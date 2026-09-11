# -*- coding: utf-8 -*-
"""Genera docs/NEXARA-MAPA-PRODUCTOS-Y-MODULOS.pdf — mapa de productos y módulos."""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Flowable,
)

ROOT = Path(r"C:\dev\apps\NEXARA-app")
CATALOG = json.loads((ROOT / ".ai" / "modules-catalog.json").read_text(encoding="utf-8"))
OUT = ROOT / "docs" / "NEXARA-MAPA-PRODUCTOS-Y-MODULOS.pdf"

INK = colors.HexColor("#102a43")
SKY = colors.HexColor("#4c6fff")
MINT = colors.HexColor("#2ec4b6")
ORANGE = colors.HexColor("#f97316")
GREEN = colors.HexColor("#10b981")
SLATE = colors.HexColor("#64748b")
LIGHT = colors.HexColor("#f1f5f9")
WHITE = colors.white

PANEL_META = {
    "erp": {
        "name": "NEXARA ERP (Core)",
        "host": "core.nexara.com.mx",
        "tagline": "Administración, finanzas, RH, almacén, compras y gobierno",
        "color": SKY,
        "who": "CEO, directores, admin, RH, contabilidad, almacén",
    },
    "crm": {
        "name": "NEXARA CRM (Sales)",
        "host": "sales.nexara.com.mx",
        "tagline": "Pipeline comercial, cotizaciones, clientes y licitaciones",
        "color": GREEN,
        "who": "Coord. ventas, vendedores, dirección comercial/admin",
    },
    "ops": {
        "name": "NEXARA OPS",
        "host": "ops.nexara.com.mx",
        "tagline": "Campo, OT, evidencias, flotilla, NOC, soporte y SLA",
        "color": ORANGE,
        "who": "Coord. ops, ingenieros de campo/soporte, NOC, PM",
    },
    "studio": {
        "name": "NEXARA STUDIO",
        "host": "studio.nexara.com.mx",
        "tagline": "CMS del sitio público, redes y captación web",
        "color": colors.HexColor("#a855f7"),
        "who": "Líder de diseño, diseñadores, marketing",
    },
    "integra": {
        "name": "NEXARA INTEGRA",
        "host": "integra.nexara.com.mx",
        "tagline": "CCTV (go2rtc MSE), ACS, Face, visitas, ANPR por sitio",
        "color": colors.HexColor("#ef4444"),
        "who": "Ops, NOC, ingenieros senior; cliente (lectura limitada)",
    },
    "lab": {
        "name": "NEXARA LAB",
        "host": "lab.nexara.com.mx",
        "tagline": "Sandbox técnico: flags, AI, health",
        "color": SLATE,
        "who": "CEO / super_admin",
    },
}

# Detalle operativo por módulo (anclado a docs + access-matrix; no inventar endpoints).
DETAIL: dict[str, dict] = {
    # ERP
    "executive": {
        "flujo": "Agrega KPIs de OPS (OT cerradas), CRM (pipeline), finanzas (AR/AP) y contratos. Lee estados canónicos de actividad.",
        "entidades": "Executive dashboard / analytics agregados",
        "conecta": "activities, ventas, accounting, maintenance-contracts, sla-tracker",
        "como": "El CEO y directores abren /erp/executive. Los contadores vienen de servicios executive/analytics; historicamente fallaban si el estatus de OT no era canónico (Finalizada vs Finalizado) — ya unificado.",
    },
    "dashboard": {
        "flujo": "Resumen personal del día: pendientes, aprobaciones, alertas.",
        "entidades": "Notificaciones + agregados por rol",
        "conecta": "approvals, notifications-center",
        "como": "Home interno distinto al ejecutivo: muestra lo que el usuario autenticado debe atender hoy según su rol.",
    },
    "chat": {
        "flujo": "Canales y DMs en tiempo real; valida membresía de canal antes de listar mensajes.",
        "entidades": "ChatChannel, mensajes, presencia",
        "conecta": "Todos los paneles tienen espejo de chat",
        "como": "Colaboración interna multi-tenant. No mezcla tokens de portal cliente.",
    },
    "reuniones": {
        "flujo": "Ritmo operativo (diario/semanal): agenda → acuerdos con responsable → lecciones y riesgos.",
        "entidades": "Meeting, Agreement, LessonLearned",
        "conecta": "activities, projects (referencia operativa)",
        "como": "Modela el pulso 10:00 / viernes de cierre del organigrama. Un acuerdo exige dueño; “vencido” se calcula, no se guarda.",
    },
    "approvals": {
        "flujo": "Bandeja de WorkflowInstance. Cadenas: viáticos, cotizaciones, compras, cierre de actividad (si hay definición ACTIVITY_CLOSURE).",
        "entidades": "WorkflowDefinition, WorkflowStep, WorkflowInstance, WorkflowApproval",
        "conecta": "viaticos, cotizaciones, procurement, activities/lifecycle",
        "como": "El motor existe; sin WorkflowDefinition activa no dispara. Umbrales MXN configurables. Validación del Arquitecto al cerrar OT se enciende creando ese flujo.",
    },
    "bi": {
        "flujo": "Tableros BI: cohortes, aging, tendencias por área.",
        "entidades": "Analytics insights",
        "conecta": "executive, crm-reports, warehouse insights, sla insights",
        "como": "Capa de lectura; no escribe transacciones. Zona México para “hoy”.",
    },
    "users": {
        "flujo": "Alta de personal, roleKey v2, IAM (sesiones, lockout, MFA TOTP, force logout).",
        "entidades": "User, UserSession, UserCompany, roleKey",
        "conecta": "RBAC url-matrix / page-matrix, SCIM, audit",
        "como": "Fuente de identidad. resolveEffectiveRoleKey en login. Matriz URL es la regla de oro de accesos.",
    },
    "companies": {
        "flujo": "Razones sociales, membresías UserCompany, API keys, billing seats.",
        "entidades": "Company, UserCompany, CompanyApiKey",
        "conecta": "TenantInterceptor (X-Company-Id) en casi todo dominio",
        "como": "Aislamiento multi-empresa: companyId en maestros fiscales/ops. Switcher en AppShell.",
    },
    "settings": {
        "flujo": "Parámetros de empresa, webhooks outbound HMAC, branding, feature gates de plan.",
        "entidades": "SystemSetting, FeatureFlag, Webhook",
        "conecta": "webhooks, billing Stripe, OIDC",
        "como": "Control center. Webhooks validan URL anti-SSRF (DNS resuelto).",
    },
    "architecture": {
        "flujo": "Mapa visual de módulos/paneles para dirección.",
        "entidades": "Derivado de access-matrix",
        "conecta": "MODULES registry",
        "como": "Documentación viva dentro del ERP, no un segundo CMS.",
    },
    "kb": {
        "flujo": "Procedimientos internos; espejo público parcial vía portal /tickets/ayuda.",
        "entidades": "KB articles / categorías",
        "conecta": "portal cliente, soporte",
        "como": "Reduce tickets repetidos; feedback “fue útil” en portal.",
    },
    "accounting": {
        "flujo": "Pólizas JournalEntry idempotentes por referencia. Egresos (gasto/viático/pago) → asiento al marcar pagado. GR → póliza de recepción.",
        "entidades": "Account, FiscalPeriod, JournalEntry, CostCenter",
        "conecta": "invoicing, banking, expenses, viatics, procurement, warehouse",
        "como": "Principio: una escritura financiera = un asiento. Cumplimiento: DIOT, Balanza/Catálogo XML SAT (condicionados a mapeo de cuentas).",
    },
    "invoicing": {
        "flujo": "Facturas AR CFDI → PAC timbrado → PDF/XML. Cancelaciones. Folios atómicos FolioCounter.",
        "entidades": "Invoice, conceptos, impuestos",
        "conecta": "SalesClient, accounting, client-portal, PAC",
        "como": "Totales redondeados por concepto (evita rechazo SAT por centavos). assertRefsBelongToCompany en FKs. Portal cliente descarga solo lo propio.",
    },
    "banking": {
        "flujo": "Cuentas bancarias, movimientos, pagos y conciliación básica.",
        "entidades": "BankAccount, movimientos",
        "conecta": "accounting, employee-payments, invoicing",
        "como": "Cierra el ciclo caja; matching avanzado es roadmap.",
    },
    "viatics-admin": {
        "flujo": "Revisión financiera de viáticos: solicitar (campo) → cadena aprobación → pagado → póliza.",
        "entidades": "Viatico (usuarioId + actividadId)",
        "conecta": "ops-viatics / my-viatics, approvals, accounting",
        "como": "Viáticos son individuales por asignado (no prorrateo). Sidebar: finanzas para admin/RH/conta; OPS para campo/coord.",
    },
    "expenses-admin": {
        "flujo": "Captura de gastos → autorización → pagado → JournalEntry.",
        "entidades": "Expense",
        "conecta": "approvals, accounting",
        "como": "Misma disciplina de póliza que viáticos.",
    },
    "employee-payments": {
        "flujo": "Dispersiones internas (no CFDI nómina). Puede calcularse desde AttendanceDay.totalMinutes.",
        "entidades": "EmployeePayment",
        "conecta": "attendance, accounting, hr",
        "como": "Botón Calcular suma minutos del periodo. CFDI tipo N es Fase 3 / fuera de P0.",
    },
    "hr": {
        "flujo": "Expediente de colaboradores, vacaciones, ficha HR con fotos de asistencia.",
        "entidades": "HR profile, leaves",
        "conecta": "attendance, fines, orgchart, users",
        "como": "People Intelligence en dashboard HR (puntualidad, carga, leaves).",
    },
    "attendance": {
        "flujo": "Checador ERP (jornada en zona MX) + contraste con puertas ACS Integra.",
        "entidades": "AttendanceDay, punches, fotos /uploads/attendance",
        "conecta": "integra-attendance, employee-payments, lunch-breaks",
        "como": "Jornadas se cortan al fin del día local; no UTC. Fotos for-user en ficha HR.",
    },
    "lunch-breaks": {
        "flujo": "Pausas de comida/descanso ligadas al control horario.",
        "entidades": "LunchBreak",
        "conecta": "attendance",
        "como": "Dominio hermano de asistencia (no módulo genérico aparte a largo plazo).",
    },
    "fines": {
        "flujo": "Multas/faltas; estatus de pago canónico Pagado/Pagada normalizado.",
        "entidades": "Fine",
        "conecta": "hr, employee-payments",
        "como": "Escritura normaliza; lectura tolera grafías históricas.",
    },
    "orgchart": {
        "flujo": "Árbol por managerId.",
        "entidades": "User.managerId",
        "conecta": "notification-hierarchy, approvals",
        "como": "Árbol plano; no modela aún la cadena Ingeniería→Arquitecto→Admin→Dirección como workflow de reporte.",
    },
    "kpis-hr": {
        "flujo": "Productividad y desempeño por área.",
        "entidades": "KPIs HR / insights",
        "conecta": "hr, attendance, activities",
        "como": "Capa analítica de personas.",
    },
    "warehouse": {
        "flujo": "Almacenes, ubicaciones, StockLevel, movimientos, reservas atómicas, cycle counts, insights ABC/aging.",
        "entidades": "Warehouse, StockLevel, StockMovement, StockReservation, CycleCount",
        "conecta": "procurement, activities (activityId en movimiento), crm-products",
        "como": "Descuento/reserva con guarda en UPDATE. Material por actividad permite costo real de OT.",
    },
    "procurement": {
        "flujo": "Requisición → RFQ multi-proveedor → OC → GoodsReceipt (landed cost) → stock WAC → factura AP.",
        "entidades": "PurchaseOrder, PurchaseRFQ, GoodsReceipt, Supplier (crédito/volumen mayorista)",
        "conecta": "warehouse, accounting, approvals",
        "como": "Crédito de mayorista avisa, no bloquea. Folios FolioCounter. 3-way match roadmap.",
    },
    "documents": {
        "flujo": "Gestión documental versionada (contratos, compliance).",
        "entidades": "ManagedDocument, DocumentVersion, DocumentCategory",
        "conecta": "hr, companies, crm",
        "como": "Control documental de Administración.",
    },
    "audit": {
        "flujo": "MutationAuditInterceptor; purge/erase PII GDPR/LFPDPPP.",
        "entidades": "AuditLog",
        "conecta": "users IAM",
        "como": "SoT de cambios sensibles; export CSV.",
    },
    "exports": {
        "flujo": "Exportaciones Excel/PDF globales autorizadas.",
        "entidades": "Jobs de export",
        "conecta": "varios dominios",
        "como": "Salida masiva para dirección/conta.",
    },
    "notifications-center": {
        "flujo": "Inbox de alertas y comunicados; jerarquía de notificación.",
        "entidades": "Notification",
        "conecta": "todos los paneles",
        "como": "Hoy una empresa; al multi-tenant hay que filtrar admins por empresa.",
    },
    "news": {
        "flujo": "Comunicados internos + métricas de lectura.",
        "entidades": "Internal comunicados / News",
        "conecta": "notifications",
        "como": "StaffOnlyGuard: portal externo no puede mutar comunicados.",
    },
    "calendar": {
        "flujo": "Agenda personal/equipo (reuniones, OT, visitas).",
        "entidades": "Calendar events",
        "conecta": "reuniones, activities, crm-agenda",
        "como": "Vista de tiempo; no reemplaza módulos de dominio.",
    },
    "my-profile": {
        "flujo": "Preferencias y datos personales del usuario.",
        "entidades": "User preferences",
        "conecta": "users",
        "como": "Cuenta propia en cada panel.",
    },
    "facilities-access": {
        "flujo": "ACS de oficinas NEXARA (HikCentral oficinas) — separado de Integra sitio.",
        "entidades": "access-control API /api/access-control",
        "conecta": "No mezclar con /api/integra",
        "como": "Puente LAN vía NAS Synology. Credenciales OFFICES_HIK_*. UI /erp/facilities/access.",
    },
    # CRM
    "crm-dashboard": {
        "flujo": "KPIs comerciales, forecast ponderado, actividad del equipo.",
        "entidades": "Insights CRM (LTV, churn risk, cohortes)",
        "conecta": "opportunities, quotes, targets",
        "como": "Home de sales.nexara.com.mx.",
    },
    "crm-chat": {
        "flujo": "Chat del equipo comercial.",
        "entidades": "ChatChannel",
        "conecta": "chat global",
        "como": "Misma infra de chat con panel CRM.",
    },
    "crm-leads": {
        "flujo": "Prospectos sin calificar → calificar a oportunidad o descartar. También entran leads de Studio/web.",
        "entidades": "Lead",
        "conecta": "studio-leads, studio-contacts, crm-opportunities",
        "como": "Entrada del embudo. Tenant companyId NOT NULL.",
    },
    "crm-opportunities": {
        "flujo": "Negocio en etapas; tabs pipeline, cotizaciones, actividades comerciales, documentos.",
        "entidades": "Opportunity / SalesOpportunity",
        "conecta": "crm-quotes, crm-pipeline, crm-agenda, crm-projects",
        "como": "Corazón del CRM. Al ganar → proyecto de venta / handoff OPS.",
    },
    "crm-pipeline": {
        "flujo": "Kanban visual por etapa.",
        "entidades": "Mismas oportunidades",
        "conecta": "crm-opportunities",
        "como": "Vista alternativa de las mismas entidades.",
    },
    "crm-agenda": {
        "flujo": "Llamadas, visitas, demos (crm-activities / sales-activities).",
        "entidades": "CrmActivity",
        "conecta": "opportunities, calendar",
        "como": "No confundir con Activity de OPS (OT de campo).",
    },
    "crm-clients": {
        "flujo": "SalesClient maestro comercial; tabs datos, sucursales, servicios, tickets, cotizaciones, facturas. Proyección ServiceClient vía FK.",
        "entidades": "SalesClient, contactos, sucursales",
        "conecta": "ops-service-clients, invoicing, portal, quotes",
        "como": "Una cuenta comercial; OPS/portal ven la proyección de servicio.",
    },
    "crm-products": {
        "flujo": "SKUs, precios, stock visible; mano de obra facturable (horas × tarifa) en líneas de cotización.",
        "entidades": "Product, Brand, precios",
        "conecta": "warehouse, cotizaciones, smart-quote",
        "como": "Catálogo compartido ventas/almacén.",
    },
    "crm-quotes": {
        "flujo": "Builder de cotización → aprobación por umbral → PDF/firma. Siempre con FK SalesClient.",
        "entidades": "Cotizacion, líneas, plantillas",
        "conecta": "approvals, smart-quote, client-portal quotes",
        "como": "Cadena: Vendedor → Coord.Ventas (>50k) → Dir.Ops (>250k) → CEO (>1M).",
    },
    "crm-templates": {
        "flujo": "Plantillas reutilizables de documentos/mensajes.",
        "entidades": "Templates",
        "conecta": "quotes, studio",
        "como": "Acelera propuestas repetibles.",
    },
    "crm-projects": {
        "flujo": "Negocios ganados: costos (productos/viáticos), handoff a OperationalProject / OT.",
        "entidades": "SalesProject",
        "conecta": "ops-projects, ops-activities",
        "como": "Puente comercial → operación.",
    },
    "crm-tenders": {
        "flujo": "Licitaciones públicas/privadas.",
        "entidades": "Tender",
        "conecta": "opportunities, documents",
        "como": "Track de procesos de compra pública/privada.",
    },
    "crm-sales-team": {
        "flujo": "Gestión de ejecutivos de venta.",
        "entidades": "Users con roles ventas",
        "conecta": "targets, reports",
        "como": "Solo leads de ventas.",
    },
    "crm-targets": {
        "flujo": "Cuotas, forecast y cumplimiento.",
        "entidades": "SalesTarget",
        "conecta": "opportunities, reports",
        "como": "Metas por persona/equipo.",
    },
    "crm-reports": {
        "flujo": "Análisis de pipeline y cierre.",
        "entidades": "Reportes CRM",
        "conecta": "bi, dashboard",
        "como": "Capa analítica comercial.",
    },
    # OPS
    "ops-dashboard": {
        "flujo": "OT abiertas, alertas, SLA del día.",
        "entidades": "Agregados activities + sla",
        "conecta": "activities, noc, support",
        "como": "Home de campo/coord. Soft-fail de viatics no tumba el home.",
    },
    "ops-dispatch": {
        "flujo": "Asignación masiva y mapa en vivo de cuadrillas.",
        "entidades": "Activities + GPS",
        "conecta": "ops-gps, ops-activities",
        "como": "Despacho para OPS_LEADS.",
    },
    "ops-chat": {
        "flujo": "Chat de operaciones.",
        "entidades": "ChatChannel",
        "conecta": "chat",
        "como": "Coordinación en sitio.",
    },
    "ops-projects": {
        "flujo": "OperationalProject: conversión de venta a OT, ingenieros asignados.",
        "entidades": "OperationalProject / WorkProject",
        "conecta": "crm-projects, activities",
        "como": "Contenedor de varias actividades de un proyecto ganado.",
    },
    "ops-activities": {
        "flujo": "OT equipo: crear Con/Sin proyecto, multi-asignación (LEAD/TECNICO/APOYO), reasignación con historial, tabs Detalle/Evidencias/Viáticos/Equipo/Aprobaciones.",
        "entidades": "Activity, ActivityAssignee, ActivityReassignment, ServiceSheet",
        "conecta": "evidences, viatics, warehouse materials, maintenance visits, client tickets, lifecycle",
        "como": "Eje de OPS. Cierre real vía hoja de servicio → ActivityLifecycleService: visita contrato COMPLETED, ticket portal CLOSED, workflow ACTIVITY_CLOSURE opcional. Estados canónicos.",
    },
    "ops-my-activities": {
        "flujo": "Misma entidad Activity filtrada al técnico: iniciar, evidencias, cerrar en sitio (móvil/web).",
        "entidades": "Activity (scope self)",
        "conecta": "ops-activities",
        "como": "Vista self para ing_campo/soporte. Pares team/self en sidebar.",
    },
    "ops-evidences": {
        "flujo": "Revisión de fotos/firmas/hojas (integrado como pestaña; menú oculto).",
        "entidades": "Evidence / activity-evidence",
        "conecta": "activities, service-sheets",
        "como": "Al completar evidencias puede dejar OT en Pendiente hasta validación admin — regla de negocio vigente.",
    },
    "ops-my-evidences": {
        "flujo": "Subida de evidencias propias.",
        "entidades": "Evidence",
        "conecta": "ops-my-activities",
        "como": "Menú oculto; se usa desde detalle de actividad.",
    },
    "ops-viatics": {
        "flujo": "Revisar/autorizar viáticos del equipo.",
        "entidades": "Viatico",
        "conecta": "viatics-admin, approvals",
        "como": "Vista team de coord ops.",
    },
    "ops-my-viatics": {
        "flujo": "Solicitar y comprobar gastos de campo ligados a actividad.",
        "entidades": "Viatico",
        "conecta": "activities",
        "como": "Vista self de ingenieros.",
    },
    "ops-vehicles": {
        "flujo": "Flotilla, asignación a cuadrillas.",
        "entidades": "VehicleAsset",
        "conecta": "ops-my-vehicles, gps",
        "como": "Arquitecto no gestiona flotilla (sidebar).",
    },
    "ops-my-vehicles": {
        "flujo": "Solicitar/entregar unidad asignada.",
        "entidades": "Vehicle assignment",
        "conecta": "ops-vehicles",
        "como": "Campo.",
    },
    "ops-gps": {
        "flujo": "Rastreo de cuadrillas (día en zona MX).",
        "entidades": "GPS tracks",
        "conecta": "dispatch, vehicles",
        "como": "Solo managers OPS.",
    },
    "ops-tools": {
        "flujo": "Kits/préstamos; deliver atómico (no doble asignación).",
        "entidades": "Tool models / ToolRequest",
        "conecta": "warehouse",
        "como": "Cuidado de herramientas de Ingeniería.",
    },
    "ops-service-clients": {
        "flujo": "Cuentas con servicio activo (proyección ops de SalesClient).",
        "entidades": "ServiceClient",
        "conecta": "crm-clients, maintenance, portal, assets",
        "como": "Maestro operativo de cliente con contrato.",
    },
    "ops-maintenance": {
        "flujo": "Visitas preventivas/correctivas; materializa visita → Activity.",
        "entidades": "Maintenance + visits",
        "conecta": "maintenance-contracts, activities",
        "como": "Al cerrar OT, visita pasa a COMPLETED.",
    },
    "ops-maintenance-contracts": {
        "flujo": "SLA, vigencias, alcance; accesible desde mantenimiento (menú no duplicado).",
        "entidades": "MaintenanceContract, MaintenanceContractVisit",
        "conecta": "sla-tracker, analytics",
        "como": "Contratos de servicio continuo.",
    },
    "ops-assets": {
        "flujo": "Equipos instalados por cliente (inventario en sitio).",
        "entidades": "Assets de campo",
        "conecta": "service-clients, maintenance",
        "como": "CMMS ligero de activos.",
    },
    "ops-noc": {
        "flujo": "Monitoreo uptime/alertas 24/7.",
        "entidades": "NOC alerts",
        "conecta": "integra events/alarms, support",
        "como": "Sala de monitoreo.",
    },
    "ops-support-inbox": {
        "flujo": "Tickets de clientes (portal → ClientTicketRequest → Activity).",
        "entidades": "ClientTicketRequest, tickets",
        "conecta": "portal, activities, sla",
        "como": "Bandeja de soporte; al cerrar servicio el ticket pasa CLOSED.",
    },
    "ops-support-sla": {
        "flujo": "Cumplimiento por prioridad/contrato; insights MTTR/backlog.",
        "entidades": "SLA tracker",
        "conecta": "support, contracts, portal countdown",
        "como": "Command Center SLA. Reasignar reinicia fechaAsignacion.",
    },
    "ops-cvs": {
        "flujo": "CVs de candidatos técnicos (lectura para PM/HR).",
        "entidades": "CV",
        "conecta": "hr",
        "como": "Reclutamiento técnico, no ATS completo.",
    },
    # STUDIO
    "studio-dashboard": {
        "flujo": "Tráfico, leads y campañas del sitio.",
        "entidades": "Métricas marketing",
        "conecta": "studio-leads, contacts",
        "como": "Home creativo.",
    },
    "studio-chat": {"flujo": "Chat creativo.", "entidades": "Chat", "conecta": "chat", "como": "Equipo diseño."},
    "studio-hero": {
        "flujo": "Carrusel hero del sitio (slides/video). StaffOnly.",
        "entidades": "HeroSlide, HeroVideo",
        "conecta": "sitio público nexara.com.mx",
        "como": "Publish controlado; RBAC STUDIO_CONTENT_*.",
    },
    "studio-pages": {
        "flujo": "Secciones CMS con draft/preview/publish y PageContentRevision + rollback.",
        "entidades": "PageContent, revisions",
        "conecta": "sitio público",
        "como": "Versionado en cada publish.",
    },
    "studio-cases": {
        "flujo": "Casos de éxito publicados.",
        "entidades": "CaseStudy",
        "conecta": "sitio público",
        "como": "Portafolio.",
    },
    "studio-news": {
        "flujo": "Blog/noticias del sitio.",
        "entidades": "News",
        "conecta": "sitio público",
        "como": "Contenido editorial.",
    },
    "studio-social": {
        "flujo": "Calendario de posts + métricas de resultado (impresiones/alcance).",
        "entidades": "SocialPost + metrics",
        "conecta": "redes externas",
        "como": "Creativa reporta métricas a las 17:00 — ahora hay dónde registrarlas.",
    },
    "studio-newsletter": {
        "flujo": "Boletín a clientes/leads.",
        "entidades": "Newsletter",
        "conecta": "contacts",
        "como": "Email marketing ligero.",
    },
    "studio-contacts": {
        "flujo": "Formularios del sitio → bandeja.",
        "entidades": "ContactMessage",
        "conecta": "crm-leads",
        "como": "Captación.",
    },
    "studio-leads": {
        "flujo": "Prospectos de marketing hacia CRM.",
        "entidades": "Lead (origen web)",
        "conecta": "crm-leads",
        "como": "Handoff creativo → ventas.",
    },
    # LAB
    "lab-home": {"flujo": "Hub sandbox.", "entidades": "—", "conecta": "flags, ai, health", "como": "Solo CEO."},
    "lab-chat": {"flujo": "Chat lab.", "entidades": "Chat", "conecta": "chat", "como": "CEO."},
    "lab-ai": {"flujo": "Pruebas de modelos/prompts.", "entidades": "AI sandbox", "conecta": "ai module", "como": "No producción."},
    "lab-flags": {"flujo": "Feature flags de plataforma.", "entidades": "FeatureFlag", "conecta": "settings", "como": "Ops de plataforma."},
    "lab-health": {"flujo": "Health de servicios API.", "entidades": "health checks", "conecta": "observability", "como": "Diagnóstico."},
    # INTEGRA
    "integra-home": {
        "flujo": "Consola: árbol sitio, puertas, video, eventos en vivo. Espejo Prisma + sync.",
        "entidades": "IntegraSite, devices, cameras, doors",
        "conecta": "todos módulos integra",
        "como": "Providers: ISAPI (LAN+edge), Artemis, HCT. Sync cron 15 min con backoff.",
    },
    "integra-video": {
        "flujo": "Video wall MSE vía go2rtc WebSocket; sub-stream H.264. Playback NVR.",
        "entidades": "Camera streams",
        "conecta": "go2rtc, edge box",
        "como": "No HLS autoplay; no hls.js CDN (CSP). HCT usa EZUIKit, no go2rtc.",
    },
    "integra-detection": {
        "flujo": "Región/sensibilidad/ruido por cámara (configuración equipo).",
        "entidades": "Detection config",
        "conecta": "video",
        "como": "Fuera del set de módulos cliente.",
    },
    "integra-events": {
        "flujo": "Eventos Face ACS con nombre/foto.",
        "entidades": "Access events",
        "conecta": "people, access",
        "como": "Push/sondeo según provider.",
    },
    "integra-alarms": {
        "flujo": "Búsqueda de alarmas del sitio.",
        "entidades": "Alarms",
        "conecta": "noc, video",
        "como": "Monitoreo.",
    },
    "integra-access": {
        "flujo": "Abrir puertas y privilegios.",
        "entidades": "Doors / rights",
        "conecta": "people, schedules, espacios",
        "como": "Comando live al equipo vía API site.",
    },
    "integra-people": {
        "flujo": "Alta persona + Face ID en terminales; espejo id/nombre/tipo (ampliable faceURL/gender/Valid/RightPlan).",
        "entidades": "Integra people mirror",
        "conecta": "schedules, visitors, attendance",
        "como": "Solo rutas ISAPI verificadas en INTEGRA-LAN.md.",
    },
    "integra-schedules": {
        "flujo": "RightPlan: cuándo/qué puertas.",
        "entidades": "Schedules",
        "conecta": "people, access",
        "como": "Política temporal de acceso.",
    },
    "integra-espacios": {
        "flujo": "Puertas indefinido vs temporal; uso planificado; vivo.",
        "entidades": "Spaces / doors meta",
        "conecta": "access",
        "como": "Organiza planta.",
    },
    "integra-attendance": {
        "flujo": "Marcas ACS por puerta; contraste con ERP /hr/attendance.",
        "entidades": "ACS punches",
        "conecta": "erp attendance",
        "como": "No reemplaza checador ERP; lo contrasta.",
    },
    "integra-visitors": {
        "flujo": "Visita única o recurrente con acceso ACS limitado al llegar.",
        "entidades": "Visitors",
        "conecta": "people, access",
        "como": "Ver INTEGRA-VISITAS-RECURRENTES.md.",
    },
    "integra-vehicles": {
        "flujo": "Flota registrada en el sitio.",
        "entidades": "Site vehicles",
        "conecta": "anpr",
        "como": "Distinto de flotilla OPS de NEXARA.",
    },
    "integra-anpr": {
        "flujo": "Cruces de reconocimiento de placas.",
        "entidades": "ANPR events",
        "conecta": "vehicles, alarms",
        "como": "Monitoreo vehicular.",
    },
    "integra-settings": {
        "flujo": "Sitios, provider, secrets cifrados, edge token, sync.",
        "entidades": "IntegraSite",
        "conecta": "edge ADR-0021",
        "como": "Roles altos. Credenciales fuera del repo.",
    },
    "integra-audit": {
        "flujo": "Bitácora de controles/mutaciones Integra.",
        "entidades": "Integra audit",
        "conecta": "settings",
        "como": "Compliance del sitio.",
    },
    "integra-map": {
        "flujo": "Plano con pines de puertas/cámaras.",
        "entidades": "Map layout",
        "conecta": "video, access",
        "como": "Situational awareness.",
    },
    "integra-notifications": {
        "flujo": "Alertas Integra.",
        "entidades": "Notifications",
        "conecta": "notifications-center",
        "como": "Inbox del panel.",
    },
    "integra-my-profile": {
        "flujo": "Perfil en panel Integra.",
        "entidades": "User",
        "conecta": "users",
        "como": "Cuenta.",
    },
}

PORTAL_SECTION = {
    "name": "PORTAL CLIENTE",
    "host": "portal.nexara.com.mx",
    "tagline": "Clientes externos: tickets, SLA, facturas CFDI, cotizaciones, KB",
    "modulos": [
        ("Tickets", "Abrir/seguir solicitudes; se enlazan a Activity vía ClientTicketRequest; al cerrar servicio → CLOSED."),
        ("SLA en vivo", "Countdown/incumplimiento por prioridad (mismos umbrales que sla-tracker) en el cliente."),
        ("Facturas", "Lista AR ligada a SalesClient.serviceClientId; descarga PDF/XML con ownership."),
        ("Cotizaciones", "Lista + PDF desde CotizacionesService."),
        ("Centro de ayuda", "KB pública enlazada desde el sidebar."),
        ("Auth", "Tokens isClient/isBranchUser; StaffOnlyGuard evita que toquen módulos internos."),
    ],
}


class BoxDiagram(Flowable):
    """Diagrama de productos NEXARA."""

    def __init__(self, width=17 * cm, height=9.2 * cm):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        boxes = [
            (0.2, 5.2, 3.9, 2.2, "ERP / Core", "core.*", SKY),
            (4.4, 5.2, 3.9, 2.2, "CRM / Sales", "sales.*", GREEN),
            (8.6, 5.2, 3.9, 2.2, "OPS", "ops.*", ORANGE),
            (12.8, 5.2, 3.9, 2.2, "STUDIO", "studio.*", colors.HexColor("#a855f7")),
            (0.2, 1.8, 3.9, 2.2, "INTEGRA", "integra.*", colors.HexColor("#ef4444")),
            (4.4, 1.8, 3.9, 2.2, "PORTAL", "portal.*", colors.HexColor("#0ea5e9")),
            (8.6, 1.8, 3.9, 2.2, "LAB", "lab.*", SLATE),
            (12.8, 1.8, 3.9, 2.2, "API Nest", "api + Postgres", INK),
        ]
        for x, y, w, h, title, sub, col in boxes:
            c.setFillColor(col)
            c.roundRect(x * cm, y * cm, w * cm, h * cm, 6, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 11)
            c.drawCentredString((x + w / 2) * cm, (y + h / 2 + 0.25) * cm, title)
            c.setFont("Helvetica", 8)
            c.drawCentredString((x + w / 2) * cm, (y + h / 2 - 0.35) * cm, sub)
        c.setStrokeColor(INK)
        c.setLineWidth(1.2)
        # Flechas conceptuales hacia API
        c.setDash(3, 2)
        for x in (2.15, 6.35, 10.55, 14.75):
            c.line(x * cm, 5.2 * cm, 14.75 * cm, 4.0 * cm)
        c.setDash()
        c.setFillColor(INK)
        self.canv.setFont("Helvetica-Oblique", 8)
        c.drawString(0.3 * cm, 0.4 * cm, "Todos los paneles → API Nest multi-tenant (companyId) → Postgres. Móvil Android/iOS consume la misma API.")


class FlowDiagram(Flowable):
    def __init__(self, width=17 * cm, height=4.5 * cm):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        steps = [
            (0.2, "Lead/Web", GREEN),
            (2.7, "Oportunidad", GREEN),
            (5.2, "Cotización", GREEN),
            (7.7, "Proyecto", ORANGE),
            (10.2, "OT/Campo", ORANGE),
            (12.7, "Cierre", ORANGE),
            (15.0, "Factura", SKY),
        ]
        y = 2.2
        for i, (x, label, col) in enumerate(steps):
            c.setFillColor(col)
            c.roundRect(x * cm, y * cm, 2.2 * cm, 1.2 * cm, 4, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 8)
            c.drawCentredString((x + 1.1) * cm, (y + 0.45) * cm, label)
            if i < len(steps) - 1:
                c.setStrokeColor(INK)
                c.setLineWidth(1.5)
                c.line((x + 2.2) * cm, (y + 0.6) * cm, (steps[i + 1][0]) * cm, (y + 0.6) * cm)
        c.setFillColor(INK)
        c.setFont("Helvetica", 8)
        c.drawString(0.3 * cm, 0.9 * cm, "Paralelos: Viáticos/Stock/Materiales ↔ OT · Contrato mant. → visita → OT · Portal ticket → OT · Evidencias → hoja servicio → lifecycle")
        c.drawString(0.3 * cm, 0.35 * cm, "Aprobaciones: cotizaciones / compras / viáticos / (opcional) ACTIVITY_CLOSURE por Arquitecto")


def styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle(name="CoverTitle", fontName="Helvetica-Bold", fontSize=26, textColor=INK, alignment=TA_CENTER, spaceAfter=12))
    ss.add(ParagraphStyle(name="CoverSub", fontName="Helvetica", fontSize=12, textColor=SLATE, alignment=TA_CENTER, spaceAfter=8))
    ss.add(ParagraphStyle(name="H1", fontName="Helvetica-Bold", fontSize=16, textColor=INK, spaceBefore=14, spaceAfter=8))
    ss.add(ParagraphStyle(name="H2", fontName="Helvetica-Bold", fontSize=13, textColor=SKY, spaceBefore=10, spaceAfter=6))
    ss.add(ParagraphStyle(name="H3", fontName="Helvetica-Bold", fontSize=11, textColor=INK, spaceBefore=8, spaceAfter=4))
    ss.add(ParagraphStyle(name="Body", fontName="Helvetica", fontSize=9, textColor=INK, alignment=TA_JUSTIFY, leading=12, spaceAfter=4))
    ss.add(ParagraphStyle(name="Small", fontName="Helvetica", fontSize=8, textColor=SLATE, leading=10, spaceAfter=3))
    ss.add(ParagraphStyle(name="BulletBody", fontName="Helvetica", fontSize=9, textColor=INK, leading=11, leftIndent=10, spaceAfter=2))
    return ss


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LIGHT)
    canvas.line(1.5 * cm, 1.2 * cm, letter[0] - 1.5 * cm, 1.2 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(SLATE)
    canvas.drawString(1.5 * cm, 0.7 * cm, "NEXARA · Mapa de productos y módulos · Confidencial interno")
    canvas.drawRightString(letter[0] - 1.5 * cm, 0.7 * cm, f"pág. {doc.page}")
    canvas.restoreState()


def product_intro(panel: str, s) -> list:
    meta = PANEL_META[panel]
    mods = [m for m in CATALOG if m["panel"] == panel]
    groups = defaultdict(list)
    for m in mods:
        groups[m["group"]].append(m)
    story = [
        Paragraph(f"{meta['name']}", s["H1"]),
        Paragraph(f"<b>Subdominio:</b> {meta['host']} &nbsp;|&nbsp; <b>Quién:</b> {meta['who']}", s["Body"]),
        Paragraph(meta["tagline"], s["Body"]),
        Paragraph(
            f"Este producto agrupa <b>{len(mods)} módulos</b> en {len(groups)} grupos de menú "
            f"({sum(1 for m in mods if m['visible'])} visibles en sidebar).",
            s["Body"],
        ),
        Spacer(1, 4),
    ]
    return story


def module_block(m: dict, s) -> KeepTogether:
    d = DETAIL.get(m["id"], {})
    url = f"/{m['panel']}{m['path'] if m['path'] != '/' else ''}"
    vis = "visible" if m["visible"] else "oculto en menú (ruta activa)"
    bits = [
        Paragraph(f"{m['label']} <font color='#64748b'>({m['id']})</font>", s["H3"]),
        Paragraph(f"<b>Ruta:</b> {url} &nbsp;·&nbsp; <b>Grupo:</b> {m['group']} &nbsp;·&nbsp; <b>Menú:</b> {vis}", s["Small"]),
        Paragraph(f"<b>Qué es:</b> {m['description']}", s["Body"]),
    ]
    if d:
        bits.append(Paragraph(f"<b>Cómo funciona:</b> {d.get('como', '')}", s["Body"]))
        bits.append(Paragraph(f"<b>Flujo principal:</b> {d.get('flujo', '')}", s["Body"]))
        bits.append(Paragraph(f"<b>Entidades:</b> {d.get('entidades', '')}", s["Small"]))
        bits.append(Paragraph(f"<b>Se conecta con:</b> {d.get('conecta', '')}", s["Small"]))
    else:
        bits.append(
            Paragraph(
                "Módulo registrado en access-matrix; detalle operativo = descripción del catálogo canónico.",
                s["Small"],
            )
        )
    bits.append(Spacer(1, 6))
    return KeepTogether(bits)


def build():
    s = styles()
    story: list = []

    # Portada
    story.append(Spacer(1, 2.2 * cm))
    story.append(Paragraph("NEXARA", s["CoverTitle"]))
    story.append(Paragraph("Mapa de productos, diagramas y detalle de módulos", s["CoverSub"]))
    story.append(Paragraph("Fuente canónica: apps/web/lib/access-matrix.ts · Arquitectura v2 · docs internos", s["CoverSub"]))
    story.append(Paragraph("Generado 2026-09-10 · Rama mejora/calidad-y-web", s["CoverSub"]))
    story.append(Spacer(1, 0.8 * cm))
    story.append(BoxDiagram())
    story.append(PageBreak())

    # Índice conceptual
    story.append(Paragraph("1. Panorama del sistema", s["H1"]))
    story.append(
        Paragraph(
            "NEXARA es un ERP vertical de servicios tecnológicos en México (CCTV, redes, mantenimiento SLA, "
            "venta de hardware y proyectos). El sistema se reparte en <b>seis paneles web</b> + <b>portal de cliente</b> "
            "+ apps nativas Android/iOS, todos contra la misma API Nest multi-tenant.",
            s["Body"],
        )
    )
    story.append(Paragraph("1.1 Productos (paneles)", s["H2"]))
    data = [["Producto", "Host", "Módulos", "Enfoque"]]
    for pid, meta in PANEL_META.items():
        n = sum(1 for m in CATALOG if m["panel"] == pid)
        data.append([meta["name"].split("(")[0].strip(), meta["host"], str(n), meta["tagline"][:48] + "…"])
    data.append(["PORTAL", PORTAL_SECTION["host"], "6*", PORTAL_SECTION["tagline"][:48] + "…"])
    t = Table(data, colWidths=[3.2 * cm, 4.2 * cm, 1.8 * cm, 7.5 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 1), (-1, -1), LIGHT),
                ("GRID", (0, 0), (-1, -1), 0.3, SLATE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(t)
    story.append(Paragraph("* Portal no está en MODULES como panel; vive en subdominio tickets/portal.", s["Small"]))

    story.append(Paragraph("1.2 Flujo de valor punta a punta", s["H2"]))
    story.append(FlowDiagram())
    story.append(Spacer(1, 8))

    story.append(Paragraph("1.3 Roles v2 (quién entra dónde)", s["H2"]))
    story.append(
        Paragraph(
            "16 roles: super_admin, ceo → core; coord_ventas/vendedor → sales; coord_operaciones/ing_campo/"
            "ing_soporte → ops; lider_diseno/disenador → studio; cliente → portal (+ lectura Integra limitada). "
            "RBAC único: url-matrix.ts + page-matrix.ts. Aprobaciones en approval-policy.ts.",
            s["Body"],
        )
    )
    story.append(
        Paragraph(
            "<b>Cadenas:</b> Viáticos Ing.Campo→Admin→Coord.Admin→Dir.Admin→CEO · "
            "Cotizaciones Vendedor→Coord.Ventas→Dir.Ops→CEO · Compras Solicitante→Coord.Admin→Dir.Admin→CEO · "
            "Evidencias/cierre Coord.Ops→Admin (y opcional Arquitecto vía workflow).",
            s["Body"],
        )
    )
    story.append(PageBreak())

    # Por producto
    order = ["erp", "crm", "ops", "studio", "integra", "lab"]
    section_n = 2
    for panel in order:
        story.extend(product_intro(panel, s))
        # intro larga por producto
        intros = {
            "erp": (
                "Backoffice corporativo. Aquí viven gobierno (usuarios/empresas), finanzas (pólizas, CFDI, bancos), "
                "personas (RRHH/asistencia), logística (almacén/compras) y el ritmo de reuniones. El CEO entra por core "
                "y ve dashboards embebidos de sales/ops/studio sin saltar de sitio."
            ),
            "crm": (
                "Embudo comercial. Lead → Oportunidad → Cotización (con mano de obra) → Proyecto de venta → handoff a OPS. "
                "SalesClient es el maestro; ServiceClient es la proyección para operación y portal."
            ),
            "ops": (
                "Ejecución de campo y servicio continuo. La Activity (OT) es el eje: multi-técnicos, evidencias, viáticos, "
                "materiales, GPS, herramientas, contratos de mantenimiento, NOC y soporte SLA. Móvil nativo en paridad."
            ),
            "studio": (
                "CMS y marketing del sitio nexara.com.mx: hero, páginas versionadas, casos, blog, redes con métricas, "
                "newsletter y captación que alimenta CRM."
            ),
            "integra": (
                "Producto de seguridad física por sitio del cliente. Frontera estricta vs oficinas NEXARA (facilities). "
                "Video wall go2rtc MSE H.264; ACS/Face/visitas/ANPR; edge on-site para LAN ISAPI. Credenciales cifradas por sitio."
            ),
            "lab": (
                "Sandbox solo para dirección técnica/CEO: feature flags, health y experimentos AI. No es superficie de negocio."
            ),
        }
        story.append(Paragraph(intros[panel], s["Body"]))
        mods = [m for m in CATALOG if m["panel"] == panel]
        groups = defaultdict(list)
        for m in mods:
            groups[m["group"]].append(m)
        for gname, items in groups.items():
            story.append(Paragraph(f"Grupo · {gname}", s["H2"]))
            for m in items:
                story.append(module_block(m, s))
        story.append(PageBreak())
        section_n += 1

    # Portal
    story.append(Paragraph(f"{section_n}. {PORTAL_SECTION['name']}", s["H1"]))
    story.append(Paragraph(f"<b>Subdominio:</b> {PORTAL_SECTION['host']}", s["Body"]))
    story.append(Paragraph(PORTAL_SECTION["tagline"], s["Body"]))
    story.append(
        Paragraph(
            "Auth separada (cliente/sucursal). No usa los MODULES internos salvo lectura Integra para rol cliente. "
            "Cualquier token de portal está bloqueado en controladores de contenido interno vía StaffOnlyGuard.",
            s["Body"],
        )
    )
    for title, body in PORTAL_SECTION["modulos"]:
        story.append(Paragraph(title, s["H3"]))
        story.append(Paragraph(body, s["Body"]))
    story.append(PageBreak())

    # Conexiones
    story.append(Paragraph(f"{section_n + 1}. Mapa de conexiones entre productos", s["H1"]))
    links = [
        ("Studio → CRM", "Contactos/leads web alimentan crm-leads / oportunidades."),
        ("CRM → OPS", "SalesProject / oportunidad ganada → OperationalProject → Activities (Con proyecto)."),
        ("OPS → ERP Finanzas", "Viáticos/gastos/pagos → pólizas; OT cerrada debería facturarse (activityId en Invoice es mejora documentada)."),
        ("OPS ↔ Almacén", "StockMovement.activityId = material consumido en servicio; costo real de OT."),
        ("OPS ↔ Portal", "ClientTicketRequest ↔ Activity; cierre propaga CLOSED; SLA visible al cliente."),
        ("OPS ↔ Contratos", "Visita de mantenimiento materializa Activity; lifecycle marca visita COMPLETED."),
        ("CRM ↔ Facturación", "SalesClient → Invoice CFDI; portal descarga lo propio."),
        ("ERP RH ↔ Integra", "Asistencia ERP vs marcas ACS; facilities ≠ Integra sitio."),
        ("Integra edge", "Caja on-site WireGuard + go2rtc en LAN del cliente; API en Hetzner."),
        ("Móvil", "Android/iOS: consola OPS/CRM/ERP subset + offline rules; misma API y RBAC."),
    ]
    for t, b in links:
        story.append(Paragraph(f"<b>{t}.</b> {b}", s["Body"]))

    story.append(Paragraph(f"{section_n + 2}. Inventario rápido", s["H1"]))
    story.append(
        Paragraph(
            f"Total módulos en access-matrix: <b>{len(CATALOG)}</b>. "
            + ", ".join(f"{p.upper()}={sum(1 for m in CATALOG if m['panel']==p)}" for p in order)
            + ". Portal documentado aparte.",
            s["Body"],
        )
    )
    story.append(
        Paragraph(
            "Referencias: docs/ARQUITECTURA_V2.md, docs/AREAS-VS-SISTEMA.md, docs/CONEXION-MODULOS.md, "
            "docs/PLAN_NEXARA_COMPLETO.md, docs/INTEGRA-OPS.md, docs/INTEGRA-LAN.md.",
            s["Small"],
        )
    )
    story.append(
        Paragraph(
            "Este PDF describe el sistema tal como está en código y docs a la fecha de generación. "
            "Si el disco contradice un párrafo, gana el disco.",
            s["Small"],
        )
    )

    doc = BaseDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.8 * cm,
        title="NEXARA — Mapa de productos y módulos",
        author="NEXARA",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="main", frames=frame, onPage=footer)])
    doc.build(story)
    print("OK", OUT, "pages~", "built", "modules", len(CATALOG))


if __name__ == "__main__":
    build()
