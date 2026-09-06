# 11 · Profundidad de los procesos de negocio en la web

**Auditoría 2026-09 · área: PROFUNDIDAD (no conteo de módulos)**
Auditor read-only. Fuente: `apps/api/prisma/schema.prisma`, `apps/api/src/**`, `apps/web/app/(panels)/**`, `apps/web/app/(subdomains)/**`.

> **Para qué sirve este documento.** Adam dice que la app móvil «no concatena con la cantidad
> exhaustiva de procesos que tiene la web». Este documento no cuenta módulos: mide **cuántos pasos,
> estados, aprobaciones y validaciones** tiene cada proceso de negocio en la web, porque eso es
> exactamente lo que la app móvil aplana a un botón. Está escrito para que alguien reconstruya la
> app móvil sin volver a leer el código.

---

## 0. El esqueleto compartido: cómo se aprueba algo en NEXARA

Antes de las fichas hay que entender que en NEXARA **conviven dos motores de aprobación distintos**.
Cualquier reimplementación móvil que asuma «un botón Aprobar» está ignorando los dos.

### 0.1 Motor A — Workflow genérico configurable (`apps/api/src/workflow/`)

Tablas: `WorkflowDefinition` → `WorkflowStep` (n pasos) → `WorkflowInstance` → `WorkflowApproval`.
Enums: `WorkflowStatus { ACTIVE, INACTIVE }`, `ApprovalStatus { PENDING, APPROVED, REJECTED, ESCALATED }`.

| Pieza | Archivo | Qué hace |
|---|---|---|
| Motor | `apps/api/src/workflow/workflow.service.ts` | crea instancia, avanza paso a paso, cierra o cancela |
| Disparador declarativo | `apps/api/src/workflow/auto-approval.service.ts` | reglas por `entityType` que deciden *si* hace falta aprobación |
| Auto-aprobación por condición | `apps/api/src/workflow/workflow-auto-approve-condition.ts` | evalúa `clave<=número` sobre el contexto de la entidad |
| Semilla de definiciones | `apps/api/src/workflow/workflow-seed.service.ts` | 6 workflows por defecto por empresa |
| Escalación por SLA | `apps/api/src/workflow/workflow-timeout.cron.ts` | cron **cada hora**, marca `[ESCALATED]` y notifica |

**Los 6 workflows sembrados por empresa** (`workflow-seed.service.ts`):

| entityType | Nombre | Pasos | timeoutHours | Auto-aprueba si |
|---|---|---|---|---|
| `COTIZACION` | Aprobación de descuento en cotización | 2 (Director comercial → Dirección general) | 48 / 72 | `maxDiscountPercent<=18` (paso 1) · `maxDiscountPercent<=22` (paso 2) |
| `EXPENSE` | Aprobación de gasto operativo | 1 (Coordinador administrativo) | 24 | — |
| `VIATIC` | Aprobación de viáticos | 1 (Coordinador de operaciones) | 24 | — |
| `SALES_PROJECT` | Aprobación de proyecto > $500k | 2 (Dir. Operaciones → CEO) | 48 / 72 | — |
| `PURCHASE_ORDER` | Aprobación de orden de compra | 1 (Compras / Administración) | 48 | — |
| `ACTIVITY_CLOSURE` | Validación de cierre de actividad | 1 (Arquitecto / Validación final) | 48 | — |

**Reglas que disparan el workflow** (`auto-approval.service.ts`, constante `RULES`):

| entityType | Se dispara cuando |
|---|---|
| `COTIZACION` | `maxDiscountPercent > 15` |
| `EXPENSE` | `amount > 5000` |
| `VIATIC` | `outOfPolicy === true` **ó** `amount > 3000` |
| `SALES_PROJECT` | `budget > 500000` |
| `PURCHASE_ORDER` | `amount > 0` (siempre) |

**Endpoints del motor** (`apps/api/src/workflow/workflow.controller.ts`, prefijo `/workflow`):
`GET definitions` · `POST definitions` · `POST request` · `GET my-pending` · `GET instances/:id` ·
`GET entity/:entityType/:entityId` · `POST approvals/:id/decide` (body `{decision, comments}`).

**Guardas de `decide()`** (`workflow.service.ts`):

1. La aprobación debe estar en `PENDING`, si no → `BadRequest('Esta aprobación ya fue decidida')`.
2. El actor debe ser `step.approverUserId`, tener `step.approverRoleId`, **o** ser elevado
   (`roleKey === 'super_admin'`, `role.accesoConsoleAdmin`, o nombre de rol que contenga «super»).
   Si no → `Forbidden('No eres el aprobador de este paso')`.
3. `REJECTED` **cancela la instancia entera** (`isComplete=true, isCancelled=true`) — no hay
   «devolver al paso anterior».
4. `APPROVED` crea la aprobación `PENDING` del paso siguiente; si no hay siguiente, cierra la
   instancia y dispara los efectos de dominio.

**UI web:** bandeja `/erp/approvals` (`apps/web/app/(panels)/erp/approvals/page.tsx`, 534 líneas).
No es un botón: dibuja el **timeline completo** de la instancia (paso 1 ✓, paso 2 ✓, paso 3 ⏳) porque
`listMyPending()` devuelve la cadena entera de aprobaciones. Incluye filtro por prioridad
(Alta/Media/Baja), buscador, **modal de rechazo con motivo** y un modal de «pedir información» que
deja la solicitud viva en bandeja. Además cada entidad tiene pestaña «Historial de aprobaciones»
alimentada por `GET /workflow/entity/:entityType/:entityId`.

### 0.2 Motor B — Cadena jerárquica por rol y monto (`apps/api/src/common/rbac/approval-policy.ts`)

Este motor **no vive en base de datos**: son cadenas de rol codificadas, filtradas por umbral de
monto. Lo usan viáticos, vehículos y multas vía `buildApprovalChain()`
(`apps/api/src/common/rbac/hierarchical-approval.ts`). **El CEO siempre es el paso final.**

| Flujo | Cadena completa | Umbrales |
|---|---|---|
| `viaticos` | Administrativo → Coord. Admin → **Dir. Admin** → CEO | Dir. Admin sólo si ≥ **$10,000** |
| `evidencias` | Coord. Operaciones → Administrativo → Coord. Admin (final) | sin umbral |
| `cotizaciones` | **Coord. Ventas** → **Dir. Operaciones** → **CEO** | ≥$50,000 / ≥$250,000 / ≥$1,000,000 |
| `compras` | Coord. Admin → **Dir. Admin** → **CEO** | Dir. Admin ≥$25,000 · CEO ≥$200,000 |
| `vehicles` | Coord. Operaciones → Arquitecto → Administrativo → CEO | sin umbral |
| `multas` | Coord. Operaciones → Administrativo → CEO | sin umbral |

Es decir: **un viático de $12,000 necesita 4 firmas** y uno de $2,000 necesita 3. El número de pasos
**depende del importe**, no es fijo. El avance se guarda en `Viatico.approvalStep` (índice) y
`Viatico.approvalTrail` (JSON con rol, usuario, acción, fecha y nota de cada firma).

Roles del sistema (`apps/api/src/common/rbac/roles.v2.ts`, con `ROLE_TIER` jerárquico): `super_admin`
(999), `ceo` (100), `dir_operaciones`/`dir_admin` (90), `arquitecto` (85), `coord_admin`/
`coord_operaciones`/`coord_ventas` (70), `lider_diseno` (65), `rh`/`contabilidad` (60), `ing_soporte`
(50), `administrativo`/`vendedor` (45), `ing_campo` (40), `disenador`, `cliente`.

> ⚠️ **Hallazgo A.** El comentario de `approval-policy.ts` afirma que los umbrales son «CONFIGURABLES
> desde /core/configuracion/aprobaciones (tabla `ApprovalThreshold` en BD)». **Esa tabla no existe**
> en `schema.prisma` y no hay ninguna referencia en `apps/api/src` fuera de ese comentario. Los
> umbrales están duros en código. Una app móvil que quiera mostrar «cuántas firmas faltan» debe
> replicar esta tabla o pedírsela al API.

> ⚠️ **Hallazgo B.** Los dos motores se solapan en cotizaciones, viáticos y compras: la cadena
> `APPROVAL_CHAINS.cotizaciones` (3 niveles por monto) **no está cableada** al workflow de descuento
> (2 pasos por porcentaje). Conviven sin hablarse. Hay que resolverlo antes de reconstruir.

### 0.3 Efectos secundarios: bus de dominio, notificaciones, webhooks y auditoría

Todo proceso relevante publica en un bus interno (`apps/api/src/domain-events/`):
`entity.created`, `entity.updated`, `workflow.auto_approval.evaluate`.

| Listener | Archivo | Efecto |
|---|---|---|
| Auto-aprobación | `workflow-domain.listener.ts` | evalúa reglas y abre la instancia de workflow |
| Cierre de workflow | `workflow-completion.listener.ts` | reenvía a `cotizaciones`, `ventas`, `activities`, `expenses`, `viaticos`, `procurement` |
| Rechazo de workflow | `workflow-rejection.listener.ts` | idem en modo rechazo |
| Webhooks salientes | `webhook-domain.listener.ts` | traduce a ~30 eventos públicos |

**Catálogo de webhooks emitidos** (`webhook-domain.listener.ts`): `approval.requested`,
`approval.approved`, `approval.rejected`, `opportunity.won`, `opportunity.lost`, `payment.registered`,
`invoice.paid`, `invoice.overdue`, `user.inactive`, `user.locked`, `client.created`, `client.updated`,
`quote.created`, `quote.approved`, `quote.discount_approved`, `quote.discount_rejected`,
`expense.approved`, `expense.rejected`, `viatic.approved`, `viatic.rejected`,
`purchase_order.confirmed`, `purchase_order.rejected`, `sales_project.approved`,
`sales_project.rejected`, `activity.completed`, `activity.closure_approved`,
`activity.closure_rejected`, `ticket.sla_breach`, `stock.low`, `stock.dead`.

**Notificaciones jerárquicas** (`apps/api/src/notifications/notification-hierarchy.service.ts`,
1,484 líneas, ~35 métodos `notifyX`): no notifican «al usuario», sino que **resuelven la cadena de
mando** (`getSupervisors`, `getSuperAdmins`, acotado por empresa con `companyScope()`), con correos
de plataforma con visión global (`gerencia@nexara.com.mx`, `developer@nexara.com.mx`). El enum
`NotificationType` del schema tiene **más de 60 valores tipados**.

**Auditoría**: `apps/api/src/audit/audit.service.ts` + `mutation-audit.interceptor.ts`
(`AuditLog` con `previousData`/`changes`, `ipAddress`, `userAgent`, `source`).

---
