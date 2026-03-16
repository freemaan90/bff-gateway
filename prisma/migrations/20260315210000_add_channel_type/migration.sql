-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('OFFICIAL', 'UNOFFICIAL');

-- AlterTable WhatsappSession: make sessionId nullable
ALTER TABLE "WhatsappSession" ALTER COLUMN "sessionId" DROP NOT NULL;

-- AlterTable WhatsappSession: add channelType and WABA fields
ALTER TABLE "WhatsappSession" ADD COLUMN "channelType" "ChannelType" NOT NULL DEFAULT 'UNOFFICIAL';
ALTER TABLE "WhatsappSession" ADD COLUMN "phoneNumberId" TEXT;
ALTER TABLE "WhatsappSession" ADD COLUMN "accessToken" TEXT;
ALTER TABLE "WhatsappSession" ADD COLUMN "wabaId" TEXT;

-- AlterTable MessageLog: add channelType and wamid
ALTER TABLE "MessageLog" ADD COLUMN "channelType" "ChannelType" NOT NULL DEFAULT 'UNOFFICIAL';
ALTER TABLE "MessageLog" ADD COLUMN "wamid" TEXT;

-- CreateIndex on MessageLog.wamid
CREATE INDEX "MessageLog_wamid_idx" ON "MessageLog"("wamid");

-- AlterTable FailedMessageLog: add channelType
ALTER TABLE "FailedMessageLog" ADD COLUMN "channelType" "ChannelType" NOT NULL DEFAULT 'UNOFFICIAL';
