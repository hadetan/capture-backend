# Schema Init Story

## Scope

- Introduce the full Google-auth user profile, trial tracking, and subscription linkage inside [prisma/schema.prisma](prisma/schema.prisma)
- Create companion tables and enums needed to enforce month-to-month Stripe subscriptions and usage logging
- Keep API layer untouched; only database structures are updated in this iteration

## Plan

1. Expand the User model to hold Supabase identifiers, Google profile data, trial status fields, and Stripe linkage metadata.
2. Add a Subscription model capturing plan tier (basic or pro), billing windows, Stripe product references, and Anthropic access flags for premium users.
3. Add a UsageSession model to persist transcript consumption across trial and paid sessions for accurate cap enforcement.
4. Define enums for subscription plan, subscription status, trial status, usage source, and token types to support validation and future business logic.

## Acceptance Criteria

- [x] prisma/schema.prisma contains the expanded User model with Google, trial, and Stripe attributes, and no default on `trialUsageCapSeconds`.
- [x] Subscription model persists per-user Stripe state with plan options limited to basic and pro, plus supporting timestamps for billing cycles.
- [x] UsageSession model exists to log consumption for both trial and subscription sources with appropriate relations and indexes.
- [x] All required enums for plan, status, trial progression, usage source, and token type are defined in the schema.
