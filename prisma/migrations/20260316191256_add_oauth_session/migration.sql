-- CreateEnum
CREATE TYPE "OAuthSessionStatus" AS ENUM ('PENDING_AUTHORIZATION', 'PENDING_WABA_SELECTION', 'PENDING_PHONE_SELECTION', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "OAuthSession" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pkceVerifier" TEXT NOT NULL,
    "encryptedToken" TEXT,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "status" "OAuthSessionStatus" NOT NULL DEFAULT 'PENDING_AUTHORIZATION',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthSession_state_key" ON "OAuthSession"("state");

-- CreateIndex
CREATE INDEX "OAuthSession_clientId_idx" ON "OAuthSession"("clientId");

-- CreateIndex
CREATE INDEX "OAuthSession_state_idx" ON "OAuthSession"("state");

-- CreateIndex
CREATE INDEX "OAuthSession_expiresAt_idx" ON "OAuthSession"("expiresAt");
