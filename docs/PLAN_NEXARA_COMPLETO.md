# Plan maestro NEXARA → plataforma nivel Odoo / superior

**Producto:** solo NEXARA (`*.nexara.com.mx`)  
**No incluye:** Zynora / `studio.zynoratek.com` (producto aparte)  
**Fecha:** 2026-07-21  
**Base:** auditorías ERP + CRM/OPS/Studio/Lab + avance P0-A/P0-B en código  

Documento vivo. El resumen ejecutivo corto sigue en `docs/ROADMAP_ODOO_PARITY.md`.

## Enterprise transformation log (2026-07-21)

| Iter | Módulo | Entrega |
|------|--------|---------|
| 1 | IAM / Usuarios | Sesiones JWT (`UserSession`), lockout, lastLogin*, risk score, `GET users/iam/insights`, force logout, bulk activate, MFA TOTP + login UI, UI Command Center |
| 2 | Almacén | `GET stock/insights` — rotación, aging, ABC, dead stock, reorden, trends; tab Inteligencia en UI |
| 3 | HR / Personas | `hr/dashboard` → People Intelligence (puntualidad, carga, leaves queue, trends); KPIs page rediseñada |
| 4 | Support / SLA | `GET sla/insights` — MTTR, backlog aging, tech ranking, trends, inbox; SLA Command Center UI |
| 5 | Audit + Webhooks | `MutationAuditInterceptor` global; outbound webhooks HMAC + retries; emits dominio (pago, opp, SLA, stock, lock) |
| 6 | CRM Intelligence | LTV, churn risk, cohortes, forecast ponderado en insights/reportes |
| 7 | Finance Intelligence | Aging AR/AP, cashflow 90d, DSO/DPO, runway; tab Inteligencia contable |
| 8 | Multi-tenant hard (base) | `companyWhere` + IDOR assert en facturas/asientos/gastos/OC; `CompanyApiKey` + UI; soft-scope legacy null |
| 9 | SSO + packaging | OIDC genérico, billing/seats/metering, scope CRM/warehouse/tickets, audit CSV+purge, theater MRP/HSE deferred |
| 10 | Hard SaaS | Stripe Checkout+Portal+webhooks, SCIM v2 Users, companyId NOT NULL, AuditLog SoT |
| 11 | Tenant OPS/CRM | Activity/ServiceClient/OpsProject/Product/SalesClient/Lead/Cotizacion NOT NULL; SCIM Groups; audit tenant+actor |
| 12 | Tenant harden | Webhooks companyId + emit scoped; companyWhere lists (ops/viáticos/pagos/stock); SCIM per-tenant via ApiKey scope=scim + seats |
| 13 | Chat/GL + packaging UI | ChatChannel + MaintenanceContract + Account/FiscalPeriod/BankAccount tenant; plan feature gates; Settings control center |
| 14 | Reliability | Idempotency-Key store + interceptor; webhook DLQ list + replay API/UI |
| 15 | Compliance + OPS | CostCenter + VehicleAsset tenant; GDPR/LFPDPPP `POST /audit/privacy/erase/:userId` |
| 16 | UI polish | Lab hub enterprise links; Companies → control center |
| 17 | Catalog masters | Brand + Supplier `companyId` + unique per tenant; procurement suppliers scoped |
| 19 | Evidence tenant + UI | Evidence.companyId + list/create/update IDOR; empty states con CTA (agenda/viáticos/webhooks/DataTable) |
| 20 | Privacy UI | IAM drawer → «Borrar PII» → `POST /audit/privacy/erase/:userId` |
| 21 | Empty CTAs | Warehouse/WMS, soporte/SLA, mantenimiento, clientes OPS, procurement |
| 22 | Cierre de brechas verificadas (auditoría 2026-07-24) | Almacén: Cycle Counts + Stock Reservations (`CycleCount`, `StockReservation`, ajuste de stock automático al cerrar conteo) · Compras: RFQ multi-proveedor (`PurchaseRFQ`/`PurchaseRFQLine`, comparación lado a lado, adjudicación → OC existente) · Studio: versionado `PageContentRevision` + rollback (snapshot en cada publish) · Contabilidad: DIOT (reporte + CSV por proveedor) y base de Contabilidad Electrónica (`Account.satAgrupador`, `Supplier.rfc`, Balanza XML condicionada a mapeo completo) · MRP/Quality/HSE: decisión de producto — confirmado sin UI/rutas activas, se mantiene fuera de alcance (ver §11) |
| 23 | Portal: facturas CFDI | `GET client-portal/invoices` (AR vía `SalesClient.serviceClientId`) + descarga PDF/XML con validación de propiedad; sección "Facturas" en `mis-servicios` |
| 24 | Portal: SLA en vivo por ticket | Badge de countdown/incumplimiento por ticket en `/tickets` — mismos umbrales de `sla-tracker.service.ts` por prioridad (Alta/Media/Baja), cálculo 100% client-side sobre datos ya expuestos |
| 25 | Portal: KB huérfana → enlazada | `/tickets/ayuda` y `kb-public/*` ya estaban completos (búsqueda, categorías, "fue útil") pero sin link desde el portal; agregado "🆘 Centro de ayuda" al sidebar |
| 26 | Compras: Landed cost | `GoodsReceipt.{freightCost,insuranceCost,customsCost,otherLandedCost}` + prorrateo por valor en `GoodsReceiptItem.landedCostAllocated`; WAC (`StockMovement.unitCost`) y asiento de recepción (`postPurchaseReceiptAccrual`) incluyen el landed cost |
| 27 | Studio: RBAC granular | `STUDIO_CONTENT_VIEW/MANAGE` otorgado a `lider_diseno`/`disenador`; agregado de forma aditiva a page-content/news/case-studies (PANEL_WEB y CONSOLE_ADMIN se mantienen) |
| 28 | Contabilidad: XML Catálogo de cuentas | `exportCatalogoCuentasXml` (misma condición de mapeo que Balanza); jerarquía Nivel/SubCtaDe/Natur derivada del catálogo existente; botón en Cumplimiento SAT |
| 29 | CRM: Cotización siempre con FK cliente + limpieza checklist §6 | `cotizaciones.service.ts` busca/crea `SalesClient` si falta FK; verificado y corregido checklist §6.3/6.7 (multi-company base y audit global ya estaban hechos, solo desactualizado el doc) |
| 30 | Portal: cotizaciones | `GET client-portal/quotes` + `/pdf` (reutiliza `CotizacionesService.getPdfBuffer`); sección "Cotizaciones" en `mis-servicios` |
| 31 | HR: Pagos calculados desde asistencia real | `calculateFromAttendance` suma `AttendanceDay.totalMinutes` del periodo; botón "Calcular" en el formulario de pagos a empleados |

Pendiente ops: keys prod (`STRIPE_*`, `OIDC_*`, `SCIM_*`) — cuando las tengas las cableamos. Pendiente contable: validar el XML de Balanza (Iter 22) contra el XSD vigente del SAT con un contador/PAC antes del primer envío real — la estructura general es correcta pero no ha sido validada contra el esquema oficial.

---



NEXARA debe quedar como **ERP vertical de servicios tecnológicos MX** con:

| Capacidad | Definición de “Odoo o superior” |
|-----------|----------------------------------|
| Multi-empresa | Datos aislados por `companyId`; un usuario puede pertenecer a N empresas |
| Contabilidad | Todo egreso/ingreso operativo genera póliza; SAT electrónico en P1 |
| Compras | OC → GR → stock valorado → factura AP → CXP → pago → banco |
| Ventas | Lead → Opp → Cotización → Orden → Factura CFDI → Complemento |
| Campo | OT + evidencias + GPS + flota + SLA con escalación |
| Clientes | Un maestro comercial + proyección operativa/portal |
| Studio | CMS NEXARA con draft/preview/publish en `studio.nexara.com.mx` |
| Seguridad | RBAC v2 único, MFA, audit trail en mutaciones críticas |
| Portal | Una auth; cliente ve tickets, SLA, y (P1) facturas/contratos |

**No es meta P0:** MRP completo, Open Banking, CFDI Nómina tipo N (roadmap P2 explícito).

---

## 1. Madurez actual (1–5) y meta por fase

| Módulo | Hoy | Meta Fase 1 (P0) | Meta Fase 2 (P1) | Meta Fase 3 (P2) |
|--------|----:|-----------------:|-----------------:|-----------------:|
| CFDI AR | 4 | 4.5 E2E estable | 5 conciliación SAT | — |
| Contabilidad | 2.5→3.2* | 3.5 ciclo ops cerrado | 4.5 XML SAT/DIOT | 5 multi-diario |
| Banking | 2 | 2.5 link a pólizas | 4 matching | 5 SPEI live |
| Gastos/Viáticos | 3→3.5* | 4 | 4.5 políticas | — |
| Pagos empleados | 1.5 | 2.5 (interno + póliza) | 3.5 ← asistencia | 5 CFDI N |
| Almacén/Compras | 2.5→3.5* | 4 | 4.5 3-way/FIFO | 5 landéd cost |
| HR/Asistencia | 3 | 3.2 | 4 turnos/pago | 4.5 expediente IMSS |
| CRM/Cotizaciones | 3.5 | 4 maestro único | 4.5 pricelists | 5 sequences |
| OPS campo | 3.5 | 3.7 CMMS unificado | 4.5 SLA/geofence | 5 dispatch |
| Studio NEXARA | 2.5 | 3.5 draft/publish | 4 versionado | 4.5 multi-marca |
| Portal | 3 | 3.5 auth única | 4 self-service | 4.5 chat |
| Multi-company | 1 | 3 membership+fiscal | 4 ops/CRM scoped | 5 consolidación |
| Auditoría | 1→2.5* | 3 finanzas/compras | 4 login/RBAC | 5 compliance |
| Chat | 3 | 3 + tenant | 3.5 CHAT_* | 4 bots |
| MRP | 0.5 | 0.5 (no priorizar) | 2 si kits | 4 |

\*Avance ya en código local (P0-A/P0-B); falta deploy + smoke.

---

## 2. Arquitectura objetivo (NEXARA)

```
┌─────────────────────────────────────────────────────────────┐
│  Paneles: core / sales / ops / studio / lab / portal        │
│  Tenant: X-Company-Id + UserCompany membership              │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  API Nest — TenantInterceptor → companyId en request        │
│  Dominios: Accounting · Procurement · Warehouse · CRM · OPS │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  Postgres — companyId en txs fiscales/ops; maestros linkeados│
└─────────────────────────────────────────────────────────────┘
```

**Principios**

1. **Una escritura = un asiento o un movimiento de stock** cuando el evento es financiero/físico.  
2. **SalesClient es el maestro comercial**; `ServiceClient` es la proyección ops/portal (FK `serviceClientId`).  
3. **Studio NEXARA** publica al sitio `nexara.com.mx`; no se mezcla con otros CMS.  
4. **Pagos a empleados ≠ nómina CFDI** hasta Fase 3.  
5. **Migraciones idempotentes**; backfill a empresa primaria antes de filtros duros.

---

## 3. Fase 0 — Cerrar el libro (P0) · ~4–8 semanas

### Sprint P0-A — Egresos → póliza ✅ código
- Gastos / viáticos / pagos empleados al `markPagado` → `JournalEntry` + `journalEntryId`
- Cuentas `102.01`, `601.01`, `601.02`, `602.01`
- Audit en approve/pagado/remove
- **DoD prod:** marcar un gasto pagado en `core.nexara.com.mx` y ver póliza en Contabilidad

### Sprint P0-B — OC → GR → stock → AP ✅ código
- Recepción crea `StockMovement` + WAC en `StockLevel`
- Póliza `GR-ACCRUAL-*` (115/601/209 · 201)
- Factura AP borrador desde GR
- UI: selector almacén
- **DoD prod:** recibir OC confirmada → stock + factura AP + póliza

### Sprint P0-C — Multi-company foundation (en curso)
| # | Entrega | Criterio |
|---|---------|----------|
| C1 | Modelo `UserCompany` | Membresía user↔empresa; default |
| C2 | `companyId` nullable en fiscal | Invoice, JournalEntry, Expense, Viatico, EmployeePayment, PurchaseOrder |
| C3 | `TenantInterceptor` | Lee `X-Company-Id`, valida membership, adjunta `req.companyId` |
| C4 | Frontend | `withTenantHeaders` en fetch central; `CompanySwitcher` en AppShell |
| C5 | Backfill | Filas existentes → empresa primaria |
| C6 | Accounting issuer | Emisor CFDI / asientos usan empresa activa |

**DoD:** cambiar empresa en switcher cambia el emisor/contexto; usuarios sin membership no ven otras empresas.

### Sprint P0-D — Studio NEXARA CMS maduro
| # | Entrega | Criterio |
|---|---------|----------|
| D1 | `PageContent` draft/publish | Guardar borrador ≠ publicar al sitio |
| D2 | Preview Studio | Vista previa sin afectar público |
| D3 | Unificar casos públicos | `CaseStudy` → `GET /case-studies/public` alimenta `/proyectos` o `/casos` |
| D4 | RBAC Studio | Permiso `studio.content.manage` (no solo CONSOLE_ADMIN) |
| D5 | Hero copy editable | Textos hardcoded → `PageContent` / hero JSON |

**DoD:** editor en `studio.nexara.com.mx` publica home/blog/casos con control explícito.

### Sprint P0-E — Clientes unificados
| # | Entrega | Criterio |
|---|---------|----------|
| E1 | Flujo único | Crear en CRM → auto `provisionServiceClient` |
| E2 | Ops creation | `ClientCreationForm` también crea/linkeá `SalesClient` |
| E3 | Deprecar `Client` legacy | Migrar logos; ocultar `/clients` |
| E4 | Cotización FK | `salesClientId` obligatorio en nuevas cotizaciones |

### Sprint P0-F — Auth portal + RBAC cierre
| # | Entrega | Criterio |
|---|---------|----------|
| F1 | Unificar `client-auth` + `branch-auth` | ✅ `POST /portal/login` (aliases deprecated) |
| F2 | Apagar flags `acceso*` | ✅ Ignorados si hay `roleKey`; permisos desde v2 + url-matrix |
| F3 | Audit login | ✅ `LOGIN_SUCCESS` / `LOGIN_FAILED` (Auth + PortalAuth) |

### Sprint P0-G — CMMS / campo
| # | Entrega | Criterio |
|---|---------|----------|
| G1 | Contrato visita → `Activity` canónica | ✅ Cron + generate-ot + complete materializan OT (`activityId`) |
| G2 | Evidencia única | Preferir `ActivityEvidence` (flujo campo); `/api/evidences` legacy compat |

---

## 4. Fase 1 — Paridad Odoo MX (P1) · ~8–14 semanas

### Contabilidad / fiscal
1. Contabilidad electrónica SAT (XML Catálogo, Balanza, Pólizas)
2. IVA / DIOT por periodo; bloqueo de periodo fiscal duro
3. Diarios (ventas, compras, bancos, varios)
4. Centros de costo en líneas de asiento de forma consistente

### Compras / almacén
1. 3-way match PO–GR–factura AP
2. Aprobaciones por monto (política)
3. FIFO o WAC formal documentado + COGS al despachar
4. Conteos cíclicos + reservas

### Banca
1. Matching sugerido movimiento ↔ pago/factura/asiento
2. Conciliación que actualiza estado y deja rastro audit
3. CEP/SPEI operativo (sin open banking aún)

### CRM / ventas
1. Consolidar módulos cotización duplicados
2. Listas de precios / descuentos
3. Quote → Order → Invoice → Complemento E2E con tests
4. Firma cotización con mayor trazabilidad (hash + IP + PDF inmutable)

### OPS / flota / SLA
1. Motor SLA con escalaciones + vista portal
2. Geofence + alertas ruta
3. Docs vehículo (seguro, verificación) + multas ligadas

### HR
1. Asistencia → cálculo base de pago semanal (alimenta pagos internos)
2. Turnos / calendarios
3. Políticas de vacaciones con saldos

### Seguridad
1. MFA TOTP
2. Reset password + invitaciones
3. Sesiones / force logout

### Studio / Lab / Chat
1. Versionado `PageContentRevision`
2. Gobernanza AI Lab (cost caps, audit prompts)
3. Permisos `CHAT_*` + tenant en canales

### Multi-company ampliación
1. `companyId` en Activity, ServiceClient, SalesClient, ChatChannel
2. Series CFDI / almacenes / cuentas por empresa
3. SoD: roles por compañía

---

## 5. Fase 2 — Superior / diferenciación (P2)

- CFDI Nómina (tipo N) + IMSS/IDSE (solo si se vende como nómina)
- Open Banking / layouts dispersión SPEI
- MRP + calidad solo si hay ensamble de kits
- Dispatch / rutas óptimas
- Sequences marketing, bots chat, guest channels
- Consolidación intercompañía
- Portal: facturas CFDI, contratos, chat soporte
- Lab experiments A/B

---

## 6. Backlog por módulo (checklist accionable)

### 6.1 Contabilidad
- [x] Auto-póliza AR timbre/cobro
- [x] Auto-póliza gastos/viáticos/pagos
- [x] Auto-póliza recepción compra
- [x] Auto-póliza pago a proveedor (CXP → bancos)
- [x] Auto-póliza COGS al despacho
- [x] DIOT (reporte + CSV por proveedor) — Iter 22
- [x] XML Catálogo de cuentas — Iter 28: `exportCatalogoCuentasXml`, misma condición de mapeo que Balanza; jerarquía (Nivel/SubCtaDe) derivada de `Account.parentId`
- [x] Periodo fiscal con bloqueo de posteo

### 6.2 Compras / almacén
- [x] GR → stock + AP draft + póliza
- [x] 3-way match (MVP: evaluate + gate pago + waive)
- [x] RFQ multi-proveedor — Iter 22 (`PurchaseRFQ`, comparación, adjudicación → OC)
- [x] Conteos / reservas — Iter 22 (`CycleCount`, `StockReservation`)
- [x] Landed cost — Iter 26: flete/seguro/aranceles/otros en `GoodsReceipt`, prorrateo por valor en `GoodsReceiptItem.landedCostAllocated`, incluido en el WAC (`StockMovement.unitCost`) y en el asiento de recepción

### 6.3 Multi-company
- [x] `UserCompany` + interceptor + switcher wired — verificado 2026-07-25: `tenant.interceptor.ts`, `CompanySwitcher.tsx`, `CurrentCompanyId` decorator en uso
- [x] `companyId` fiscal — verificado: `Invoice`/`JournalEntry`/`Expense` con `companyId Int` obligatorio
- [x] `companyId` ops/CRM — verificado: `Activity`/`ServiceClient`/`SalesClient`/`SalesLead` con `companyId Int` obligatorio
- [x] Catálogos por empresa vs compartidos — decisión ya implementada en código: **siloed por empresa**, no compartidos (`Product`/`Brand`/`Supplier` con `companyId` obligatorio + `@@unique([companyId, ...])`); documentado aquí como decisión consciente, no pendiente

### 6.4 CRM / clientes
- [x] Flujo único Sales→Service — verificado: `ventas.service.ts` invoca `provisionServiceClient` automáticamente al crear `SalesClient`
- [x] Deprecar `Client` — verificado: escrituras a `Client` legacy bloqueadas con `BadRequestException`, solo lectura de compatibilidad
- [x] Cotización siempre con FK cliente — Iter 29: si no viene `salesClientId`/oportunidad, `cotizaciones.service.ts` busca o crea el `SalesClient` a partir del nombre capturado (sin FK ni nombre → 400)
- [x] Portal ve cotizaciones — Iter 30: `GET client-portal/quotes` + `/pdf` (vía `SalesClient.serviceClientId`), sección "Cotizaciones" en `mis-servicios`

### 6.5 Studio NEXARA
- [x] Draft/publish PageContent — verificado: `PageContent.draftContent` + `publish()` en `page-content.service.ts`
- [x] Casos públicos — verificado: `GET case-studies/public` + `/proyectos` en el sitio público ya lo consume
- [x] RBAC studio.content — Iter 27: `PERMISSIONS.STUDIO_CONTENT_VIEW/MANAGE`, otorgado a `lider_diseno`/`disenador`, aditivo en page-content/news/case-studies controllers (no rompe PANEL_WEB/CONSOLE_ADMIN existentes)
- [x] Versionado — Iter 22 (`PageContentRevision`, rollback en Studio)
- [x] SEO suite — verificado: tab SEO completo en Studio (`PAGE_SEO_KEYS`, title/description/OG/keywords/noindex por página)

### 6.6 Portal
- [x] Auth unificada
- [x] SLA en vivo — Iter 24: badge de countdown/vencido por ticket en `/tickets` (portal), mismos umbrales que `sla-tracker.service.ts` por prioridad
- [x] Facturas/contratos — Iter 23: `GET client-portal/invoices` + descarga PDF/XML (contratos ya se mostraban en services-summary)
- [x] KB integrada — Iter 25: ya existía `/tickets/ayuda` + `kb-public/*` completos pero huérfanos (sin link); agregado a sidebar del portal

### 6.7 RBAC / audit
- [x] Fin de flags `acceso*` (ignorados con roleKey; columnas legacy pendientes de drop)
- [x] Audit en todas mutaciones $ / stock / CFDI — verificado 2026-07-25: `MutationAuditInterceptor` registrado como `APP_INTERCEPTOR` global en `audit.module.ts` (cubre toda mutación, no solo estas)
- [x] Audit login staff + portal
- [x] MFA — TOTP + UI de setup en /erp/users (Iter 1)

### 6.8 Pagos / nómina
- [x] Etiqueta “Pagos a empleados”
- [x] Póliza al pagar
- [x] Cálculo desde asistencia — Iter 31: `GET employee-payments/calculate-from-attendance` suma `AttendanceDay.totalMinutes` reales del periodo; botón "Calcular" en el formulario de pago (sugiere, no fuerza el monto)
- [ ] CFDI N (P2)

---

## 7. Orden de ejecución recomendado (siguiente 90 días)

| Semana | Sprint | Entrega |
|-------:|--------|---------|
| 1 | P0-C | Membership + interceptor + switcher + companyId fiscal |
| 2 | P0-C/D | Backfill + accounting por tenant; Studio draft PageContent |
| 3 | P0-D | Casos públicos + RBAC Studio + hero editable |
| 4 | P0-E | Unificación clientes Sales↔Service; deprecar Client |
| 5 | P0-F | Portal auth unificado; cierre flags RBAC críticos |
| 6 | Deploy+QA | Smoke P0-A/B/C/D en prod NEXARA |
| 7–8 | P0-G + P1 start | CMMS; pago proveedor → póliza; 3-way match diseño |
| 9–12 | P1 fiscal/ops | SAT XML o SLA/geofence según presión de negocio |

---

## 8. Criterios de aceptación globales

1. **Libro cerrado:** no hay “Pagado” financiero sin `journalEntryId` (o excepción auditada).  
2. **Stock cerrado:** no hay GR de producto sin `StockMovement`.  
3. **Tenant:** request autenticado sin membership válida a `X-Company-Id` → 403.  
4. **Studio:** el sitio público solo lee contenido `PUBLISHED`.  
5. **Un cliente:** no se puede crear `ServiceClient` huérfano desde UI sin opción de link comercial.  
6. **NEXARA only:** ningún entregable de este plan toca Zynora.

---

## 9. Riesgos y decisiones

| Riesgo | Mitigación |
|--------|------------|
| Filtro `companyId` rompe reportes legacy | Nullable + backfill; filtro soft 2 sprints; hard después |
| Supplier sin RFC bloquea AP | Factura AP queda DRAFT; captura fiscal en UI |
| Dualidad cotizaciones | Congelar módulo legacy; un path oficial |
| Scope creep MRP/nómina | Mantener en P2 hasta decisión comercial |
| Confusión Zynora | Este plan y el código NEXARA no importan assets Zynora |

---

## 10. Estado de implementación (actualizar al cerrar sprints)

| Sprint | Estado | Notas |
|--------|--------|-------|
| P0-A Egresos→póliza | ✅ código | Migración `20260721120000_*` — deploy pendiente |
| P0-B OC→GR→stock→AP | ✅ código | Migración `20260721130000_*` — deploy pendiente |
| P0-C Multi-company | ✅ base | Membership + interceptor + switcher + stamp companyId |
| P0-D Studio NEXARA | ✅ código | Draft/publish PageContent; casos públicos en /proyectos; RBAC diseño |
| P0-E Clientes | ✅ código | CRM↔OPS auto-link; legacy `/clients` writes bloqueadas; cotizaciones con `salesClientId` |
| P0-F Portal/RBAC | ✅ código | `POST /portal/login`; flags `acceso*` ignorados con roleKey; Audit LOGIN_* |
| P0-G CMMS | ✅ base | Visita→Activity canónica; workType PREVENTIVE_INVENTORY |
| P1 AP pay + 3-way | ✅ código | Póliza PAY CXP→bancos; matchStatus + gate pago; migración `20260721160000_*` |
| P1 COGS + periodo | ✅ código | `SM-COGS-*` Dr 501.01 Cr 115.01; bloqueo periodo cerrado + reopen |
| Iter 22 Cycle Counts/Reservations | ✅ código | Migración `20260724120000_iter20_cyclecount_reservation_rfq_pagerevision_satagrupador`; ajuste de stock vía `createStockMovement` existente al cerrar conteo |
| Iter 22 RFQ multi-proveedor | ✅ código | `PurchaseRFQ`/`PurchaseRFQLine`; comparación + adjudicación → `createPurchaseOrder` existente |
| Iter 22 Studio versionado | ✅ código | `PageContentRevision`; snapshot en cada `publish()`; rollback = restaurar + republicar |
| Iter 22 DIOT + Contabilidad Electrónica | ✅ código | `Account.satAgrupador` (migración `20260724130000_iter20_supplier_rfc` incluye `Supplier.rfc`); Balanza XML **estructura general Anexo 24, sin validar contra XSD oficial** — validar con contador/PAC antes de envío real |
| Iter 22 MRP/Quality/HSE | ✅ decisión | Confirmado sin controllers/UI activos; permanece fuera de alcance hasta demanda comercial real de ensamble/kits |
| Iter 23 Portal facturas | ✅ código | `client-portal/invoices` + `/pdf` + `/xml`; scoping por `SalesClient.serviceClientId = user.clientId`, IDOR validado antes de delegar a `AccountingService.getInvoicePdf/Xml` |
| Iter 24 Portal SLA en vivo | ✅ código | Sin cambios de backend; badge calculado en `apps/web/app/(subdomains)/tickets/page.tsx` reutilizando umbrales de `sla-tracker.service.ts` |
| Iter 25 Portal KB link | ✅ código | Backend y página ya existían; solo faltaba el link de navegación — un solo `<Link>` en el sidebar |
| Iter 26 Landed cost | ✅ código | Migración `20260724140000_iter26_landed_cost`; prorrateo por valor (no por cantidad); UI en "Registrar recepción" con total estimado en vivo |
| Iter 27 Studio RBAC | ✅ código | Sin migración; permisos nuevos en `common/permissions.ts` + `auth.service.ts` resolveUserPermissions |
| Iter 28 Catálogo cuentas XML | ✅ código | Reutiliza `getSatAgrupadorStatus`; **sin validar contra XSD oficial** — mismo pendiente contable que Balanza (Iter 22) |
| Iter 29 Cotización FK + doc | ✅ código | Auto-provisión de `SalesClient` por nombre (find-or-create, scoped por companyId); sin migración |
| Iter 30 Portal cotizaciones | ✅ código | Sin migración; scoping por `salesClient.serviceClientId = user.clientId` |
| Iter 31 Pagos desde asistencia | ✅ código | Sin migración; usa `AttendanceDay` ya existente, es sugerencia no automatización forzada |

---

## 11. Decisiones de producto (no construir / diferir)

| Área | Decisión | Motivo | Revisar cuando |
|------|----------|--------|-----------------|
| MRP / Quality / HSE | **No construir** — modelos Prisma (`BillOfMaterials`, `ProductionOrder`, `QualityInspection`, `NonConformanceReport`, etc.) se mantienen en schema sin controllers ni UI. Verificado 2026-07-24: cero referencias en `apps/web` a estos modelos. | NEXARA vende servicios tecnológicos de campo (CCTV, redes, cómputo, soporte), no manufactura. Construir MRP/Calidad completo sin un cliente que ensamble kits sería trabajo especulativo sin retorno medible. | Si aparece una oportunidad comercial real de ensamble/kits o manufactura ligera. Hasta entonces, no es deuda técnica pendiente — es una decisión tomada. |
