import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exception.filter';
import { appLogger } from './common/errors/logger';
import { Reflector } from '@nestjs/core';
import { CoreModule } from './common/core.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExcelExportController } from './common/excel-export.controller';
import { ExcelExportService } from './common/excel-export.service';
import { ExcelImportController } from './common/excel-import.controller';
import { ExcelImportService } from './common/excel-import.service';
import { ClientsModule } from './clients/clients.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ActivitiesModule } from './activities/activities.module';
import { EvidencesModule } from './evidences/evidences.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ExpensesModule } from './expenses/expenses.module';
import { GpsModule } from './gps/gps.module';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ViaticosModule } from './viaticos/viaticos.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ProjectsModule } from './projects/projects.module';
import { ContactMessagesModule } from './contact-messages/contact-messages.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { NewsModule } from './news/news.module';
import { WorkProjectsModule } from './work-projects/work-projects.module';
import { EmployeePaymentsModule } from './employee-payments/employee-payments.module';
import { CotizacionesModule } from './cotizaciones/cotizaciones.module';
import { ServiceClientsModule } from './service-clients/service-clients.module';
import { ClientAuthModule } from './client-auth/client-auth.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { ServiceSheetsModule } from './service-sheets/service-sheets.module';
import { ClientTicketRequestsModule } from './client-ticket-requests/client-ticket-requests.module';
import { BranchAuthModule } from './branch-auth/branch-auth.module';
import { BranchPortalModule } from './branch-portal/branch-portal.module';
import { VentasModule } from './ventas/ventas.module';
import { ActivityEvidenceModule } from './activity-evidence/activity-evidence.module';
import { FinesModule } from './fines/fines.module.js';
import { ToolRequestsModule } from './tool-requests/tool-requests.module.js';
import { LunchBreaksModule } from './lunch-breaks/lunch-breaks.module.js';
import { CvsModule } from './cvs/cvs.module.js';
import { InventoriesModule } from './inventories/inventories.module.js';

@Module({
  imports: [
    CoreModule,
    PrismaModule,
    ClientsModule,
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
    AttendanceModule,
    ProjectsModule,
    ContactMessagesModule,
    NewsletterModule,
    NewsModule,
    WorkProjectsModule,
    EmployeePaymentsModule,
    CotizacionesModule,
    ServiceClientsModule,
    ClientAuthModule,
    ClientPortalModule,
    ServiceSheetsModule,
    ClientTicketRequestsModule,
    BranchAuthModule,
    BranchPortalModule,
    VentasModule,
    ActivityEvidenceModule,
    FinesModule,
    ToolRequestsModule,
    LunchBreaksModule,
    CvsModule,
    InventoriesModule,
  ],
  controllers: [AppController, ExcelExportController, ExcelImportController],
  providers: [
    AppService,
    ExcelExportService,
    ExcelImportService,
    {
      provide: APP_FILTER,
      useFactory: () => new AllExceptionsFilter(appLogger),
    },
  ],
})
export class AppModule {}

