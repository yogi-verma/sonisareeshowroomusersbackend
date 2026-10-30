# Backend authentication

The Express API uses Google OAuth 2.0 for user signup and login. On a first successful Google sign-in, it creates a MongoDB `User`; later sign-ins update the profile on the same account. Sessions use a signed, HTTP-only JWT cookie.

## Configuration

Copy `.env.example` to `.env` and set `MONGODB_URI`, a long random `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, and `FRONTEND_ORIGIN`. Register the exact callback URL in Google Cloud Console, for example `http://localhost:5000/api/auth/google/callback`. The frontend starts sign-in by navigating to `GET /api/auth/google`. Set `AUTH_SUCCESS_PATH` to change the post-login frontend path.

Run `npm install` and `npm run dev` from this directory.

## Routes

- `GET /api/health` — health check.
- `GET /api/auth/google` — begin Google OAuth.
- `GET /api/auth/google/callback` — validate Google identity and create/sign in the MongoDB user.
- `GET /api/auth/me` — return the signed-in user's profile.
- `POST /api/auth/logout` — clear the session cookie.

## User profile and addresses

All `/api/users/me` routes require a valid session cookie or `Authorization: Bearer <token>` header. Profile and address mutations also validate the browser `Origin` against `FRONTEND_ORIGIN`.

- `GET /api/users/me` — return the current user's profile, phone number, and saved addresses.
- `PATCH /api/users/me` — update the phone number with `{ "phoneNumber": "+91 98765 43210" }`. Send an empty string to clear it.
- `GET /api/users/me/addresses` — list saved addresses.
- `POST /api/users/me/addresses` — save an address. Required fields: `areaStreetSectorVillage`, six-digit `pincode`, `townCity`, and `state`. Optional fields: `label`, `flatHouseNo`, `landmark`, and `isDefault`.
- `PATCH /api/users/me/addresses/:addressId` — update supplied address fields.
- `DELETE /api/users/me/addresses/:addressId` — delete an address. If the default address is deleted, the first remaining address becomes the default.
Address records have a maximum of 20 per user. The first saved address is the default unless a different one is selected. Only one address can be default at a time.
