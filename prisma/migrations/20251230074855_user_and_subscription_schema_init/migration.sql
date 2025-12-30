-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('BASIC', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'INCOMPLETE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('ELIGIBLE', 'ACTIVE', 'EXHAUSTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "UsageSource" AS ENUM ('TRIAL', 'SUBSCRIPTION', 'BONUS');

-- CreateEnum
CREATE TYPE "UsageTokenKind" AS ENUM ('ASSEMBLY_AI', 'ANTHROPIC');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "fullName" TEXT,
    "avatarUrl" TEXT,
    "countryCode" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "trialStatus" "TrialStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "trialUsageSeconds" INTEGER NOT NULL DEFAULT 0,
    "trialUsageCapSeconds" INTEGER,
    "trialConvertedAt" TIMESTAMP(3),
    "stripeCustomerId" TEXT,
    "stripeSetupIntentId" TEXT,
    "lastStripeEventId" TEXT,
    "nextUsageResetAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'BASIC',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "priceId" TEXT,
    "productId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "renewedAt" TIMESTAMP(3),
    "tokenDurationSeconds" INTEGER NOT NULL DEFAULT 3600,
    "anthropicAccess" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "latestInvoiceId" TEXT,
    "lastWebhookSyncAt" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "tokenKind" "UsageTokenKind" NOT NULL,
    "source" "UsageSource" NOT NULL DEFAULT 'TRIAL',
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "consumedTrialCap" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "UsageSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_plan_idx" ON "Subscription"("plan");

-- CreateIndex
CREATE INDEX "UsageSession_userId_source_idx" ON "UsageSession"("userId", "source");

-- CreateIndex
CREATE INDEX "UsageSession_userId_tokenKind_idx" ON "UsageSession"("userId", "tokenKind");

-- CreateIndex
CREATE INDEX "UsageSession_subscriptionId_idx" ON "UsageSession"("subscriptionId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageSession" ADD CONSTRAINT "UsageSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageSession" ADD CONSTRAINT "UsageSession_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
