import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('players')
  players(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.admin.listPlayers(Number(limit) || 50, Number(offset) || 0);
  }

  @Patch('players/role')
  setRole(@Body() body: { playerId?: string; role?: 'user' | 'admin' }) {
    if (!body?.playerId || (body.role !== 'user' && body.role !== 'admin')) {
      return { error: 'invalid_body' };
    }
    return this.admin.setRole(body.playerId, body.role);
  }
}
