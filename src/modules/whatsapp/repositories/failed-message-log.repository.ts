import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FailedMessageLog } from '@prisma/client';

interface CreateFailedMessageLogDto {
  userId: string;
  sessionId: string | null;
  phone: string;
  messageText: string;
  failureReason: string;
  channelType?: string;
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
