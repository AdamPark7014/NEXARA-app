ALTER TABLE "User"
ADD COLUMN "employeeNumber" VARCHAR(30);

UPDATE "User"
SET "employeeNumber" = 'NXR25SYS' || LPAD("id"::text, 3, '0')
WHERE "employeeNumber" IS NULL;

CREATE UNIQUE INDEX "User_employeeNumber_key" ON "User"("employeeNumber");