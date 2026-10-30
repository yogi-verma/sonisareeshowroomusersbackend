import { randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const googleAuthUrl = 'https://accounts.google.com/o/oauth2/v2/auth';

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/'
};

function clearOAuthState(res) {
  res.clearCookie('oauth_state', cookieBase);
}

export function startGoogleAuth(_req, res) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL || !process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Google sign-in is not configured.' });
  }

  const state = randomBytes(32).toString('hex');
  res.cookie('oauth_state', state, { ...cookieBase, maxAge: 10 * 60 * 1000 });
  const url = new URL(googleAuthUrl);
  url.search = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  }).toString();
  return res.redirect(url.toString());
}

export async function finishGoogleAuth(req, res, next) {
  try {
    const expected = req.cookies?.oauth_state;
    const supplied = typeof req.query.state === 'string' ? req.query.state : '';
    clearOAuthState(res);
    if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
      return res.status(400).json({ message: 'Google sign-in state is invalid. Please try again.' });
    }
    if (typeof req.query.code !== 'string') {
      return res.status(400).json({ message: 'Google sign-in was cancelled or failed.' });
    }
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured.');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) {
      return res.status(401).json({ message: 'Google sign-in could not be completed.' });
    }
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile?.id || !profile.email || profile.verified_email !== true) {
      return res.status(401).json({ message: 'A verified Google account is required.' });
    }

    const user = await User.findOneAndUpdate(
      { googleId: profile.id },
      { $set: {
        email: profile.email.toLowerCase(),
        name: profile.name || profile.email,
        picture: profile.picture || ''
      }, $setOnInsert: { googleId: profile.id } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 });
    const frontend = process.env.FRONTEND_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:3000';
    return res.redirect(new URL(process.env.AUTH_SUCCESS_PATH || '/', frontend).toString());
  } catch (error) {
    return next(error);
  }
}

export function logout(_req, res) {
  res.clearCookie('auth_token', cookieBase);
  return res.json({ message: 'Logged out successfully.' });
}

export function getMe(req, res) {
  const { _id, email, name, picture } = req.user;
  return res.json({ id: _id, email, name, picture });
}
