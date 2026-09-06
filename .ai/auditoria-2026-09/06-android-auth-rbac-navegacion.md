# 06 · Android: autenticación, sesión, RBAC y navegación

Auditoría READ-ONLY · 2026-09-06 · alcance: `apps/mobile-native/android/app/src/main/java/mx/nexara/mobile/nativeapp/`
Contraste con `apps/api/src/auth` y `apps/web/lib/access-matrix.ts`.
No cubre el 502 (lo lleva otro agente).

---

## 1. La cadena, de extremo a extremo

```
┌─ LOGIN ──────────────────────────────────────────────────────────────────────┐
│ LoginViewModel.submit()            ui/screens/LoginViewModel.kt:73           │
│   └─ AuthRepository.login()        data/AuthRepository.kt:15                 │
│        intenta EN CASCADA 4 endpoints, tragándose la excepción de cada uno:  │
│        1. POST auth/login          (interno)     AuthRepository.kt:21-49     │
│        2. POST portal/login        (unificado)   AuthRepository.kt:52-99     │
│        3. POST client-auth/login   (legacy)      AuthRepository.kt:102-127   │
│        4. POST branch-auth/login   (legacy)      AuthRepository.kt:130-154   │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─ LO QUE DEVUELVE LA API ─────────────────────────────────────────────────────┐
│ apps/api/src/auth/auth.service.ts:967-976 (issueSession) + :691-713          │
│   access_token · expiresAt · loginGreeting · loginDevice                     │
│   user = { id, nombre, email, role(=Role.nombre), roleId,                    │
│            roleKey ★, orgRoleKey ★, nivelAutoridad ★, roleFlags ★,           │
│            department, departmentId, permissions[], isSuperAdmin,            │
│            isPlatformOwner ★, avatarUrl }                                    │
│   ★ = la app Android NI SIQUIERA LOS DECLARA en el DTO                       │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─ DTO ANDROID (recorte) ──────────────────────────────────────────────────────┐
│ data/api/AuthApi.kt:13-32  LoginUserDto / LoginResponse                      │
│   guarda: id, nombre, email, role, roleId, department, departmentId,         │
│           avatarUrl, permissions, isSuperAdmin, loginDevice                  │
│   TIRA:   roleKey, orgRoleKey, nivelAutoridad, roleFlags, isPlatformOwner,   │
│           expiresAt                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─ SESIÓN ─────────────────────────────────────────────────────────────────────┐
│ data/SessionStore.kt:30-91  EncryptedSharedPreferences "nexara_session"      │
│   token plano · permissions como CSV (SessionStore.kt:50,81)                 │
│   NO guarda: expiración, companyId, roleKey, refresh token (no existe)       │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─ PANELES VISIBLES ───────────────────────────────────────────────────────────┐
│ access/PanelAccessResolver.accessiblePanels()   PanelAccessResolver.kt:38-88 │
│   cliente/sucursal ──────────────────────────► [PORTAL]        (línea 41-43) │
│   isSuperAdmin (solo 2 correos) ─────────────► [ERP,CRM,OPS,STUDIO,LAB] (48) │
│   resto: 5 booleanos calculados con                                          │
│     (a) lista blanca de ~20 permisos ESCRITA A MANO en Kotlin (52-79)        │
│     (b) `role.contains("...")` sobre el NOMBRE VISIBLE del rol (61,67,73,77) │
└──────────────────────────────────────────────────────────────────────────────┘
                    │                                    │
       0 paneles ───┘                                    └─── 1 panel → entra directo
       "No hay paneles disponibles                            NexaraApp.kt:62-63, 99-103
        para tu cuenta."
       ui/screens/PanelHubScreen.kt:155-160
                                    │
                                    ▼
┌─ NAVHOST RAÍZ ───────────────────────────────────────────────────────────────┐
│ ui/NexaraApp.kt:141  NavHost                                                 │
│   login · onboarding · panels · erp · ops · crm · studio · lab · portal ·    │
│   notifications · alias legacy (console/ventas/contabilidad/web/tickets)     │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                ┌───────────────────┼────────────────────┬──────────┬─────────┐
                ▼                   ▼                    ▼          ▼         ▼
        ConsoleNavHost        VentasNavHost       StudioNavHost  LabNavHost TicketsNavHost
        (ERP y OPS)           (CRM)               (STUDIO)       (LAB)      (PORTAL)
        tabs POR ROL          tabs FIJOS          tabs FIJOS     fijos      fijos
        ConsoleNavHost.kt     VentasNavHost.kt
        :186-233              :125-130
                │
                ▼
┌─ MÓDULOS DENTRO DEL PANEL ───────────────────────────────────────────────────┐
│ 1) ModulePanelMap.consoleKeysFor(panel)   access/ModulePanelMap.kt:39-43     │
│    lista blanca de claves ERP vs OPS, escrita a mano                         │
│ 2) canAccessConsoleModule(user, module)   ui/console/ConsoleAccessRules.kt:86│
│    - línea 89-90: comprueba module.superAdminOnly y module.permissions       │
│      → CÓDIGO MUERTO: los 112 ModuleEntry del catálogo tienen la lista       │
│        vacía y superAdminOnly=false (ui/catalog/ModuleCatalog.kt:26-157)     │
│    - líneas 96-135: decide de verdad con `role.contains("ingenier")`,        │
│      `contains("vendedor")`, `isAdministrativoRole()` …                      │
│ 3) consoleSidebarGroups()  ConsoleAccessRules.kt:151-204                     │
│    10 grupos con claves literales; lo que no esté aquí no se ve nunca        │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Respuesta directa a la pregunta clave:** el resolver **no** usa los permisos que
devuelve la API como fuente de verdad. Los usa como *una de dos* señales, contra una
lista blanca de ~20 cadenas fijadas en Kotlin (`PanelAccessResolver.kt:52-79`), y
completa el resto con coincidencias de subcadena sobre el **nombre visible** del rol.
Dentro del panel es peor: los permisos no intervienen en absoluto
(`ModuleCatalog.kt` — 112 entradas, 0 con `permissions =`), y todo se resuelve con
`role.contains(...)` (`ConsoleAccessRules.kt:96-135`). Añadir un módulo o un rol
**exige recompilar y subir a Play**.

---

## 2. Causa raíz de que los usuarios vean tan poco

### 2.1 El backend ya no habla el idioma que la app escucha

`AuthService.resolveUserPermissions` (`apps/api/src/auth/auth.service.ts:91-100`)
tiene dos ramas. Si el usuario tiene `roleKey` v2 —y **todos** los usuarios reales lo
tienen (`prisma/migrations/20260620120000_seed_nexara_team/migration.sql:61-69` crea
los `Role` con `orgRoleKey`, y `prisma/seed-demo-users.ts:35-186` asigna los 17
empleados)— los permisos salen de:

```
buildBaseAuthenticatedPermissions()   auth.service.ts:103-135
  = kb.view · workflow.view · panel.support · support.view · panel.people ·
    people.view · search.view
+ addV2RolePermissions(roleKey)       auth.service.ts:392-626
```

**Ninguno de los 7 permisos base coincide con nada que
`PanelAccessResolver` busque.** Un usuario solo ve un panel si `addV2RolePermissions`
le concede por casualidad uno de los ~20 literales que la app conoce
(`console.access`, `console.admin`, `attendance.view`, `panel.ventas`, `panel.web`…)
o si el nombre de su rol contiene la subcadena correcta.

### 2.2 Simulación con los roles que existen de verdad en la base

Nombres reales de `Role.nombre` (migración `20260620120000` líneas 61-69 +
`seed-demo-users.ts:236-241,337-339`): `CEO`, `Coordinador Administrativo`,
`Administrativo`, `Líder de Diseño`, `Coordinador de Operaciones`,
`Ingeniero de Campo`, `Ingeniero de Soporte`, `Arquitecto`.

| roleKey v2 | Role.nombre | Paneles que **debería** ver | Paneles que ve en Android | Por qué |
|---|---|---|---|---|
| `ceo` | CEO | ERP, CRM, OPS, STUDIO, LAB | **ERP, CRM, OPS** | tiene `panel.lab`+`lab.access` pero LAB solo mira `isSuperAdmin ‖ role~"developer"` (`PanelAccessResolver.kt:79`); STUDIO exige `panel.web`/`studio.access` que el CEO no recibe (`:76`) |
| `arquitecto` | Arquitecto | OPS (+CRM, ERP) | ERP, CRM, OPS | ok por `console.access` |
| `coord_operaciones` | Coordinador de Operaciones | OPS (+ERP, CRM) | ERP, CRM, OPS | ok |
| `coord_admin` | Coordinador Administrativo | ERP (+CRM) | ERP, CRM, **OPS** | `console.access` lo mete en OPS también (`:71`) |
| `administrativo` | Administrativo | ERP | ERP | ok por `attendance.view` |
| `ing_campo` (×7 empleados) | Ingeniero de Campo | OPS | **ERP + OPS** | `console.access` abre ERP (`:55`) — un ingeniero de campo aterriza en el hub con el panel corporativo |
| `ing_soporte` | Ingeniero de Soporte | OPS | ERP + OPS | idem |
| `lider_diseno` / `disenador` | Líder de Diseño | STUDIO | **ERP + STUDIO** | `attendance.view` abre ERP |
| `vendedor` / `coord_ventas` | (sin fila en la migración) | CRM | ERP + CRM | idem |
| `contabilidad` | (sin fila) | ERP | ERP | ok por `contabilidad.view` |
| **`rh`** | (sin fila; probable "Recursos Humanos") | ERP | **NINGUNO** | recibe `hr.view`,`hr.manage`,`cvs.manage`,`documents.view` — **ninguno está en la lista blanca de ERP** (`:52-59`); y `role.contains("rh")` no casa con "recursos humanos" (`:61`) |
| `cliente` | Cliente | INTEGRA (web: `CLIENTE_INTEGRA_MODULE_IDS`) | PORTAL (tickets) | Android no tiene panel INTEGRA |

**El caso "entró y no cargó su dashboard" tiene un camino exacto:** cualquier rol cuyos
permisos v2 no toquen la lista blanca cae en `accessiblePanels() == emptyList()`
→ `routeForSinglePanelUser` devuelve `null` (`PanelAccessResolver.kt:99-103`)
→ `startDestination = "panels"` (`NexaraApp.kt:72-76`)
→ `PanelHubScreen` con "No hay paneles disponibles para tu cuenta."
(`ui/screens/PanelHubScreen.kt:155-160`). Ni dashboard, ni tabs, ni salida salvo cerrar
sesión. Lo mismo le pasa a cualquier rol nuevo que se dé de alta en `roles.v2.ts` sin
tocar el Kotlin.

### 2.3 Dentro del panel el recorte es todavía más brutal

`ConsoleAccessRules.kt:115-122` — rama `isIngeniero` (7 de los 17 empleados):

```kotlin
val baseAllowed = setOf("/dashboard", "/cotizaciones", "/cvs", "/ventas", "/attendance")
if (!path.startsWith("/my-") && path !in baseAllowed) return false
```

y acto seguido `/cotizaciones` exige `cotizaciones.access`, `/cvs` exige `cvs.*` y
`/ventas` exige `sales.*` — permisos que `ing_campo` **no** tiene
(`auth.service.ts:576-593`). Resultado neto para un Ingeniero de Campo:

> `dashboard`, `my-activities`, `my-evidences`, `my-viatics`, `my-vehicles`,
> `my-lunch-breaks`, `my-profile`, `attendance`.

Se quedan fuera módulos que el backend **sí** le autoriza: `evidences`, `viatics`,
`vehicles`, `tools`, `gps` (tiene `gps.view`), `activities`, y `calendar`
(`/calendar` no empieza por `/my-` ni está en `baseAllowed`).

---

## 3. Tabla de divergencias Android ↔ web

| # | Concepto | `apps/web/lib/access-matrix.ts` | Android | Impacto |
|---|---|---|---|---|
| D1 | Fuente de decisión | `orgRoleKey` (21 claves, `getAllowedPanels` :1061) + `v2Role` | `Role.nombre` como string + lista blanca de permisos hardcodeada | dos verdades distintas; nunca convergen |
| D2 | Nº de paneles | 6: erp, crm, ops, studio, lab, **integra** (:31-38) | 6: erp, crm, ops, studio, lab, **portal** (`PanelId.kt:14-61`) | INTEGRA inalcanzable en móvil; PORTAL no existe en la web |
| D3 | `tickets` legacy | → **OPS** (`LEGACY_PANEL_MAP` :131) | → **PORTAL** (`PanelId.kt:73`) | mismo deep link, panel distinto |
| D4 | `integra` legacy | → INTEGRA (:130) | sin entrada → cae a **ERP** (`PanelId.kt:75`) y en el parser a ERP (`DeepLinkParser.kt:180`) | notificación de INTEGRA abre un placeholder de ERP |
| D5 | Rol `cliente` v2 | 15 módulos INTEGRA de lectura (`CLIENTE_INTEGRA_MODULE_IDS` :1019) | PORTAL de tickets (`PanelAccessResolver.kt:41-43`) | el cliente ve otra app |
| D6 | Panel HOME | `ROLE_HOME_PANEL` explícito por rol (:1142-1171) + `ORG_ROLE_HOME_PATH` | "si solo hay 1 panel entra; si hay 2+ muestra hub" (`:99-103`) | el ing. de campo, que en web aterriza en `/ops/my-activities`, en móvil ve un hub con 2 tarjetas |
| D7 | STUDIO | `STUDIO_TEAM` = CEO, DIRECTOR_COMMERCIAL, DESIGNER (:316) | `panel.web` ‖ `studio.access` ‖ role~diseño (`:76-77`) | el CEO pierde STUDIO; `studio.access` **no existe** en `permissions.ts` |
| D8 | LAB | por matriz de módulos | `isSuperAdmin ‖ role~developer/desarroll` (`:79`) | ignora `panel.lab` y `lab.access` que la API sí emite (`auth.service.ts:441-444`) |
| D9 | Roles org | web añade `arquitecto` y `coord_operaciones` a `ORG_ROLE_KEYS` (21); la API tiene 19 (`common/org-roles.ts:15-35`) | Android no lee `orgRoleKey` en absoluto | ninguna de las tres capas coincide |
| D10 | Módulos declarados | `MODULES` con `allowedRoles` por entrada (:325-1005) | `ModuleCatalog` con `permissions` vacío en las 112 entradas | el filtro por permiso es código muerto (`ConsoleAccessRules.kt:89-90`) |
| D11 | Chat | módulo `chat`/`crm-chat`/`ops-chat` con rol | clave `chat` no está en `ERP_KEYS` ni en `OPS_KEYS` (`ModulePanelMap.kt:7-36`) | el chat corporativo no aparece en el menú de ninguno de los dos paneles |
| D12 | Tenant | web manda `X-Company-Id` | Android no manda nada (grep: 0 apariciones) | ver §6 |

---

## 4. Sesión

| Aspecto | Situación | Archivo:línea |
|---|---|---|
| Dónde vive el token | `EncryptedSharedPreferences` (AES256-SIV/GCM) — correcto | `SessionStore.kt:35-41` |
| Permisos | CSV en la misma prefs; un permiso con coma rompería el parseo | `SessionStore.kt:50, 81` |
| Caducidad | La API devuelve `expiresAt` (`auth.service.ts:969`) — **el DTO Android no lo declara** (`AuthApi.kt:27-32`) y no se guarda | — |
| Refresh | **No existe.** La API expone `POST auth/session/extend` con sliding session y tope de 7 días (`auth.controller.ts:100-120`, `auth.service.ts:1010+`). Grep en todo el Kotlin: 0 llamadas | — |
| Al expirar | Interceptor detecta 401 → `SessionEvents.notifyExpired()` → diálogo modal → `repo.logout()` → `navigate(Login) { popUpTo(0) }` | `ApiClient.kt:39-41`, `SessionExpiredHost.kt:33-58`, `NexaraApp.kt:133-139` |
| Consecuencia | Con `JWT_EXPIRES_IN` por defecto en `4h` (`auth.service.ts:963`), a las 4 horas exactas el técnico en campo pierde el formulario que estuviera llenando. No hay borrador, no hay reintento, no hay extensión silenciosa | — |
| Login en cascada | 4 intentos secuenciales; cada fallo se traga y guarda en `lastError`, y solo se propaga el **último** capturado (`AuthRepository.kt:153`: `throw lastError ?: e`). Un 500 real del `auth/login` interno acaba reportado como el error del `branch-auth/login`. Además: 4 round-trips de red y 4 registros `LOGIN_FAILED` en `AuditLog` (`auth.service.ts:835-845`) por cada contraseña mal tecleada | `AuthRepository.kt:15-155` |
| MFA | La API puede responder `401 MFA_REQUIRED` (`auth.service.ts:862-871`). Android lo mapea a "Correo o contraseña incorrectos" (`AuthErrorMapper.kt:12`) y no tiene pantalla de código. **Un usuario con MFA activo no puede entrar a la app y le dice que su contraseña está mal** | `AuthErrorMapper.kt:10-27` |
| Errores en español | Sí, tanto login (`AuthErrorMapper.kt`) como el resto (`ApiErrors.kt:6-17`). Ningún código crudo llega al usuario. Punto positivo. Salvedad: `ApiErrors.kt:16` cae a `message` del throwable, que en un fallo de Moshi es texto técnico en inglés | — |

---

## 5. Navegación

**NavHosts:** raíz (`NexaraApp.kt:141`), console —compartido por ERP y OPS—
(`ConsoleNavHost.kt:328`), ventas (`VentasNavHost.kt:174`), studio
(`StudioNavHost.kt:61`), lab (`LabNavHost.kt:140`), tickets
(`TicketsNavHost.kt:131`), contabilidad (`ContabilidadNavHost`, invocado como estado
booleano `showContabilidad` en vez de como ruta — `ConsoleNavHost.kt:167-170`).

**Tabs inferiores:** solo el de console se calcula por rol
(`ConsoleNavHost.kt:186-233`), con 4 ramas: `isAdministrativo` / `isSuperAdmin‖isAdmin`
/ `isIngeniero` / resto, todas derivadas de `role.lowercase().contains(...)`
(`ConsoleNavHost.kt:148-151`). CRM, STUDIO, LAB y PORTAL tienen tabs **fijos** para
todo el mundo (p.ej. `VentasNavHost.kt:125-130`): un vendedor sin `sales.reports.view`
ve las mismas cuatro pestañas que su gerente.

**Módulos con pantalla nativa pero inalcanzables desde la interfaz:**

| clave | pantalla que existe | por qué no se ve |
|---|---|---|
| `chat` | `ChatScreen` (`ConsoleNavHost.kt:544-550`) | no está en `ERP_KEYS` ni `OPS_KEYS` (`ModulePanelMap.kt`). Solo llega por deep link o por el widget del Command Center |
| `dispatch` | `ConsoleDispatchScreen` (`:526-532`) | ídem; ni en el mapa de paneles ni en ningún grupo del sidebar |
| `recruiting` | `RecruitingScreen` (`:589`) | está en `OPS_KEYS` pero **ningún** `pick(...)` de `consoleSidebarGroups` lo lista (`ConsoleAccessRules.kt:163-201`) |
| `my-preferences` | `MyPreferencesScreen` (`:578-584`) | está en `ERP_KEYS` pero no en ningún grupo del sidebar |
| `work-projects` | `WorkProjectsRichScreen` (`:585`) | está en el grupo "finance" del sidebar, pero solo en `OPS_KEYS`; en OPS ese grupo se vacía por el resto de filtros |

**Destinos rotos desde el Command Center:** `getCommandWidgetsForUser`
(`ui/commandcenter/CommandCenterAccess.kt:116`) ofrece widgets con `moduleKey`
`"pipeline"` y `"leads"`; `routeForModuleKey` los manda a `console/m/pipeline` /
`console/m/leads`, claves que **no** están en el `setOf(...)` de módulos manejados
(`ConsoleNavHost.kt:590-604`) → el CEO toca "Pipeline" en su tablero y aterriza en
`PlaceholderScreen`.

**Deep links:**
- Solo esquema propio `nexara://` (`AndroidManifest.xml:69-74`). No hay App Links para
  `https://*.nexara.com.mx`, así que las URLs de las notificaciones web no abren la app.
- `applyPendingDeepLink` navega al panel **sin comprobar acceso**
  (`NexaraApp.kt:109-113`: `is DeepLinkDestination.Module -> navigateToPanel(d.panel)`).
  Un push mal enrutado deja al usuario en un panel vacío (la API sí sigue protegida; el
  daño es de UX, no de datos).
- `DeepLinkParser` tiene *fallback* silencioso a ERP para cualquier prefijo desconocido
  (`DeepLinkParser.kt:180`) — de ahí que `/integra/...` acabe en ERP.

**Cobertura de pruebas:** hay 6 tests unitarios
(`app/src/test/java/.../access/`), todos de parsing de deep links y URLs. **Cero tests
de `PanelAccessResolver` y cero de `ConsoleAccessRules`**, que son precisamente los dos
archivos donde vive el bug.

---

## 6. Offline y multi-empresa

**Encolado.** `OfflineHttpInterceptor` (`data/offline/OfflineHttpInterceptor.kt:40-43,
66-69`) encola POST/PUT/PATCH/DELETE cuando `NetworkMonitor` dice que no hay red **o**
cuando salta un `IOException`, y devuelve un `202 {"queued":true}` sintético. Así que sí:
marcar asistencia sin señal se encola y se reintenta con backoff exponencial
(`OfflineSyncCoordinator.kt:60-66`).

**Duplicados: sí, y sin defensa.** El caso malo es el `IOException` por *timeout de
lectura* (22 s, `ApiClient.kt:28`): la petición llegó al servidor y se ejecutó, pero la
respuesta se perdió → el interceptor la encola igual (`:66-69`) y el coordinador la
reenvía. La API tiene un interceptor de idempotencia estilo Stripe que lee la cabecera
`idempotency-key` (`apps/api/src/common/idempotency/idempotency.interceptor.ts`), pero
**Android no la envía nunca** (grep `Idempotency` en todo el Kotlin: 0 resultados). Un
check-in de asistencia o una evidencia pueden duplicarse al reconectar.

**Pérdida silenciosa.** `PERMANENT_CLIENT` incluye 401 y 403
(`OfflineSyncCoordinator.kt:29`): si la cola se reproduce con un token ya expirado, la
mutación se descarta con un `Log.w` y **nadie se entera** (`:82-86`). El técnico cree
que reportó y no reportó.

**Caché GET compartida entre usuarios — fuga real.**
`OfflineApiCache.keyFor(url, authTag)` (`OfflineApiCache.kt:14-18`) hashea
`url|authTag`, y `authTag = request.header("Authorization")?.take(48)`
(`OfflineHttpInterceptor.kt:25`). `"Bearer "` son 7 caracteres; la cabecera JWT
`{"alg":"HS256","typ":"JWT"}` en base64url ocupa 36 caracteres fijos, más el punto son
44; los 4 restantes son el primer grupo base64 del payload, que siempre codifica `{"s`
de `{"sub":…`. Es decir: **los 48 primeros caracteres son idénticos para todos los
usuarios**, y la clave de caché queda reducida a la URL. En un tablet compartido, el
usuario B recibe offline las respuestas cacheadas del usuario A — y si son de otra
empresa, también de otro tenant.

**Nada se limpia al cerrar sesión.** `AuthRepository.logout()` (`:163-166`) solo hace
`sessionStore.clear()` + `RealtimeBus.stop()`. No hay una sola llamada a
`apiCache().clear()` ni a `mutationQueue().clear()` en todo el código (grep: 0).
Además `SessionStore.clear()` (`:137-151`) **no borra `avatar_url` ni
`quick_profiles_csv`**, así que la lista de correos de compañeros sobrevive al logout.

**Multi-empresa: la app no participa.** `ADR-0014` establece que sin `X-Company-Id` el
scope es *fail-closed* salvo `TENANT_ALLOW_PRIMARY_FALLBACK=1`. Android **no envía esa
cabecera nunca** (los únicos headers propios son `X-Device-*`, `DeviceIdentity.kt:8-12`).
En la práctica `TenantInterceptor` (`common/tenant/tenant.interceptor.ts:58-69`) delega
en `CompanyService.resolveForUser`, que sin header cae a la membresía
`UserCompany.isDefault` y, si no hay ninguna, a la empresa primaria
(`company.service.ts:91-98`). Consecuencias:

1. Un usuario con varias empresas **queda clavado en su empresa por defecto**; no hay
   forma de cambiar desde el móvil. El módulo `companies` del catálogo
   (`ModuleCatalog.kt:84` → `CompaniesScreen`) lista empresas que no puede activar.
2. `SessionUser` no tiene `companyId` (`SessionStore.kt:7-21`), aunque
   `UnifiedPortalLoginResponse` sí lo recibe y lo descarta (`PortalAuthApi.kt:40`).
3. Combinado con la caché compartida del punto anterior, **sí es posible quedarse con
   datos de la empresa equivocada en caché** al cambiar de usuario en el mismo
   dispositivo, sin necesidad siquiera de cambiar de empresa.

---

## 7. Defectos, por severidad

| # | Sev | Defecto | Archivo:línea | Arreglo propuesto |
|---|---|---|---|---|
| 1 | **Crítica** | Un rol cuyos permisos v2 no rocen la lista blanca de Kotlin se queda con **cero paneles** y un mensaje muerto. Hoy le pasa a `rh`; le pasará a cualquier rol nuevo | `PanelAccessResolver.kt:52-88`; `PanelHubScreen.kt:155-160` | §8 (paneles servidos por la API). Parche puente: añadir `hr.view`, `panel.people`, `people.view`, `bi.view`, `accounting.view`, `documents.view`, `procurement.view`, `warehouse.view`, `invoicing.view`, `banking.view` a la lista de ERP, y dar a `PanelHubScreen` una salida (perfil + soporte) cuando la lista esté vacía |
| 2 | **Crítica** | Autorización por subcadena del nombre visible del rol. Renombrar `Role.nombre` en la BD cambia lo que ve el usuario, sin desplegar nada | `PanelAccessResolver.kt:24,61,67,73,77,79`; `ConsoleAccessRules.kt:53-57,97-100`; `ConsoleNavHost.kt:150`; `CommandCenterAccess.kt:88-113` | consumir `roleKey`/`orgRoleKey` (ya vienen en la respuesta) y eliminar todos los `contains` |
| 3 | **Crítica** | Caché GET offline con clave efectivamente común a todos los usuarios → fuga entre usuarios y entre tenants en el mismo dispositivo | `OfflineApiCache.kt:14-18`; `OfflineHttpInterceptor.kt:25` | clavar la clave a `userId + companyId` del `SessionUser`, no a un prefijo del token; y borrar caché + cola en `logout()` |
| 4 | **Alta** | Un usuario con MFA activo no puede entrar y la app le dice que la contraseña es incorrecta | `AuthErrorMapper.kt:12`; falta pantalla de código | detectar `message == "MFA_REQUIRED"` y pedir el TOTP; `LoginRequest` ya tendría que llevar `mfaCode` |
| 5 | **Alta** | Sin refresh: a las 4 h se cierra la sesión y se pierde el trabajo en curso, teniendo la API `auth/session/extend` disponible | `ApiClient.kt:39-41`; `SessionExpiredHost.kt`; `auth.controller.ts:100` | guardar `expiresAt`, llamar a `session/extend` al volver a *foreground* y a mitad de vida; en el 401, reintentar una vez con el token renovado antes de mandar al login |
| 6 | **Alta** | Mutaciones offline sin `Idempotency-Key`: duplicados al reconectar tras un timeout | `OfflineHttpInterceptor.kt:74-89`; `OfflineSyncCoordinator.kt:70-75` | generar un UUID al encolar y enviarlo como `Idempotency-Key` en el reintento (el backend ya lo soporta) |
| 7 | **Alta** | 401/403 en el replay descartan la mutación en silencio | `OfflineSyncCoordinator.kt:29,82-86` | en 401 no descartar: renovar sesión y reintentar; en 403 mover a "fallidas" y avisar en la pantalla de cola |
| 8 | **Alta** | El ingeniero de campo (7 de 17 empleados) pierde `evidences`, `viatics`, `vehicles`, `tools`, `gps` y `calendar` pese a tener el permiso | `ConsoleAccessRules.kt:115-122` | sustituir `baseAllowed` por comprobación de permiso real por módulo |
| 9 | **Alta** | La app no envía `X-Company-Id`; multi-empresa inoperante y `CompaniesScreen` decorativa | `DeviceIdentity.kt:8-12`; `ApiClient.kt:29-43` | guardar `companyId` en `SessionUser`, mandarlo como cabecera en el interceptor y purgar caché al cambiar de empresa |
| 10 | Media | `logout()` no limpia caché offline, cola de mutaciones, `avatar_url` ni `quick_profiles_csv` | `AuthRepository.kt:163-166`; `SessionStore.kt:137-151` | limpiar todo; la lista de accesos rápidos, si se conserva, que sea decisión explícita del usuario |
| 11 | Media | Login en cascada de 4 endpoints: 4 round-trips, error final engañoso y 4 `LOGIN_FAILED` por intento | `AuthRepository.kt:15-155` | un único `POST portal/login` que ya resuelve interno/cliente/sucursal, o preguntar primero por el tipo de cuenta |
| 12 | Media | `chat`, `dispatch`, `recruiting`, `my-preferences` tienen pantalla y no hay forma de llegar por la interfaz | `ModulePanelMap.kt:7-36`; `ConsoleAccessRules.kt:163-201` | mientras el catálogo siga en Kotlin, añadirlos; con §8 desaparece la clase de bug |
| 13 | Media | Los widgets `pipeline` y `leads` del Command Center caen en `PlaceholderScreen` | `CommandCenterAccess.kt:56,78`; `ConsoleNavHost.kt:590-604` | enrutar a CRM (`VentasNavHost`) en vez de a `console/m/...` |
| 14 | Media | Tabs fijos en CRM, STUDIO, LAB y PORTAL | `VentasNavHost.kt:125-130`; `StudioNavHost.kt:61`; `LabNavHost.kt:140`; `TicketsNavHost.kt:131` | calcular las pestañas con la misma función que ERP/OPS |
| 15 | Media | `contabilidad` se abre con un booleano de estado, no como ruta: no hay back de sistema ni deep link | `ConsoleNavHost.kt:167-170` | convertirlo en destino del NavHost |
| 16 | Media | Deep link navega a paneles sin acceso | `NexaraApp.kt:109-113` | filtrar contra `accessiblePanels()` y, si no procede, mostrar "no tienes acceso a este módulo" |
| 17 | Baja | `studio.access` no existe en `permissions.ts`; la comprobación nunca se cumple | `PanelAccessResolver.kt:76` vs `apps/api/src/common/permissions.ts:141-142` | usar `studio.content.view` |
| 18 | Baja | `PanelId.fromLegacy("integra")` cae a ERP y `DeepLinkParser` manda `/integra/*` a ERP | `PanelId.kt:75`; `DeepLinkParser.kt:180` | o se implementa INTEGRA, o se devuelve `null` y se abre la web |
| 19 | Baja | `permissions` serializados como CSV: un permiso con coma corrompe la sesión | `SessionStore.kt:50,81` | JSON |
| 20 | Baja | `module.permissions` / `superAdminOnly` son código muerto (112/112 entradas vacías) | `ConsoleAccessRules.kt:89-90`; `ModuleCatalog.kt:26-157` | se resuelve solo con §8 |
| 21 | Baja | Cero tests sobre `PanelAccessResolver` y `ConsoleAccessRules` | `app/src/test/java/.../access/` | tabla de casos: un test por `roleKey` v2 con los permisos que emite `addV2RolePermissions` |

---

## 8. Arquitectura propuesta: que añadir un módulo no exija recompilar

El problema no es que la lista esté mal escrita: es que **existe en Kotlin**. Hoy hay
cuatro copias de la matriz de acceso —`access-matrix.ts` (web), `roles.v2.ts` +
`addV2RolePermissions` (API), `PanelAccessResolver` + `ModulePanelMap` +
`ConsoleAccessRules` (Android)— y las tres se contradicen entre sí.

**El movimiento:** la API deja de mandar solo `permissions[]` y manda **el menú ya
resuelto**.

### Contrato nuevo

Endpoint `GET /api/me/navigation` (y el mismo objeto embebido en la respuesta de login
para no pagar un round-trip extra):

```jsonc
{
  "version": "2026-09-06T10:00:00Z",   // para caché e invalidación
  "homePanel": "ops",
  "homePath": "/ops/my-activities",
  "companies": [ { "id": 1, "name": "NEXARA", "isDefault": true } ],
  "activeCompanyId": 1,
  "panels": [
    {
      "id": "ops", "name": "NEXARA OPS", "icon": "🚀", "accent": "#f97316",
      "tagline": "Campo, NOC, soporte y mantenimiento",
      "tabs": ["my-activities", "my-evidences", "attendance"],   // máx. 4 + "Más"
      "groups": [
        { "id": "employee", "title": "Mi espacio de trabajo",
          "modules": [
            { "key": "my-activities", "label": "Mis actividades", "icon": "📋",
              "webPath": "/ops/my-activities", "capabilities": ["read","create"] }
          ] }
      ]
    }
  ]
}
```

Se deriva **de `access-matrix.ts`**, que ya es la fuente de verdad declarada: se extrae
a `packages/access-matrix` (paquete compartido del monorepo), la web lo sigue
consumiendo tal cual y la API expone el mismo objeto serializado. Una sola matriz, tres
consumidores.

### Qué queda en el cliente Android

| Hoy | Después |
|---|---|
| `PanelAccessResolver` (104 líneas de reglas) | `NavigationRepository.load()` → parsea el JSON |
| `ModulePanelMap` (44 líneas) | desaparece: los grupos vienen del servidor |
| `ConsoleAccessRules` (287 líneas) | queda `canRender(moduleKey)` = `moduleKey in navigation` |
| `ModuleCatalog` (112 entradas con metadatos) | queda como **registro de pantallas**: `Map<String, @Composable () -> Unit>`. Solo eso: qué Composable dibuja cada clave |
| tabs por rol en 4 ramas `if` | `panel.tabs` tal cual viene |

Añadir un módulo pasa a ser: escribir la entrada en `access-matrix.ts` → desplegar la
API → todos los clientes lo ven. Solo se recompila la app si el módulo necesita una
**pantalla nueva**; si no la tiene, la app abre su `webPath` en el WebView de módulo,
que ya existe (`WebPanelUrl.forPath` + `PlaceholderScreen`) y hoy se usa como
degradación involuntaria.

### Detalles que hay que resolver a la vez

1. **Caché con `version`.** Guardar el JSON junto a la sesión y refrescar al arrancar y
   al volver de background. Sin red, se usa el último conocido (menú estable offline).
2. **Invalidación al cambiar de rol.** `version` cambia cuando cambia el rol o los
   permisos; el cliente compara y recarga. Hoy, cambiarle el rol a alguien no se refleja
   hasta que cierra sesión.
3. **`companyId` en la sesión y en las cabeceras.** El bloque `companies` del contrato
   habilita el selector de empresa; el interceptor manda `X-Company-Id`; al cambiar de
   empresa se purga caché GET y se rechaza el cambio si hay cola offline pendiente.
4. **Clave de caché offline = `userId:companyId:url`.** No un prefijo del token.
5. **Degradación segura.** Si `/me/navigation` falla, usar el último JSON cacheado; si
   no hay ninguno, un menú mínimo garantizado (dashboard + mi perfil + soporte), nunca
   la pantalla vacía de hoy.
6. **Un test de contrato** en el monorepo que compare `getAllowedPanels(role)` de la web
   contra la respuesta del endpoint para cada `roleKey`: si divergen, falla CI. Es lo
   que habría cazado las 12 divergencias de §3.

### Orden sugerido

| Fase | Qué | Riesgo |
|---|---|---|
| 0 (hoy) | Parche puente del defecto 1 (ampliar lista blanca + salida en el hub vacío) y del 3 (clave de caché + limpiar en logout) | bajo, sin cambio de contrato |
| 1 | `packages/access-matrix` extraído; `GET /me/navigation`; test de contrato web↔API | medio |
| 2 | Android consume el endpoint; `PanelAccessResolver`/`ModulePanelMap`/`ConsoleAccessRules` se borran; `ModuleCatalog` se reduce a registro de pantallas | medio |
| 3 | Selector de empresa + `X-Company-Id` + purga de caché; `session/extend`; `Idempotency-Key` | medio |

---

## Remediación 2026-09-06 (post-Cursor)

Reverificado contra el disco después del turno de remediación de Cursor
(`9f8c1755` integración `/me/navigation`, `181cc218` paridad móvil 3 olas).
Donde el informe de arriba contradice al código actual, **gana el código**.

### Qué ya estaba arreglado (informe desactualizado)

- **`/me/navigation` sí está integrado.** `AuthRepository.enrichSession()` lo pide en
  login y en cada `maybeExtendSession()`; `SessionUser` guarda `navPanels`,
  `navModuleKeys` y `navPaths`, y `SessionStore` los persiste.
- **Módulos huérfanos §3 recuperados por Cursor.** `chat`, `dispatch` y `recruiting`
  ya estaban en `ModulePanelMap`, en los grupos de `consoleSidebarGroups` y despachados
  en `ConsoleNavHost`. Verificado uno por uno: `ChatScreen.kt` (2 919 líneas),
  `ConsoleDispatchScreen.kt` (498 líneas, tablero kanban con datos reales de
  `ConsoleRepository`) y `RecruitingScreen` son pantallas funcionales, no cascarones.
- **Barrido inverso limpio.** Las 64 entradas de `ModuleCatalog.console` tienen las tres
  cosas: pantalla en `ConsoleNavHost`, clave en `ModulePanelMap` y grupo de menú. Ningún
  menú lleva a la nada. Lo mismo en ventas / studio / lab / integra / contabilidad.

### Qué seguía roto

1. **La decisión por subcadena de rol seguía viva**, degradada a respaldo pero decidiendo
   siempre que `/me/navigation` no responde. `PanelAccessResolver.kt:106-151` (antes):
   `t.contains("admin")`, `t.contains("rh")`, `t.contains("ingenier")`, `t.contains("noc")`.
   Cursor había añadido `contains("recurso")` para tapar el caso de RH, sin quitar el
   mecanismo.
2. **Cero paneles seguía siendo un estado alcanzable.** Si el rol no casaba con ninguna
   subcadena y los permisos tampoco, `accessiblePanels()` devolvía lista vacía y
   `PanelHubScreen.kt:163` pintaba «No hay paneles disponibles para tu cuenta»: pantalla
   muerta, sin salida.
3. **`isClientOrBranchAccount` degradaba internos al portal.** La regex
   `(cliente|client|sucursal|branch)` sobre el nombre visible del rol mandaba a PORTAL a
   cualquier interno con «Clientes» en el título. Los prefijos de permiso que también
   consultaba (`client-portal.`, `client-tickets.`…) **no existen en toda la API**: código
   muerto que solo podía disparar de más.
4. **`normalizedConsolePath` solo pelaba `/console` y `/operacion`.** Los módulos con
   ruta canónica nueva — `chat` (`/erp/chat`), `dispatch` (`/ops/dispatch`), `support`
   (`/ops/support`), `noc` (`/ops/noc`) — nunca casaban con la lista de rutas permitidas
   del ingeniero. **Estaban en el menú y en el mapa, y aun así invisibles para todo el
   personal de campo**, que es el grupo más grande de usuarios de la app.
5. **RH entraba a ERP y no veía CVs ni reclutamiento.** `roles.v2.ts` le da a `rh` el
   panel HOME `core` (→ ERP), pero `cvs` y `recruiting` solo estaban en `OPS_KEYS`. El
   filtro de panel los recortaba: RH llegaba a su panel sin su trabajo diario.
6. **`consoleBottomTabModuleKeys` seguía con `roleLower.contains("ingenier")`** sin
   ninguna condición previa (`ConsoleAccessRules.kt:306`, antes).
7. **`chat`, `dispatch` y `recruiting` salían duplicados**, declarados en dos grupos del
   sidebar cada uno.

### Qué se arregló

- **Nuevo `access/RolePanelMatrix.kt`** — espejo Android de `roles.v2.ts`
  (`ROLE_HOME_PANEL` ∪ `ROLE_EXTRA_PANELS` ∪ `LEGACY_TO_V2`). Normaliza el rol
  (minúsculas, sin acentos, separadores → `_`) y lo resuelve a clave canónica por
  **igualdad exacta** contra una tabla de alias, más una segunda pasada de igualdad por
  token para nombres compuestos («Recursos Humanos (RH)»). Cero `contains`.
- **`PanelAccessResolver.accessiblePanels()` reescrito como cadena de decisión explícita:**
  externo → super admin → `navPanels` de la API → rol canónico → permisos → **panel base
  ERP**. Un usuario interno autenticado nunca sale con cero paneles. `navPanels` ahora
  entiende los alias legacy (`core`, `sales`, `console`, `operacion`, `web`, `tickets`) y
  filtra `portal`: la API no puede degradar a un interno a cuenta de cliente.
- **`isClientOrBranchAccount` eliminada.** Lo externo lo marcan `isClient`/`isBranchUser`
  (que pone el propio `portal/login`) o el rol canónico `cliente`/`sucursal`.
- **`normalizedConsolePath` pela también `/ops`, `/erp` y `/crm`.** Con esto `chat`,
  `dispatch`, `support` y `noc` vuelven a verse en el menú del ingeniero.
- **`ConsoleAccessRules`: `isAdministrativoRole`, `isIngenieroRole`, `isVendedorRole` y
  `consoleBottomTabModuleKeys` pasan por `RolePanelMatrix.canonicalRoleKey()`.** Ningún
  `role.contains(...)` queda en la ruta de decisión de acceso.
- **`ModulePanelMap`: `cvs` y `recruiting` añadidos a `ERP_KEYS`** — RH ve lo suyo.
- **Listas de rol alineadas con `url-matrix.ts`:** al ingeniero se le añaden
  `/support/sla`, `/maintenance`, `/maintenance/contracts`, `/assets`, `/service-clients`,
  `/kb` y `/notifications-center` (unión ING_CAMPO ∪ ING_SOPORTE, que en la app es un solo
  cubo); al vendedor `/chat`, `/notifications-center` y `/clients`.
- **Menú sin duplicados:** `pick()` marca cada clave ya emitida; un módulo sale en el
  primer grupo que lo reclama.
- **`offline-queue` añadido al grupo «Administración interna»** — era la única entrada del
  catálogo sin grupo de menú (solo se llegaba desde «Mi perfil»).

### Pruebas añadidas

No había ni una sobre `PanelAccessResolver` ni sobre `ConsoleAccessRules`, que es justo
donde vivía el defecto. Ahora hay **39** (93 en total en el módulo, 0 fallos):

- `app/src/test/.../access/PanelAccessResolverTest.kt` — **22 pruebas**: RH ve sus paneles
  por `navPanels`, por `roleKey`, por `orgRoleKey` legacy y solo por nombre visible en cinco
  grafías; un interno con rol desconocido nunca acaba en cero paneles; vendedor / ingeniero
  de campo / diseñador / contabilidad no ven paneles ajenos; la API manda sobre el respaldo
  local; la API no puede degradar un interno a portal; alias legacy de panel; permisos como
  respaldo; ruta directa cuando solo hay un panel.
- `app/src/test/.../ui/console/ConsoleAccessRulesTest.kt` — **17 pruebas**: RH ve
  `hr`/`attendance`/`cvs`/`recruiting`/`employee-payments`/`orgchart`/`kpis-hr`/`chat`;
  `chat` y `dispatch` visibles para el ingeniero de campo; `support`/`noc`/`support-sla`/
  `maintenance`/`assets`/`service-clients` para el de soporte; ningún módulo duplicado;
  el ingeniero no ve finanzas ni RH admin y el vendedor no ve operación; el administrativo
  se queda en su lista; un rol sin mapear nunca ve un menú vacío; y tres barridos de
  coherencia (mapa → catálogo, catálogo → panel, catálogo → menú alcanzable) que fallarán
  si alguien vuelve a dejar un módulo huérfano o un menú a la nada.

### Verificación

```
:app:compileDebugKotlin          BUILD SUCCESSFUL
:app:testDebugUnitTest           BUILD SUCCESSFUL — 93 tests, 0 fallos
scripts/check-app-web-parity.py  OK — web paths, matriz y catálogo alineados
                                 (168 rutas web, 116 módulos, 110 con ruta real)
```

### Pendiente — no es de la app (`apps/api`, otro dueño)

- **`me.service.ts:24` lee `profile?.roleKey` crudo**, no `resolveEffectiveRoleKey()`.
  Un usuario cuyo rol canónico viene de `Role.orgRoleKey` (legacy, sin `User.roleKey`)
  recibe `panels: []`, `paths: []` y `moduleKeys` con solo las tres claves semilla. Es la
  causa más probable de que `/me/navigation` no gobierne para usuarios viejos — y por la
  que el respaldo local de `RolePanelMatrix` tiene que existir y ser correcto. El login
  (`auth.service.ts:692`, `mapSessionUser`) sí resuelve bien el `roleKey`, así que la app
  tiene el dato aunque el endpoint de navegación no lo use.
- **`ModuleEntry.permissions` sigue vacío en las 116 entradas del catálogo**, así que el
  `if (module.permissions.isNotEmpty() && ...)` de `ConsoleAccessRules.kt` sigue sin
  ejecutarse nunca. No se rellenó a propósito: `canAccessConsoleModule` termina en
  `return true` y llenar esa lista convertiría el fallo en «módulo invisible», que es
  exactamente el defecto reportado. El gate real vive hoy en las listas por rol; si se
  quiere mover a permisos, hay que hacerlo con la matriz de permisos efectivos delante.
