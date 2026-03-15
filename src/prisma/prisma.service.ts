import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { envs } from '../config/envs';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private client: PrismaClient;

  constructor() {
    const pool = new Pool({ connectionString: envs.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    this.client = new PrismaClient({ adapter } as any);
  }

  get user() { return this.client.user; }
  get whatsappSession() { return this.client.whatsappSession; }
  get activity() { return this.client.activity; }

  async onModuleInit() {
    await this.client.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
