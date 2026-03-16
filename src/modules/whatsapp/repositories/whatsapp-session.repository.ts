import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsappSessionEntity } from '../domain/whatsapp-session.entity';
import { EncryptionService } from '../../../common/encryption/encryption.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WhatsappSessionRow = any;

@Injectable()
export class WhatsappSessionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {}

  private toDomain(session: WhatsappSessionRow): WhatsappSessionEntity {
    return new WhatsappSessionEntity({
      ...session,
      sessionId: session.sessionId ?? null,
      channelType: (session.channelType as string) ?? 'UNOFFICIAL',
      phoneNumberId: session.phoneNumberId ?? undefined,
      accessToken: session.accessToken ?? undefined,
      wabaId: session.wabaId ?? undefined,
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

  async createOfficialSession(data: {
    userId: string;
    phoneNumber: string;
    phoneNumberId: string;
    accessToken: string;
    wabaId: string;
  }): Promise<WhatsappSessionEntity> {
    // Check for duplicate phoneNumberId for the same user
    const existing = await this.findOfficialByPhoneNumberIdAndUserId(
      data.phoneNumberId,
      data.userId,
    );
    if (existing) {
      throw new ConflictException(
        `Ya existe una sesión oficial con phoneNumberId ${data.phoneNumberId} para este usuario`,
      );
    }

    const encryptedToken = this.encryptionService.encrypt(data.accessToken);

    const session = await this.prisma.whatsappSession.create({
      data: {
        userId: data.userId,
        phoneNumber: data.phoneNumber,
        phoneNumberId: data.phoneNumberId,
        accessToken: encryptedToken,
        wabaId: data.wabaId,
        channelType: 'OFFICIAL',
        isReady: true,
        isActive: true,
        sessionId: null,
      } as any,
    });

    return this.toDomain(session);
  }

  async findOfficialByPhoneNumberIdAndUserId(
    phoneNumberId: string,
    userId: string,
  ): Promise<WhatsappSessionEntity | null> {
    const session = await (this.prisma.whatsappSession as any).findFirst({
      where: {
        phoneNumberId,
        userId,
        channelType: 'OFFICIAL',
        isActive: true,
      },
    });

    return session ? this.toDomain(session) : null;
  }

  decryptAccessToken(session: WhatsappSessionEntity): string {
    return this.encryptionService.decrypt(session.accessToken!);
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

  async findById(id: string): Promise<WhatsappSessionEntity | null> {
    const session = await this.prisma.whatsappSession.findUnique({
      where: { id },
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
      data: data as any,
    });

    return this.toDomain(session);
  }

  async updateBySessionId(
    sessionId: string,
    data: Partial<WhatsappSessionEntity>,
  ): Promise<WhatsappSessionEntity> {
    const session = await this.prisma.whatsappSession.update({
      where: { sessionId },
      data: data as any,
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
