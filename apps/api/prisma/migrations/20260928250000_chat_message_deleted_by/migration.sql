-- Borrado lógico del chat: quién eliminó el mensaje.
-- `deletedAt` ya existía (20260716210000). Esta migración solo agrega
-- `deletedById`. El texto permanece en la fila para auditoría; las consultas
-- del chat filtran deletedAt IS NULL y la API no devuelve el cuerpo.

ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "deletedById" INTEGER;

DO $$ BEGIN
  ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "chat_messages_deletedById_idx"
  ON "chat_messages"("deletedById");
