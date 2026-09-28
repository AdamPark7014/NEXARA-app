-- Confirmación de lectura del chat interno (entregado / visto), por mensaje y usuario.
-- Aditiva: los mensajes que ya existen quedan sin filas (palomita gris = enviado)
-- hasta que alguien los reciba o los abra.

CREATE TABLE IF NOT EXISTS "chat_message_reads" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3),
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "chat_message_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_message_reads_messageId_userId_key"
    ON "chat_message_reads"("messageId", "userId");

CREATE INDEX IF NOT EXISTS "chat_message_reads_messageId_idx"
    ON "chat_message_reads"("messageId");

CREATE INDEX IF NOT EXISTS "chat_message_reads_userId_idx"
    ON "chat_message_reads"("userId");

CREATE INDEX IF NOT EXISTS "chat_message_reads_companyId_idx"
    ON "chat_message_reads"("companyId");

DO $$ BEGIN
  ALTER TABLE "chat_message_reads"
    ADD CONSTRAINT "chat_message_reads_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_message_reads"
    ADD CONSTRAINT "chat_message_reads_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_message_reads"
    ADD CONSTRAINT "chat_message_reads_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "company_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
