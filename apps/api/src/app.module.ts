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
import { ExcelImportController } from './common/excel-import.controller';
import { ExcelModule } from './common/excel.module';
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
import { AlertsModule } from './alerts/alerts.module.js';
import { DevicesModule } from './devices/devices.module.js';
import { ViaticosModule } from './viaticos/viaticos.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ProjectsModule } from './projects/projects.module';
import { ContactMessagesModule } from './contact-messages/contact-messages.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { NewsModule } from './news/news.module';
import { HeroSlidesModule } from './hero-slides/hero-slides.module';
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
import { ActivityEvidenceModule } from './activities/evidence/activity-evidence.module';
import { FinesModule } from './fines/fines.module.js';
import { ToolRequestsModule } from './tool-requests/tool-requests.module.js';
import { LunchBreaksModule } from './attendance/lunch/lunch-breaks.module.js';
import { CvsModule } from './cvs/cvs.module.js';
import { InventoriesModule } from './inventories/inventories.module.js';
import { AccountingModule } from './accounting/accounting.module.js';
import { WarehouseModule } from './warehouse/warehouse.module.js';
import { ProcurementModule } from './procurement/procurement.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthModule } from './health/health.module';
import { SettingsModule } from './settings/settings.module';
import { UserPreferencesModule } from './user-preferences/user-preferences.module';
import { EmailModule } from './common/email/email.module.js';
import { CronModule } from './common/cron/cron.module.js';
import { HrModule } from './hr/hr.module.js';
import { SearchModule } from './search/search.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { AccessControlModule } from './access-control/access-control.module.js';
import { PacModule } from './pac/pac.module.js';
import { MaintenanceContractsModule } from './maintenance-contracts/maintenance-contracts.module.js';
import { TendersModule } from './tenders/tenders.module.js';
import { CrmActivitiesModule } from './crm-activities/crm-activities.module.js';
import { SalesTargetsModule } from './sales-targets/sales-targets.module.js';
import { KbModule } from './kb/kb.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { CompanyModule } from './company/company.module.js';
import { MobileCrmModule } from './mobile-crm/mobile-crm.module.js';
import { ExecutiveModule } from './executive/executive.module.js';
import { WorkflowModule } from './workflow/workflow.module.js';
import { SlaTrackerModule } from './sla-tracker/sla-tracker.module.js';
import { ExportsModule } from './exports/exports.module.js';
import { NocModule } from './noc/noc.module.js';
import { LabModule } from './lab/lab.module.js';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    CoreModule,
    ExcelModule,
    RealtimeModule, // @Global() — inyectable desde cualquier módulo
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
    DevicesModule,
    NotificationsModule,
    AlertsModule,
    ViaticosModule,
    AttendanceModule,
    ProjectsModule,
    ContactMessagesModule,
    NewsletterModule,
    NewsModule,
    HeroSlidesModule,
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
    // ── ERP Servicios IT/CCTV — Backoffice ──
    AccountingModule,
    WarehouseModule,
    ProcurementModule,
    MaintenanceModule,
    AuditModule,
    AnalyticsModule,
    DocumentsModule,
    HealthModule,
    SettingsModule,
    UserPreferencesModule,
    EmailModule,
    CronModule,
    HrModule,
    SearchModule,
    CatalogModule,
    AccessControlModule,
    PacModule,
    MaintenanceContractsModule,
    TendersModule,
    CrmActivitiesModule,
    SalesTargetsModule,
    KbModule,
    CalendarModule,
    CompanyModule,
    MobileCrmModule,
    ExecutiveModule,
    WorkflowModule,
    SlaTrackerModule,
    ExportsModule,
    NocModule,
    LabModule,
  ],
  controllers: [AppController, ExcelExportController, ExcelImportController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useFactory: () => new AllExceptionsFilter(appLogger),
    },
  ],
})
export class AppModule {}

