import { Injectable } from '@nestjs/common';
import { ActivityRepository } from '../modules/users/repositories/activity.repository';
import { WhatsappSessionRepository } from '../modules/whatsapp/repositories/whatsapp-session.repository';

// Service Layer - Lógica de negocio para usuarios
@Injectable()
export class UsersService {
  constructor(
    private readonly activityRepository: ActivityRepository,
    private readonly sessionRepository: WhatsappSessionRepository,
  ) {}

  async getUserActivity(userId: string, limit = 50) {
    const activities = await this.activityRepository.findByUserId(userId, limit);
    return activities.map((activity) => activity.toJSON());
  }

  async getUserStats(userId: string) {
    const [totalSessions, activeSessions, totalActivities] = await Promise.all([
      this.sessionRepository.countByUserId(userId),
      this.sessionRepository.countActiveByUserId(userId),
      this.activityRepository.countByUserId(userId),
    ]);

    return {
      totalSessions,
      activeSessions,
      totalActivities,
    };
  }

  async getRecentActivity(userId: string, hours: number = 24) {
    const activities = await this.activityRepository.findRecent(userId, hours);
    return activities.map((activity) => activity.toJSON());
  }
}
