import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmployeePaymentsController } from './employee-payments.controller.js';
import { EmployeePaymentsService } from './employee-payments.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [EmployeePaymentsController],
  providers: [EmployeePaymentsService],
})
export class EmployeePaymentsModule {}
