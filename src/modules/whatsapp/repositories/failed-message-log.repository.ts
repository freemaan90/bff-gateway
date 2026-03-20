import { Injectable } from '@nestjs/common';
import { ChannelType, FailedMessageLog } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

interface CreateFailedMessageLogDto {
  userId: string;
  sessionId: string | null;
  phone: string;
  messageText: string;
  failureReason: string;
  channelType?: ChannelType;
}

interface FindFailedMessageLogsDto {
  userId: string;
  limit: number;
}

@Injectable()
export class FailedMessageLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateFailedMessageLogDto): Promise<FailedMessageLog> {
    return this.prisma.failedMessageLog.create({ data });
  }

  async findByUserId(dto: FindFailedMessageLogsDto): Promise<FailedMessageLog[]> {
    return this.prisma.failedMessageLog.findMany({
      where: { userId: dto.userId },
      orderBy: { failedAt: 'desc' },
      take: dto.limit,
    });
  }
}
