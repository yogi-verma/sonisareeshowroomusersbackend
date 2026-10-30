const localOrigins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

export default function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();

  const configuredOrigins = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return value.replace(/\/+$/, '');
      }
    });

  if ((process.env.NODE_ENV !== 'production' && localOrigins.has(origin)) || configuredOrigins.includes(origin)) {
    return next();
  }
  return res.status(403).json({ message: 'Requests from this origin are not allowed.' });
}
