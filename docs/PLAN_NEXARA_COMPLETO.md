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

Pendiente inmediato: configurar env prod (STRIPE_*, OIDC_*, SCIM_*). Opcional: Chat/MaintenanceContract tenant, GL/Bank/Period, plan gates.

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
- [ ] XML SAT + DIOT
- [x] Periodo fiscal con bloqueo de posteo

### 6.2 Compras / almacén
- [x] GR → stock + AP draft + póliza
- [x] 3-way match (MVP: evaluate + gate pago + waive)
- [ ] RFQ multi-proveedor
- [ ] Conteos / reservas
- [ ] Landéd cost

### 6.3 Multi-company
- [ ] `UserCompany` + interceptor + switcher wired
- [ ] `companyId` fiscal
- [ ] `companyId` ops/CRM
- [ ] Catálogos por empresa vs compartidos (decisión explícita)

### 6.4 CRM / clientes
- [ ] Flujo único Sales→Service
- [ ] Deprecar `Client`
- [ ] Cotización siempre con FK cliente
- [ ] Portal ve cotizaciones (opcional P1)

### 6.5 Studio NEXARA
- [ ] Draft/publish PageContent
- [ ] Casos públicos
- [ ] RBAC studio.content
- [ ] Versionado
- [ ] SEO suite

### 6.6 Portal
- [x] Auth unificada
- [ ] SLA en vivo
- [ ] Facturas/contratos
- [ ] KB integrada

### 6.7 RBAC / audit
- [x] Fin de flags `acceso*` (ignorados con roleKey; columnas legacy pendientes de drop)
- [ ] Audit en todas mutaciones $ / stock / CFDI
- [x] Audit login staff + portal
- [ ] MFA

### 6.8 Pagos / nómina
- [x] Etiqueta “Pagos a empleados”
- [x] Póliza al pagar
- [ ] Cálculo desde asistencia
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
