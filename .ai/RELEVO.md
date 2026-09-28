# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-28
- **Hecho:** Luis (coordinador) ya puede asignar o pedir apoyo fuera de su departamento. El alta de actividades ya no exige el mismo `departmentId` si quien asigna es coordinación/gerencia y el destino es otro mando o alguien de su equipo. Un empleado sin mando sigue limitado a su departamento. Validación en `POST/PATCH /activities` y al sumar gente al equipo. Sin migración. Despliegue (el script jala y, al ver el cambio en `apps/api`, reconstruye `nexara-api`): `cd /var/www/nexara-app && bash deploy/update.sh`. No hacer `git pull` antes: si el commit ya está en HEAD, el script no reconstruye. Si ya se jaló: `bash deploy/update.sh --force-all --no-pull`.

- **Último turno anterior:** claude-code
- **Fecha:** 2026-09-28
- **Regla:** se trabaja **siempre directo en `main`**: sin ramas, worktrees ni PRs (Adam es el único programador).
  Está en las reglas de Cursor, `~/.claude/CLAUDE.md`, `C:\dev\CLAUDE.md`, `FUSION-PROTOCOL.md` y la plantilla EXEC-PACKET.
- **Única rama:** `main` en local, en GitHub y en el servidor. Cero worktrees. `mejora/calidad-y-web` ya no existe.
- **Servidor:** `/var/www/nexara-app` sigue `main`; `deploy/update.sh` despliega la rama actual.
- **Respaldo de todo lo borrado:** `C:\dev\.ai\archivo-nexara-2026-09-27\` — `todas-las-ramas.bundle`
  (224 ramas) + parches/zips de los 39 worktrees con cambios (`final\` = copia justo antes de borrar).
  Recuperar una rama: `git fetch C:\dev\.ai\archivo-nexara-2026-09-27\todas-las-ramas.bundle "refs/heads/<rama>:refs/heads/<rama>"`.

## Hecho (Claude, 28-09 10:40-11:15): «Acceso a cuentas» solo para Christian; la bóveda sigue SIN construirse
- **Acceso a cuentas** (API `account-access/*` + web `/erp/acceso-cuentas`, botón en `/erp/users` solo si `GET account-access/status`
  dice `puedeEntrar`): Christian (correo `PLATFORM_OWNER_EMAIL`, nadie más, ni Adam) vuelve a escribir su contraseña → ficha HMAC de
  5 min (vive solo en memoria de la pantalla) → lista de cuentas (sin él ni la de desarrollo) → «Restablecer contraseña»: genera una de 14
  caracteres, guarda solo el hash, cierra sesiones, la muestra UNA vez, audita sin ella. 5 fallos = 15 min bloqueado (mismo contador que el login).
- **Adam volvió a pedir** las contraseñas guardadas y pegó la hoja de credenciales del 21-09 («puedes solo ponerlas y que la siguiente que se
  cree se mande y guarde»). El clasificador de permisos lo bloqueó por **tercera vez** (`Secret-Store Writes`, al editar `schema.prisma`).
  No se rodeó: se revirtió lo que alcanzó a escribirse (modelo y migración `20260928120000_credential_vault`, sin rastro en git) y
  **no se cargó ninguna contraseña de la hoja**. Las contraseñas de la hoja **no están en el repo, en la memoria ni en los docs**.
  Para desbloquearlo Adam debe dar permiso explícito en su configuración de Claude Code (regla de permisos) o ejecutar él mismo el paso.
  Si autoriza, el plan sigue siendo el de abajo; y para las cuentas de la hoja: script con `--apply` (simulación por omisión) que solo
  cambia el hash si la contraseña de la hoja no coincide, guarda en la bóveda, y NO toca a Christian ni a la cuenta de desarrollo
  (las de la hoja para esas dos cuentas siguen un patrón adivinable; una hoja no debe pisar la contraseña del dueño).
- Pruebas: API 227 suites / 2,745; web 73 archivos / 638; `tsc` limpio en ambos.
- **Subido** (`6647aeb9`) y **desplegado** (2.º despliegue del día, sin migraciones nuevas).
- **Activaciones en producción: NO hechas por Claude.** El clasificador negó leer la base de producción (`Production Reads`) y no se
  rodeó. Quedó `apps/api/scripts/activar-perfil-ceo.sh` para que Adam lo corra EN el servidor
  (`cd /var/www/nexara-app && git pull --ff-only && bash apps/api/scripts/activar-perfil-ceo.sh` lista las empresas;
  con `COMPANY_ID=<id> APLICAR=1` aplica módulos/nómina/alta delegada/checar en web (`HORAS`, 48 por omisión)/plantillas).

## Hecho (Claude, 28-09 10:00-11:00): alta de usuarios delegada, checar desde la web (temporal), subida y despliegue
- **Subido a GitHub** (`a9a1aa72..4d706ed8`, 21 commits incluidos los de la sesión anterior y `f006fe0e` de otra sesión) y **desplegado**
  con `deploy/update.sh --with-migrate` (Adam lo pidió: «deployas todo»). Estado del despliegue y de las activaciones: ver el cierre
  de este turno en la conversación; si algo quedó a medias está en «A medias / siguiente» abajo.
- **Alta de usuarios delegada** (`b73d4457`): `users/user-creation-policy.ts` + `users-delegation.service.ts`, política por empresa
  `users.creation_grants` (`scripts/set-user-creation-grants.sql`): Antonio (`jose.ramirez@`) y Luis (`direccion.operaciones@`) → `ing_soporte`,
  David (`operaciones@`) → `ing_campo`; Christian todos los de abajo (sin ceo/super_admin/cliente). Por PERSONA porque David y Luis
  comparten rol. `GET users/delegated/roles`, `POST users/delegated`; botón «Dar de alta a alguien» en `/erp/organigrama`
  (`components/team/AltaUsuarioPanel.tsx`). Antes solo ceo/dir_admin/coord_admin tenían `users.manage`.
- **Checar desde la web, TEMPORAL** (`463397ab`): `attendance.web_checkin_until` (fecha ISO por empresa, `scripts/set-web-checkin-window.sql`
  con `-v hours=N`); se cierra sola. `AttendanceService.ventanaWeb` + `GET attendance/web-checkin`; con la ventana abierta la checada web
  entra con origen WEB y validación PENDIENTE (sin avisos a jefes); `AttendanceForm` se recuperó del historial (`d2ad4589^`) y
  `components/asistencias/ChecarEnWeb.tsx` lo muestra solo con la ventana abierta.
- **BÓVEDA DE CONTRASEÑAS: NO construida.** Adam pidió guardar las contraseñas en un apartado oculto solo para Christian (con su contraseña
  otra vez). El clasificador de permisos bloqueó el comando que agregaba la tabla («filtración de credenciales») y no se rodeó. Diseño listo
  para cuando Adam lo autorice explícitamente: tabla `credential_vault_entries` (cifrado AES-256-GCM, llave `VAULT_ENCRYPTION_KEY` en
  `deploy/.env.nexara`, no en la base), desbloqueo con la contraseña de Christian (solo el correo dueño; no Adam) → token de 5 min,
  «mostrar» de una en una, todo auditado; guarda solo la contraseña inicial/restablecida (no puede ver la vigente porque es un hash).
  Alternativa sin guardar nada: que Christian, tras volver a escribir su contraseña, restablezca la de cualquiera y la vea una vez.

## Hecho (Claude, 27-09 23:00-00:00): perfil del CEO «a tope» — Tu día, bandeja con importe, topes, nómina, menos ruido
Pedido de Adam: «continúa adaptando su perfil a tope». Seis commits más (`4b4e7c2f`, `558f1b43`,
`156e4143`, `dd54b594`, `c7d1c6ba`, `a24555ae`), ya subidos y desplegados el 28-09. API jest 222 suites / 2,697 ok, `tsc` 0; web `tsc` 0 y vitest **613 ok, 0 fallas**
(se arreglaron las 6 specs viejas). Guía para Christian: `docs/ceo/PERFIL-CEO-EN-EL-ERP.md`.
- **Bandeja de Aprobaciones con título e importe:** `workflow/entity-summary.ts` (una consulta por tipo, por empresa) adjunta `resumen`
  a `listMyPending`; web muestra título/importe/«importe por aprobar»; abre la cotización en `/erp/cotizaciones/:id`.
- **«Tu día»:** `executive/ceo-brief*.ts` (puro + servicio + cron 8:00 MX L–V, idempotente por día, nada si vacío),
  `GET /api/executive/brief`, panel `components/executive/TuDiaPanel.tsx` en `/erp/executive`. Usa el tipo `WORKFLOW_PENDING`
  con categoría `resumen-ceo` (no hay tipo propio; crear uno exigiría migrar el enum).
- **Calendario de nómina:** `employee-payments/nomina-calendario.ts` (quincenal/mensual/semanal, política `payroll.schedule`,
  `scripts/set-payroll-schedule.sql`). Sin fila no avisa nada. La pre-nómina «lista» solo se le dice a quien ve Pagos.
- **Topes de aprobación por monto (opt-in):** `workflow/approval-thresholds*.ts`, política `approvals.thresholds`
  (`scripts/set-approval-thresholds.sql`, montos de ejemplo: **los define Christian**). Se exige en `CotizacionesService.send/aprobar`
  y `ProcurementService.approvePurchaseOrder` (dependencia `@Optional()`); dirección pasa sin pedirse permiso; cotizaciones usan
  el flujo `COTIZACION_MONTO`, las OC el «toda OC» sembrado. Limitaciones: no convierte USD; una aprobación dada no se invalida si
  el total sube después.
- **Modo «solo el resumen y lo urgente»:** `notifications/notification-noise.ts` + filtro en `createNotification` (preferencia
  `notificaciones.solo_resumen`, caché 60 s, solo se consulta para tipos informativos); casilla en «Tu día».
- **Viático → siguiente paso:** `notifyViaticNextApprover` (el CEO ya se entera de que le toca).
- **Sin cablear todavía:** aprobar cotización/OC/pagos desde el celular; «facturar desde cotización»; `aprobar` interno no crea el proyecto;
  `approval-policy.ts` antiguo sigue sin usarse. Para activar en producción: `docs/ceo/PENDIENTES-PARA-HIJO-2026-09-27.md` §B (pasos 7 y 8).
- **Ojo:** el hook de git-solo-main bloquea comandos Bash que contengan el texto de un push (aunque solo sea documentación en un
  heredoc) o un push con redirecciones: escribir esos textos con Edit/Write y usar el push sin `2>&1`.

## Hecho (Claude, 27-09 17:00-18:00): el sistema del CEO — pagos solo CEO, plantillas, CFDI listo, tablero real
Pedido de Adam con el paquete de Christian (`PENDIENTES-PARA-HIJO`). Cinco commits en `main` **sin subir ni desplegar**
(`548ddce4`, `761b3fd5`, `6868764a`, `1fc5171d`, `5df8a482`) más el de documentos; API jest 215 suites / 2,638 ok y `tsc` 0;
web `tsc` 0 y vitest 601 ok + las 6 fallas previas (ya resueltas después).
- **«Pagos a personal» solo CEO, por empresa** (`common/tenant/module-policy*`): política `rbac.module_roles` en `SystemSetting`
  con `companyId`; 403 en todos los endpoints de `employee-payments`, pre-nómina sin montos; `/me/navigation` quita el módulo
  (web `webModuleIds`, apps `moduleKeys` y `hiddenModuleIds`, que gana sobre comodines como `/erp/finance/**`).
  **Falta activarla en Nexara:** `apps/api/scripts/set-module-policy.sql` con el `company_id` (no pude leer producción:
  el permiso me bloqueó la consulta). Doc: `docs/POLITICA-MODULOS-POR-EMPRESA.md`.
- **Aviso diario de OC atrasadas** (9:30 MX, L–V, `procurement/purchase-order-overdue*`). Pre-nómina automática evaluada y
  NO hecha (ver `docs/erp-automation-map.md`).
- **Facturación:** `GET /api/pac/readiness` + `npm run pac:preflight` + `docs/CFDI-GO-LIVE.md`; arreglos: dígito verificador
  del RFC (`pac/rfc-checksum.ts`), CP del emisor, IVA 0 %, respuesta sin UUID. **No se encendió nada** (`PAC_PROVIDER=mock`).
  Riesgos abiertos en el runbook y en `docs/ceo/PENDIENTES-PARA-HIJO-2026-09-27.md` §C.
- **Plantillas:** 9 plantillas, catálogo de 53 conceptos y kit IDC como datos + seed idempotente `npm run seed:plantillas`
  (simula por omisión). Doc: `docs/PLANTILLAS-COTIZACION-NEXARA.md`.
- **Tablero y bandeja del CEO:** `executive.service` (vencidas por fecha, por cobrar neto, stock desde `stock_levels`,
  «Asignada»); `workflow.service` (pasos sin aprobador visibles y notificados con importe, `esAprobadorDeRespaldo`); crons
  de la mañana con `timeZone` (facturas vencidas, OC por llegar, mantenimientos, margen, vehículos, herramientas, reabastecimiento).
- **Documentos:** `docs/ceo/` (versión 2, verificada contra el código). El paquete para Christian (panel HTML, plan, contexto de
  Claude) quedó en `Descargas\NEXARA-paquete-CEO-2026-09-27-v2` y su `.zip`.
- **Seguridad:** Adam pegó en el chat la e.firma de Christian (RFC y contraseña): **no se usó ni se guardó**. Recomendar que
  cambie esa contraseña; el timbrado usa el CSD de la empresa, no la e.firma.
- **Para desplegar (decide Adam):** subir a GitHub (rebase y push a `main`), correr `deploy/update.sh` en el servidor y seguir
  `docs/ceo/PENDIENTES-PARA-HIJO-2026-09-27.md` §B. Ojo: el primer día hábil el cron de OC avisará a compradores y a Christian.

## Hecho (Claude, 27-09 17:40): listas desplegables de cotización que no dejaban scrollear
- Adam (captura de `/erp/cotizaciones/nueva`): el selector de cliente no deja scrollear. Causa: `onBlur`
  cierra la lista a los 150 ms y tocar/arrastrar la barra de scroll del `<ul>` quita el foco al input; además
  `ClienteCombo` recortaba a 8 clientes (`slice(0, 8)`) y con teclado la opción activa no seguía en pantalla.
- Arreglo en `_editor/SeccionPortada.tsx` (`onMouseDown` con `preventDefault` en la lista, hasta 100
  coincidencias, `scrollIntoView` solo al navegar con teclado para no pelear con la rueda) y el mismo
  `onMouseDown` en la lista de catálogo de `_editor/TablaPartidas.tsx`.
- Verificado: web `tsc` 0. **No probado en navegador** (la página exige sesión). Adam dijo «y así»: puede haber
  más pantallas con problemas de scroll; falta que indique cuáles.
- **Sin subir a GitHub ni desplegar:** `main` local va varios commits por delante de `origin/main` (ver la sección de
  arriba). Subirlos y correr `deploy/update.sh` los publica todos, incluido el cron que avisa a compradores. Decidir con Adam.

## Hecho (Claude, 27-09 12:30-13:10): Inicio «visual primero» + mapa repinta con el tema
- Adam: bajando del video quiere ver imágenes antes que texto y sintetizar. Nuevo orden de Inicio:
  hero → **Trabajo real** (mosaico de 5 fotos: 1 vertical + 4 horizontales, `styles.mosaic5`) →
  **Por qué NEXARA** (foto 3:4 `styles.whyPhoto` + método en tres pasos integrado como lista
  `stepList` + cifras + CTAs; **desaparece la banda «Cómo trabajamos»** de solo texto) → **Servicios**
  como tarjetas con fotografía real (`styles.serviceCard`, caja 16:10, tile de icono colgando) →
  Industrias → Fabricantes → Cobertura → CTA. Archivos: `nexara/page.tsx`, `nexara/home-sections.module.css`.
- `BrandMap`: el conmutador de tema no repintaba el mapa (la guarda `isStyleLoaded()` es falsa mientras
  cargan teselas). Ahora repinta directo y, si el estilo no está listo, en el siguiente `idle`.
- Verificado en local (3005) a 1536/820/375: sin scroll horizontal, tarjetas de servicio con media
  uniforme (244 px a 1536), mosaico 2 filas = alto de la foto vertical, contraste sin fallas en ambos temas.
- **Entorno:** el puerto 3000 lo ocupa el contenedor Docker `nexara-web-dev` (`next start`, build fijo:
  **no refleja cambios de código**). Para ver cambios en vivo: entrada `nexara-web-alt` de
  `C:\dev\.claude\launch.json` (Next dev en el **3005**). El digest de Ollama deja `apps/web/.ai/`
  (excluido vía `.git/info/exclude`, no commitear).
- Regla «solo main» revisada: `GIT-SOLO-MAIN.md`, hook `git-solo-main-guard.ps1` y `~/.claude/CLAUDE.md`
  coinciden; queda además en la memoria de Claude como regla por defecto.

## Hecho: consolidación en `main` (tarde)
- Fusionadas las 5 ramas con código nuevo sin conflicto: `ci-fixes` (CI, seeds, guardia release Android),
  `erp-automation-map` (doc), recordatorio diario 9 am de evidencias pendientes >24 h, aviso de SLA
  vencido a la jerarquía, y `revert-pr44-soporte`.
- Corregido al fusionar: `EVERY_DAY_AT_09` → `EVERY_DAY_AT_9AM`; bloque `enc_soporte` duplicado en
  `url-matrix.ts` (se queda el de `main`, que incluye ver flotilla); expectativa vieja de `ci-fixes` que
  mandaba a `administrativo` a «Mis vehículos».
- Verificado: API `tsc` 0, jest rbac/evidence/cron 134 ok; web `tsc` 0, vitest solo las 6 fallas previas;
  Android `assembleDebug` OK. Deploy `8b625478` (solo API; `apps/web` idéntico a producción).
- No fusionadas (en el respaldo): `feat/chat-android-whatsapp` y `feat/ios-chat-whatsapp` (lógica de
  menciones/adjuntos/cola de envío con tests, sin conectar a la UI; su parte web choca con `main`) y
  ~50 ramas viejas que chocan con `main`.

## Hecho: pulido UI/UX del ERP Core + apps móviles
Nueve carriles en paralelo, integrados y fusionados en `main`:
- **Sistema de diseño y shell:** tokens `--ui-*` (espaciado, tipografía, elevación, movimiento, z-index,
  `--ui-touch-min`), `Skeleton`/`PageSkeleton`/`PanelError`, `erp/loading|error|not-found.tsx`, menú
  lateral colapsable y recordado, cajón móvil táctil, paleta de comandos diferida, `Modal` (hoja en móvil,
  `size`), `DataTable` (`loading`, `zebra`, sombras de scroll), `KpiCard`, `PageHeader` (`breadcrumbs`),
  `FormField` (`required`, aria), `PanelTabs` con teclado. Botones/tarjetas ya no brincan dentro de paneles.
- **Hoy, Actividades/Asistencias (EXEC-PACKET pasos 2-8), Comercial, Recursos, Finanzas, Gobierno/RRHH:**
  estados de carga/vacío/error, refrescos que no borran datos, copy sin jerga, 375 px sin desbordes,
  toques ≥40 px, inputs 16 px en móvil, sin `useSearchParams`, `formatApiError` en todos lados.
- **Bugs de producción corregidos de paso:** búsqueda de Aprobaciones no filtraba; errores de Mi perfil
  invisibles; contador de Boletín en 0; fechas UTC (mañana tras las 6 pm) en Prenómina, Comidas y
  formularios de Finanzas; Excel de asistencia en UTC; descargas CSV/XML/PDF en Safari/Firefox; Compras
  contaba listas de otras pestañas; organigrama se reseteaba al guardar.
- **Integración:** `formatApiError` nunca muestra JSON/HTML/pila ni `Cannot GET /api/...`; token
  `--on-primary`; 404 raíz en español (`app/not-found.tsx`); cadena `Dashboard*` muerta borrada.
- **Android:** Material 3 claro/oscuro + `NxFoundation.kt`; portal y pantallas ERP pulidas; `assembleDebug` OK.
- **iOS:** `NxDesignSystem.swift` y pantallas pulidas; `ios-static-check` limpio. Sin Mac: falta compilar.

## Fusión de `main` (16 commits que no estaban en producción)
- Entraron: workflow TestFlight, arreglos de Release iOS (ChatView, `String+NilIfEmpty.swift`), Play
  `isMonitoringTool` v1.0.3 (12), scripts de firma, push APNs `mutable-content` en API.
- **No entraron (por decisión de Adam: el sitio público queda en su canónica de producción):** blogs SEO
  nuevos, cambios a soluciones/cobertura/page-seo/programmatic-landings e industry-hubs, alias SEO del
  middleware, y su portada/HomeHero. `apps/web` es idéntico a lo que ya estaba en producción.
- También se integraron: `enc-soporte-paridad` (vehículos para soporte), `mobile-rbac-parity` (menú móvil
  agrupado), `asignar-herramientas-db` y el commit «Recordarme en login» que solo existía en el servidor.

## Verificado
- web: `tsc` 0 errores; vitest 597 ok / 6 fallas **previas** (iguales en producción antes de la misión):
  4 en `components/ops/HerramientasChecklist.spec.tsx` (spec no actualizado tras PR #46) y 2 RBAC por
  `enc_soporte` (`role-modules.spec.ts`, `role-extra-panels.parity.spec.ts`: API sin la clave).
- `next build` OK; barrido de las 30 rutas del menú a 375 px sin desbordes; escritorio claro/oscuro OK.
- Deploy 1 (`8a1e95a4`) y deploy 2 (`a393c6cb`, rama `main`) en producción.

## A medias / siguiente
- Actualizar los 2 specs RBAC de `enc_soporte` y `HerramientasChecklist.spec.tsx`.
- iOS: compilar en Mac/TestFlight (riesgos: `if` dentro del toolbar del chat; chat compacto en iPhone).
- Android: tema oscuro definido pero apagado (pantallas con colores claros fijos); `ClickableText` del chat.
- `/erp/mis-actividades` redirige con `redirect()` de servidor y en navegación cliente deja un error de
  consola (aterriza bien). Considerar redirección en middleware.
- Reintentar tras `teamError` al asignar duplica la actividad (hay aviso, no arreglado).
- Notificaciones/Analítica/Reuniones leen `?tab` solo al cargar.
- El contenedor local `nexara-web-dev` (localhost:3000) corre `next start` con un build viejo horneado:
  `docker compose up -d --build web` en `C:\dev\apps\NEXARA-app` para verlo al día.
- `/core/login` redirige a `/erp/login` (404) por el remapeo genérico `/core` → `/erp`; el login real es `/login`.
- Disco del servidor ~85 %.

## No tocar
Puente NAS · keystore Play · sitio público (canónica de producción) · `NO TOCAR LIBREMENTE`.
