-- Encargo al responsable: ejecucion (personal) | despacho (a subordinados).
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "assignmentCharge" VARCHAR(20);
