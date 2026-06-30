-- Multi-step rejection for activity evidence review
ALTER TABLE "activity_evidences" ADD COLUMN IF NOT EXISTS "rejectedSteps" JSONB;
