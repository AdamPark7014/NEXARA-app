-- Migration: add companyAddress, companyRfc, companyWebsite to order_templates
ALTER TABLE "order_templates"
  ADD COLUMN IF NOT EXISTS "companyAddress" VARCHAR(300),
  ADD COLUMN IF NOT EXISTS "companyRfc"     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "companyWebsite" VARCHAR(200);
