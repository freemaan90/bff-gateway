import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsappSessionEntity } from '../domain/whatsapp-session.entity';
import { WhatsappSession } from '@prisma/client';

@Injectable()
export class WhatsappSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(session: WhatsappSession): WhatsappSessionEntity {
    return new WhatsappSessionEntity({
      ...session,
      lastQrCode: session.lastQrCode ?? undefined,
    });
  }

  async create(data: {
    sessionId: string;
    userId: string;
    phoneNumber: string;
  }): Promise<WhatsappSessionEntity> {
    const session = await this.prisma.whatsappSession.create({
      data,
    });

    return this.toDomain(session);
  }

  async findBySessionId(sessionId: string): Promise<WhatsappSessionEntity | null> {
    const session = await this.prisma.whatsappSession.findUnique({
      where: { sessionId },
    });

    return session ? this.toDomain(session) : null;
  }

  async findByUserIdAndSessionId(
    userId: string,
    sessionId: string,
  ): Promise<WhatsappSessionEntity | null> {
    const session = await this.prisma.whatsappSession.findFirst({
      where: {
        userId,
        sessionId,
      },
    });

    return session ? this.toDomain(session) : null;
  }

  async findByUserId(userId: string): Promise<WhatsappSessionEntity[]> {
    const sessions = await this.prisma.whatsappSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => this.toDomain(session));
  }

  async findActiveByUserId(userId: string): Promise<WhatsappSessionEntity[]> {
    const sessions = await this.prisma.whatsappSession.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => this.toDomain(session));
  }

  async update(
    id: string,
    data: Partial<WhatsappSessionEntity>,
  ): Promise<WhatsappSessionEntity> {
    const session = await this.prisma.whatsappSession.update({
      where: { id },
      data,
    });

    return this.toDomain(session);
  }

  async updateBySessionId(
    sessionId: string,
    data: Partial<WhatsappSessionEntity>,
  ): Promise<WhatsappSessionEntity> {
    const session = await this.prisma.whatsappSession.update({
      where: { sessionId },
      data,
    });

    return this.toDomain(session);
  }

  async countByUserId(userId: string): Promise<number> {
    return this.prisma.whatsappSession.count({
      where: { userId },
    });
  }

  async countActiveByUserId(userId: string): Promise<number> {
    return this.prisma.whatsappSession.count({
      where: {
        userId,
        isActive: true,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.whatsappSession.delete({
      where: { id },
    });
  }
}
