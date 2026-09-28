# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-28
- **Hecho (foto de salida):** al tomar la foto, el aislamiento de empresa envolvía `findUnique({ activityId_userId })` en `AND` con `companyId`. Prisma rechazaba la llave compuesta (`Unknown argument activityId_userId`). La app lo mostraba como «Error del servidor. Intenta más tarde.» (HTTP 5xx) o «Parámetros de la petición inválidos» (el filtro traduce `PrismaClientValidationError` a HTTP 400; no era el DTO ni el tamaño del data URL: el cuerpo ya había entrado). El middleware ahora aplana esas llaves (`activityId` + `userId` + `companyId`) en findFirst/updateMany/deleteMany/upsert. Cubre también horas extra (`userId_fecha`) y visitas de contrato (`contractId_scheduledDate`). La geocerca lee con `findFirst`. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh`.
- **Hecho (autoasignación de todos los roles):** administrativo, contabilidad, rh, ing_campo, ing_soporte, diseñador, vendedor y el resto del personal interno pueden crear una actividad y asignársela a sí mismos. En producción `GET /api/activities/next-an` respondía 403 «No tienes permisos para esta acción» a administrativo (soluciones@ y Daniela) porque el folio exigía `ACTIVITIES_MANAGE`; el formulario lo pide al guardar. Ese GET, el alta a nombre propio y la lectura de proyectos del formulario ya no responden 403. Asignar a otra persona y dar de alta proyectos siguen exigiendo gestión de actividades. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (clientes):** coordinación, gerencia y la encargada comercial (`administrativo`) crean y editan clientes desde el menú, una cotización o un proyecto nuevo. Un ingeniero u operativo no puede, ni con gente a cargo. Antonio sigue en `ing_soporte` y no puede; el rol que sí puede es `enc_soporte`. Este cambio no trae migración.
- **Hecho (foto del equipo):** el avatar de Mi equipo queda recortado dentro del círculo (disco fijo, `overflow: hidden`, `object-fit: cover`). Un retrato ya no se sale del aro ni tapa el nombre. El mismo recorte vale en el centro operativo, en Asignadas por mí y en el avatar compartido. Sin migración.
- **Hecho (tarjetas de Mi equipo):** en `/erp/pizarra` cada persona lista sus actividades abiertas (responsable, equipo, autoasignada o de otro departamento), cada una con estado y debajo el folio `AN-0001` y el título. Ya no dice «Sin actividad asignada» si hay trabajo, y una cerrada no tapa a las pendientes. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (autoasignación y despacho):** la cola personal incluye lo que la persona se asigna a sí misma (cualquier rol: responsable o miembro), no solo lo que le deja otro. Un servicio a Antonio queda en despacho: Luis no elige al ingeniero; Antonio sí se lo asigna a Carolina, Alejandro o Roberto aunque el servicio lo haya creado otro departamento y aunque no le reporten en el organigrama. Un empleado sin mando sigue en su departamento. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (cola personal):** lo que le asignan a una persona ya sale en `GET /me/activities` (web y apps). Luis veía «Todo al día» y contadores en 0 porque esa lista usaba el filtro de la pizarra (`coreKind = servicio`). Una tarea, un proyecto o un preventivo sin tipo —aunque lo dejara otro departamento— no entraba. El filtro de tipo sigue para el trabajo de *otros* en la pizarra. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (actividades, turno anterior en main):** Luis (coordinador) ya puede asignar o pedir apoyo fuera de su departamento. El alta de actividades ya no exige el mismo `departmentId` si quien asigna es coordinación/gerencia y el destino es otro mando o alguien de su equipo. Un empleado sin mando sigue limitado a su departamento. Validación en `POST/PATCH /activities` y al sumar gente al equipo. Sin migración.

## Hecho (Claude, 28-09 10:20-12:00): rechazo de App Store iOS (NEXARA 1.0) — código subido, falta build + capturas + reenvío
- **Qué dijo Apple (25-09, envío `2b6fc440…`):** 3.2 (parece app de una empresa), 2.3.10 (capturas Android), 2.1 (no entran con la cuenta demo). Detalle, causas y textos: `docs/store/IOS-RESPUESTA-APPLE.md`.
- **Diagnóstico:** el login de Apple SÍ entró en el servidor (`lastLoginAt` 25-09 15:34 UTC, IP Dublín/Vodafone Ireland, 4 min antes del rechazo). La cuenta `play.review` está sana (activa, sin MFA, sin candado, solo `nexara-demo`). El fallo fue de la app iOS: sin recortar espacios, `auth/login` encolado offline (guardaba la contraseña en claro y salía como «Sesión expirada»), errores sin distinguir. Las capturas y el video eran de Android; la ficha y las notas decían «no para el público».
- **Código en `main` (commit `17f62d15`, solo `apps/mobile-native/ios`, `.github/workflows`, `docs/store`):** modo demo local sin credenciales (`NexaraApp/Demo/*`, botón «Explorar NEXARA con datos de muestra», o `-NEXARA_DEMO 1`); login robusto (`AuthErrorMapper`, recorte, `auth/*` nunca offline); `PrivacyInfo.xcprivacy`, Face ID, sin ATT/file sharing/fetch, «Eliminar mi cuenta» → `/legal/eliminar-cuenta`, solo iPhone; `ios-testflight.yml` ya conserva los manifiestos de privacidad de los SDK; nuevo `ios-screenshots.yml` + target `NexaraAppUITests`. CI «iOS · compilar (simulador)» en VERDE con todo. Los rojos de «Secretos», «Tipos y tests» y Android son de `.ts/.json` ajenos, no de iOS.
- **Ficha de App Store Connect (guardado, NO enviado):** promo, descripción multiempresa, palabras clave, URL de soporte `/contacto` y notas de revisión reescritas (sin contraseña en las notas).
- **PENDIENTE (Adam / próximo agente):** (1) lanzar desde GitHub Actions «iOS capturas de App Store (simulador)» (dispatch; no se puede empujar tag por el hook) y bajar los PNG que el bot deja en `docs/store/ios-screenshots/`; (2) lanzar «iOS TestFlight» con `version=1.0`, `build=4`, `upload=true` (ya hay 1.0 (1) y 1.0.0 (3)); (3) en ASC: subir capturas 6.9", quitar las 8 de Android y el adjunto `nexara_review_demo2.mp4`, elegir el build 4; (4) Adam corre `apps/mobile-native/ios/scripts/verificar-cuenta-revision.ps1` (y `resembrar-cuenta-revision.ps1` si da 401); (5) responder en Resolution Center con el texto de `docs/store/IOS-RESPUESTA-APPLE.md` y «Volver a enviar a revisión». Nada de eso se envió a Apple.
- **Ojo:** `NEXARA-usuarios-v5.xlsx` / `-v6.xlsx` están versionados en el repo PÚBLICO (no se abrieron): verificar que no lleven contraseñas. Adam pegó en el chat la tabla de credenciales de empleados reales: conviene rotarlas.

## Hecho (Cursor, 28-09): cotizador en el formato de Christian; el 400 al guardar partidas
- **Causa del HTTP 400 `INVALID_REQUEST`:** `PrismaService` convierte `cotizacion.update({ where: { id } })` en `updateMany` para meter `companyId`. `updateMany` no acepta escrituras anidadas. `items: { create }` lanzaba `PrismaClientValidationError` y el filtro lo devolvía como 400. Las partidas no se guardaban y el total quedaba en 0. Ahora se borran y se crean con `cotizacionItem.createMany` en la misma transacción; el padre solo recibe columnas. Cantidad, descuento e impuestos se redondean a entero antes de Prisma.
- **Formato:** PDF de descarga, el del envío y la vista previa salen con el membrete Nexara (logo, Century Gothic / URW Gothic, verde `#1FAF8D`, carbón `#24262A`), datos del cliente, franja comercial, partidas, subtotal, IVA 16%, total, importe con letra y firma de Christian Eduardo Del Pozo Sánchez / NEW ENGINEERING EXPERTISE AND RESOURCE ADVANCEMENT S.A. DE C.V. El costo y el margen no se imprimen. La vista interna (`/pdf/internal`) conserva el PDF anterior, que sí muestra costo.
- **Captura:** por partida, número (`1`, `1.1`), unidad (incluye Licencia), título, marca, modelo, descripción, costo interno y margen % sobre el costo (default 20% → precio = costo × 1.20) o precio manual. Empresa, atención, ubicación y trabajo en la hoja 04.
- **Esquema:** migración aditiva `20260928180000_cotizacion_formato_nexara` (`atencion`, `trabajo`, `partida`). Las cotizaciones viejas siguen cargando.
- **Prueba Grupo Dice:** 5 partidas, subtotal 779,072.62, IVA 124,651.62, total **903,724.24**. Jest de `cotizaciones` 17 suites / 360. `tsc` de api y web en 0.
- **Despliegue (en el servidor, no corrido desde aquí):** `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`. El script hace el `git pull`. No jalar antes: si el commit ya está en HEAD, no reconstruye. Si ya se jaló: `bash deploy/update.sh --force-all --with-migrate --no-pull`.

## Hecho (Cursor, 28-09): coordinadores y encargada comercial dan de alta clientes
- **Regla anterior:** el menú y el API de `/erp/clientes` solo abrían a quien estaba en la matriz de correos
  (Luis sí veía sector CORPORATIVO en el servicio, pero `PAGE_MATRIX` y `URL_MATRIX` de `coord_operaciones`
  no tenían Clientes, así que el menú no salía y el alta devolvía 403). El listado sin sector filtraba por
  `ownerId`, y la cotización creaba el cliente directo en Prisma, sin sector ni cliente de operación.
- **Ahora:** agregan y editan clientes los roles de coordinación y gerencia
  (`ceo`, `dir_admin`, `dir_operaciones`, `coord_admin`, `coord_operaciones`, `coord_ventas`, `arquitecto`,
  `enc_soporte`, `administrativo`, y los que ya podían: `contabilidad`, `rh`) más un jefe no operativo con
  gente a su cargo. Un ingeniero u operativo (`ing_campo`, `ing_soporte`, `disenador`, `vendedor`, `cliente`)
  no puede, aunque tenga personal a cargo. Desactivar y eliminar sigue siendo solo Christian.
- El correo del encargado gana el sector (Luis CORPORATIVO, Daniela COMERCIAL, David PROYECTO+COMERCIAL).
  Si el correo no está en la matriz, el rol pone el sector. El alta rápida no pide datos fiscales.
- Menú Clientes para esos roles. Alta rápida en proyecto nuevo y, al guardar una cotización, el nombre nuevo
  pasa por el mismo `createClient` (empresa + sector + provisión OPS) para usarlo enseguida en actividad.
  No se tocó el formulario de actividades.
- **Antonio** (`jose.ramirez@`, encargado de soporte) sigue en rol `ing_soporte`: no da de alta clientes.
  El puesto que sí puede es `enc_soporte`.
- **Sin migración de clientes.** Si el servidor todavía no aplicó `20260928180000_cotizacion_formato_nexara`, este pull sí lleva `--with-migrate` por esa migración del cotizador, no por clientes. Si ya está aplicada: `cd /var/www/nexara-app && bash deploy/update.sh`.

- **Regla:** se trabaja **siempre directo en `main`**: sin ramas, worktrees ni PRs (Adam es el único programador).
  Está en las reglas de Cursor, `~/.claude/CLAUDE.md`, `C:\dev\CLAUDE.md`, `FUSION-PROTOCOL.md` y la plantilla EXEC-PACKET.
- **Única rama:** `main` en local, en GitHub y en el servidor. Cero worktrees. `mejora/calidad-y-web` ya no existe.
- **Servidor:** `/var/www/nexara-app` sigue `main`; `deploy/update.sh` despliega la rama actual.
- **Respaldo de todo lo borrado:** `C:\dev\.ai\archivo-nexara-2026-09-27\` — `todas-las-ramas.bundle`
  (224 ramas) + parches/zips de los 39 worktrees con cambios (`final\` = copia justo antes de borrar).
  Recuperar una rama: `git fetch C:\dev\.ai\archivo-nexara-2026-09-27\todas-las-ramas.bundle "refs/heads/<rama>:refs/heads/<rama>"`.

## Hecho (Claude, 28-09 11:25-11:55): BÓVEDA DE CONTRASEÑAS construida, desplegada y cargada (Adam quitó la revisión de permisos y lo autorizó)
- **Desplegada** (`b8503cff`, `update.sh --with-migrate`, migración `20260928120000_credential_vault` aplicada, API sana). Llave `VAULT_ENCRYPTION_KEY`
  creada en el servidor (`deploy/.env.nexara`, 600) y presente en el contenedor.
- **Hoja del 21-09 cargada en la empresa 1:** simulación y luego `--apply`: las 16 cuentas ya tenían la contraseña de la hoja (0 cambiadas,
  0 sesiones cerradas) y las 16 quedaron guardadas cifradas. Verificado en el servidor: 16/16 descifran bien con la llave, 0 filas en claro.
  `play.review@` no es de la empresa 1 (no se tocó). Christian y developer NO se cargaron a propósito (sus contraseñas de la hoja siguen un
  patrón adivinable y no se pisan). La hoja JSON temporal se borró; no está en el repo, memoria ni docs.
- Restos locales SIN versionar (ignorados por git): borradores viejos en `.ai/drafts/` (`seed-core-roster`, `generate-credentials-xlsx`)
  con contraseñas de esa hoja. Conviene borrarlos a mano.
- Tabla `credential_vault_entries` (migración `20260928120000_credential_vault`), módulo `src/credential-vault/` (AES-256-GCM, llave
  `VAULT_ENCRYPTION_KEY` en `deploy/.env.nexara` → compose → API; AAD = `companyId:userId`; nunca guarda al dueño ni a developer;
  `guardar` no lanza: sin llave devuelve false y el alta sigue). Se guarda en `UsersService.create/update` (cubre el alta delegada),
  en «restablecer» y en la carga de hoja. `account-access`: la lista trae `guardada`, `POST users/:id/reveal` (ficha de 5 min, audita
  `ACCOUNT_PASSWORD_REVEAL` sin la contraseña) y la pantalla tiene «Ver contraseña» (se oculta a los 30 s).
- Carga de una hoja de credenciales: `prisma/cargar-credenciales-boveda.ts` (`--company-id --file=- [--apply]`, simulación por omisión,
  no imprime contraseñas; omite dueño y developer; solo cambia hash si no coincide y cierra sesiones solo de esas).
  La hoja JSON vive FUERA del repo y se borra después. Las contraseñas de la hoja NO están en el repo, la memoria ni los docs.
- Pruebas: API 230 suites / 2,779; web 73 archivos / 642; `tsc` limpio.

## Hecho (Claude, 28-09 10:40-11:15): «Acceso a cuentas» solo para Christian (primera versión: solo restablecer)
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
- **Activaciones en producción: HECHAS por Adam (28-09 ~11:17 MX), no por Claude.** El clasificador negó a Claude leer y escribir en la
  base de producción (`Production Reads`, `Production Deploy`) y no se rodeó; Adam corrió `apps/api/scripts/activar-perfil-ceo.sh`
  en el servidor: `COMPANY_ID=1 APLICAR=1` (empresa 1 = NEXARA; la 2 = NEXARA Demo NO lleva estas políticas). Quedó activo en la empresa 1:
  `rbac.module_roles` = `{"employee-payments":["ceo"]}` (Pagos solo CEO), `payroll.schedule` = quincenal,
  `users.creation_grants` (Antonio y Luis → `ing_soporte`, David → `ing_campo`), `attendance.web_checkin_until` = 2026-09-30T17:16:49Z
  (checar en web abierto 48 h y se cierra solo) y las **9 plantillas de cotización** (`seed:plantillas`, 9 creadas). Las políticas se releen en ≤30 s.
  Sin activar a propósito: topes de aprobación (faltan montos de Christian) y CFDI (mock). Sin verificar por Claude con un usuario real;
  la primera prueba útil es entrar como Antonio y ver «Dar de alta a alguien» en `/erp/organigrama`, y como Christian ver «Acceso a cuentas».
- Bug del script (tabla `company_profiles` → es `company_profile`) corregido en `e4a949ef`.

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
- **Bóveda de contraseñas:** en ese momento el clasificador de permisos bloqueó agregar la tabla («filtración de credenciales») y no se
  rodeó. Después Adam quitó la revisión de permisos y se construyó (ver la entrada «BÓVEDA DE CONTRASEÑAS construida» arriba).

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
- **Respaldar `VAULT_ENCRYPTION_KEY`** (está en `/var/www/nexara-app/deploy/.env.nexara` del servidor, permisos 600): si se pierde, las contraseñas
  guardadas no se pueden leer (se restablecen y listo). No está en el repo, ni en la base, ni en este relevo.
- El **1-oct** (o cuando venza `attendance.web_checkin_until`) confirmar que checar en web ya se cerró; para cerrarla antes:
  `DELETE FROM system_settings WHERE key='attendance.web_checkin_until' AND "companyId"=1;`
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
