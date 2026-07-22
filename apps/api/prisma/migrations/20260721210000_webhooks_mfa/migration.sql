-- Outbound webhooks + MFA secrets for IAM enterprise

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaSecret" VARCHAR(64);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabledAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "outbound_webhooks" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "secret" VARCHAR(120),
    "events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "outbound_webhooks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "outbound_webhooks_isActive_idx" ON "outbound_webhooks"("isActive");

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
    "id" SERIAL NOT NULL,
    "webhookId" INTEGER NOT NULL,
    "event" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "responseCode" INTEGER,
    "responseBody" VARCHAR(1000),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "webhook_deliveries_webhookId_status_idx" ON "webhook_deliveries"("webhookId", "status");
CREATE INDEX IF NOT EXISTS "webhook_deliveries_nextRetryAt_idx" ON "webhook_deliveries"("nextRetryAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_deliveries_webhookId_fkey') THEN
    ALTER TABLE "webhook_deliveries"
      ADD CONSTRAINT "webhook_deliveries_webhookId_fkey"
      FOREIGN KEY ("webhookId") REFERENCES "outbound_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbound_webhooks_createdById_fkey') THEN
    ALTER TABLE "outbound_webhooks"
      ADD CONSTRAINT "outbound_webhooks_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
