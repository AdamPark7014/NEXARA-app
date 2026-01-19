import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exception.filter';
import { appLogger } from './common/errors/logger';
import { Reflector } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExcelExportController } from './common/excel-export.controller';
import { ExcelExportService } from './common/excel-export.service';
import { ExcelImportController } from './common/excel-import.controller';
import { ProductsModule } from './products/products.module';
import { ClientsModule } from './clients/clients.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaService } from './prisma/prisma.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module';
import { EvidencesModule } from './evidences/evidences.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ExpensesModule } from './expenses/expenses.module';
import { GpsModule } from './gps/gps.module';
import { NotificationsModule } from './notifications.module';
import { ViaticosModule } from './viaticos/viaticos.module';

@Module({
  imports: [
    ProductsModule,
    ClientsModule,
    OrdersModule,
    UsersModule,
    AuthModule,
    ActivitiesModule,
    EvidencesModule,
    VehiclesModule,
    ExpensesModule,
    GpsModule,
    ScheduleModule.forRoot(),
    NotificationsModule,
    ViaticosModule,
  ],
  controllers: [AppController, ExcelExportController, ExcelImportController],
  providers: [
    AppService,
    PrismaService,
    Reflector,
    ExcelExportService,
    {
      provide: APP_FILTER,
      useFactory: () => new AllExceptionsFilter(appLogger),
    },
  ],
  exports: [Reflector]
})
export class AppModule {}
