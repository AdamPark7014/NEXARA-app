-- Caja on-site por sitio ISAPI: tunel + go2rtc + sync (ADR-0021).

CREATE TABLE "integra_edge_agents" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "enrollTokenHash" VARCHAR(64),
    "enrollTokenExpiresAt" TIMESTAMP(3),
    "agentTokenHash" VARCHAR(64),
    "publicKey" VARCHAR(64),
    "tunnelIp" VARCHAR(45),
    "hostname" VARCHAR(120),
    "agentVersion" VARCHAR(40),
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "enrolledAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integra_edge_agents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integra_edge_agents_siteId_key" ON "integra_edge_agents"("siteId");
CREATE UNIQUE INDEX "integra_edge_agents_tunnelIp_key" ON "integra_edge_agents"("tunnelIp");
CREATE INDEX "integra_edge_agents_companyId_status_idx" ON "integra_edge_agents"("companyId", "status");

ALTER TABLE "integra_edge_agents" ADD CONSTRAINT "integra_edge_agents_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integra_edge_agents" ADD CONSTRAINT "integra_edge_agents_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "integra_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
