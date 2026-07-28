-- UserCompany.employeeNumber per-tenant unique (keeps User.employeeNumber for display/compat)

ALTER TABLE "user_companies" ADD COLUMN IF NOT EXISTS "employeeNumber" VARCHAR(40);

-- Backfill from User.employeeNumber for existing memberships
UPDATE "user_companies" uc
SET "employeeNumber" = u."employeeNumber"
FROM "User" u
WHERE u.id = uc."userId"
  AND uc."employeeNumber" IS NULL
  AND u."employeeNumber" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "user_companies_companyId_employeeNumber_key"
  ON "user_companies"("companyId", "employeeNumber");
