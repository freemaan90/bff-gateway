import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActivityEntity, ActivityType } from '../domain/activity.entity';
import { Activity } from '@prisma/client';

@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(activity: Activity): ActivityEntity {
    return new ActivityEntity({
      ...activity,
      type: activity.type as ActivityType,
      sessionId: activity.sessionId ?? undefined,
      metadata: activity.metadata as Record<string, any> | undefined,
    });
  }

  async create(data: {
    userId: string;
    sessionId?: string;
    type: ActivityType | string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<ActivityEntity> {
    const activity = await this.prisma.activity.create({
      data: {
        userId: data.userId,
        sessionId: data.sessionId,
        type: data.type,
        description: data.description,
        metadata: data.metadata,
      },
    });

    return this.toDomain(activity);
  }

  async findByUserId(
    userId: string,
    limit: number = 50,
  ): Promise<ActivityEntity[]> {
    const activities = await this.prisma.activity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        session: {
          select: {
            sessionId: true,
            phoneNumber: true,
          },
        },
      },
    });

    return activities.map((activity) => this.toDomain(activity));
  }

  async findBySessionId(sessionId: string): Promise<ActivityEntity[]> {
    const activities = await this.prisma.activity.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    return activities.map((activity) => this.toDomain(activity));
  }

  async countByUserId(userId: string): Promise<number> {
    return this.prisma.activity.count({
      where: { userId },
    });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.activity.deleteMany({
      where: { userId },
    });
  }

  async findRecent(userId: string, hours: number = 24): Promise<ActivityEntity[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const activities = await this.prisma.activity.findMany({
      where: {
        userId,
        createdAt: {
          gte: since,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return activities.map((activity) => this.toDomain(activity));
  }
}
