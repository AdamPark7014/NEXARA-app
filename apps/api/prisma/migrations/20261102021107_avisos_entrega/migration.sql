-- Programa Velocidad Core (01-11-2026): cómo se entregó cada aviso. Lo anterior queda como «push».
-- Idempotente: se aplica antes de subir el código, para que un despliegue ajeno sin migrar no encuentre
-- la API nueva sin su columna. El código viejo la ignora.

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "entrega" VARCHAR(12) NOT NULL DEFAULT 'push';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_userId_entrega_createdAt_idx" ON "notifications"("userId", "entrega", "createdAt");
