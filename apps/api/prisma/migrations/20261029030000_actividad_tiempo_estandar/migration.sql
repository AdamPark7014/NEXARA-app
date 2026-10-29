-- Tiempo estándar por especificidad: cantidad, destino, traslado y el estándar con su desglose.
ALTER TABLE "Activity" ADD COLUMN "unidades" JSONB;
ALTER TABLE "Activity" ADD COLUMN "destino" JSONB;
ALTER TABLE "Activity" ADD COLUMN "trasladoMin" INTEGER;
ALTER TABLE "Activity" ADD COLUMN "trasladoModo" VARCHAR(12);
ALTER TABLE "Activity" ADD COLUMN "tiempoEstandarMin" INTEGER;
ALTER TABLE "Activity" ADD COLUMN "estandarDesglose" JSONB;
ALTER TABLE "Activity" ADD COLUMN "estandarCambiadoMotivo" VARCHAR(300);
