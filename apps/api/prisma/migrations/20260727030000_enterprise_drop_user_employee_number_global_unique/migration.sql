-- Drop global User.employeeNumber unique; uniqueness lives on UserCompany

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_employeeNumber_key') THEN
    ALTER TABLE "User" DROP CONSTRAINT "User_employeeNumber_key";
  END IF;
END $$;

DROP INDEX IF EXISTS "User_employeeNumber_key";
