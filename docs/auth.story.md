# Auth Story: Google OAuth via Supabase

## Context

- Desktop client: Electron app embedding the Supabase Google OAuth redirect flow using the system browser.
- Backend: Express API leveraging Supabase service-role key for profile management and Prisma for persisted user metadata.
- Goal: Replace legacy email/password flows with a single Google sign-in that transparently handles login vs registration.

## Proposed Flow

1. Electron app opens Supabase hosted OAuth URL with Google provider and deep-link redirect (custom protocol capture://auth) registered by the desktop client.
2. After Google consent, Supabase redirects to capture://auth with authorization code; Electron intercepts and exchanges it using Supabase JavaScript client (PKCE).
3. Client receives Supabase session (access + refresh). Access token lifespan set to 5 hours; refresh token lifespan set to 30 days via Supabase dashboard policies.
4. Client invokes backend `/api/auth/google/session` with the Supabase session tokens.
5. Backend validates session via Supabase Admin API, upserts user profile in Prisma (first request determines register vs login), sets an HttpOnly secure cookie containing **only** the Supabase refresh token, and returns the access token in the JSON response body.
6. Refresh handling:
   - Client stores the access token in memory (or another volatile store) and sends it via `Authorization: Bearer` headers until it nears expiry.
   - When the access token expires, the frontend calls `/api/auth/google/session/refresh`. The backend reads the refresh token from the HttpOnly cookie, obtains a fresh Supabase session, and responds with a new access token while rotating the refresh-token cookie.
   - If the refresh cookie is missing or rejected, the frontend prompts the user to reauthenticate with Supabase.
7. Logout clears both refresh and legacy access cookies (defensive) and signs out the Supabase session via Admin API.

## Implementation Tasks

- Update auth route/controller/service to accept Supabase session payload, validate, and manage Prisma profile state.
- Ensure middleware verifies Supabase access token and injects user context for downstream services.
- Configure Supabase project settings for custom redirect URI, session lifetimes (5h access, 30d refresh), and PKCE enforcement.
- Electron client: register custom protocol handler, wire Supabase OAuth flow, and persist refreshed sessions.
- Add comprehensive Jest coverage for controller/service branches (happy path, invalid session, Prisma failure).

## Acceptance Criteria

- [ ] Electron client handles Supabase Google OAuth redirect and delivers session tokens to backend.
- [x] Backend `/api/auth/google/session` upserts user profile, stores refresh token server-side via HttpOnly cookie, and surfaces access token in response payload.
- [x] Supabase session refresh operates automatically for ≤ 30 days without manual login prompts.
- [x] Logout endpoint terminates Supabase session and clears backend cookie.
- [x] Tests cover successful login/register, invalid token, and refresh handling scenarios.
