# NEXARA · Arquitectura v2 — Roles, Accesos y Reorganización

> Documento maestro del refactor `refactor/roles-purge-v2`.
> Reemplaza completamente el modelo de permisos legacy.

---

## 1. Negocio (contexto)

NEXARA es una empresa **tech-services** con dos vertientes:

### Servicios
- CCTV (instalación + mantenimiento)
- Gestión de redes / cableado estructurado
- Pantallas, monitores, equipo de cómputo
- Mantenimientos preventivos/correctivos
- **Clientes grandes** (POS, impresoras, scanners) bajo contrato SLA
- Licitaciones públicas y privadas

### Venta
- Hardware al mayoreo (laptops, monitores, pantallas, NVRs)
- Proyectos grandes (parques industriales, gobierno, universidades)
- Cliente final residencial (ej. 4 cámaras + NVR)

---

## 2. Personas (Quién hace qué)

| Persona | Rol v2 | Panel HOME |
|--------|--------|------------|
| Tú (desarrollador) | `super_admin` | `core` |
| CEO / Dueño | `ceo` | `core` |
| Director de Operaciones | `dir_operaciones` | `core` |
| Director Administrativo | `dir_admin` | `core` |
| Coord. Admin (senior) | `coord_admin` | `core` |
| Administrativos | `administrativo` | `core` |
| Contador | `contabilidad` | `core` |
| RH | `rh` | `core` |
| Coord. Ventas (gerente) | `coord_ventas` | `sales` |
| Vendedores | `vendedor` | `sales` |
| Coord. Operaciones (PM) | `coord_operaciones` | `ops` |
| Ingenieros de campo | `ing_campo` | `ops` |
| Ingenieros de soporte / NOC | `ing_soporte` | `ops` |
| Líder de Diseño | `lider_diseno` | `studio` |
| Diseñadores / Community | `disenador` | `studio` |
| Clientes externos | `cliente` | `portal` |

**Total: 16 roles** (vs. 19 org-roles + 27 flags actuales).

---

## 3. Entradas al sistema (subdominios)

| Subdominio | Slug interno | Para quién | Notas |
|------------|--------------|-----------|-------|
| `core.nexara.com.mx` | `console` | ERP: CEO, directores, admin, RH, contabilidad | Eje principal |
| `sales.nexara.com.mx` | `ventas` | CRM: vendedores, coord. ventas | |
| `ops.nexara.com.mx` | `operacion` | Ingenieros de campo, soporte, NOC, coord. ops | |
| `studio.nexara.com.mx` | `web` | Diseñadores, marketing | CMS del sitio público |
| `portal.nexara.com.mx` | `tickets` | Clientes externos | Solo tickets |

**Eliminadas como subdominio independiente** (fusionan a `core`):
- `finance.nexara` → módulo `core/contabilidad`
- `support.nexara` → módulo `ops/soporte`
- `noc.nexara` → módulo `ops/noc`
- `people.nexara` → módulo `core/rh`
- `lab.nexara` → módulo `core/sistema/lab` (solo super_admin)

> El CEO entra solo a **core** y desde ahí ve dashboards embebidos de
> `sales`, `ops` y `studio` (read-only). No tiene que ir a múltiples sitios.

---

## 4. Fuente única de verdad

Todo el RBAC se concentra en:

| Archivo | Propósito |
|--------|-----------|
| [apps/api/src/common/rbac/roles.v2.ts](apps/api/src/common/rbac/roles.v2.ts) | Catálogo de 16 roles + tiers + paneles |
| [apps/api/src/common/rbac/url-matrix.ts](apps/api/src/common/rbac/url-matrix.ts) | Matriz Rol → URLs permitidas (API + web) |
| [apps/api/src/common/rbac/approval-policy.ts](apps/api/src/common/rbac/approval-policy.ts) | Cadenas de aprobación con umbrales |
| [apps/api/src/common/rbac/url-access.guard.ts](apps/api/src/common/rbac/url-access.guard.ts) | Guard NestJS que aplica la matriz |
| [apps/web/lib/rbac/roles.ts](apps/web/lib/rbac/roles.ts) | Espejo frontend |
| [apps/web/lib/rbac/page-matrix.ts](apps/web/lib/rbac/page-matrix.ts) | Matriz de páginas, expone `canOpenPage()` |
| [apps/web/lib/rbac/role-mapping.ts](apps/web/lib/rbac/role-mapping.ts) | Mapeo legacy → v2 en el frontend |
| [apps/web/lib/user-access.ts](apps/web/lib/user-access.ts) | Envuelve `canOpenPage()` para páginas/redirects |
| [apps/web/components/app-shell/AppShell.tsx](apps/web/components/app-shell/AppShell.tsx) | Layout + navegación por rol (reemplaza al `DynamicSidebar` planeado) |

**Regla de oro:** si quieres cambiar quién accede a qué, modificas
SOLO `url-matrix.ts` y `page-matrix.ts`. Nada más.

> Nota: `navigation.ts`, `DynamicSidebar.tsx` y `useCanAccess.ts` (hook
> dedicado) nunca se crearon como archivos separados — la implementación real
> quedó dentro de `AppShell.tsx` / `user-access.ts`. Los ejemplos de código
> de la sección 10 usan los nombres reales, no los planeados originalmente.

---

## 5. Aprobaciones (cadenas jerárquicas)

Definidas en [approval-policy.ts](apps/api/src/common/rbac/approval-policy.ts).
Los umbrales en MXN son **configurables** desde `/core/configuracion/aprobaciones`.

```
VIÁTICOS
  Ing.Campo → Administrativo → Coord.Admin → Dir.Admin (>10k) → CEO (>50k)

EVIDENCIAS (de actividades)
  Ing.Campo → Coord.Operaciones → Administrativo → Coord.Admin (cierre)

COTIZACIONES
  Vendedor → Coord.Ventas (>50k) → Dir.Operaciones (>250k) → CEO (>1M)

COMPRAS
  Solicitante → Coord.Admin → Dir.Admin (>25k) → CEO (>200k)
```

---

## 6. Consolidación de módulos (eliminar redundancia)

| Fusión | Razón |
|--------|-------|
| `activity-evidence` → **dentro de `activities`** | Las evidencias son sub-recurso de actividad |
| `evidences` (genérico) → **eliminar** | Cubierto por `activity-evidence` + `documents` |
| `lunch-breaks` → **dentro de `attendance`** | Mismo dominio (control horario) |
| `crm-activities` → renombrar a `sales-activities` | Evita colisión con `activities` (ops) |
| `executives` → fusionar con `analytics` | Ambos son BI |
| `mobile-crm` → fusionar con `ventas` | Es un subset móvil |
| `realtime` (no registrado) → **eliminar** o registrar |
| `news` + `newsletter` → un solo módulo `content` |
| `support` + `client-ticket-requests` → unificar tickets |
| `branch-auth` + `client-auth` → un solo `external-auth` |

UI:
- `core/actividades/:id` tendrá tabs: **Detalle · Evidencias · Viáticos · Aprobaciones · Historial**
  (en vez de secciones separadas)
- `core/clientes/:id` tendrá tabs: **Datos · Sucursales · Servicios · Tickets · Cotizaciones · Facturas**
- `sales/oportunidades/:id` tendrá tabs: **Pipeline · Cotizaciones · Actividades · Documentos**

---

## 7. UI/UX — Lineamientos

- **Color**: paleta neutra existente (Ink #102a43, Sky #4c6fff, Mint #2ec4b6).
- **Tipografía**: Bebas Neue (display), Space Grotesk (UI).
- **Densidad**: sidebar 240px colapsable a 64px (icon-only).
- **Sidebar único** = `<DynamicSidebar panel={...} />`. NO crear sidebars locales.
- **Acción primaria** siempre arriba a la derecha del contenido (no en sidebar).
- **Vista de tabla** con: filtros pegajosos, paginación cursor, acciones por fila con dropdown único.
- **Aprobaciones** = bandeja central en `/core/aprobaciones` (cards con monto + responsable previo + adjuntos).

---

## 8. Plan de migración (5 fases)

### Fase 1 — Foundation ✅ (este PR)
- [x] Crear `apps/api/src/common/rbac/*` (roles, matriz, aprobaciones, guard)
- [x] Crear `apps/web/lib/rbac/*` (espejo + matriz páginas + navegación)
- [x] `<DynamicSidebar>` + `useCanAccess`
- [x] Documento maestro (este archivo) + `PURGE_LIST.md`

### Fase 2 — Wiring
- [x] Agregar columna `role` v2 en `User` (Prisma migration) — columna real es
      `User.roleKey` (`String?`), no `role`. Ver `schema.prisma`.
- [x] ~~Script de migración legacy → v2 (`migrate-roles.ts`)~~ — **no se
      necesita**: `resolveEffectiveRoleKey()` en
      [auth.service.ts](apps/api/src/auth/auth.service.ts) resuelve el
      `roleKey` v2 en cada login (desde `orgRoleKey` vía `LEGACY_TO_V2` si la
      columna está vacía) y lo mete al JWT. Es más robusto que un backfill de
      una sola vez porque cubre altas nuevas sin volver a correr el script.
- [x] Página web respeta el rol v2 — no vía `middleware.ts` (el middleware
      solo resuelve subdominio→prefijo, no lee sesión) sino vía
      `canOpenPage()` en [page-matrix.ts](apps/web/lib/rbac/page-matrix.ts),
      consumido por [user-access.ts](apps/web/lib/user-access.ts) y
      [section-views.ts](apps/web/lib/section-views.ts) en cada página.
- [ ] Aplicar `UrlAccessGuard` a controllers críticos (auth, viaticos,
      cotizaciones, users) — **parcial**: `viaticos` y `cotizaciones` ya lo
      usan. `auth` no lo necesita (rutas públicas de login). `users` sigue en
      `RbacGuard` legacy **a propósito**: sus endpoints dependen de
      `@RBAC({ permissions / anyPermissions })` (combinaciones finas tipo
      `USERS_MANAGE | CONSOLE_ADMIN | HR_VIEW`) que `url-matrix.ts` todavía no
      cubre ruta por ruta. `UrlAccessGuard` no lee `@RBAC()` — si se migrara
      users.controller.ts hoy, cualquier URL sin regla explícita en la matriz
      quedaría abierta a cualquier rol autenticado. Migrar solo después de
      escribir las reglas equivalentes en `url-matrix.ts` para cada endpoint.
- [x] Sustituir sidebars hardcoded — no existe `<DynamicSidebar>` como
      componente separado (el archivo histórico `Sidebar.tsx` quedó vacío);
      la navegación por rol vive dentro de
      [AppShell.tsx](apps/web/components/app-shell/AppShell.tsx), que sí
      consume la matriz de roles. Funcionalmente cumple el objetivo con otro
      nombre de archivo.

### Fase 3 — Consolidación
- [ ] Fusionar `activity-evidence` en `activities` (rutas + Prisma)
- [ ] Mover `lunch-breaks` dentro de `attendance`
- [ ] Renombrar `crm-activities` → `sales-activities`
- [ ] Eliminar `evidences` (genérico), `realtime` (muerto)
- [ ] Mover `support`, `noc`, `people`, `lab` como módulos de `core`/`ops`

### Fase 4 — UI/UX redesign
- [ ] Layouts de `[id]` con tabs (actividades, clientes, oportunidades)
- [ ] Bandeja unificada de aprobaciones
- [ ] Dashboards embebidos (CEO ve todo desde `core`)
- [ ] Panel de "Usuarios y Roles" con explorador de permisos

### Fase 5 — Limpieza final
- [ ] Eliminar `org-roles.ts` legacy
- [ ] Eliminar columnas `acceso*` booleanas del modelo `Role`
- [ ] Eliminar `RbacGuard` legacy (queda solo `UrlAccessGuard`)
- [ ] Eliminar archivos en `PURGE_LIST.md`

---

## 9. Seguridad

- **Defense-in-depth**: el guard backend nunca confía en el middleware web.
- **Whitelist por defecto**: si una URL no aparece en `url-matrix.ts`, se NIEGA.
- **Auditoría**: todo DENY se loguea con `role + method + url`.
- **Bypass**: solo `super_admin` salta toda validación. Cuentas con este rol
  deben ser ≤ 2 personas.
- **Tokens**: JWT incluye `role` v2. Los tokens viejos sin `role` se mapean
  vía `LEGACY_TO_V2` y se renuevan en el siguiente login.

---

## 10. Cómo usar (para developers)

### Backend: proteger un controller
```ts
import { UseGuards } from '@nestjs/common';
import { UrlAccessGuard } from 'src/common/rbac';

@UseGuards(UrlAccessGuard)
@Controller('viaticos')
export class ViaticosController { /* ... */ }
```
El guard lee la matriz, no necesitas decorador adicional.

### Backend: aprobaciones
```ts
import { getRequiredApprovers, canApproveStep } from 'src/common/rbac';

const steps = getRequiredApprovers('viaticos', 35_000);
// → [Administrativo, Coord.Admin, Dir.Admin] (CEO no porque < 50k)
```

### Frontend: esconder UI según rol
```tsx
import { canUserAccessPath } from '@/lib/user-access';

const { user } = useUser();
{canUserAccessPath(user, '/erp/users') && <Button>Gestionar usuarios</Button>}
```

### Frontend: navegación por rol
No hay un componente `<DynamicSidebar>` aparte — la navegación vive dentro de
`AppShell.tsx`, que ya envuelve cada panel y calcula qué items mostrar con
`buildUserSidebar()` / `getUserAllowedModules()` de `lib/user-access.ts`. No
crear sidebars locales nuevas; si falta un link, agrégalo ahí.

---

**Última actualización**: 2026-07-09, rama `refactor/roles-purge-v2` —
Fase 2 auditada contra el código real (ver notas inline arriba); Fases 3-5
siguen sin empezar.
