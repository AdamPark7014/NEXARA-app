# NEXARA · Lista de Purga

> Archivos/módulos identificados para eliminar o fusionar.
> **Nada se borra todavía** — esta lista se ejecuta en la **Fase 5** del refactor.
> Antes de borrar cada item: verificar 0 referencias, correr tests, hacer backup.

---

## ✅ Phase 2.4 — Estado (RBAC v2 wiring)

Branch: `refactor/roles-purge-v2` · Local · Sin push.

- ✅ `apps/web/components/rbac/DynamicSidebar.tsx` reescrito con drawer móvil,
  búsqueda en vivo, user card, logout y theme toggle. CSS BEM en
  `DynamicSidebar.css`.
- ✅ Wrappers RBAC v2 listos (sustituir el import legacy en cada layout cuando
  esté validado):
  - `apps/web/app/(subdomains)/console/SidebarV2.tsx`
  - `apps/web/app/(subdomains)/ventas/VentasSidebarV2.tsx`
  - `apps/web/app/(subdomains)/operacion/OperacionSidebarV2.tsx`
- ✅ `PanelKey` exportado desde `@/lib/rbac/navigation`.

### Deferred dentro de Phase 2.4 (motivos de seguridad)

- ❌ **Middleware JWT gate** (`apps/web/middleware.ts` + `canOpenPage`):
  el token de sesión vive en `localStorage` (`UserContext.tsx`), no en cookie
  httpOnly. Edge middleware no puede leerlo. Requiere migrar auth a cookie
  (refactor mayor) o aceptar `RbacPageGuard` (client-side) como única capa.
  → Mantener `RbacPageGuard` como gate efectivo en frontend.
- ❌ **UrlAccessGuard montado en controllers**: el guard hereda de
  `AuthGuard('jwt')` y rechaza cualquier rol no listado en `url-matrix.ts`.
  Hoy `url-matrix.ts` cubre sólo algunos roles/endpoints; activarlo provocaría
  403 masivos en producción. Plan: completar `url-matrix.ts` rol por rol,
  luego sustituir `RbacGuard` por `UrlAccessGuard` por controller.

---

## ✅ Phase 5 — Resultado auditoría (NO se borró nada)

Cada bloque tiene un veredicto verificado con `grep_search` sobre `apps/`:

| Item | Refs vivos | Veredicto |
|------|-----------|-----------|
| `apps/api/src/common/org-roles.ts` | 8 (alerts, ventas, seeds, roles.controller, etc.) | **NO borrar.** Roles legacy todavía sirven mapeo. |
| `apps/web/lib/org-roles.ts` | 5 (panel-user, panel-routing, panel-home, module-map, org-access) | **NO borrar.** |
| `apps/web/lib/org-access.ts` | 2 (`console/Sidebar.tsx`, `operacion/OperacionSidebar.tsx`) | **Borrable después** de que los layouts pasen a `DynamicSidebar` (wrappers ya listos). |
| `apps/api/src/evidences/` (módulo legacy) | Registrado en `app.module.ts`; controller expone `/evidences` (distinto de `/activity-evidence`). Web/mobile no parecen llamarlo, pero queda dependencia interna por `EvidencesService` exportado. | **Auditar más a fondo.** No es duplicado directo; sirve evidencias genéricas. |
| `apps/api/src/common/rbac.guard.ts` (`RbacGuard`) | 20+ controllers | **NO borrar.** Migrar gradualmente a `UrlAccessGuard`. |
| 27 flags `acceso*` en modelo `Role` | DB + seeds | **NO borrar.** Requiere migración Prisma + backfill. |

### Items que sí se pueden borrar cuando el usuario aprueba

```
package-Adam.json
apps/api/prisma/schema-Adam.prisma.bak
hash-gen.js
tmp-port3002-cmd.txt
```
(Todos sin referencias internas.)

---

## 🔴 Borrar inmediatamente (sin riesgo)

Archivos backup / placeholder claramente muertos:

```
package-Adam.json
apps/api/prisma/schema-Adam.prisma.bak
apps/api/src/news/news.controller-Adam.ts                # marcado D en git
apps/api/src/projects/dto/create-project.dto-Adam.ts     # marcado D
apps/api/src/projects/projects.controller-Adam.ts        # marcado D
apps/api/src/projects/projects.service-Adam.ts           # marcado D
apps/api/src/test-compile.ts                              # marcado D
apps/api/src/users/seed-demo-users.js                     # marcado D (existe el .ts)
apps/api/src/notifications.module.ts                      # marcado D (duplicado)
apps/web/app/(subdomains)/[slug]/Sidebar.tsx              # marcado D
apps/web/app/(subdomains)/[slug]/VentasSidebar-Adam.tsx   # marcado D
apps/web/app/(subdomains)/[slug]/VentasSidebar.module.css # marcado D
apps/web/app/(subdomains)/[slug]/VentasSidebar.tsx        # marcado D
hash-gen.js                                               # debug
tmp-port3002-cmd.txt                                      # tmp
```

> Tip: ejecutar `git restore` selectivo para conservar `.gitignore` y luego confirmar borrado real.

---

## 🟡 Fusionar en otro módulo (refactor, no borrado puro)

### Backend (`apps/api/src/`)

| Origen | Destino | Acción |
|--------|---------|--------|
| `activity-evidence/` | `activities/evidence/` | Mover a sub-carpeta + sub-controller |
| `evidences/` (genérico) | (eliminar) | Solo usa `documents/` o `activity-evidence/` |
| `lunch-breaks/` | `attendance/lunch/` | Sub-recurso |
| `crm-activities/` | `ventas/activities/` | Mover + renombrar |
| `executives/` | `analytics/executive/` | Sub-recurso BI |
| `mobile-crm/` | `ventas/mobile/` | Mover |
| `news/` + `newsletter/` | `content/` | Crear nuevo `content` y mover ambos |
| `branch-auth/` + `client-auth/` | `external-auth/` | Unificar |
| `branch-portal/` | `client-portal/branch/` | Sub-recurso |
| `client-ticket-requests/` | `support/tickets/` | Crear `support` y consolidar |

### Backend — eliminar definitivamente
- `apps/api/src/realtime/` — **NO está registrado** en `app.module.ts`. Verificar 0 imports → borrar.
- `apps/api/src/common/org-roles.ts` — reemplazado por `rbac/roles.v2.ts` (mantener hasta Fase 5)
- Columnas en modelo `Role`: los 27 flags `acceso*` (mantener hasta Fase 5 + migración)

### Frontend (`apps/web/app/(subdomains)/`)

| Origen | Destino |
|--------|---------|
| `console/Sidebar.tsx` | Reemplazar por `<DynamicSidebar panel="core" />` |
| `ventas/VentasSidebar.tsx` | Reemplazar por `<DynamicSidebar panel="sales" />` |
| `operacion/OperacionSidebar.tsx` | Reemplazar por `<DynamicSidebar panel="ops" />` |
| `contabilidad/layout.tsx` navGroups | El layout pasa a usar `<DynamicSidebar panel="core" />` (porque contabilidad se fusiona a core) |
| Carpeta `contabilidad/` completa | Mover contenido a `console/contabilidad/` y borrar |
| Carpeta `support/` completa | Mover a `operacion/soporte/` |
| Carpeta `noc/` completa | Mover a `operacion/noc/` |
| Carpeta `people/` completa | Mover a `console/rh/` |
| Carpeta `lab/` completa | Mover a `console/sistema/lab/` |

### Vistas duplicadas en web

| Concepto | Ubicaciones actuales | Acción |
|----------|---------------------|--------|
| Cotizaciones | `console/cotizaciones`, `ventas/cotizaciones`, `(public)/cotizaciones` | `(public)` es público (mantener); `console/` es vista admin; `ventas/` es vista comercial — **diferentes scopes, OK pero compartir componentes** |
| Clientes | `console/clients`, `ventas/clientes` | `core/clientes` = admin general, `sales/mis-clientes` = los del vendedor |
| Proyectos | `console/proyectos`(?), `ventas/proyectos`, `contabilidad/proyectos`, `operacion/proyectos`, `(public)/proyectos` | Backend: 1 modelo `Project`. Frontend: vistas con filtros por tipo |
| Viáticos | `operacion/viatics`, `contabilidad/viaticos`, `(operacion)/mis-viaticos` | Unificar bajo `core/viaticos` (admin) + `ops/mis-viaticos` (campo) |

---

## 🟢 Auditar antes de tocar

Estos módulos parecen vivos pero hay que verificar uso real:

```
apps/api/src/pac/         # ¿Panel de acceso?  — verificar
apps/api/src/access-control/  # Hikvision — confirmar con ops
apps/api/src/gps/         # ¿Activo?
apps/api/src/fines/       # Multas — verificar uso
apps/api/src/tool-requests/ # Solicitudes de herramientas
```

---

## Comando de verificación (antes de borrar)

```bash
# Para cada archivo a borrar, verificar 0 imports:
grep -r "from.*activity-evidence" apps/ --include="*.ts" --include="*.tsx"
grep -r "import.*evidences" apps/ --include="*.ts" --include="*.tsx"
grep -r "lunch-breaks" apps/ --include="*.ts" --include="*.tsx"
grep -r "RealtimeModule" apps/api/src/

# Verificar tests pasan:
pnpm --filter @nexara/api test
pnpm --filter @nexara/web build
```
