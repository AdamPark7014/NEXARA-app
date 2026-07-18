-- Pin messages in workspace chat
ALTER TABLE "chat_messages" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "chat_messages" ADD COLUMN "pinnedById" INTEGER;

CREATE INDEX "chat_messages_channelId_pinnedAt_idx" ON "chat_messages"("channelId", "pinnedAt");

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
