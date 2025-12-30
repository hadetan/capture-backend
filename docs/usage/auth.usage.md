# Capture Backend Auth Usage Guide

This guide explains how to integrate the Capture backend authentication APIs in client applications. It covers environment setup, Supabase configuration, request/response formats, and end-to-end flow for Google-only sign-in.

---

## 1. Overview

- **Auth mechanism:** Supabase Google OAuth (no passwords, no other providers).
- **Primary endpoints:**
  - `POST /api/auth/google/session` — Exchange Supabase session tokens for a backend session and persisted profile record.
  - `POST /api/auth/google/session/refresh` — Rotate expired access tokens using the refresh-token cookie.
  - `GET /api/auth/me` — Fetch the authenticated user profile and completion status.
  - `POST /api/auth/logout` — Terminate Supabase session and clear all auth cookies.
- **Session state:**
  - Client obtains Supabase access/refresh tokens from OAuth flow.
  - Backend stores the Supabase refresh token inside an HttpOnly cookie (`sb-refresh-token`).
  - Backend returns the Supabase access token (and expiry) **only in the JSON response body**; clients must send it as a bearer header for future requests.

---

## 2. Environment Configuration

Populate the following variables before starting the backend (`.env` file):

```dotenv
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SUPABASE_AUTH_EXTERNAL_GOOGLE_REDIRECT_URI=<supabase-redirect-uri>
PORT=3000
CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
DATABASE_URL=<postgres-connection-string>
```

### Supabase Project Settings

1. Enable the Google provider under **Authentication → Providers**.
2. Configure the redirect URL you will use (e.g., `capture://auth` for Electron deep links or your local callback URL).
3. Ensure **JWT expiry** is ≤ 18,000 seconds (5 hours) and **refresh token expiry** is ≤ 2,592,000 seconds (30 days) under **Authentication → Settings**.
4. Set up environment variables above on the server where the backend runs.

### Prisma Client

Run once (and after schema changes):

```bash
npm install
npm run prisma:generate
```

---

## 3. Electron / Client OAuth Flow

1. Launch Supabase-hosted Google OAuth URL (e.g., via `supabase.auth.signInWithOAuth`).
2. After Google consent, Supabase redirects to the registered URI.
3. The client (Electron) exchanges the authorization code using the Supabase JS client and receives a session object:

   ```json
   {
     "session": {
       "access_token": "<sb-access-token>",
       "refresh_token": "<sb-refresh-token>",
       "expires_in": 3600,
       "token_type": "bearer"
     },
     "user": { ... }
   }
   ```

4. Forward the session fields (`access_token`, `refresh_token`, `expires_in`, `token_type`) to the backend endpoint described next.
5. Discard any received refresh token on the client after the backend exchange; rely on the HttpOnly cookie set by the backend.

---

## 4. API Endpoints

### 4.1 POST /api/auth/google/session

Exchange Supabase session tokens for a backend session. Also upserts the Prisma `User` record.

**Request**

```
POST /api/auth/google/session
Content-Type: application/json

{
  "accessToken": "<supabase-access-token>",
  "refreshToken": "<supabase-refresh-token>",
  "expiresIn": 3600,
  "tokenType": "bearer"
}
```

**Responses**

- **201 Created** (new user) or **200 OK** (existing user):

  ```json
  {
    "success": true,
    "message": "Registered with Google",
    "data": {
      "user": {
        "id": "<uuid>",
        "email": "user@example.com",
        "fullName": "Test User",
        "avatarUrl": "https://...",
        "countryCode": "IN",
        "trialStatus": "ELIGIBLE",
        "trialEndsAt": null,
        "trialUsageSeconds": 0,
        "trialUsageCapSeconds": null,
        "nextUsageResetAt": null,
        "subscription": null,
        "lastLoginAt": "2025-12-30T00:00:00.000Z"
      },
      "session": {
        "accessToken": "<supabase-access-token>",
        "expiresIn": 3600,
        "refreshExpiresIn": 2592000,
        "tokenType": "bearer"
      },
      "profileComplete": false,
      "isNewUser": true
    }
  }
  ```

- **4xx / 5xx Errors** expose standard JSON error payloads: `{ "success": false, "message": "..." }`.

**Side Effects**

- Clears any legacy `sb-access-token` cookie.
- Sets `sb-refresh-token` HttpOnly cookie (max-age = Supabase refresh expiry). Use this cookie when calling the refresh endpoint.
- Upserts Prisma `User` using Supabase user metadata (name, picture, locale).

### 4.2 POST /api/auth/google/session/refresh

Request a new access token using the HttpOnly refresh cookie. Optionally supply `refreshToken` in the JSON body when cookies are unavailable (e.g., native HTTP clients), but browsers should rely on cookies only.

**Request**

```
POST /api/auth/google/session/refresh
Content-Type: application/json

{
  "refreshToken": "<optional-refresh-token>"
}
```

**Response**

```json
{
  "success": true,
  "message": "Session refreshed",
  "data": {
    "user": { "id": "<uuid>" },
    "session": {
      "accessToken": "<new-access-token>",
      "expiresIn": 3600,
      "refreshExpiresIn": 2592000,
      "tokenType": "bearer"
    },
    "profileComplete": true,
    "isNewUser": false
  }
}
```

**Side Effects**

- Rotates `sb-refresh-token` cookie with the latest Supabase refresh token.
- Clears any legacy `sb-access-token` cookie.

### 4.3 GET /api/auth/me

Retrieve the authenticated user. Requires either:

- `Authorization: Bearer <supabase-access-token>` header **or**
- (Legacy compatibility) a valid `sb-access-token` cookie, though new clients should prefer bearer headers.

**Response**

```json
{
  "success": true,
  "message": "Profile retrieved",
  "data": {
    "user": { ...same shape as above... },
    "profileComplete": false
  }
}
```

### 4.4 POST /api/auth/logout

Terminates Supabase session and clears the cookie. Requires authentication (header/cookie).

**Request**

```
POST /api/auth/logout
```

**Response**

```json
{
  "success": true,
  "message": "Logged out",
  "data": null
}
```

**Side Effects**

- Backend calls Supabase Admin API to sign out the user by ID.
- Clears `sb-refresh-token` cookie and any legacy `sb-access-token` cookie.

---

## 5. Common Error Codes

| Status | Message (example)                                  | Reason                                                 |
|--------|----------------------------------------------------|--------------------------------------------------------|
| 400    | "Access token lifetime exceeds supported maximum"  | `expiresIn` > 18,000 seconds                           |
| 401    | "Invalid or expired Supabase access token"         | Supabase rejects the provided access token             |
| 401    | "Only Google sign-ins are supported"               | Supabase user provider is not `google`                 |
| 401    | "Access token missing"                             | No bearer header supplied and legacy cookie absent     |
| 404    | "User profile not found"                           | Prisma has no entry for the Supabase user              |
| 503    | "Google authentication is not enabled in Supabase" | Admin API returns provider disabled                    |

All errors follow the standard response format: `{ "success": false, "message": "..." }`.

---

## 6. Client Integration Checklist

1. Install Supabase client in the Electron app and configure with anonymous key.
2. Initiate Google OAuth via Supabase with redirect to a custom protocol (`capture://auth`).
3. After receiving `session`, call `POST /api/auth/google/session` with session tokens.
4. Read `accessToken` + `expiresIn` from the backend response body and store it in memory or secure storage suitable for bearer headers.
5. Allow the backend to manage the refresh token via HttpOnly cookie; do not persist it in client storage.
6. Before the access token expires, call `POST /api/auth/google/session/refresh` to obtain a fresh token (browser clients rely on refresh cookie automatically).
7. Use `GET /api/auth/me` to fetch profile details and drive onboarding UI.
8. On logout, call `POST /api/auth/logout`, clear local Supabase session if stored, and drop any in-memory access token.

---

## 7. Local Development Tips

- Start Supabase locally (if using CLI):

  ```bash
  npm run sb:start
  ```

- Run backend in dev mode:

  ```bash
  npm run dev
  ```

- Run tests:

  ```bash
  npm test
  ```

- When schema changes:

  ```bash
  npm run prisma:generate
  ```

Ensure the `.env` used by Jest includes necessary Supabase settings, or mock them as needed.

---

## 8. Troubleshooting

| Issue | Resolution |
|-------|------------|
| `MODULE_NOT_FOUND: @prisma/client/runtime/library.js` | Run `npm run prisma:generate` after installing dependencies. |
| 401 responses despite successful login | Ensure the bearer header uses the latest `accessToken`; if expired, call the refresh endpoint to rotate tokens. |
| 503 error about Google auth disabled | Confirm the Google provider is enabled in Supabase and service role key is correct. |
| Electron redirect loop | Check the registered redirect URI matches the one passed to Supabase and that the custom protocol handler is active. |

---

## 9. Postman / API Client Setup

1. Set base URL: `http://localhost:3000/api` (adjust for deployed environments).
2. For `POST /auth/google/session`, supply valid tokens from Supabase (use Supabase CLI or UI to obtain test tokens).
3. Capture the `sb-refresh-token` cookie (HttpOnly) for browser flows or provide `refreshToken` manually when testing the refresh endpoint via API tools.

---

By following this guide, client teams and automation agents should be able to configure Supabase, perform Google sign-ins, and interact with the Capture backend authentication APIs confidently and without ambiguity.
