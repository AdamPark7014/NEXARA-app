# 02 · Matriz de acceso web — qué módulos ve cada rol

Auditoría read-only · 2026-09-06 · rama en `bd6143ce` (árbol limpio)
Área: `apps/web/lib/access-matrix.ts` y toda la cadena que decide qué aparece en el menú.

Síntoma reportado:

> «el usuario de más alto rango tiene todos los módulos bien, pero los demás
> tienen muy pocos módulos en relación con lo que hacen, deberían tener más,
> muchos más»

**El síntoma es real y está medido.** El CEO ve 95 de 103 módulos. La mediana del
resto es **22**. Cinco roles ven menos de 16. Y la causa no es que la matriz sea
tacaña: es que **la matriz que Adam cree estar editando no es la que decide**.

---

## 0. Veredicto en cinco líneas

1. `access-matrix.ts` **no gobierna el acceso de ningún usuario real**. Su campo
   `allowedRoles` es código muerto para todo usuario con rol reconocido
   (`user-access.ts:112` → `if (v2) return true;`).
2. Quien decide de verdad es `page-matrix.ts:38` (`PAGE_MATRIX`), una lista
   blanca de rutas escrita a mano para 17 roles, y `section-views.ts:200`
   (`shouldShowModuleInSidebar`), un `switch` de ~40 casos que vuelve a filtrar.
3. Hay **tres** listas blancas de rutas en el producto (`access-matrix.ts`,
   `page-matrix.ts` en web, `url-matrix.ts` en API) y cada una se declara a sí
   misma «single source of truth». Ninguna importa a las otras.
4. Los 21 roles organizacionales se **colapsan a 14** antes de consultar la
   matriz (`role-mapping.ts:72`), así que 7 puestos distintos comparten permisos
   con otro puesto.
5. Todo módulo nuevo nace **invisible para todos**: cae en `default:` de
   `shouldShowModuleInSidebar` (sobrevive) pero **no está en ninguna regla de
   `PAGE_MATRIX`**, así que `canOpenPage` lo niega. Esa es la causa raíz
   estructural.

---

## 1. El inventario real

| Cosa | Cuántas | Dónde |
|---|--:|---|
| Módulos registrados | **103** | `access-matrix.ts:325` (`MODULES`) |
| Paneles | 6 | ERP 33 · CRM 15 · OPS 22 · STUDIO 10 · LAB 5 · INTEGRA 18 |
| Páginas `page.tsx` bajo `(panels)` | 126 estáticas + dinámicas | todas cubiertas por algún módulo o por prefijo |
| Páginas bajo `(subdomains)` | 5 | `/tickets`, `/tickets/[branch]`, `/tickets/ayuda`, `/tickets/mis-servicios`, `/tickets/mis-sucursales` — fuera de `MODULES`, solo para rol `cliente` |
| Roles organizacionales (v1) | **21** | `apps/web/lib/org-roles.ts:7-29` (`ORG_ROLE_KEYS`) |
| Roles RBAC v2 | **17** | `apps/web/lib/rbac/roles.ts:6-24` (`ROLES`) |
| Roles v2 distintos alcanzables desde v1 | **14** | `role-mapping.ts:72` (`ORG_TO_V2`) |
| Permisos granulares (API) | **113** | `apps/api/src/common/permissions.ts` |
| Permisos granulares (web) | **111** | `apps/web/lib/permissions.ts` |

No hay ningún módulo huérfano de página: los 103 tienen su `page.tsx`. El
problema es puramente de autorización, no de rutas rotas.

---

## 2. La cadena real de decisión (y dónde se rompe)

Lo que ocurre cuando el AppShell pinta la barra lateral:

```
buildUserSidebar()                      user-access.ts:127
  └─ para cada uno de los 103 MODULES:
       ├─ canUserAccessModule()         user-access.ts:103
       │    ├─ canUserAccessPath()      user-access.ts:92
       │    │    ├─ if (isSuperAdmin) return true                    ← bypass
       │    │    ├─ v2 = resolveV2RoleKey(user)   role-mapping.ts:21
       │    │    ├─ if (v2) return canOpenPage(v2, url)  ← ★ DECIDE PAGE_MATRIX
       │    │    └─ return canAccessUrl(orgKey, url)     ← ★ solo si NO hay v2
       │    └─ if (v2) return true;     user-access.ts:112  ← ★ ignora allowedRoles
       └─ shouldShowModuleInSidebar()   section-views.ts:200 ← ★ SEGUNDO filtro
```

Las tres estrellas son el problema:

**★1 — `allowedRoles` es código muerto.** `user-access.ts:112`:

```ts
  // v2 users: canUserAccessPath (PAGE_MATRIX) is the authoritative check.
  // Skipping allowedRoles avoids false negatives when org role sets
  // (e.g. OPS_LEADS) don't perfectly mirror the v2 role hierarchy
  // (e.g. coord_operaciones / arquitecto missing from OPS_LEADS).
  const v2 = resolveV2RoleKey(user);
  if (v2) return true;
```

El comentario admite el problema y lo resuelve **desactivando la matriz** en vez
de arreglarla. `resolveV2RoleKey` devuelve no-nulo para prácticamente todo
usuario (el paso 5 de su cascada hace *matching* por texto del nombre del rol),
así que `access-matrix.ts` queda fuera del circuito para el 100 % de los usuarios
reales. Las 1 200 líneas de `allowedRoles` cuidadosamente escritas **no se
ejecutan nunca**.

**★2 — `PAGE_MATRIX` es la lista blanca que sí manda**, y es corta: 17 bloques
de rutas escritas a mano, sin relación con `MODULES`. Nadie garantiza que un
módulo registrado aparezca en algún bloque.

**★3 — `shouldShowModuleInSidebar` vuelve a filtrar** con conjuntos de roles
propios (`EXECUTIVE`, `OPS_MANAGERS`, `SALES_MANAGERS`, `FINANCE_ROLES`,
`WAREHOUSE_ROLES`… `section-views.ts:26-41`) que **no coinciden** con los de
`PAGE_MATRIX`. El resultado es una intersección de dos criterios que nadie diseñó
en conjunto.

### Consecuencia medible de ★3

Módulos donde `section-views.ts` **dice que hay que mostrarlos** y
`page-matrix.ts` **bloquea la URL** (el rol tiene la intención declarada de
verlos, y aun así no aparecen):

| Rol v2 | Contradicciones | Ejemplos que duelen |
|---|--:|---|
| `coord_admin` | **33** | `settings`, `hr`, `orgchart`, `audit`, todo INTEGRA |
| `coord_ventas` | **30** | `approvals`, `kb`, `calendar`, `studio-contacts`, `studio-leads` |
| `rh` | **30** | `approvals`, `kb`, `accounting`, `invoicing` |
| `contabilidad` | **27** | `approvals`, `kb`, `attendance` |
| `arquitecto` | **26** | `approvals`, `kb`, `documents`, **todo INTEGRA** |
| `administrativo` | **26** | `warehouse`, `ops-vehicles`, todo INTEGRA |
| `dir_admin` | **32** | todo el CRM operativo, todo INTEGRA |
| `vendedor` | **24** | `calendar`, todo INTEGRA |
| `ing_campo` | **22** | `calendar`… y **todo INTEGRA** |
| `lider_diseno` / `disenador` | 23 c/u | `crm-chat`, todo INTEGRA |
| `dir_operaciones` | 13 | `kb`, `accounting`, `orgchart`, `audit` |
| `coord_operaciones` | 8 | `approvals`, `kb`, `orgchart`, `documents` |
| `ing_soporte` | 6 | `crm-quotes`, `ops-dispatch` |

Y al revés — rutas que `PAGE_MATRIX` **permite** pero el menú **oculta** (el
usuario puede llegar tecleando la URL, pero no hay enlace):

`ing_campo` 15 · `dir_operaciones` 9 · `coord_operaciones` 6 · `vendedor` 6 ·
`arquitecto` 5 · `ing_soporte` 4 · `ceo` 4 · `coord_admin` 1.

Un ingeniero de campo puede abrir `/ops/maintenance`, `/ops/assets`,
`/ops/service-clients` y `/ops/noc` escribiendo la URL, pero **ninguna aparece en
su menú**. Eso es literalmente «tienen muy pocos módulos en relación con lo que
hacen».

---

## 3. Matriz completa rol × módulo — tal como está HOY

Leyenda: **●** en el menú lateral · **○** alcanzable por URL pero oculto ·
**·** bloqueado (403 / redirect).

Columnas: SA `super_admin` · CEO `ceo` · ARQ `arquitecto` · DOP `dir_operaciones`
· DAD `dir_admin` · CAD `coord_admin` · ADM `administrativo` · COP
`coord_operaciones` · ICA `ing_campo` · ISO `ing_soporte` · CVE `coord_ventas` ·
VEN `vendedor` · LDI `lider_diseno` · DIS `disenador` · RH `rh` · CON
`contabilidad` · CLI `cliente`.

| Módulo (ruta) | SA | CEO | ARQ | DOP | DAD | CAD | ADM | COP | ICA | ISO | CVE | VEN | LDI | DIS | RH | CON | CLI |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **ERP** (33) | | | | | | | | | | | | | | | | | |
| `/erp/executive` |○|●|·|●|●|·|·|·|·|·|·|·|·|·|·|·|·|
| `/erp/dashboard` |○|○|●|●|●|●|●|·|·|·|●|·|·|·|●|●|·|
| `/erp/chat` |●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|·|
| `/erp/reuniones` |●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|·|
| `/erp/approvals` |●|●|·|●|●|●|●|·|·|·|·|·|·|·|·|·|·|
| `/erp/analytics/bi` |○|●|·|●|●|·|·|·|·|·|·|·|·|·|·|·|·|
| `/erp/users` |○|●|·|·|●|●|·|·|·|·|·|·|·|·|·|·|·|
| `/erp/companies` |○|●|·|●|●|●|●|·|·|·|·|·|·|·|·|·|·|
| `/erp/settings` |○|●|·|·|●|·|·|·|·|·|·|·|·|·|·|·|·|
| `/erp/architecture` |○|●|·|●|●|·|·|·|·|·|·|·|·|·|·|·|·|
| `/erp/kb` |●|●|·|·|●|·|·|·|·|●|·|·|·|·|·|·|·|
| `/erp/accounting` |○|●|·|·|●|●|·|·|·|·|·|·|·|·|·|●|·|
| `/erp/invoicing` |○|●|·|·|●|●|·|·|·|·|·|·|·|·|·|●|·|
| `/erp/banking` |○|●|·|·|●|●|·|·|·|·|·|·|·|·|·|●|·|
| `/erp/finance/viatics` |●|●|·|○|●|●|●|·|·|·|·|·|·|·|·|●|·|
| `/erp/finance/expenses` |○|●|·|●|●|●|●|·|·|·|·|·|·|·|·|●|·|
| `/erp/finance/employee-payments` |○|●|·|●|●|●|·|·|·|·|·|·|·|·|●|●|·|
| `/erp/hr` |●|●|·|·|●|·|·|·|·|·|·|·|·|·|●|·|·|
| `/erp/hr/attendance` |●|●|●|·|●|●|●|●|●|●|●|●|●|●|●|·|·|
| `/erp/hr/lunch-breaks` |●|●|●|·|●|●|●|●|●|●|●|●|●|●|●|·|·|
| `/erp/hr/fines` |●|●|·|·|●|·|·|·|·|·|·|·|·|·|●|·|·|
| `/erp/hr/orgchart` |●|●|·|·|●|·|·|·|·|·|·|·|·|·|●|·|·|
| `/erp/hr/kpis` |●|●|·|·|●|·|·|·|·|·|·|·|·|·|●|·|·|
| `/erp/warehouse` |○|●|·|●|●|●|·|·|·|·|·|·|·|·|·|·|·|
| `/erp/procurement` |○|●|·|●|●|●|·|·|·|·|·|·|·|·|·|·|·|
| `/erp/documents` |●|●|·|●|●|●|●|·|●|●|·|·|·|·|●|●|·|
| `/erp/audit` |○|●|·|·|●|·|·|·|·|·|·|·|·|·|·|·|·|
| `/erp/exports` |○|●|·|●|●|●|·|·|·|·|·|·|·|·|·|●|·|
| `/erp/notifications-center` |●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|·|
| `/erp/news` |○|●|·|·|●|●|●|·|·|·|·|·|·|·|·|·|·|
| `/erp/calendar` |●|●|●|●|●|●|●|●|●|●|·|·|●|●|●|●|·|
| `/erp/my-profile` |●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|·|
| `/erp/facilities/access` |●|●|·|●|●|·|·|·|·|·|·|·|·|·|·|·|·|
| **CRM** (15) | | | | | | | | | | | | | | | | | |
| `/crm/dashboard` |○|●|·|○|●|●|·|·|·|·|●|●|·|·|·|·|·|
| `/crm/chat` |●|●|·|·|·|·|·|·|·|·|●|●|·|·|·|·|·|
| `/crm/leads` |○|●|·|·|·|●|·|·|·|·|●|●|·|·|·|·|·|
| `/crm/opportunities` |●|●|·|·|·|●|·|·|·|·|●|○|·|·|·|·|·|
| `/crm/pipeline` |○|●|·|○|·|●|·|·|·|·|●|●|·|·|·|·|·|
| `/crm/agenda` |○|●|·|·|·|·|·|·|·|·|●|●|·|·|·|·|·|
| `/crm/clients` |○|●|·|·|·|●|·|·|·|·|●|●|·|·|·|·|·|
| `/crm/products` |○|●|·|·|·|●|·|·|·|·|●|●|●|●|·|·|·|
| `/crm/quotes` |○|●|○|○|●|●|·|●|·|·|●|●|●|●|·|●|·|
| `/crm/templates` |○|●|·|·|●|·|·|·|·|·|●|○|●|·|·|·|·|
| `/crm/projects` |○|●|○|○|·|●|·|·|·|·|●|●|·|·|·|●|·|
| `/crm/tenders` |○|●|·|○|●|·|·|·|·|·|●|○|·|·|·|·|·|
| `/crm/team` |○|●|·|·|●|·|·|·|·|·|●|○|·|·|·|·|·|
| `/crm/targets` |○|●|·|·|●|·|·|·|·|·|●|○|·|·|·|·|·|
| `/crm/reports` |○|●|·|○|●|·|·|·|·|·|●|○|·|·|·|·|·|
| **OPS** (22) | | | | | | | | | | | | | | | | | |
| `/ops/dashboard` |●|●|●|●|·|·|·|●|●|●|·|·|·|·|·|·|·|
| `/ops/dispatch` |●|●|●|●|·|·|·|●|●|·|·|·|·|·|·|·|·|
| `/ops/chat` |●|●|●|●|·|·|·|●|●|●|·|·|·|·|·|·|·|
| `/ops/projects` |●|●|●|●|●|●|·|●|○|·|·|·|·|·|·|·|·|
| `/ops/activities` |●|●|●|●|●|●|·|●|○|○|·|·|·|·|·|·|·|
| `/ops/my-activities` |○|·|·|·|·|·|·|○|●|●|·|·|·|·|·|·|·|
| `/ops/evidences` |○|○|○|○|·|·|·|○|○|·|·|·|·|·|·|·|·|
| `/ops/my-evidences` |○|·|·|·|·|·|·|○|○|·|·|·|·|·|·|·|·|
| `/ops/viatics` |○|○|●|●|·|·|·|●|○|·|·|·|·|·|·|·|·|
| `/ops/my-viatics` |○|·|·|·|·|·|·|○|●|●|·|·|·|·|·|·|·|
| `/ops/vehicles` |●|●|○|●|·|·|·|●|○|·|·|·|·|·|·|·|·|
| `/ops/my-vehicles` |○|·|·|·|·|·|·|○|●|○|·|·|·|·|·|·|·|
| `/ops/gps` |●|●|●|●|·|·|·|●|○|·|·|·|·|·|·|·|·|
| `/ops/tools` |●|●|●|●|·|○|·|●|●|●|·|·|·|·|·|·|·|
| `/ops/service-clients` |●|●|●|●|·|·|·|●|○|·|·|·|·|·|·|·|·|
| `/ops/maintenance` |●|●|●|●|·|·|·|●|○|·|·|·|·|·|·|·|·|
| `/ops/maintenance/contracts` |○|○|○|○|·|·|·|○|○|·|·|·|·|·|·|·|·|
| `/ops/assets` |●|●|●|●|·|·|·|●|○|·|·|·|·|·|·|·|·|
| `/ops/noc` |●|●|●|●|·|·|·|●|○|·|·|·|·|·|·|·|·|
| `/ops/support` |●|●|●|●|·|·|·|●|○|○|·|·|·|·|·|·|·|
| `/ops/support/sla` |●|●|●|●|·|·|·|●|○|○|·|·|·|·|·|·|·|
| `/ops/recruiting` |●|●|●|●|·|·|·|●|○|·|·|·|·|·|●|·|·|
| **STUDIO** (10) | | | | | | | | | | | | | | | | | |
| `/studio/dashboard` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| `/studio/chat` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| `/studio/hero` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| `/studio/pages` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| `/studio/cases` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| `/studio/news` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| `/studio/social` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| `/studio/newsletter` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| `/studio/contacts` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| `/studio/leads` |●|●|·|·|·|·|·|·|·|·|·|·|●|●|·|·|·|
| **LAB** (5) | | | | | | | | | | | | | | | | | |
| `/lab` |●|●|·|·|·|·|·|·|·|·|·|·|·|·|·|·|·|
| `/lab/chat` |●|●|·|·|·|·|·|·|·|·|·|·|·|·|·|·|·|
| `/lab/ai` |●|●|·|·|·|·|·|·|·|·|·|·|·|·|·|·|·|
| `/lab/flags` |●|●|·|·|·|·|·|·|·|·|·|·|·|·|·|·|·|
| `/lab/health` |●|●|·|·|·|·|·|·|·|·|·|·|·|·|·|·|·|
| **INTEGRA** (18) | | | | | | | | | | | | | | | | | |
| `/integra` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/video` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/detection` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|·|
| `/integra/events` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/alarms` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/access` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/people` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/schedules` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|·|
| `/integra/espacios` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|·|
| `/integra/attendance` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|·|
| `/integra/visitors` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/vehicles` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/anpr` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/settings` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|·|
| `/integra/audit` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|·|
| `/integra/map` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/notifications-center` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|
| `/integra/my-profile` |●|●|·|●|·|·|·|●|·|●|·|·|·|·|·|·|●|

**Totales en el menú:** SA 66 · **CEO 95** · ARQ 23 · DOP 52 · DAD 42 · CAD 32 ·
ADM 14 · COP 42 · ICA 15 · ISO 32 · CVE 22 · VEN 15 · LDI 20 · DIS 19 · RH 15 ·
CON 16 · CLI 12

**Totales alcanzables por URL:** SA 103 · CEO 99 · ARQ 28 · DOP 61 · DAD 42 ·
CAD 33 · ADM 14 · COP 48 · ICA 30 · ISO 36 · CVE 22 · VEN 21 · LDI 20 · DIS 19 ·
RH 15 · CON 16 · CLI 12

> **Anomalía:** `super_admin` ve **66**, menos que el CEO (95). Los conjuntos
> `ERP_EXECUTIVE`, `ERP_ADMIN`, `FINANCE_ROLES`, `SALES_MANAGERS`,
> `WAREHOUSE_ROLES` de `section-views.ts:36-41` **no incluyen `SUPER_ADMIN`**, así
> que un super-admin real pierde `executive`, `users`, `settings`, `audit`, toda
> la contabilidad y casi todo el CRM. Adam no lo nota porque
> `gerencia@nexara.com.mx` es *platform owner* y `role-mapping.ts:24` lo degrada a
> `ceo` **antes** de mirar `isSuperAdmin`. El «usuario de más alto rango» que
> funciona bien es en realidad el CEO, no el super-admin.

---

## 4. La otra mitad del problema: los roles se colapsan antes de llegar a la matriz

`access-matrix.ts` distingue con cuidado 21 puestos. `ORG_TO_V2`
(`role-mapping.ts:72`) los aplasta a **14** antes de consultar `PAGE_MATRIX`:

| Rol v2 efectivo | Puestos org que caen ahí |
|---|---|
| `ing_soporte` | `senior_engineer`, `support_agent`, **`noc_lead`**, **`noc_operator`** |
| `coord_operaciones` | `project_manager`, `coord_operaciones`, `maintenance_coordinator` |
| `coord_admin` | **`warehouse_manager`**, **`procurement_officer`** |
| `coord_ventas` | `director_commercial`, `sales_manager` |
| resto | 1:1 |

Y `ARQUITECTO` y `COORD_OPERACIONES` **no aparecen en ningún `allowedRoles`** de
`access-matrix.ts` (única mención: `ROLE_HOME_PANEL`, línea 1142). Si la matriz
v1 llegara a activarse, esos dos roles verían **0 módulos**.

### Intención declarada vs. realidad, por puesto

`Intención` = módulos visibles que `access-matrix.ts` le concede por
`allowedRoles`. `Realidad` = módulos que realmente aparecen en su menú tras
`PAGE_MATRIX` + `shouldShowModuleInSidebar`.

| Puesto org (v1) | v2 efectivo | Intención | Realidad | Δ | Lo que pierde |
|---|---|--:|--:|--:|---|
| `ceo` | `ceo` | 97 | 95 | −2 | `dashboard`, `ops-viatics` |
| `director_admin` | `dir_admin` | 51 | 42 | **−11** | todo el CRM operativo (`leads`, `opportunities`, `pipeline`, `agenda`, `clients`, `products`, `projects`, `crm-chat`), `integra-settings`, `integra-notifications`, `integra-my-profile` |
| `director_ops` | `dir_operaciones` | 50 | 52 | −3 | `kb`, `viatics-admin`, `orgchart` |
| `director_commercial` | `coord_ventas` | 40 | 22 | **−20** | `executive`, `approvals`, `bi`, `architecture`, `kb`, `orgchart`, `exports`, `calendar` y **los 10 módulos de STUDIO** |
| `sales_manager` | `coord_ventas` | 31 | 22 | −9 | `approvals`, `bi`, `kb`, `orgchart`, `calendar`, `studio-contacts`, `studio-leads` |
| `sales_rep` | `vendedor` | 24 | 15 | −9 | `crm-opportunities`, `kb`, `orgchart`, `calendar`, `studio-contacts`, `studio-leads`, `dashboard` |
| `project_manager` | `coord_operaciones` | 29 | 42 | −7 | `approvals`, `bi`, `kb`, `viatics-admin`, `orgchart`, `crm-projects`, `dashboard` |
| `senior_engineer` | `ing_soporte` | 42 | 32 | **−12** | `ops-dispatch`, `ops-projects`, `ops-activities`, `ops-viatics`, `ops-vehicles`, `ops-gps`, `ops-maintenance`, `ops-assets`, `crm-quotes`, `orgchart` |
| `field_engineer` | `ing_campo` | 18 | 15 | −5 | `kb`, `orgchart`, `dashboard`, `integra-notifications`, `integra-my-profile` |
| `designer` | `disenador` | 25 | 19 | −6 | `kb`, `orgchart`, `crm-templates`, `dashboard` |
| `admin_staff` | `administrativo` | 16 | 14 | −7 | `kb`, `hr`, `orgchart`, `ops-vehicles`, `facilities-access` |
| `accountant` | `contabilidad` | 19 | 16 | −5 | `approvals`, `kb`, `orgchart` |
| `hr_specialist` | `rh` | 20 | 15 | −5 | **`users`**, `kb`, `news` |
| `warehouse_manager` | `coord_admin` | 15 | 32 | −5 / **+22** | pierde `ops-tools`, `kb`, `orgchart` — pero **gana** `users`, `accounting`, `invoicing`, `banking`, `employee-payments`, todo el CRM |
| `procurement_officer` | `coord_admin` | 12 | 32 | −4 / **+24** | idéntico al anterior |
| `maintenance_coordinator` | `coord_operaciones` | 18 | 42 | −3 / **+27** | gana los 18 módulos de INTEGRA y todo OPS |
| `support_agent` | `ing_soporte` | 19 | 32 | −6 / +19 | **pierde `ops-noc`, `ops-support-inbox`, `ops-support-sla`, `ops-service-clients`** |
| `noc_lead` | `ing_soporte` | 28 | 32 | −5 / +9 | **pierde `ops-noc` y `ops-support-sla`** |
| `noc_operator` | `ing_soporte` | 20 | 32 | −3 / +15 | **pierde `ops-noc`** |
| `arquitecto` | `arquitecto` | 0 | 23 | +23 | (nunca estuvo en la matriz v1) |
| `coord_operaciones` | `coord_operaciones` | 0 | 42 | +42 | (idem) |

Dos lecturas de esta tabla, y ambas son problemas:

- **Roles que se quedan cortos** (el síntoma de Adam): `director_commercial` −20,
  `senior_engineer` −12, `director_admin` −11.
- **Roles que se pasan** (riesgo de seguridad, nadie lo ha reportado porque
  nadie se queja de tener de más): un **jefe de almacén acaba con acceso a
  bancos, facturación, contabilidad y alta de usuarios** porque
  `warehouse_manager → coord_admin`. Un coordinador de mantenimiento acaba con
  `integra/settings` y `integra/audit`.

---

## 5. Déficit por rol — qué le falta a cada puesto para hacer su trabajo

El razonamiento se apoya en el organigrama documentado en
`docs/AREAS-VS-SISTEMA.md`, que nombra puesto por puesto las funciones reales.

### 5.1 `arquitecto` — Josué Cervantes · Arquitecto / Director Técnico (23 módulos)

`docs/AREAS-VS-SISTEMA.md` §4 le asigna **«Validación final de trabajos»** y lo
repite: *«Josué valida y envía a Administración y Dirección»*. El propio
documento dice que la solución es un `WorkflowDefinition` con el Arquitecto como
aprobador del paso 1.

| Le falta | Por qué |
|---|---|
| `/erp/approvals` | **Es su función principal.** El motor de aprobaciones está construido y él no puede abrir la bandeja. Bloqueado en `page-matrix.ts:53`. |
| `/integra/**` (18 módulos) | Es el **director técnico** de una empresa cuyo producto insignia es CCTV/ACS. `ROLE_EXTRA_PANELS` (`roles.ts:72`) le concede `integra` explícitamente; `PAGE_MATRIX` no. |
| `/erp/kb`, `/erp/documents` | Diseño y planeación de proyectos sin procedimientos ni planos. |
| `/erp/warehouse`, `/erp/procurement` | Planear un proyecto exige saber qué material hay y qué se puede comprar. |
| `/erp/analytics/bi` | `auth.service.ts:398` **sí** le da `bi.view` + `executive.dashboard` en la API. La web se lo niega. |
| `/crm/quotes/**` | Lo tiene alcanzable (`○`) pero oculto: cotiza proyectos técnicos. |

### 5.2 `ing_soporte` (= soporte + NOC + ingeniero senior) — 32 módulos

Cuatro puestos distintos comprimidos en uno.

| Le falta | Por qué |
|---|---|
| **`/ops/noc`** | `noc_lead` y `noc_operator` colapsan a este rol y **la consola NOC no está en `PAGE_MATRIX[ing_soporte]`** (`page-matrix.ts:200`). El operador de NOC no puede abrir el NOC. |
| **`/ops/support` y `/ops/support/sla` en el menú** | La ruta sí está permitida, pero `shouldShowModuleInSidebar` (`section-views.ts:237-240`) solo la muestra a `EXECUTIVE ∪ OPS_MANAGERS`. **La bandeja de tickets no aparece en el menú del ingeniero de soporte.** |
| `/ops/maintenance`, `/ops/assets`, `/ops/service-clients` | Un `senior_engineer` atiende mantenimientos y necesita saber qué equipo tiene instalado el cliente. |
| `/ops/gps`, `/ops/dispatch` | El `noc_lead` coordina cuadrillas. |
| `/crm/quotes/**` | El ingeniero senior cotiza la parte técnica (`access-matrix.ts` se lo daba). |

### 5.3 `ing_campo` — los 8 técnicos (15 módulos)

`docs/AREAS-VS-SISTEMA.md` §6: instalaciones, mantenimiento, evidencias, reportes
de servicio, cuidado de herramientas.

| Le falta | Por qué |
|---|---|
| **`/integra/**`** | Son los que **instalan físicamente** las cámaras y terminales. Hoy no pueden ver ni el plano ni el estado de la puerta que acaban de montar. Cero módulos INTEGRA. |
| `/erp/kb` en el menú | Los procedimientos de instalación. Bloqueado por `tier(v2) >= 50` en `section-views.ts:341` — `ing_campo` es tier 40. |
| `/ops/assets`, `/ops/service-clients` en el menú | Llegar a un sitio sin saber qué hay instalado. Alcanzables (`○`) pero invisibles. |
| `/ops/maintenance` en el menú | «Instalaciones **y mantenimiento**» es su función textual. |
| `/erp/hr/orgchart` | A quién escalar. `access-matrix.ts` lo daba a `ANY_INTERNAL`. |

### 5.4 `administrativo` — Karen Elizalde · Mónica García (14 módulos, el más pobre)

`docs/AREAS-VS-SISTEMA.md` §2 les asigna: **facturación**, **cotizaciones**,
**seguimiento a clientes**, control documental, **compras con mayorista**.

| Le falta | Por qué |
|---|---|
| **`/erp/invoicing`** | **Facturar es su función nombrada #1** y no puede abrir Facturación. |
| **`/crm/quotes/**`** | «Cotizaciones» es su función nombrada #2. |
| **`/crm/clients`** | «Seguimiento a clientes» es su función nombrada #3. |
| **`/erp/procurement`, `/erp/warehouse`** | «Compras con Mayorista» es su función nombrada #5. `shouldShowModuleInSidebar` **sí** quiere mostrarle `warehouse`; `PAGE_MATRIX[administrativo]` (`page-matrix.ts:155`) lo bloquea. |
| `/erp/accounting`, `/erp/exports` | Apoyo administrativo a contabilidad. |
| `/erp/kb` | tier 45 < 50. |

Este es el caso más flagrante: el rol que hace facturación no puede abrir
facturación.

### 5.5 `coord_operaciones` (= PM + coordinador + mantenimiento) — 42 módulos

`docs/AREAS-VS-SISTEMA.md` §3: planificación de servicios, seguimiento de
proyectos, asignación de personal, **control de materiales**.

| Le falta | Por qué |
|---|---|
| **`/erp/warehouse`** | «Control de materiales» es su función nombrada. El doc dice que ya existe `StockMovement.activityId`, y el coordinador no puede ver el almacén. |
| `/erp/approvals` | Es el paso 1 de las cadenas `evidencias`, `vehicles` y `multas` en `apps/api/src/common/rbac/approval-policy.ts:33-78`. **La API le pide aprobar; la web no le deja abrir la bandeja.** |
| `/erp/dashboard`, `/erp/analytics/bi` | Seguimiento de proyectos sin tablero. La API le da `bi.view` (`auth.service.ts:398`). |
| `/crm/projects/**` | El *handoff* de venta a OT. Solo tiene `/crm/quotes` exacto. |
| `/erp/kb`, `/erp/documents`, `/erp/orgchart` | Procedimientos y asignación de personal. |
| `/erp/finance/viatics` | Autoriza viáticos de su cuadrilla. |

### 5.6 `coord_ventas` (= director comercial + gerente de ventas) — 22 módulos

| Le falta | Por qué |
|---|---|
| **`/studio/leads` y `/studio/contacts`** | `section-views.ts:373` **quiere** mostrárselos (está en `SALES_MANAGERS`); `PAGE_MATRIX[coord_ventas]` (`page-matrix.ts:228`) no tiene `/studio/**`. **Los leads que entran por marketing no llegan a ventas.** |
| `/erp/executive`, `/erp/analytics/bi` | Un **director comercial** sin tablero ejecutivo. La API le da `bi.view` + `executive.dashboard`. |
| `/erp/approvals` | Es el paso 1 de la cadena `cotizaciones` (`approval-policy.ts`, umbral $50 000). Misma contradicción que arriba. |
| `/erp/calendar`, `/erp/kb`, `/erp/hr/orgchart` | Módulos declarados `ANY_INTERNAL` que no le llegan. |
| `/erp/exports` | Reportes comerciales a dirección. |

### 5.7 `vendedor` — 15 módulos

| Le falta | Por qué |
|---|---|
| **`/crm/opportunities` en el menú** | **Su objeto de trabajo central.** La ruta está permitida (`/crm/**`) pero `section-views.ts:318` solo lo muestra a `EXECUTIVE ∪ SALES_MANAGERS ∪ coord_admin`. Un vendedor **no ve «Oportunidades» en su menú**. |
| `/crm/targets` en el menú | Su propia cuota. Oculto por `SALES_MANAGERS`. |
| `/crm/reports` en el menú | Su propio desempeño. |
| `/erp/calendar` | Falta en `PAGE_MATRIX[vendedor]` (`page-matrix.ts:240`) — un vendedor sin agenda. |
| `/studio/leads` | De dónde vienen sus prospectos. |

### 5.8 `rh` — 15 módulos

| Le falta | Por qué |
|---|---|
| **`/erp/users`** | RH da de alta a la gente; el alta de usuario y rol vive en `/erp/users`. |
| `/erp/approvals` | Aprobaciones de vacaciones. Nótese que la API tampoco le da `hr.approve.leave`: ese permiso va al bucket `ceo/dir_admin/coord_admin` (`auth.service.ts:406`), mientras que `rh` solo recibe `hr.view/manage` (`:414`). Incoherencia de diseño en las dos capas. |
| `/erp/kb`, `/erp/news` | Procedimientos y comunicados internos — RH es quien los publica. |

### 5.9 `contabilidad` — 16 módulos

| Le falta | Por qué |
|---|---|
| **`/crm/quotes/:id`** | `page-matrix.ts:294` lista `'/crm/quotes'` **sin `/**`**. Puede ver la lista y **no puede abrir una cotización**. Bug de una línea. |
| `/erp/approvals` | Aprueba compras y viáticos según `approval-policy.ts`. |
| `/erp/hr/attendance` | `section-views.ts:251` dice mostrarlo a todo el mundo salvo `cliente`; `PAGE_MATRIX[contabilidad]` no incluye `SELF_ATTENDANCE_PATHS`. **Contabilidad no puede checar su propia asistencia.** |

### 5.10 `disenador` / `lider_diseno` — Daniela Galindo (19 / 20 módulos)

| Le falta | Por qué |
|---|---|
| `/erp/documents` | Manuales de marca y contratos de proveedores creativos. Excluido explícitamente por `!DESIGN_TEAM.has(v2)` en `section-views.ts:347`. |
| `/erp/kb` | Idem, `section-views.ts:341`. |
| `/erp/calendar` en `lider_diseno` | Sí lo tiene; el diseñador también. Correcto. |
| `/crm/templates` en `disenador` | Es quien **hace** las plantillas comerciales; solo el líder las ve. |

### 5.11 Módulos «universales» que no lo son

`access-matrix.ts` declara `kb`, `orgchart`, `calendar`, `notifications-center`,
`my-profile`, `chat`, `reuniones`, `dashboard`, `integra-notifications` e
`integra-my-profile` como `ANY_INTERNAL` (`access-matrix.ts:280`, 19 roles).
Realidad:

| Módulo | Intención | Roles que lo ven de verdad |
|---|--:|--:|
| `/erp/kb` | 19 | **3** (ceo, dir_admin, ing_soporte) |
| `/erp/hr/orgchart` | 19 | **3** (ceo, dir_admin, rh) |
| `/erp/calendar` | 19 | 13 (faltan coord_ventas, vendedor) |
| `/erp/dashboard` | 19 | 7 |
| `/integra/notifications-center` | 19 | **4** |
| `/integra/my-profile` | 19 | **4** |

---

## 6. Módulos huérfanos

**Estrictamente huérfanos** (`allowedRoles` = solo `ceo`, y ningún rol v2 salvo
`ceo`/`super_admin` los alcanza) — los 5 del panel LAB:

| Módulo | Ruta | `allowedRoles` |
|---|---|---|
| `lab-home` | `/lab` | `[ceo]` |
| `lab-chat` | `/lab/chat` | `[ceo]` |
| `lab-ai` | `/lab/ai` | `[ceo]` |
| `lab-flags` | `/lab/flags` | `[ceo]` |
| `lab-health` | `/lab/health` | `[ceo]` |

Discutible si es un error: LAB es sandbox técnico. Pero `getHomePanel`
(`access-matrix.ts`) manda al *developer super-admin* a `/lab`, y ese usuario
—`developer@nexara.com.mx`, sembrado con `roleKey: 'ceo'` según
`seed-demo-users.ts`— sí llega. Nadie más, ni siquiera `arquitecto`, el director
técnico.

**Huérfanos de menú** (alcanzables por alguien, pero invisibles para todos salvo
CEO/super-admin):

| Módulo | Ruta | Motivo |
|---|---|---|
| `ops-evidences` | `/ops/evidences` | `section-views.ts:215-218` devuelve `false` **incondicionalmente** — «integrado en Actividades como pestaña» |
| `ops-my-evidences` | `/ops/my-evidences` | idem |
| `ops-maintenance-contracts` | `/ops/maintenance/contracts` | `section-views.ts:241-243` devuelve `false` incondicionalmente |

Los tres siguen registrados en `MODULES` con `visible: false`, lo que es
coherente. No son bugs, pero sí ruido: son módulos que la matriz sigue
declarando y que ninguna ruta de UI enlaza.

**Rutas sin módulo** (existen en disco y `MODULES` no las conoce):

`/crm/notifications-center`, `/ops/notifications-center`,
`/studio/notifications-center` — el módulo `notifications-center` solo está
registrado en ERP (más `integra-notifications`). En la vía v1 hay un *fallback*
para `/my-profile` y `/chat` (`access-matrix.ts:1088-1091`) pero **no para
`notifications-center`**. En la vía v2 tampoco: son 3 páginas que solo abre quien
tenga `/crm/**`, `/ops/**` o `/studio/**` completo.

**Sobre-permiso por prefijo:** `integra-home` tiene `path: "/"`, así que
`getModuleUrl` devuelve `/integra` y `canAccessUrl` hace
`normalized.startsWith("/integra/")` (`access-matrix.ts:1082`). En la vía v1,
**cualquiera que pueda ver `integra-home` puede abrir `/integra/settings`**, que
está restringido a `[ceo, director_ops, director_admin]`. Lo mismo con `/lab`.

---

## 7. Divergencias web ↔ API

| Artefacto | API | Web | Divergencia |
|---|---|---|---|
| Catálogo de roles v2 | `apps/api/src/common/rbac/roles.v2.ts:20-38` (17) | `apps/web/lib/rbac/roles.ts:6-24` (17) | **Valores idénticos, pero duplicados a mano.** La cabecera del archivo web dice «Espejo de …»; no hay import ni test de paridad de las claves. |
| Catálogo de roles v1 | `apps/api/src/common/org-roles.ts` (**19**) | `apps/web/lib/org-roles.ts:7-29` (**21**) | **La web tiene `arquitecto` y `coord_operaciones`; la API no.** Un rol creado por la UI nunca puede obtener `orgRoleKey = 'arquitecto'` porque `role-template.ts` fuerza una de las 19 plantillas de la API. |
| Catálogo de permisos | `apps/api/src/common/permissions.ts` (**113**) | `apps/web/lib/permissions.ts` (**111**) | **Faltan en la web `studio.content.view` y `studio.content.manage`.** La web no puede razonar sobre el permiso que la API exige a Studio (18 usos de `STUDIO_CONTENT_MANAGE` en controladores). |
| Matriz de rutas | `url-matrix.ts:91` — `{path, methods, scope}` por rol, *first-match-wins* | `page-matrix.ts:38` — `string[]` de globs, *some()* | **Estructuras distintas, contenidos distintos, ningún test de paridad.** Ambas se autoproclaman fuente única. |
| Matriz de módulos | — | `access-matrix.ts:325` | Solo existe en web y está desconectada. |
| Paneles por rol | `roles.v2.ts:89` `ROLE_EXTRA_PANELS` | `roles.ts:72` `ROLE_EXTRA_PANELS` | Idénticos y **con test de paridad** (`role-extra-panels.parity.spec.ts`). Pero en la web **no lo consume nadie**: 0 importadores fuera del propio spec. Declara que `arquitecto` tiene `integra` y `sales`, y `PAGE_MATRIX` se lo niega. |

### Permisos que la web comprueba y la API no

Ninguno en sentido estricto: la web solo verifica rutas (`canOpenPage`), no
permisos, en la ruta de sidebar. Los 111 permisos de `apps/web/lib/permissions.ts`
se usan para habilitar botones, no para el menú. Pero la web **niega rutas que la
API concede por permiso**:

| Caso | API concede | Web niega |
|---|---|---|
| `arquitecto` → BI/ejecutivo | `bi.view`, `bi.manage`, `executive.dashboard` (`auth.service.ts:398`) | `/erp/analytics/bi` y `/erp/executive` fuera de `PAGE_MATRIX[arquitecto]` |
| `coord_operaciones` → BI | idem | idem |
| `coord_ventas` → BI | idem | idem |
| `coord_admin` → BI | idem | idem |
| `arquitecto` → gobierno | **`console.admin`** + `workflow.manage` (`auth.service.ts:496`) | no puede abrir `/erp/approvals` ni `/erp/users` |
| `dir_operaciones` → gobierno | **`console.admin`** | no puede abrir `/erp/users`, `/erp/settings`, `/erp/audit` |
| `arquitecto` / `coord_operaciones` → CRM | `sales.view`, `panel.ventas` (`auth.service.ts:622`) | solo `/crm/quotes` (exacto) y `/crm/projects/**` |
| `administrativo` → documentos | `documents.view`, `documents.manage` (`auth.service.ts:543`) | ✓ coincide |
| `ing_soporte` → soporte | `support.view` | `/ops/support` permitido pero **oculto** en el menú |

### Divergencia estructural en las cadenas de aprobación

`apps/api/src/common/rbac/approval-policy.ts:33-78` define quién aprueba qué. Los
roles que la API nombra como aprobadores **paso 1** son
`administrativo` (viáticos), `coord_operaciones` (evidencias, vehículos, multas)
y `coord_ventas` (cotizaciones). De los tres, **`coord_operaciones` y
`coord_ventas` no pueden abrir `/erp/approvals`** en la web: no está en sus
bloques de `PAGE_MATRIX` (`page-matrix.ts:173` y `:228`). Cuatro de las seis
cadenas de aprobación están rotas del lado del menú. Añádase `arquitecto`, que
es el paso 2 de la cadena `vehicles` y tampoco puede abrir la bandeja.

### Riesgo de datos que agrava todo esto

`apps/api/src/users/users.service.ts:1041-1042` borra `roleKey` de todo update
con el comentario «solo se cambia desde el endpoint dedicado
`PATCH /users/:id/role-key`». **Ese endpoint no existe.** Ningún controlador lo
declara. Por tanto **todo usuario creado desde la UI tiene `roleKey = NULL`** y su
rol v2 se deriva de `Role.orgRoleKey` vía `ORG_TO_V2` — exactamente el camino con
pérdida descrito en §4. La matriz «buena» (`roleKey` explícito) solo la tienen los
usuarios sembrados.

Además, la migración `20260620120000_seed_nexara_team/migration.sql:61-68` inserta
**claves v2 dentro de la columna `orgRoleKey`**, así que esa columna contiene una
mezcla de vocabularios v1 y v2 en producción.

---

## 8. Causa raíz estructural

**La matriz está hecha con lista blanca explícita por rol, en tres capas
independientes, y ninguna de las tres tiene un valor por defecto para un módulo
nuevo.** Concretamente:

**`apps/web/lib/access-matrix.ts:265-266`**

```ts
  /** Roles que pueden ver/usar este módulo (whitelist explícita). */
  allowedRoles: OrgRoleKey[];
```

Cada uno de los 103 módulos enumera a mano sus roles. Un módulo nuevo empieza con
la lista que quien lo escribió recordó en ese momento — típicamente
`[R.CEO, R.DIRECTOR_ADMIN]`. **Nunca hay un criterio; hay 103 decisiones
independientes.** Por eso `kb` y `orgchart` acabaron en `ANY_INTERNAL` (19 roles)
y `ops-noc` en 5.

**`apps/web/lib/user-access.ts:112`**

```ts
  const v2 = resolveV2RoleKey(user);
  if (v2) return true;
```

Esta línea desactiva la matriz anterior para todo usuario real. Es la causa de
que editar `access-matrix.ts` no cambie nada visible — y muy probablemente la
razón por la que el problema persiste pese a haberse tocado.

**`apps/web/lib/rbac/page-matrix.ts:38`**

```ts
export const PAGE_MATRIX: Record<RoleKey, PageRule[]> = {
```

y su doc de cabecera, línea 22: *«Whitelist de páginas (no endpoints) por rol.
Cualquier ruta NO listada está bloqueada.»* Deny-by-default sobre una lista
escrita a mano y desconectada de `MODULES`. **Un módulo nuevo no aparece aquí, y
por tanto está bloqueado para los 15 roles que no tienen un comodín `/panel/**`.**
Los únicos roles con comodín completo son `super_admin` (`/**`), `ceo` (los 6
paneles), y parcialmente `dir_admin` (`/erp/**`), `arquitecto`/`coord_operaciones`/
`ing_campo` (`/ops/**`), `coord_ventas`/`vendedor` (`/crm/**`) y
`lider_diseno`/`disenador` (`/studio/**`).

**`apps/web/lib/section-views.ts:200`**

Un `switch` de ~40 casos con conjuntos de roles propios que vuelve a filtrar. Un
módulo nuevo cae en `default: return module.visible !== false` (línea 380-381) —
sobrevive esta capa, pero ya lo mató `PAGE_MATRIX`.

### El resultado exacto

> **Un módulo nuevo aparece por defecto para: `super_admin`, `ceo`, y el rol o
> roles cuyo comodín de panel lo cubra. Para todos los demás nace invisible y
> hay que acordarse de añadirlo a mano en dos archivos distintos.**

Eso explica el síntoma con precisión: el rol de más alto rango tiene comodín y lo
ve todo automáticamente; los demás acumulan un déficit que crece con cada módulo
que se agrega y que nadie recuerda propagar.

---

## 9. Propuesta

### 9.1 Principio

Sustituir las tres listas blancas por **una matriz por capacidad**, derivada, con
default explícito. Un módulo declara *qué capacidad requiere*; un rol declara
*qué capacidades tiene*. Nadie enumera módulos por rol nunca más.

```ts
// access-matrix.ts — el módulo declara capacidad, no roles
type ModuleEntry = {
  …
  capability: Capability;      // ← sustituye allowedRoles
  selfScope?: Capability;      // variante "mis X" vs "todas las X"
};

// capabilities.ts — el rol declara capacidades
export const ROLE_CAPABILITIES: Record<RoleKey, Capability[]> = { … };

// derivado, no escrito a mano:
export const PAGE_MATRIX = buildPageMatrix(MODULES, ROLE_CAPABILITIES);
```

Con eso `page-matrix.ts` y el `switch` de `section-views.ts` desaparecen como
fuentes de verdad y pasan a ser funciones puras sobre la misma tabla. `url-matrix.ts`
del API se genera del mismo artefacto compartido (o se valida contra él con un
test de paridad, como ya se hace con `ROLE_EXTRA_PANELS`).

### 9.2 Catálogo de capacidades propuesto (21)

| Capacidad | Módulos que cubre |
|---|---|
| `common.self` | `my-profile`, `calendar`, `chat`, `reuniones`, `notifications-center`, `attendance`, `lunch-breaks`, `dashboard` (+ los homólogos por panel) |
| `common.org` | `kb`, `orgchart`, `documents`, `news` |
| `erp.exec` | `executive`, `bi`, `architecture` |
| `erp.approve` | `approvals` |
| `erp.gov` | `users`, `companies`, `settings`, `audit` |
| `erp.finance.read` | `accounting`, `invoicing`, `banking`, `exports` |
| `erp.finance.write` | idem con escritura + `employee-payments` |
| `erp.expenses` | `viatics-admin`, `expenses-admin` |
| `erp.hr` | `hr`, `fines`, `kpis-hr` |
| `erp.logistics` | `warehouse`, `procurement` |
| `erp.facilities` | `facilities-access` |
| `crm.pipeline` | `crm-dashboard`, `crm-leads`, `crm-opportunities`, `crm-pipeline`, `crm-agenda`, `crm-clients`, `crm-chat` |
| `crm.catalog` | `crm-products`, `crm-quotes`, `crm-templates` |
| `crm.lead` | `crm-team`, `crm-targets`, `crm-reports`, `crm-tenders`, `crm-projects` |
| `ops.self` | `ops-my-activities`, `ops-my-viatics`, `ops-my-vehicles`, `ops-my-evidences`, `ops-dashboard`, `ops-chat`, `ops-tools` |
| `ops.field` | `ops-activities` (lectura), `ops-service-clients`, `ops-assets`, `ops-maintenance` |
| `ops.supervise` | `ops-dispatch`, `ops-gps`, `ops-projects`, `ops-viatics`, `ops-vehicles`, `ops-evidences`, `ops-maintenance-contracts` |
| `ops.support` | `ops-support-inbox`, `ops-support-sla`, `ops-cvs` |
| `ops.noc` | `ops-noc` |
| `studio.content` | los 10 módulos de STUDIO |
| `integra.monitor` | `integra-home`, `video`, `detection`, `events`, `alarms`, `map` |
| `integra.acs` | `access`, `people`, `schedules`, `espacios`, `visitors`, `attendance`, `vehicles`, `anpr` |
| `integra.admin` | `integra-settings`, `integra-audit` |
| `lab` | los 5 módulos de LAB |

**Regla de oro:** `common.self` y `common.org` se conceden a **todo rol interno
por defecto**. Son los que hoy están declarados `ANY_INTERNAL` y llegan a 3 roles.

### 9.3 Matriz propuesta rol × capacidad

`●` concedido · `○` solo lectura · `·` denegado

| Capacidad | SA | CEO | ARQ | DOP | DAD | CAD | ADM | COP | ICA | ISO | CVE | VEN | LDI | DIS | RH | CON | CLI |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `common.self` |●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|·|
| `common.org` |●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|●|·|
| `erp.exec` |●|●|●|●|●|○|·|○|·|·|●|·|·|·|·|○|·|
| `erp.approve` |●|●|●|●|●|●|●|●|·|·|●|·|●|·|●|●|·|
| `erp.gov` |●|●|○|○|●|○|·|·|·|·|·|·|·|·|○|·|·|
| `erp.finance.read` |●|●|·|○|●|●|●|·|·|·|○|·|·|·|○|●|·|
| `erp.finance.write` |●|●|·|·|●|●|·|·|·|·|·|·|·|·|·|●|·|
| `erp.expenses` |●|●|○|●|●|●|●|●|·|·|·|·|·|·|●|●|·|
| `erp.hr` |●|●|·|○|●|●|·|·|·|·|·|·|·|·|●|·|·|
| `erp.logistics` |●|●|●|●|●|●|●|●|○|○|·|·|·|·|·|○|·|
| `erp.facilities` |●|●|●|●|●|○|○|●|·|○|·|·|·|·|·|·|·|
| `crm.pipeline` |●|●|○|○|●|●|●|·|·|·|●|●|·|·|·|○|·|
| `crm.catalog` |●|●|●|●|●|●|●|●|·|●|●|●|●|●|·|●|·|
| `crm.lead` |●|●|○|○|●|●|·|○|·|·|●|○|●|·|·|○|·|
| `ops.self` |·|·|·|·|·|·|●|●|●|●|·|·|·|·|·|·|·|
| `ops.field` |●|●|●|●|○|○|·|●|●|●|·|·|·|·|·|·|·|
| `ops.supervise` |●|●|●|●|○|○|·|●|○|○|·|·|·|·|·|·|·|
| `ops.support` |●|●|●|●|·|·|·|●|○|●|·|·|·|·|●|·|·|
| `ops.noc` |●|●|●|●|·|·|·|●|○|**●**|·|·|·|·|·|·|·|
| `studio.content` |●|●|·|·|○|·|·|·|·|·|**●**|○|●|●|·|·|·|
| `integra.monitor` |●|●|**●**|●|○|·|·|●|**●**|●|·|·|·|·|·|·|○|
| `integra.acs` |●|●|**●**|●|·|·|·|●|**●**|●|·|·|·|·|○|·|○|
| `integra.admin` |●|●|**●**|●|·|·|·|○|·|●|·|·|·|·|·|·|·|
| `lab` |●|●|**●**|·|·|·|·|·|·|·|·|·|·|·|·|·|·|

En **negrita** los cambios que resuelven un déficit nombrado en §5.

### 9.4 Conteo resultante

| Rol | Hoy | Propuesto | Δ |
|---|--:|--:|--:|
| `super_admin` | 66 | 103 | +37 |
| `ceo` | 95 | 103 | +8 |
| `arquitecto` | 23 | ~72 | **+49** |
| `dir_operaciones` | 52 | ~78 | +26 |
| `dir_admin` | 42 | ~70 | +28 |
| `coord_admin` | 32 | ~52 | +20 |
| `administrativo` | 14 | ~40 | **+26** |
| `coord_operaciones` | 42 | ~66 | +24 |
| `ing_campo` | 15 | ~40 | **+25** |
| `ing_soporte` | 32 | ~50 | +18 |
| `coord_ventas` | 22 | ~48 | **+26** |
| `vendedor` | 15 | ~28 | +13 |
| `lider_diseno` | 20 | ~30 | +10 |
| `disenador` | 19 | ~27 | +8 |
| `rh` | 15 | ~30 | +15 |
| `contabilidad` | 16 | ~34 | +18 |
| `cliente` | 12 | 12 | 0 |

### 9.5 Arreglos puntuales que no esperan al refactor

Ordenados por coste/beneficio. Todos son de una a tres líneas.

| # | Archivo:línea | Cambio |
|---|---|---|
| 1 | `page-matrix.ts:294` | `'/crm/quotes'` → `'/crm/quotes/**'` — contabilidad no puede abrir una cotización |
| 2 | `page-matrix.ts:173` | `'/crm/quotes'` → `'/crm/quotes/**'` en `COORD_OPERACIONES` — mismo bug |
| 3 | `page-matrix.ts:200` | añadir `'/ops/noc'`, `'/ops/gps'`, `'/ops/maintenance/**'`, `'/ops/assets'`, `'/ops/service-clients'` a `ING_SOPORTE` — NOC y soporte |
| 4 | `section-views.ts:237-240` | añadir `SUPPORT` a `ops-support-inbox` / `ops-support-sla`; añadir `SUPPORT` a `ops-noc` |
| 5 | `section-views.ts:318` | añadir `SALES_REP` a `crm-opportunities` — el vendedor debe ver Oportunidades |
| 6 | `page-matrix.ts:53` | añadir `'/erp/approvals'` y `'/integra/**'` a `ARQUITECTO` |
| 7 | `page-matrix.ts:155` | añadir `'/erp/invoicing'`, `'/erp/warehouse'`, `'/erp/procurement'`, `'/crm/quotes/**'`, `'/crm/clients/**'` a `ADMINISTRATIVO` |
| 8 | `page-matrix.ts:173` | añadir `'/erp/approvals'`, `'/erp/warehouse'`, `'/erp/dashboard'` a `COORD_OPERACIONES` |
| 9 | `page-matrix.ts:228` | añadir `'/studio/leads'`, `'/studio/contacts'`, `'/erp/calendar'`, `'/erp/approvals'`, `'/erp/executive'` a `COORD_VENTAS` |
| 10 | `page-matrix.ts:240` | añadir `'/erp/calendar'` a `VENDEDOR` |
| 11 | `page-matrix.ts:187` | añadir `'/integra/**'` (lectura) y `'/erp/kb'` a `ING_CAMPO` |
| 12 | `page-matrix.ts:294` | añadir `...SELF_ATTENDANCE_PATHS` a `CONTABILIDAD` — hoy no puede checar |
| 13 | `section-views.ts:341,347` | bajar el umbral `tier >= 50` a `>= 40` para `kb`; quitar la exclusión de `DESIGN_TEAM` en `documents` |
| 14 | `section-views.ts:36-41` | añadir `ROLES.SUPER_ADMIN` a `ERP_EXECUTIVE`, `ERP_ADMIN`, `FINANCE_ROLES`, `SALES_MANAGERS`, `WAREHOUSE_ROLES` — el super-admin ve menos que el CEO |
| 15 | `page-matrix.ts` (global) | añadir `'/:panel/notifications-center'` como regla común, igual que `SELF_ATTENDANCE_PATHS` |
| 16 | `apps/web/lib/permissions.ts` | añadir `studio.content.view` y `studio.content.manage` (paridad con la API) |
| 17 | `apps/api/src/common/org-roles.ts` | añadir `arquitecto` y `coord_operaciones` a `ORG_ROLE_KEYS` + plantillas, o quitarlos de la web |
| 18 | `apps/api/src/users/users.controller.ts` | implementar el `PATCH /users/:id/role-key` que `users.service.ts:1041` da por existente — sin él ningún usuario nuevo tiene rol v2 |

Los puntos 1-5 son los que más se notarían mañana por la mañana con el menor
riesgo.

### 9.6 Salvaguarda para que no vuelva a pasar

Un test que recorra los 103 módulos y falle si alguno no es alcanzable por al
menos un rol distinto de `super_admin`/`ceo`, y otro que falle si
`shouldShowModuleInSidebar` devuelve `true` para un par (rol, módulo) que
`canOpenPage` niega. Hoy hay **338 pares** en esa contradicción (323 si se
excluye `cliente`, cuyos 15 casos son en su mayoría intencionados). Los scripts
`apps/web/scripts/audit-rbac.mjs` y `audit-rbac-matrix.mjs` ya existen y parecen
pensados para esto; no están en CI.

---

## Resumen

1. **Causa raíz:** la matriz es lista blanca explícita por rol, repartida en tres
   capas independientes, sin valor por defecto. `access-matrix.ts:265` enumera
   roles módulo a módulo; `user-access.ts:112` (`if (v2) return true;`) desactiva
   esa matriz para todo usuario real; `page-matrix.ts:38` la sustituye por otra
   lista blanca escrita a mano y desconectada de `MODULES`; y
   `section-views.ts:200` vuelve a filtrar con conjuntos de roles propios.
2. **Un módulo nuevo nace invisible para todos** salvo `super_admin`, `ceo` y
   quien tenga comodín de panel. El déficit crece con cada módulo añadido.
3. **Roles:** 21 organizacionales (`org-roles.ts:7`) que se colapsan a 14 antes
   de consultar la matriz (`role-mapping.ts:72`), sobre un catálogo v2 de 17
   (`rbac/roles.ts:6`). `arquitecto` y `coord_operaciones` no aparecen en ningún
   `allowedRoles` de la matriz v1.
4. **Módulos:** 103 registrados (ERP 33 · CRM 15 · OPS 22 · STUDIO 10 · LAB 5 ·
   INTEGRA 18). Todos tienen página; el problema es solo de autorización.
5. **Déficit en números** (módulos en el menú, sobre 103): CEO 95 · DOP 52 ·
   DAD 42 · COP 42 · CAD 32 · ISO 32 · ARQ 23 · CVE 22 · LDI 20 · DIS 19 ·
   CON 16 · RH 15 · VEN 15 · ICA 15 · **ADM 14** · CLI 12. Mediana 22. El
   `super_admin` real ve 66 — menos que el CEO.
6. **Casos que más duelen:** el rol `administrativo` (facturación es su función
   nombrada) no puede abrir `/erp/invoicing`; el `ing_soporte` —donde caen NOC
   lead y NOC operator— no puede abrir `/ops/noc` y tiene la bandeja de soporte
   oculta; el `vendedor` no ve «Oportunidades» en su menú; el `arquitecto`
   —cuya función documentada es «validación final de trabajos»— no puede abrir
   `/erp/approvals` ni ningún módulo de INTEGRA.
7. **Sobre-permiso simétrico:** `warehouse_manager` y `procurement_officer`
   colapsan a `coord_admin` y acaban con bancos, facturación, contabilidad y alta
   de usuarios. `maintenance_coordinator` acaba con `integra/settings`.
8. **Divergencias web↔API:** 21 roles v1 en web vs 19 en API; 111 permisos en web
   vs 113 en API (faltan los dos de Studio); tres matrices de rutas
   (`access-matrix.ts`, `page-matrix.ts`, `url-matrix.ts`) que se autoproclaman
   fuente única y no se importan entre sí; y roles a los que la API concede
   `console.admin` o `bi.view` y la web bloquea la página correspondiente.
9. **Riesgo de datos:** `users.service.ts:1041` borra `roleKey` y delega en un
   endpoint `PATCH /users/:id/role-key` **que no existe**; todo usuario creado
   desde la UI queda sin rol v2 y se resuelve por el camino con pérdida.
10. **Huérfanos:** los 5 módulos de LAB (solo `ceo`); `ops-evidences`,
    `ops-my-evidences` y `ops-maintenance-contracts` ocultos incondicionalmente;
    y 3 páginas `notifications-center` (CRM, OPS, STUDIO) sin módulo registrado.
11. **338 pares (rol, módulo)** en contradicción: `section-views.ts` quiere
    mostrarlos y `page-matrix.ts` los bloquea. `coord_admin` 33, `dir_admin` 32,
    `coord_ventas` 30, `rh` 30, `contabilidad` 27, `arquitecto` 26,
    `administrativo` 26.
12. **La propuesta en una frase:** sustituir las tres listas blancas por **una
    matriz rol × capacidad** (21 capacidades, §9.2-9.3) de la que se *deriven*
    `PAGE_MATRIX` y el filtro de sidebar, con `common.self` y `common.org`
    concedidas por defecto a todo rol interno — lo que sube la mediana de 22 a
    ~45 módulos y hace que un módulo nuevo aparezca solo donde le corresponde.

---

# Remediación 2026-09-06 (post-Cursor)

Turno de remediación posterior al de Cursor que introdujo `GET /me/navigation`.
**Todo lo de arriba se reverificó contra el disco antes de tocar nada**; donde el
informe y el código no coincidían, gana el código y así se anota.

## 1. Qué del informe ya no era cierto

Cursor arregló tres de los cuatro «casos que más duelen» del §6:

| Caso del §6 | Estado real al empezar este turno |
|---|---|
| `administrativo` no puede abrir `/erp/invoicing` | **Parcial.** `page-matrix.ts` ya tenía `/erp/invoicing`, pero **sin comodín**: abría el listado y ninguna factura (`/erp/invoicing/:id` bloqueado). |
| `ing_soporte` no tiene `/ops/noc` | **Corregido.** `/ops/noc` y `/ops/noc/**` presentes; NOC, bandeja y SLA visibles. |
| `vendedor` no ve «Oportunidades» | **Corregido.** `section-views.ts` ya incluye `SALES_REP` en `crm-opportunities`. |
| `arquitecto` no puede abrir `/erp/approvals` | **Parcial.** `/erp/approvals` presente, pero **los 18 módulos de INTEGRA seguían invisibles**, ahora por la capa nueva. |

Y una corrección al propio informe: **el glob `/crm/quotes/**` no estaba mal
escrito.** `compilePattern()` traduce `/**` a `(/.*)?`, así que `/crm/quotes/**`
sí cubre `/crm/quotes`. Los globs rotos eran los **contrarios** — paths desnudos
sobre rutas que sí tienen detalle dinámico (`/erp/invoicing`, `/erp/warehouse`,
`/erp/procurement`, `/crm/quotes`, `/crm/tenders`): el módulo aparecía en el
menú, el listado abría y el primer clic en una fila daba en muro.

## 2. El mapa real de decisión: tres filtros en cascada

El menú se decide en tres capas que se **intersectan**, así que el resultado es
siempre la más restrictiva:

| # | Capa | Archivo | Qué niega |
|---|---|---|---|
| 1 | `PAGE_MATRIX` | `apps/web/lib/rbac/page-matrix.ts:38` | Whitelist de páginas. Deniega por defecto. |
| 2 | `shouldShowModuleInSidebar` | `apps/web/lib/section-views.ts:200` | Qué se pinta en el menú, por conjuntos de rol. |
| 3 | `URL_MATRIX` → `/me/navigation` | `apps/api/src/common/rbac/url-matrix.ts:92` | Clip del servidor sobre lo ya filtrado (`AppShell.tsx:311-322`). |

`user-access.ts:111-112` (`if (v2) return true`) **no era la causa**: salta
`module.allowedRoles` y por tanto amplía, no reduce. Confirmado midiendo.

**La capa 3 era el agujero nuevo y el más grave**, porque `deriveModuleKeysFromPaths`
deriva los módulos de los *paths* de `url-matrix`, y `url-matrix` era más estrecha
que `PAGE_MATRIX` en 9 de los 17 roles.

### El caso extremo: el super admin veía 1 módulo

`filterModulesByNavigation` (`me-navigation.ts:75`) reducía cada regla a su base
con `rule.replace(/\/\*\*$/, "")`. Para `/**` —la única regla del `super_admin`—
eso da cadena vacía, y la línea siguiente (`if (!base) return false`) negaba
**todo**. Sobrevivía solo `my-profile`, que venía de la semilla de
`deriveModuleKeysFromPaths`. El comodín que significa «acceso total» significaba
«acceso a nada».

Se sumaba un segundo fallo independiente: los conjuntos de rol de
`section-views.ts` (`ERP_EXECUTIVE`, `ERP_ADMIN`, `FINANCE_ROLES`,
`WAREHOUSE_ROLES`, `SALES_MANAGERS`) **no incluían `SUPER_ADMIN`**, y le negaban
otros 37 módulos en la capa 2.

Adam no lo notó porque «el usuario de más alto rango» es el dueño de la
plataforma (`gerencia@`), que `resolveV2RoleKey` resuelve a **`ceo`**, no a
`super_admin` — y `ceo` estaba sano (95 módulos).

## 3. Antes / después, módulos visibles sobre 103

Medido ejecutando las tres capas reales, no simulándolas.

| Rol | Antes | Después | Δ |
|---|---:|---:|---:|
| `super_admin` | **1** | **95** | +94 |
| `ceo` | 95 | 95 | 0 |
| `dir_operaciones` | 52 | 63 | +11 |
| `dir_admin` | 36 | 49 | +13 |
| `arquitecto` | 24 | 47 | +23 |
| `coord_operaciones` | 42 | 46 | +4 |
| `coord_admin` | 29 | 38 | +9 |
| `ing_soporte` | 33 | 36 | +3 |
| `coord_ventas` | 22 | 29 | +7 |
| `administrativo` | 19 | 23 | +4 |
| `contabilidad` | 16 | 20 | +4 |
| `lider_diseno` | 15 | 20 | +5 |
| `disenador` | 16 | 19 | +3 |
| `rh` | 15 | 18 | +3 |
| `vendedor` | 16 | 17 | +1 |
| `ing_campo` | 13 | 15 | +2 |
| `cliente` | 12 | 12 | 0 |

**Mediana: 19 → 29.** Y, lo más importante: **`denyL3 = 0` en los 17 roles** —
ninguna concesión de la web la recorta ya el servidor.

## 4. Criterio usado para ampliar

No se repartió permiso a bulto. Cada módulo añadido cumple **una** de estas dos
reglas, ambas auditables:

1. **`section-views.ts` ya nombraba explícitamente al rol** para ese módulo y
   `PAGE_MATRIX` lo contradecía. La intención ya estaba escrita en el código; lo
   que faltaba era dejar entrar. (No cuenta el `default:` del `switch`, donde la
   capa 2 no tiene opinión — por eso no se tocó ningún `*-chat`, `facilities-access`
   ni `integra-*` de roles que no tienen ese panel.)
2. **Función documentada en `docs/AREAS-VS-SISTEMA.md`** para ese puesto.

### Cambios por archivo

**`apps/web/lib/me-navigation.ts`** — el comodín raíz (`/**`, `/*`, `/`) se trata
como acceso total en vez de colapsar a base vacía.

**`apps/web/lib/section-views.ts`**
- `SUPER_ADMIN` entra en `ERP_EXECUTIVE`, `ERP_ADMIN`, `FINANCE_ROLES`,
  `WAREHOUSE_ROLES` y `SALES_MANAGERS`. Los pares personales de OPS siguen
  ocultos vía `EXECUTIVE`.
- `arquitecto` y `dir_operaciones` ven `crm-quotes` y `crm-projects`: `url-matrix`
  ya les daba scope `approve` sobre cotizaciones y `PAGE_MATRIX` la ruta, pero el
  menú se las escondía.
- `dir_operaciones` ve además `crm-dashboard`, `crm-pipeline`, `crm-tenders` y
  `crm-reports` — todas rutas que `PAGE_MATRIX` ya le concedía.

**`apps/web/lib/rbac/page-matrix.ts`**

| Rol | Añadido | Por qué |
|---|---|---|
| `arquitecto` | `documents`, `kb`, `hr/orgchart` | «Diseño y planeación de proyectos» (§4). `url-matrix` ya se los daba. |
| `dir_operaciones` | `kb`, `hr/orgchart`, `news`, asistencia propia, globs de `warehouse`/`procurement` | Un director también ficha; el detalle de almacén estaba roto. |
| `dir_admin` | CRM completo (`leads`, `opportunities`, `clients`, `products`, `projects`, `pipeline`, `agenda`), glob de `tenders` | Es `SALES_MANAGER` en la capa 2; «Seguimiento a clientes» (§2). |
| `coord_admin` | `hr`, `hr/fines`, `hr/kpis`, `hr/orgchart`, `kb`, `crm/agenda`, globs de `invoicing`/`procurement` | Es `HR_MANAGER` en la capa 2. |
| `administrativo` | globs de `invoicing`/`warehouse`/`procurement`, `crm/leads`, `crm/pipeline`, `crm/agenda`, `ops/vehicles` | Facturación y Compras con Mayorista son sus funciones #1 y #5 (§2); `resolveOpsPairNav` ya le da vista de flotilla. |
| `coord_operaciones` | `approvals`, `documents`, `kb`, `hr/orgchart`, glob de `crm/quotes` | Aprueba viáticos y cierres de OT (§3). |
| `ing_soporte` | `crm/quotes` + glob | La capa 2 ya lo nombraba en `crm-quotes`: cotiza refacciones. |
| `coord_ventas` | `calendar`, `approvals`, `kb`, `documents`, `hr/orgchart`, `studio/contacts`, `studio/leads` | No tenía ni su propio calendario; los leads del sitio son de ventas. |
| `rh` | `approvals`, `kb`, `finance/viatics`, glob de `documents` | Autoriza permisos e incidencias; `resolveViaticsSidebarHome` ya lo mandaba a viáticos ERP. |
| `contabilidad` | `approvals`, `kb`, globs de `invoicing` y `crm/quotes`, asistencia propia | Autoriza gastos; el detalle de factura y de cotización es su trabajo diario. |

**`apps/api/src/common/rbac/url-matrix.ts`** — se alineó la tercera capa con las
otras dos para los 9 roles donde recortaba: INTEGRA para `arquitecto`; CRM y
reportes de campo para `dir_admin` y `coord_admin`; `calendar` y `documents` para
`ing_campo`, `ing_soporte`, `vendedor` y el equipo de diseño; `chat`, catálogo y
plantillas para `lider_diseno`/`disenador`; y las páginas nuevas de los demás.
Solo se añadieron **rutas de página** y lecturas `GET` acotadas — ninguna
ampliación de escritura sobre endpoints existentes.

## 5. Red de seguridad

`apps/web/lib/rbac/role-modules.spec.ts` — 49 pruebas, vitest, al estilo de
`page-matrix.spec.ts`:

- El **conjunto exacto** de módulos visibles de cada uno de los 17 roles. Si un
  cambio mueve un módulo, este archivo se mueve en el mismo commit.
- **Coherencia de las tres capas**: importa `URL_MATRIX` y
  `deriveModuleKeysFromPaths` de verdad desde `apps/api` y exige que nada de lo
  que la web concede lo recorte `/me/navigation`. Es la prueba que impide que el
  déficit vuelva por la puerta de atrás.
- El comodín raíz devuelve el catálogo entero; una navegación vacía nunca recorta.
- **Listado ⇒ detalle**: ningún rol puede abrir una lista y quedarse fuera de la
  ficha.
- Un caso por puesto, nombrando la función del organigrama que lo justifica.
- **Confinamiento**: ningún rol operativo entra en `users`, `accounting`,
  `banking`, `settings` ni facturación fiscal.

Verificado por mutación: revertir el arreglo del comodín raíz rompe 4 pruebas.

## 6. Propuesto y NO aplicado

Todo esto lo pide la capa 2 (`section-views.ts` ya nombra al rol) pero toca
facturación fiscal, contabilidad, nómina o alta de usuarios. **Requiere el visto
bueno de Adam**, así que queda escrito y sin aplicar:

| Rol | Módulos que la capa 2 ya le concede y `PAGE_MATRIX` sigue negando | Por qué no se aplicó |
|---|---|---|
| `administrativo` | `accounting`, `banking`, `employee-payments` | Contabilidad y nómina para un rol administrativo de tier 45. |
| `rh` | `accounting`, `invoicing`, `banking` | Facturación fiscal para RH. |
| `dir_operaciones` | `users`, `settings`, `audit`, `accounting`, `invoicing`, `banking` | Alta de usuarios y contabilidad para el director de operaciones. |
| `coord_admin` | `settings`, `architecture`, `audit` | Configuración y auditoría del sistema. |
| `ing_campo` | `kb` | Lo bloquea `tier >= 50` en la capa 2 y él es tier 40. Un técnico de instalación con manuales a mano parece razonable, pero es cambiar la política de tier, no un permiso suelto. |

Otros dos hallazgos anotados, sin tocar:

1. **`listAllowedUrls()` no incluye `SHARED_SESSION_URL_RULES`** y
   `checkUrlAccess()` sí (`url-matrix.ts:731`). Hoy es inocuo —esas reglas son
   todas `/api/`— pero `/me/navigation` devuelve una vista incompleta de lo que
   el usuario realmente puede tocar.
2. **La propuesta estructural del §12 sigue en pie.** Esta remediación alinea las
   tres listas; no las sustituye. Mientras sean tres, cada módulo nuevo hay que
   darlo de alta tres veces y el déficit vuelve a crecer solo.

## 7. Estado

`npm run typecheck:web` ✅ · `npm run typecheck:api` ✅ ·
`npm run test:web` ✅ 608/608 (37 archivos) · `npm run test:api` ✅ 911/911 (110 suites).
