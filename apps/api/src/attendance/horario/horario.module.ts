import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ChatModule } from '../../chat/chat.module.js';
import { HorarioController } from './horario.controller.js';
import { HorarioService } from './horario.service.js';

@Module({
  imports: [PrismaModule, ChatModule],
  controllers: [HorarioController],
  providers: [HorarioService],
  exports: [HorarioService],
})
export class HorarioModule {}
