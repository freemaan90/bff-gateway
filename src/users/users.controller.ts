import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('activity')
  async getActivity(@Request() req, @Query('limit') limit?: string) {
    const userId = req.user.id;
    const activityLimit = limit ? parseInt(limit, 10) : 50;
    return this.usersService.getUserActivity(userId, activityLimit);
  }

  @Get('stats')
  async getStats(@Request() req) {
    const userId = req.user.id;
    return this.usersService.getUserStats(userId);
  }
}
