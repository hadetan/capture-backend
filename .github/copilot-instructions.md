# GitHub Copilot Instructions for capture-backend

> Short: Actionable guidance for AI agents to be productive in this repository (Express + Supabase stack).

## Summary (what the project is)
- **Project type:** Backend service — Node.js + Express
- **Primary language(s):** JavaScript
- **Stack / libs:** Express, Joi (validation), CORS, Supabase (DB & auth), Prisma, Stripe, Google OAuth, AssemblyAI SDKs/REST
- **High-level purpose:** Authentication and token broker for a capture app — handle Google-only auth, trials/subscriptions, and issue AssemblyAI/Anthropic temporary tokens

## Quick start — important commands
- Install deps: `npm ci`
- Run locally: `npm start` (or `node src/index.js`)
- Dev: `npm run dev` (recommended: `nodemon`)
- Test: `npm test` (Jest)
- Lint: `npm run lint` (`eslint .` - ESLint configured to fail on unused vars)
- Format: `npm run format` (optional; e.g., `prettier --write`) 

> Tip: If the script is missing in `package.json`, add the corresponding npm script to match the commands above.

## Project layout / key files
- All application code lives under `src/` organized by feature:
  - `src/<feature>/` contains:
    - `<feature>.controller.js  ` (HTTP request/response logic)
    - `<feature>.route.js       ` (Express router, mounting middlewares)
    - `<feature>.service.js     ` (business logic, DB calls via Supabase client)
    - `<feature>.validation.js  ` (Joi schemas + validation middleware)

  Example:
  - `src/login/`
    - `login.controller.js`
    - `login.route.js`
    - `login.service.js`
    - `login.validation.js`

- Tests live under `test/` at repo root and mirror the `src/` structure:
  - `test/login/login.test.js` → tests for `src/login/*`
- Key infra files: `Dockerfile`, `docker-compose.yml` (if present)
- CI workflows: `.github/workflows/*.yml` (tests run on PR/merge — see CI section)

- **Separation of concerns:** Routes → Controllers → Services. Routes handle routing + validation middleware, controllers handle request parsing and responses, services contain business logic and Supabase interactions.
- **Validation:** All inbound payloads use **Joi** schemas in `<feature>.validation.js` and are applied as middleware on route definitions.
- **Auth:** Support Google Sign-In only. Store minimal profile data (email, Google identifiers) via Supabase and ensure flows work with a single-click sign-in/register path. Never request extra profile fields outside Google payload.
- **Token brokerage:** Services must hold AssemblyAI credentials securely and exchange them for temporary tokens following https://www.assemblyai.com/docs/universal-streaming/authenticate-with-a-temporary-token. Premium plan users (69 USD) also receive Anthropic temporary credentials; standard subscription (10 USD) only exposes AssemblyAI temps. Implement fast refresh paths for expired tokens—avoid blocking transcription sessions.
- **Trials and subscriptions:** Persist trial state (7 days from first sign-in or 3 total hours of transcript usage, whichever hits first). After trial exhaustion, require Stripe subscription. Schema must track usage counters, thresholds, subscription tier, renewal dates, and token limits (default 1 hour per temp token unless overridden).
- **Payments:** Integrate Stripe for checkout and webhook verification. Guard subscription entry points and ensure graceful fallback for failed or canceled payments.
- **CORS:** Centralized CORS middleware in `src/index.js` (or equivalent) so endpoints are accessible by browser clients.
- **Error handling:** Central error handler middleware should normalize errors to JSON `{ error: message }` with proper HTTP status codes. For every API change, handle edge cases (missing entities, invalid states, upstream failures) and surface consistent `ApiError` responses so raw server exceptions never reach clients.

## Testing & debugging notes
- Run the whole test suite: `npm test` (Jest)
- Run a single test file (Jest example): `npm test -- test/login/login.test.js`
- Tests mirror the `src/` layout in `test/` and should focus on:
  - unit tests for services (mock Supabase client)
  - integration tests for routes (use test server instance)
- Environment vars needed for local dev / tests:
  - `SUPABASE_URL`, `SUPABASE_KEY` (or `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` if needed)
  - `NODE_ENV`, `PORT`
  Store them in `.env` for local development (do NOT commit credentials).
- Use Jest mocks or tools like `nock` for HTTP and `jest.mock` for Supabase client to avoid hitting real services in unit tests.

## Conventions & gotchas
- File naming: use the exact pattern `<name>.(controller|route|service|validation).js` under `src/<name>/`.
- ESLint: Basic rules enforced — **no unused variables/functions**, consistent `semi`/`quotes` per repo config. Run `npm run lint` and fix errors before pushing.
- Validation-first: Validate incoming bodies/params in route middleware before calling controller logic.
- Keep services pure and side-effect free where possible: encapsulate Supabase calls and mapping to app DTOs in services.
- Indentation: always use four spaces per level; do not introduce tab characters.
- Validation modules (`*validation.js`) should declare Joi schemas that cover every field defined on the corresponding database table. When the Prisma schema defines enums (or an enum exists in shared constants), import and reuse that enum instead of duplicating the raw values.
- Keep domain documentation up to date: add product and technical stories under `docs/` for every significant auth, trial, or subscription change.
- Design Prisma schema changes to support trial tracking (start timestamps, elapsed usage minutes) and tiered subscriptions (plan type, status, next billing date, token allowance overrides).

- **Utilities & constants:**
  - Use `src/utils/const.js` as the single source of truth for global constants (e.g., `httpStatus`, role names, common string keys). Export constants via the utils barrel (for example, `require('./utils').consts`).
  - Use `src/utils/common.js` for shared helper functions (e.g., `pick`, `omit`, `isEmpty`) to avoid duplication across services and controllers.
  - Use `catchAsync`, `ApiError`, and `httpResponse` (from `src/utils`) in all API handlers. Wrap async controllers with `catchAsync`, throw `ApiError` for structured errors, and send responses via `httpResponse` helpers for consistent response shape.
  - If needed, create/use `src/utils/custom.validation.js` to centralize Joi validation helpers (e.g., `validateSchema`) that convert Joi errors into `ApiError` using `httpStatus.UNPROCESSABLE_ENTITY`.

## CI / GitHub Actions
- Tests and lint run on Pull Requests and on pushes to main (typical `.github/workflows/*` `on: [pull_request, push]` with `branches: [main]`).
- Workflow job should at minimum: checkout, install (`npm ci`), run `npm run lint`, and `npm test`.
