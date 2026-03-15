import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MessageLog } from '@prisma/client';

interface CreateMessageLogDto {
  userId: string;
  sessionId: string | null;
  phone: string;
  messageText: string;
}

interface FindMessageLogsDto {
  userId: string;
  limit: number;
}

@Injectable()
export class MessageLogRepository {
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
}
