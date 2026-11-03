# Backend authentication

The Express API uses Google OAuth 2.0 for user signup and login. On a first successful Google sign-in, it creates a MongoDB `User`; later sign-ins update the profile on the same account. Sessions use a signed, HTTP-only JWT cookie.

## Configuration

Copy `.env.example` to `.env` and set `MONGODB_URI`, a long random `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, and `FRONTEND_ORIGIN`. Register the exact callback URL in Google Cloud Console, for example `http://localhost:5000/api/auth/google/callback`. The frontend starts sign-in by navigating to `GET /api/auth/google`. Set `AUTH_SUCCESS_PATH` to change the post-login frontend path.

`ADMIN_ORDERS_API_KEY` is a shared server-to-server secret. Its value must match exactly in `backend/.env`, `adminBackend/.env`, and `frontend/.env`. The customer backend uses it to apply paid order stock changes in the admin backend; the frontend also uses it for protected admin order requests. Configure the same secret in all three corresponding Vercel projects for each environment, then redeploy those projects after changing it.

Run `npm install` and `npm run dev` from this directory.

## Routes

- `GET /api/health` — health check.
- `GET /api/auth/google` — begin Google OAuth.
- `GET /api/auth/google/callback` — validate Google identity and create/sign in the MongoDB user.
- `GET /api/auth/me` — return the signed-in user's profile.
- `POST /api/auth/logout` — clear the session cookie.

## Product reviews and ratings

- `GET /api/products/:productId/reviews?limit=20&skip=0` — list public product reviews and return average rating, total count, and per-star counts. Results are newest first; `limit` defaults to 20 and is capped at 100. Use `pagination.hasMore` and increase `skip` to retrieve later comments.
- `PUT /api/products/:productId/reviews` — create or update the signed-in user's review for that product. Requires a session cookie or bearer token, and validates the browser `Origin`. Send `{ "rating": 1, "comment": "Your review" }`; ratings must be whole stars from 1 to 5 and comments may contain up to 1000 characters. Each user has one review per product and can update it with the same request.

Review submission verifies that the product exists in the catalog. Public review reads do not require sign-in.

## User profile and addresses

All `/api/users/me` routes require a valid session cookie or `Authorization: Bearer <token>` header. Profile and address mutations also validate the browser `Origin` against `FRONTEND_ORIGIN`.

- `GET /api/users/me` — return the current user's profile, phone number, and saved addresses.
- `PATCH /api/users/me` — update the phone number with `{ "phoneNumber": "+91 98765 43210" }`. Send an empty string to clear it.
- `GET /api/users/me/addresses` — list saved addresses.
- `POST /api/users/me/addresses` — save an address. Required fields: `areaStreetSectorVillage`, six-digit `pincode`, `townCity`, and `state`. Optional fields: `label`, `flatHouseNo`, `landmark`, and `isDefault`.
- `PATCH /api/users/me/addresses/:addressId` — update supplied address fields.
- `DELETE /api/users/me/addresses/:addressId` — delete an address. If the default address is deleted, the first remaining address becomes the default.
Address records have a maximum of 20 per user. The first saved address is the default unless a different one is selected. Only one address can be default at a time.

## Admin and customer chat

Chat is one-to-one between a customer and the showroom admin account; customers cannot address other customers. A customer gets one persistent conversation, created automatically when they send their first message. Messages are limited to 2,000 characters and stored in MongoDB.

Configure `ADMIN_BACKEND_URL` to point at the admin backend (default `http://localhost:5001`). Admin REST and WebSocket sessions are verified against its `GET /loggedinadmin` endpoint using the admin session token, so revoked sessions are rejected. The storefront backend needs to be able to reach the admin backend. The admin backend must allow the storefront frontend origin.

REST routes (customer routes accept the user session cookie or bearer token; admin routes accept the `adminToken` cookie or bearer token):

- `GET /api/chat/me?limit=50&before=<messageId>` — get the signed-in customer's conversation and newest messages; pagination returns messages in chronological order.
- `POST /api/chat/me/messages` — send `{ "body": "..." }` as the customer.
- `GET /api/chat/admin/conversations?limit=50&skip=0` — admin inbox with customer profile, last message, status, and unread count.
- `GET /api/chat/admin/conversations/:conversationId/messages?limit=50&before=<messageId>` — fetch a conversation's messages.
- `POST /api/chat/admin/conversations/:conversationId/messages` — admin reply with `{ "body": "..." }`.
- `PATCH /api/chat/admin/conversations/:conversationId` — set `{ "status": "open" }` or `{ "status": "closed" }`.

WebSocket endpoint: `ws://<backend-host>/ws/chat` (use `wss://` in production). Customer sessions authenticate with the existing `auth_token` HTTP-only cookie. Admin browsers request `POST /api/chat/admin/socket-ticket` through the storefront's server-side proxy; the 30-second single-use ticket is passed as `?ticket=...` during the WebSocket upgrade. The endpoint checks browser origin against `FRONTEND_ORIGIN`. Send JSON `{ "type": "message", "body": "..." }` as a customer. Admins send `{ "type": "message", "conversationId": "...", "body": "..." }`. Events are `{ "type": "connected", "role": "user|admin" }`, `{ "type": "message", "message": { ... } }`, or `{ "type": "error", "message": "..." }`. The customer receives messages only for their own conversation; admins receive messages across the inbox. REST endpoints provide message history after reconnecting.

Read receipts are persisted on each message as `seenAt`. The WebSocket accepts `{ "type": "seen" }` from a customer or `{ "type": "seen", "conversationId": "..." }` from an admin and broadcasts `{ "type": "seen", "conversationId": "...", "seenAt": "...", "seenBy": "user|admin" }` to the sender. Loading a conversation through REST also marks incoming messages seen. Presence is persisted per customer and for the showroom admin; the socket broadcasts `{ "type": "presence", "presence": { "actorType", "actorId", "status", "lastSeenAt" } }`. A disconnected account remains online for a 60-second grace period, then becomes offline with its disconnect time recorded as last seen.
