import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProyectosIncompletosService } from './proyectos-incompletos.service.js';

/** Separado del módulo de proyectos para evitar ciclos con ventas y contratos. */
@Module({ imports: [PrismaModule, NotificationsModule], providers: [ProyectosIncompletosService], exports: [ProyectosIncompletosService] })
export class ProyectosAvisosModule {}
