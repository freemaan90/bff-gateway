import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, MessageLog } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

interface CreateMessageLogDto {
  userId: string;
  sessionId: string | null;
  phone: string;
  messageText: string;
  channelType?: ChannelType;
  wamid?: string;
}

interface FindMessageLogsDto {
  userId: string;
  limit: number;
}

@Injectable()
export class MessageLogRepository {
  private readonly logger = new Logger(MessageLogRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateMessageLogDto): Promise<MessageLog> {
    return this.prisma.messageLog.create({ data });
  }

  async findByUserId(dto: FindMessageLogsDto): Promise<MessageLog[]> {
    return this.prisma.messageLog.findMany({
      where: { userId: dto.userId },
      orderBy: { sentAt: 'desc' },
      take: dto.limit,
    });
  }

  async findByWamid(wamid: string): Promise<MessageLog | null> {
    return this.prisma.messageLog.findFirst({
      where: { wamid } as any,
    });
  }

  async updateDeliveryStatus(wamid: string, status: string): Promise<void> {
    // No deliveryStatus field in schema yet — log warning for future use
    this.logger.warn(
      `updateDeliveryStatus called for wamid=${wamid} status=${status} — no deliveryStatus field in schema yet`,
    );
  }
}
