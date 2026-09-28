-- Bóveda de contraseñas del dueño: contraseña vigente de cada cuenta, cifrada (AES-256-GCM) con una llave
-- que NO vive en la base. Idempotente.
CREATE TABLE IF NOT EXISTS "credential_vault_entries" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credential_vault_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credential_vault_entries_userId_key" ON "credential_vault_entries"("userId");
CREATE INDEX IF NOT EXISTS "credential_vault_entries_companyId_idx" ON "credential_vault_entries"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credential_vault_entries_userId_fkey') THEN
    ALTER TABLE "credential_vault_entries"
      ADD CONSTRAINT "credential_vault_entries_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
