-- Cola personal de ejecución (Mis actividades): orden por persona + por qué va ahí.
ALTER TABLE "activity_assignees" ADD COLUMN "ordenEjecucion" INTEGER;
ALTER TABLE "activity_assignees" ADD COLUMN "ordenJustificacion" VARCHAR(500);
ALTER TABLE "activity_assignees" ADD COLUMN "ordenActualizadoAt" TIMESTAMP(3);
