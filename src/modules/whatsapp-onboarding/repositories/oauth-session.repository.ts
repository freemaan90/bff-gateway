import { Injectable } from '@nestjs/common';
import { OAuthSessionStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OAuthSessionEntity } from '../domain/oauth-session.entity';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OAuthSessionRow = any;

@Injectable()
export class OAuthSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(row: OAuthSessionRow): OAuthSessionEntity {
    return new OAuthSessionEntity({
      id: row.id,
      clientId: row.clientId,
      state: row.state,
      pkceVerifier: row.pkceVerifier,
      encryptedToken: row.encryptedToken ?? undefined,
      wabaId: row.wabaId ?? undefined,
      phoneNumberId: row.phoneNumberId ?? undefined,
      status: row.status as OAuthSessionEntity['status'],
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    });
  }

  async create(data: {
    clientId: string;
    state: string;
    pkceVerifier: string;
    expiresAt: Date;
  }): Promise<OAuthSessionEntity> {
    const row = await this.prisma.oAuthSession.create({ data });
    return this.toDomain(row);
  }

  async findByState(state: string): Promise<OAuthSessionEntity | null> {
    const row = await this.prisma.oAuthSession.findUnique({ where: { state } });
    return row ? this.toDomain(row) : null;
  }

  /**
   * Retorna la sesión activa del usuario, filtrando por:
   * - status NOT IN [COMPLETED, FAILED]
   * - expiresAt > now()
   */
  async findActiveByUserId(userId: string): Promise<OAuthSessionEntity | null> {
    const row = await this.prisma.oAuthSession.findFirst({
      where: {
        clientId: userId,
        status: {
          notIn: [OAuthSessionStatus.COMPLETED, OAuthSessionStatus.FAILED],
        },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  async update(
    id: string,
    data: Partial<
      Pick<
        OAuthSessionEntity,
        'encryptedToken' | 'wabaId' | 'phoneNumberId' | 'status'
      >
    >,
  ): Promise<OAuthSessionEntity> {
    const row = await this.prisma.oAuthSession.update({
      where: { id },
      data: data as any,
    });
    return this.toDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.oAuthSession.delete({ where: { id } });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.oAuthSession.deleteMany({ where: { clientId: userId } });
  }
}
