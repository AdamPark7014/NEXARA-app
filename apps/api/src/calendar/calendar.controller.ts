import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CalendarService } from './calendar.service.js';
import { RbacGuard } from '../common/rbac.guard.js';

@Controller('calendar')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Get('events')
  events(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(Date.now() + 30 * 86400000);
    return this.service.getEvents({
      from: fromDate,
      to: toDate,
      ownerId: ownerId ? +ownerId : undefined,
    });
  }
}
