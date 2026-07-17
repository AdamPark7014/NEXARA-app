-- Workspace chat (Slack-like channels, DMs, threads, document rooms)

CREATE TYPE "ChatChannelKind" AS ENUM ('PUBLIC', 'PRIVATE', 'DIRECT', 'DOCUMENT');
CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'SYSTEM', 'FILE');

CREATE TABLE "chat_channels" (
    "id" SERIAL NOT NULL,
    "kind" "ChatChannelKind" NOT NULL DEFAULT 'PUBLIC',
    "slug" VARCHAR(80),
    "name" VARCHAR(120) NOT NULL,
    "topic" VARCHAR(500),
    "description" VARCHAR(1000),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "documentId" INTEGER,
    "dmKey" VARCHAR(64),
    "createdById" INTEGER,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" VARCHAR(280),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_channel_members" (
    "id" SERIAL NOT NULL,
    "channelId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "lastReadAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_channel_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "channelId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL,
    "attachmentUrl" VARCHAR(500),
    "attachmentName" VARCHAR(255),
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_message_reactions" (
    "id" SERIAL NOT NULL,
    "messageId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_channels_slug_key" ON "chat_channels"("slug");
CREATE UNIQUE INDEX "chat_channels_documentId_key" ON "chat_channels"("documentId");
CREATE UNIQUE INDEX "chat_channels_dmKey_key" ON "chat_channels"("dmKey");
CREATE INDEX "chat_channels_kind_lastMessageAt_idx" ON "chat_channels"("kind", "lastMessageAt");

CREATE UNIQUE INDEX "chat_channel_members_channelId_userId_key" ON "chat_channel_members"("channelId", "userId");
CREATE INDEX "chat_channel_members_userId_lastReadAt_idx" ON "chat_channel_members"("userId", "lastReadAt");

CREATE INDEX "chat_messages_channelId_createdAt_idx" ON "chat_messages"("channelId", "createdAt");
CREATE INDEX "chat_messages_parentId_createdAt_idx" ON "chat_messages"("parentId", "createdAt");

CREATE UNIQUE INDEX "chat_message_reactions_messageId_userId_emoji_key" ON "chat_message_reactions"("messageId", "userId", "emoji");

ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "managed_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chat_channel_members" ADD CONSTRAINT "chat_channel_members_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_channel_members" ADD CONSTRAINT "chat_channel_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "chat_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_message_reactions" ADD CONSTRAINT "chat_message_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default public channels
INSERT INTO "chat_channels" ("kind", "slug", "name", "topic", "description", "updatedAt")
VALUES
  ('PUBLIC', 'general', 'general', 'Conversación general del equipo', 'Canal abierto para toda la organización', CURRENT_TIMESTAMP),
  ('PUBLIC', 'documentos', 'documentos', 'Discusión sobre el repositorio documental', 'Preguntas, revisiones y anuncios del DMS', CURRENT_TIMESTAMP);
