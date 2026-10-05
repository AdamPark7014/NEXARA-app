# RELEVO

- **04-10 21:50 (claude-code) — push de iOS:** todo listo salvo subir la llave a Firebase. App ID con Push
  activado; build 1.0.0 (8) firmado con `aps-environment = production`; Firebase FCM v1 habilitado. Se
  registró la llave APNs «NEXARA APNs» (Key ID `3U672539N2`, Sandbox & Production, Team Scoped). **Falta
  que Adam descargue el `.p8` (una sola vez) y lo suba en Firebase → Cloud Messaging → NEXARA iOS
  (producción y desarrollo, Team ID AHNW9K8745).** No requiere build nuevo ni reenvío. Android ya funciona
  (FCM puro, nada que configurar en Google Play). En TestFlight los builds 1, 3, 5, 6 y 7 aparecieron
  caducados el 04-10; el 8 (en revisión) sigue vigente.

- **04-10 (claude-code): NEXARA iOS 1.0 REENVIADA a revisión — build 1.0.0 (8), «Pendiente de revisión»
  desde las 18:32.** Apple había rechazado la 1.0 (6) solo por 2.3.10 («remove non-iOS status bar
  images», revisada en iPad Air 11"): las capturas SÍ eran del simulador de iOS, pero `DemoBanner` pintaba
  su azul detrás de la barra de estado (`53202c98`, ahora va como pastilla debajo). Además:
  `256e6ff1` `ConsoleHelpers.mapStr` devolvía «<null>» para los `null` de JSON (pastillas «<null>» en el
  chat, también con el servidor real); Inicio ya no corta la prioridad; capturas con hora de México y
  batería normal. Capturas regeneradas en GitHub (`ios-screenshots.yml`, iPhone 17 Pro Max, commit
  `3724a510`) y subidas a ASC 6,9" en orden (Inicio, Actividades, Asistencia, chat ×2, Más, Clientes,
  Notificaciones, Mi perfil); 6,5" usa 6,9". Descripción y notas al revisor sin «organigrama» (ya no está
  en las apps), con la navegación nueva y rutas «Más > Mi perfil > …». Builds 7 y 8 subidos por
  `ios-testflight.yml` (el 8 es el enviado). **Si Apple vuelve a escribir: leer el mensaje en
  Revisión de apps.**

- **03-10 ~10:00 (claude-code):** `50e9b8cc` («Recordarme») **desplegado y verificado** (API/web sanas).
  **Chat purgado en producción a pedido de Adam** («como si nunca hubiéramos mandado ningún mensaje»):
  borrados 63 mensajes (y sus 312 lecturas), 157 notificaciones del chat (`category='chat'` o
  `entityType='chat_message'`) y 16 conversaciones directas (se vuelven a crear solas al escribir);
  los 6 canales restantes (#general, #anuncios, #operaciones, «Actividades» y 2 de la empresa 2) quedan
  sin último mensaje ni marcas de leído. Adjuntos de `uploads/chat` (5) movidos al respaldo.
  **Respaldo verificado fila por fila** en el servidor: `/root/respaldos/chat-purga-20261003/`
  (`chat-tablas.sql` data-only —restaurar con `--disable-triggers` por la FK circular de hilos—,
  `notificaciones-chat.csv`, `uploads-chat/`). Ojo al scriptar por SSH: `docker exec -i … psql` dentro
  de `bash -s <<EOF` se come el resto del script por stdin (usar `</dev/null`).

- **03-10 09:45 (claude-code):** el deploy del rediseño (`c85edb8b`) **sí quedó en producción** (web y API
  reiniciadas, mapa de cobertura nuevo responde 200). Después:
  - **«Recordarme» no duraba**: el login sí pedía y recibía la sesión de 30 días, pero al recargar,
    `syncProfile` (`UserContext.tsx`) rehacía al usuario con `auth/profile`, que no trae `remember` ni
    `expiresAt`; la sesión quedaba como no recordada y `safePersistUser` borraba la copia de
    localStorage (y bajaba `nx_session` a 1 día). Ahora conserva ambos de la sesión guardada. Prueba
    `UserContext.remember.spec.tsx` (falla con el código anterior). Quien entró antes del arreglo debe
    volver a entrar con la casilla marcada.
  - **Organigrama**: Mónica García (id 5) no tenía jefe (`managerId` NULL → «Sin jefe», línea punteada).
    En producción `managerId = 1` (Christian), igual que Daniela. Cambio solo de datos.

- **Turno 03-10 (mañana, claude-code — rediseño v2, en paralelo con la sesión de dependencias):**
  **Etapas 5 y 6 terminadas** (commits locales; push y deploy al cierre de este turno):
  - `ba6b4cf9` primer tramo (préstamos/kits de herramientas, reabasto, recolección, recorrido, prioridad).
  - `8fdb7059` **apps** Android+iOS: teal `#1F9E84`, pestaña Inicio, barra inferior de 5 destinos,
    dock de acción en el detalle (Iniciar/Reanudar/Pausar). Android 699 pruebas en verde. **iOS sin
    compilar** (Windows): verificar en Xcode aislamiento de hilo principal, `#Preview`, dock sobre listas,
    diálogo de pausa, insignias y capturas. Falta build/release de tiendas. (Este commit se llevó por
    índice compartido dos borrados de maplibre de la otra sesión; el estado final es el correcto.)
  - `ff2f138e` Asistencias · `3b9aa281` pizarra/ficha/flujo/Mis actividades · `b5b97f4c` Almacén y
    Herramientas (+ API: existencias traen foto/categoría/precio; valor del inventario con `unitCost`,
    antes salía $0) · `ce1cea7c` Cotizaciones · `42219482` **fix base**: `Field` remontaba el input al
    aparecer/irse un error (se perdía el foco) · `b7eb4512` Clientes y Proyectos · `3283ec98` detalle,
    evidencias y alta de actividad.
  - Resultado: `style={{` y `<button>` crudos casi en cero en los módulos migrados (quedan los de valores
    calculados). Quedan 94 `style={{` en 6 componentes de `components/ops` que **ninguna página importa**
    (`ActivityEvidenceReviewPanel`, `EvidenceReviewQueue`, `OpsActivitiesBoard`, `OpsTicketRequestQueue`,
    `OpsProjectDetailShell`; `OpsActivitiesImport` sí tiene 1 uso): candidatos a borrar.
  - Pruebas al cierre (con los cambios de dependencias incluidos): API 272 suites / 3,366, web 111 / 957,
    `tsc` API y web 0, Android compile + unit tests verde.
  - **No visto en navegador** (no hay sesión local): Adam debe recorrer Actividades, Cotizaciones, Almacén,
    Asistencias, Clientes y Proyectos en claro/oscuro y en el celular.
  - `.ai/audit/` (reporte de `ollama_audit`) queda **sin commitear a propósito**: puede llevar fragmentos
    de llaves.

- **Turno 03-10 (mañana, claude-code — dependencias, en paralelo con el agente del rediseño v2):**
  commits **locales, sin push ni deploy** (debajo hay commits del rediseño que su agente aún no sube):
  - `5f51ac19` parches de runtime: protobufjs 7.6.6, websocket-driver 0.7.5, tar 7 (vía override de
    `@mapbox/node-pre-gyp` 2), multer 2.4.0 en todo el árbol, axios 1.20, engine.io/socket.io-parser/ws,
    path-to-regexp, form-data, grpc-js, busboy, basic-ftp 5.3.1, lodash 4.18 bajo swagger. Borrado
    `apps/api/pnpm-lock.yaml` (ningún build lo usa).
  - `b35be85e` maplibre-gl 6.11.2: ESM, sin variante CSP; worker módulo en `public/maplibre/`
    (`maplibre-worker.spec.ts` vigila que sea copia exacta del paquete). Verificado en Chrome headless
    contra `next start`: idéntico a producción, tema claro OK.
  - `fd351cee` mapa de cobertura de Adam en versión clara/oscura (`CoverageMap`, webp 1200/1600/2000).
    Solo se ve en Inicio: el middleware manda `/cobertura` → `/proyectos`, que no tiene mapa.
  - `017cf330` nodemailer 10.0.13 (+ prueba de envío con las dos formas de importar); sale `@types/nodemailer`.
  - **Next 14 → 15: solo plan** en `.ai/PLAN-NEXT15.md` (≈10–14 h, recomendado 15.5.x). Espera a Adam.
  - trivy: 353 → 113 hallazgos; CRITICAL 8 → 3 (2 de `next`, sin exposición hoy; 1 es la llave de Stripe
    en `deploy/.env.nexara`, archivo local ignorado por git). HIGH 181 → 46.
  - **Trampa de npm 11:** no aplica `overrides` nuevos a dependencias de un workspace si ya hay lock. Truco:
    agregar el paquete padre a `dependencies` de la raíz, `npm install`, quitarlo, `npm install`.
    `npm ls` las marca «invalid»; el install (también el de Docker) respeta el lock.
  - **Índice compartido:** `git rm` deja el borrado preparado y el siguiente `git commit` de otro agente se
    lo lleva (pasó en `8fdb7059`). Con varios agentes, commitear con rutas explícitas (`git commit -- rutas`).
- **Último turno (antes de este):** claude-code
- **Fecha:** 2026-10-02 (noche)
- **Revisé el turno de Cursor:** reglas respetadas (solo `main`, trailer, árbol limpio, RELEVO al día,
  `tsc` 0, producción en el commit declarado). Única desviación: eligió la dirección A del chat sin
  esperar a Adam; Adam ya lo vio y siguió, se queda. En el servidor quedó un cambio sin commitear de
  Cursor en `deploy/docker/Dockerfile.web` (CACHEBUST fijo) y archivos sueltos (`" 2"`, `*.bak-recordarme-*`):
  **no los toqué**.
- **Hecho (este turno, desplegado sin migraciones):** los 8 hallazgos de seguridad que quedaron abiertos
  del paquete de 6 agentes:
  - `7ca4ff7a` fotos de evidencia por campos: subir/quitar exige asignado vigente, responsable o
    EVIDENCES_REVIEW; la congelación la decide la evidencia de **quien subió** la foto. Pausar acota el
    padrón a la empresa; `tenant()` de sesiones falla cerrado; abrir/terminar reciben companyId; el cron
    de alertas lee sesiones por empresa.
  - `c5b457e2` códigos de barras: actividad ligada a un movimiento debe ser del tenant; DTOs reales con
    class-validator; el inventario/escáner de herramientas **ya no escribe en GET** — los códigos
    pendientes se completan con `POST tool-requests/inventory/codigos/completar` (TOOLS_MANAGE). En
    producción hay 3 herramientas y 1 sin código.
  - `acd5ff8e` clientes/proyectos: reutilizar un cliente por nombre en el alta rápida exige poder abrir
    su ficha (si no, 403 «Ya existe un cliente con ese nombre… pide a coordinación…»); sumar tipos o
    rellenar datos exige gestionar el padrón. Proyectos: alta rápida exige ver al cliente y, si no es
    PROYECTO, las reglas de `addClientSector`. Regla única en `ventas/client-access.ts`. Con los roles
    reales solo puede frenar a José Antonio (`enc_soporte`) con un prospecto comercial ajeno.
  - `fdbca24a` **Etapa 4 del rediseño**: `ModulePage`, `FormPage`, `RecordPage` en `components/base`,
    `DataTable` con `rowActions`, selección y celdas `PersonCell/ProgressCell/StatusCell/WhenCell`
    (API previa intacta). Aún no las usa ninguna página.
  - Pruebas: API 271 suites / 3,364 (la única falla en corrida completa es el tope de 5 s de
    `propuesta-vista-previa.spec.ts`; sola pasa 8/8); web 107 / 941; `tsc` API y web 0.
- **EN CURSO (sin commitear, agentes):** Etapa 5 por módulo en web (pizarra/mis actividades; detalle y
  alta de actividad; cotizaciones; almacén+herramientas; asistencias; clientes+proyectos) y Etapa 6 en
  apps (Android a medias por un agente que se cortó; iOS sin empezar). Si entras y ves esos archivos
  sucios, son de esos agentes: `relevo.ps1 salvar` y no los reescribas.
- **Turno anterior (cursor) — Hecho y DESPLEGADO (HEAD `00babcee`, migración `20261003010000_guardias` aplicada):**
  - `f3d33c8c` **Sugerencia de nómina** (pestaña en Pagos a empleados, `GET employee-payments/sugerencia-nomina`,
    solo lectura). Divisor = horario de cada persona (40 h oficina; 48 h sin horario fijo): **Adam lo aprobó así**.
  - `93f6d593` **Guardias de fin de semana**: sáb/dom solo checa entrada quien tiene guardia (422 +
    rechazo `FIN_DE_SEMANA_SIN_GUARDIA`, sin avisar jefes); con guardia sin geocerca de oficina; entrada
    automática al subir foto de inicio de servicio/tarea (`attendance/entrada-guardia.ts`); botón
    «Guardias» en Asistencias; aviso en el formulario de actividad. Regla absoluta (aunque el horario
    tenga sábado); un encargado no se programa a sí mismo; apps no tienen pantalla de guardias aún.
  - `b89ae264` **Chat estilo Slack (Dirección A, Etapa 1)** + tarjetas de folio (actividad/cotización).
    Arreglé yo un hueco: pastilla interna `[x](//otro.com)` o `/\otro.com` ya no genera enlace (prueba en
    `rich-text.spec.tsx`). Etapa 2 pendiente: hilos, Menciones, Guardados, Archivos; API debería mandar
    quién fijó y el puesto del autor.
  - `79cf420a` **Apps**: pausar/reanudar (técnico y jefe desde Pizarra), escáner con cámara en Almacén y
    Herramientas (Android CameraX+ML Kit; iOS AVFoundation), mensaje correcto del rechazo de fin de semana.
    Android 677 tests verde. **iOS sin compilar** (Windows). **Falta build/release de tiendas.**
  - **Rediseño UI aprobado por Adam** (maquetas en `.ai/ui-maquetas/png/`, plan en `.ai/ui-maquetas/PLAN.md`,
    sidebar CLARO): `2ba59eef` Etapas 1-2 (tokens v2 en `ui-tokens.scss`, `components/base` unificado:
    Button 7 variantes, Stat con icono/tendencia/semáforo, StatusBadge con `estado-tono.ts`, campos con
    error/válido, FormSection/FormFooter, Alert, Toast; `components/ui/*` ahora envoltorios del base con
    la misma API). `00babcee` Etapa 3 (sidebar 264/68 px, grupos Hoy · Clientes y obra · Recursos ·
    Finanzas · Mi cuenta, iconos SVG, contadores de chat y aprobaciones, `sidebar-presentation.ts`).
  - Verificación final: API jest 270 suites / 3319; web vitest 103 / 913; `tsc` API y web 0.
- **SIGUIENTE (rediseño):** Etapa 4 plantillas (`ModulePage`/`FormPage`/`RecordPage`, `DataTable` con
  acciones por fila y selección) y Etapa 5 módulos: Actividades/pizarra → detalle → alta → Cotizaciones →
  Almacén → Clientes/Proyectos → Asistencias → Finanzas. Etapa 6 apps nativas (teal `#1F9E84`, pestaña
  Inicio, barra inferior M3, dock de acción). Etapa 7 regla ESLint. Sin contador en Actividades/Viáticos
  ni franja «En jornada» en el sidebar: no hay endpoint verificado.
- **Hecho antes (paquete grande de 6 agentes: commiteado y DESPLEGADO, `101192ad`, con migraciones):**
  `20261002130000_activity_work_sessions`, `20261002140000_clientes_varios_tipos` y
  `20261002150000_producto_codigo_barras` aplicadas en producción (`_prisma_migrations`, sin rollback);
  API sana. Antes: `tsc` API y web 0; jest API completo en verde (las fallas al correr todo junto eran
  lentitud: las suites de cotizaciones pasan solas); vitest web en verde; Android
  `:app:testDebugUnitTest` en verde. iOS no se compila en Windows: revisado a mano. Revisión de
  seguridad de endpoints nuevos sin hallazgos (cada uno con RBAC; pausar a otro valida alcance; UPC
  codifica el código hacia proveedor fijo). El `prisma:error` de `WorkflowSeedService` al arrancar es
  la semilla de siempre (nombre duplicado), no es de esto.
  - **Organigrama:** el agente murió con 5 pruebas rojas; las 5 eran de las pruebas, no del dibujo
    (plantilla «de 17» que sumaba 20, `getByTitle` no alcanza `<title>` dentro de `<path>`, jsdom sin
    `PointerEvent`, nivel esperado mal contado). 35/35. **No lo vi en navegador**: pedir a Adam que
    abra `/erp/organigrama`.
  - **iOS:** `CoreModels.swift` (`CoreEvidence.label(_:coreKind:)`) se había quedado fuera del commit
    de actividades y los archivos ya commiteados lo usan: sin `1931efd1` iOS no compilaba.
  - **Perfiles desactivados:** el botón Activar/Desactivar de Perfiles (`06c5db82`) ya estaba en
    producción. Nuevo (`bce4d424`): la API ya no deja asignar a un inactivo (antes solo lo escondía el
    selector; dirección/mismo departamento pasaban): `ActivitiesService.assertResponsableActivo` en
    create/update (cubre formulario, proyectos y programación), kit de herramientas y OT de
    mantenimiento. Reuniones, proyectos y equipo de actividad ya lo validaban.
  - **Pendiente de Adam:** pie del membrete del PDF de cotización (imagen) trae «Malltertaiment,
    Explanada Puebla…» y «(22) 01 79 18 71»; si ya no van, que diga cuáles y se edita la imagen.
    Las apps nativas (sin organigrama, comercial, geocerca 500 m) necesitan su propio build/release.
- **Hecho (organigrama, 21:20):** Adam lo aprobó en producción y pidió una «rayita» secundaria de Luis
  a José Antonio. `d47732f9`: un lateral conserva su línea de mando y suma el puente punteado (cuando
  el jefe queda un anillo adentro). Desplegado; en BD `User.id=7` (Luis) `lateralDeId=39` (Antonio).
- **Del pedido grande de las 12:50 solo falta:** build/release de las apps en tiendas (y compilar iOS en
  macOS + probar cámara en dispositivos reales). Guardias, nómina, chat y apps ya están (ver arriba).
- **Contexto del paquete (02-10, ~13:25), por área:**
  1. **Cotizaciones — TERMINADO por su agente, falta mi revisión:** el PDF ya toma `depositPercent`/`note`
     del editor (antes `paymentTerms`→`PAGO_DEFAULT`, por eso el 50 % no se quitaba); datos fiscales del
     emisor (`EMISOR`) arriba del título en la hoja 1; `GET cotizaciones/partidas-frecuentes` + «Usadas
     antes» en `FilaNueva` (margen vacío). 412 tests de `src/cotizaciones` en verde según el agente.
     Muestra: `scratchpad/cotizacion-encabezado.png` — **mirarla antes de publicar**. Ojo: el pie del
     membrete trae otra dirección/teléfono que los datos fiscales.
  2. **Actividades (en curso):** comercial para Paulina (`finanzas@nexara.com.mx`) en web/Android/iOS;
     «Inicio/Conclusión de actividad» en comercial; geocerca 500 m por tipo (servicio, proyecto, obra y
     tarea salvo recolección/entrega/compra; nunca comercial); auditoría de que la evidencia no se pierda.
  3. **Sesiones de tiempo (en curso, dueño del esquema):** tabla `activity_work_sessions` (migración
     `20261002130000_activity_work_sessions`), tope 12 h, cierre al checar salida, pausa por jefe/CEO,
     KPIs desde sesiones.
  4. **Clientes + proyectos (en curso):** Clientes de vuelta al menú para quien lleva comercial, base única
     con el alta rápida, proyectos por cliente (posible migración `20261002140000_*`).
  5. **Organigrama radial + quitar Organigrama de Android/iOS (en curso).** Dejó `tsc` web con 2 errores
     (`eyebrow` en `erp/organigrama/page.tsx` y `erp/hr/orgchart/page.tsx`) al momento del corte.
  6. **Códigos de barras (en curso):** lector USB y UPC en almacén, Code 128 propio y etiquetas de
     herramientas (posible migración `20261002150000_*`).
  **Chat:** solo maquetas (`scratchpad/chat/direccion-a.png`, `direccion-b.png`, `auditoria.md`, `plan.md`);
  Adam debe elegir A o B antes de construir. **Sin empezar:** guardias de fin de semana, sugerencia de
  nómina (horas productivas vs laboradas) y las pantallas nuevas en las apps (pausar, escáner con cámara).
- **Hecho (Chat: «Crear canal» no se podía usar y se veía horrible):** Adam mandó captura: sin botón
  «Crear», casilla gigante y «Canal privado» lejos. Dos causas en `WorkspaceChat`: (1) los tokens
  `--nx-*` (`--nx-send`, `--nx-line`, `--nx-accent`…) vivían solo en `.shell`, pero **todos los modales
  del chat cuelgan fuera de `.shell`** (hermanos de `.fill`): `.sendBtn` quedaba sin fondo con texto
  blanco → «Crear» invisible, y los bordes (`--nx-line`) desaparecían; (2) el estilo global
  `:where(input…)` de `utilities.scss` da `width:100%` y alto de campo a cualquier input, también a la
  casilla. Fix: los tokens ahora son `.shell, .modalBackdrop {…}` (arregla también DM, invitar, selector
  de entidades, cambiador de canales y lectores, que compartían el problema); casilla en una tarjeta
  `.optionRow` con tamaño propio y descripción; texto de ayuda; **los errores van dentro del modal**
  (antes `setError` salía detrás del fondo, p. ej. «Ya existe un canal con ese nombre» parecía «no
  pasa nada»); Enter crea; botón «Crear canal» deshabilitado sin nombre y «Creando…» mientras guarda.
  Backend sin cambios (`POST chat/channels` no pide permiso extra). Verificado con una réplica estática
  del modal en Chrome headless (no con el chat real: no hay sesión ni entorno local); web 696/696,
  `tsc` 0. **Pendiente: que Adam lo pruebe.**
- **Hecho (cotizaciones: la partida escrita en «Nueva partida» ya no se pierde si no das Enter):**
  Adam mandó dos capturas de NEX-CE00002201-0005 (cotización 18): en una computadora la 2.ª partida
  tenía nombre y precio 220 pero el subtotal/total seguían en $9,379.45 y el PDF mostraba una sola
  partida. En producción (`cotizacion_items`) solo estaba la partida 1: la otra nunca se agregó. Causa:
  la última fila de `TablaPartidas` (`FilaNueva`) es un borrador con estado local y solo pasa a ser
  partida con Enter o el botón «↵» — pero se ve idéntica a una real (incluso enseña su total), así que
  quien no daba Enter creía tenerla. Ahora `FilaNueva` se agrega sola al salir de la fila (`onBlur` de
  la fila + `setTimeout` que revisa dónde quedó el foco: moverse entre sus celdas, el botón ↵, el
  catálogo o cambiar de ventana no la agregan a medias) y **sin robar el foco**
  (`alAgregar(p, { conFoco: false })`); Enter sigue igual. El «↵» se resalta mientras hay algo por
  agregar. `TablaPartidas.spec.tsx` nuevo (5 tests; el principal falla sin el arreglo — verificado
  quitando el `onBlur`), 64/64 en `cotizaciones`+`lib/cotizacion*`, `tsc` 0. **La partida 2 de la
  cotización 18 no está en la base: hay que volver a capturarla** (cualquier cotización donde pase
  lo mismo igual).
- **Hecho (Perfiles: Christian activa y desactiva perfiles desde su propio menú):** Adam pidió poder
  desactivar a alguien que se fue (sin credenciales ni asignación, historial intacto, reactivable).
  `/erp/users` ya hacía eso (`isActive` corta login/sesiones en `auth.service`/`jwt.strategy`, saca
  del chat y apaga el ACS vía `UsersService.updateHrFields`, y `team-board` filtra `isActive: true`),
  pero **el menú de Christian solo llega a «Perfiles»** (`/erp/perfiles` → `AltaUsuarioPanel`), sin
  enlace a `/erp/users` — por eso «sigo sin poder» aunque la función existía. Se puso el control donde
  él trabaja: `PATCH users/delegated/:id/activo` (`UsersDelegationService.cambiarActivo`; solo
  dirección, nunca uno mismo ni las cuentas del dueño/developer; reusa `updateHrFields` y deja
  `USER_DEACTIVATED`/`USER_REACTIVATED` en auditoría). La lista de Perfiles de dirección ahora
  incluye a los inactivos (`activo` en `PersonaEquipo`, orden activos primero) para poder
  reactivarlos; los encargados (Antonio/Luis/David) siguen viendo solo su equipo activo y sin el
  botón. UI: botón Desactivar/Activar con confirmación, etiqueta «Desactivado», sin «Editar» para
  inactivos. 7 tests de servicio + 3 de pantalla; `tsc` 0, API 3005/3005. **Pendiente: que Adam lo
  pruebe con la persona que se fue.**
- **Fecha (turno anterior):** 2026-10-01
- **Hecho (Roberto Vivanco solo podía recibir «Servicio», no «Tarea»):** Antonio (su jefe directo,
  managerId 39→40) no podía asignarle una tarea de recolección de material — el selector de «Tipo
  de actividad» solo le mostraba Servicio («Solo ves los tipos que Roberto Paul puede recibir»).
  Investigué permisos de organigrama y correo (`equipo-alcance.ts`) y Roberto está completamente
  dentro del alcance de Antonio por los dos caminos — el límite real estaba en
  `apps/web/lib/activity-kinds.ts`: `RECEIVE_BY_EMAIL[roberto]` tenía un comentario explícito
  («Roberto: solo atiende servicios») y solo `['servicio']`, a diferencia de Carolina/Alejandro
  (su mismo equipo de soporte) que ya tenían `['tarea', 'proyecto', 'servicio']`. Se iguala a
  Roberto con ellos — decisión explícita de Adam («absolutamente todos deben tener tareas»). Mismo
  cambio espejado en `CoreActivityKinds.kt` (Android) y `CoreActivityRules.swift` (iOS) para que no
  reaparezca el mismo límite ahí; **las apps nativas necesitan su propio build/release para
  llevarlo** (no las toca este deploy web). `tsc` 0, 480/480 en `lib/`.
- **Hecho (Evidencia por campos: nadie la documenta sin haber tomado antes la entrada):** Adam vio
  en el panel que AN-0031 tenía «Evidencia por campos» 2/2 sin que a Antonio le apareciera hecho el
  Paso 1 — el stepper de `ActivityEvidenceFlow` y la pantalla de «Evidencia por campos» son dos
  flujos independientes en la misma página, y nada impedía documentar campos sin haber tomado la
  entrada. `ActivityEvidenceFieldsService.guardarFoto()` ahora exige que el `ActivityEvidence` del
  usuario tenga `entryPhotoUrl` antes de guardar cualquier foto de campo («Primero toma la foto de
  entrada (Paso 1)…»); sin entrada, no hay campos. 3 tests (`activity-evidence-fields-paso1.spec.ts`).
- **Hecho (excepción puntual: adjuntar entrada/salida en vez de cámara — AN-0031 de Antonio):** tras
  destrabar el cierre (ver abajo), Antonio reportó que ya tenía las fotos de entrada/salida «en el
  carrete» y pedía adjuntarlas en vez de volver a tomarlas con la cámara. Adam fue explícito: la
  regla de «solo cámara en vivo» (`lib/evidencia-adjunto.ts` lo documenta así: la galería se puede
  falsear) se queda igual para todos — esto es una excepción puntual, **solo para esa asignación**,
  que se cierra sola. Se agregó `evidence.allow_attach:<activityId>` en `system_settings` (mismo
  patrón que `attendance.web_checkin_until`): pura (`adjuntar-entrada-salida.ts`,
  `ventanaAdjuntarEntradaSalida`, 5 tests) + expuesta como `allowAttach`/`allowAttachUntil` en
  `GET activity-evidence/:activityId`. En `ActivityEvidenceFlow.tsx`, el Paso 1 y el Paso 5 muestran
  un botón «📎 Adjuntar (excepción)» junto al de cámara solo cuando `allowAttach` es cierto — reusa
  `dataUrlDeImagen`/`getGeolocation`/`setPendingPhoto` ya existentes (mismo flujo de vista previa y
  envío que la cámara en vivo; la ubicación sigue siendo la de ahora mismo, de donde sea que se
  adjunte). Nada cambia para nadie más. Ventana abierta para AN-0031 (companyId 1) por 6 horas vía
  `apps/api/scripts/set-evidence-attach-window.sql` (correrlo de nuevo con otras horas la amplía;
  `DELETE FROM system_settings WHERE key = 'evidence.allow_attach:31'...` la cierra antes). `tsc` 0,
  285/285 en `src/activities`, 2998/2998 en todo el API. **Pendiente: confirmar con Adam/Antonio que
  ya ve el botón y que las fotos quedan guardadas.**
- **Hecho (gate de «Finalizar actividad»: no veía la Evidencia por campos — AN-0031 de Antonio):**
  por WhatsApp, Antonio no podía cerrar AN-0031 («no me aparece el botón de finalizar»). En la base:
  su «Evidencia por campos» (Cámara 1, Antes+Después) estaba 100% completa (`activity_evidence_fields`
  / `activity_evidence_field_photos`), pero el gate de `ActivitiesService.update()` (Armor, antes de
  pasar a Finalizada) solo miraba el modelo `Evidence` **viejo** (`tipoEvidencia` = llegada/salida/
  hoja) — y ese modelo llevaba 0 filas para esta actividad porque nada de los flujos actuales
  (ActivityEvidence de 5 pasos, ni Evidencia por campos) escribe ahí. Cualquier actividad con
  plantilla de campos propios quedaba bloqueada para siempre, sin importar qué tan completa
  estuviera. Fix: si la actividad tiene `activity_evidence_fields`, su `progresoDeCampos()` (de
  `evidence-fields.helpers.ts`, la misma función pura que ya usa la pantalla «Evidencia por
  campos») manda y se salta el chequeo viejo; sin campos propios, sigue el flujo de siempre
  (sin tocarlo, para no regresar nada). 4 tests nuevos (`activities-evidence-gate.spec.ts`) +
  277/277 en `src/activities` + 2990/2990 en todo el API. **Pendiente: que Antonio vuelva a
  intentar cerrar AN-0031** (ya no debería faltarle nada).
- **Hecho (/erp/pizarra/flujo: una sola franja, sin el reglón desalineado):** Adam mandó captura de
  esa página y dijo «se ve horrible» — la causa concreta: eran dos `StatRow` separados (uno de 6
  columnas con `FlujoKpiStrip`, otro de 3 columnas debajo) sobre el mismo ancho, así que las
  columnas de la segunda fila quedaban el doble de anchas que las de la primera y no alineaban —
  más la redundancia de «A tiempo» como % en la primera fila y como conteo en la segunda. Se
  reemplazaron ambos por un solo `StatRow cols={8}` con los 8 valores reales (ya no se reusa
  `FlujoKpiStrip` en esta página; esa sigue igual donde sí se usa: la franja compacta de Actividades
  y Mi equipo). `tsc` 0, 34/34 en los specs de pizarra/team-board-api.
- **Hecho (Flujo del periodo: el clic no se notaba — sin señal visual persistente):** Adam probó el
  fix de «cada número abre su lista» y reportó «sigue igual». El `href` del `Stat` sí funcionaba,
  pero no había ninguna señal visible sin pasar el mouse (el fondo solo cambiaba en `:hover`), así
  que en una captura se ve idéntico a antes. Se agregó una flechita «›» siempre visible junto al
  número y un subrayado punteado en la etiqueta cuando el `Stat` es clicable (`piezas.module.css` /
  `piezas.tsx`). **Importante:** si la pestaña ya estaba abierta desde antes del despliegue
  anterior, un simple refresh (F5) también hace falta — React ya tenía cargado el bundle viejo en
  memoria.
- **Hecho (Flujo del periodo: ventana de checar desde la web, 5 días más):** Antonio avisó por
  WhatsApp que no le dejaba cargar su asistencia («se checa desde la app NEXARA»): la excepción
  `attendance.web_checkin_until` (companyId 1, NEXARA) había vencido el 30-sep. Se corrió de nuevo
  `set-web-checkin-window.sql` (vía `docker exec -i nexara-db psql`, sin tocar código ni
  redesplegar) con `hours=120` → vence el 06-oct 17:12 UTC. El backend la relee de la tabla en cada
  consulta (sin caché) y la pantalla de «Mi jornada» se refresca sola cada 5 min, así que no hace
  falta nada más. Para la próxima vez: `apps/api/scripts/set-web-checkin-window.sql`, o
  `COMPANY_ID=1 APLICAR=1 HORAS=120 bash apps/api/scripts/activar-perfil-ceo.sh` desde el servidor.
- **Hecho (Flujo del periodo: cada número abre su lista real, ya no son cifras vagas):** Adam vio
  «Asignadas 57, Iniciadas 52…» en Actividades → Asignadas por mí y dijo que no especificaban nada
  (ni de quién, ni cuáles). Se agregó `GET me/kpis/flujo/:bucket` (`me.controller.ts` →
  `TeamBoardService.getWorkflowActivities`) que lista las actividades reales detrás de cada balde
  (assigned/started/evidence/closed/slaOnTime/slaLate con `activityAssignee`; peerRejected con
  `activityPeerRequest`). Para que el número de la franja y la lista nunca se desacoplen, se extrajo
  `clasificarActividad()` en `workflow-kpis.ts` como única fuente de verdad — tanto el conteo
  (`accumulateWorkflow`, sin cambio de comportamiento) como el detalle la usan. `Stat`
  (`components/base/piezas.tsx`) ganó un `href` opcional (se vuelve `<Link>`, mismas clases CSS,
  sin tocar los ~30 usos existentes que no lo pasan). `FlujoKpiStrip` enlaza 5 de los 6 números
  (no «A tiempo», que es un % y no un balde) a `/erp/pizarra/flujo/[bucket]` (página nueva, mismo
  patrón que `/erp/pizarra/flujo`: `RangoSelector`, tarjetas `PersonaPhotoCard` con link a
  `/erp/actividades/:id`). La página de detalle (`/erp/pizarra/flujo`) también enlaza sus 2 cifras
  de SLA (A tiempo / Tarde). Backend: 3 tests nuevos (`workflow-bucket.spec.ts`) + 170/170 en
  `src/me`. Web: `tsc` 0 (tras limpiar `.next/types` de una ruta temporal vieja de la sesión
  anterior), 34/34 en los specs de `team-board-api`/`base`/`pizarra`. **No lo probé a mano en el
  navegador**: Docker Desktop no arrancó en esta máquina (ya documentado, sin forzar «Reset to
  factory defaults» — borraría la BD local) y no hay stack local levantado para loguearme como
  CEO. **Desplegado, pendiente que Adam confirme en Actividades → cualquier pestaña con Flujo del
  periodo, dando clic en un número.**
- **Hecho (planos: orden de página — firma al final de verdad, no antes):** tras el fix de `3595081c`
  (planos embebidos en el PDF que de verdad descarga el cliente, `cotizacion-formato-nexara.ts`), Adam
  reportó que los planos salían al final y el cierre (ATENTAMENTE + firma) quedaba antes — pidió que el
  cierre vaya siempre hasta el final de verdad. Se reordenó: la lista de «ANEXOS» no imprimibles y las
  imágenes de plano a página completa ahora van antes del cierre (antes iban después); el cierre se
  mueve a una hoja propia cuando hubo algún anexo con página propia, para no encimarse con un plano (bug
  real que se hubiera visto: la imagen no avanzaba `p.y` tras dibujarse). Los planos en PDF real (los que
  se anexan con `pdf-lib`, páginas vectoriales tal cual) ahora se **insertan** antes de la última página
  del documento (la del cierre) en vez de añadirse siempre al final — `anexarPaginasPdf()` en
  `common/pdf/planos-pdf.ts` ganó la opción `antesDeFinal`. Imágenes de plano también quedaron centradas
  horizontalmente (antes pegadas al margen izquierdo). Test nuevo que fija el orden (la página del plano
  antes que la del cierre, cierre siempre en la última página). Verificado con los dos planos reales de
  la cotización 13 (bajados de nuevo por `scp`): 4 páginas — 1) datos/partidas, 2) IPADE A-01, 3) RED CCTV
  IPADE, 4) ATENTAMENTE + firma — confirmado con PyMuPDF. `tsc` 0, jest API 2983/2983. **Pendiente
  desplegar y pedirle a Adam que confirme en una cotización real.**
- **Hecho (quiebre angosto de la tabla de cotizaciones, cierre de iOS y Android):** con Costo y Margen %
  como columnas fijas (9 en total), el quiebre «sin columnas opcionales» seguía en 560px — entre 560 y
  900px la tabla se apretaba sin pasar a modo apilado (Marca/Modelo como «M.» sueltos, Costo/Margen sin
  caja visible). Se sube ese quiebre a 900px, igualándolo al de columnas opcionales (que quedó idéntico
  y se borró por duplicado). Verificado en el navegador a 700px (apilado, con valores) y 1100px
  (columnas). **Desplegado** (`43627301`).
  **iOS:** con la ayuda de Adam entré a App Store Connect (Chrome del propio Adam, ya con su sesión) —
  la versión 1.0 llevaba desde el lunes «Pendiente de revisión» con el build 5. Se quitó de la cola
  («eliminar esta versión del proceso de revisión»), se adjuntó el build 6 y se guardó. **Adam mismo la
  volvió a mandar a revisión** (el botón «Añadir a revisión» lo apretó él, no yo). Capturas, descripción
  y demás metadatos ya estaban completos de antes; no se tocaron.
  **Android:** el AAB (versionCode 14 / 1.0.5, ver arriba) pesa 24.4 MB — por encima del límite de 10 MB
  de la herramienta de subida de archivos de esta sesión (Claude en Chrome), así que no pude arrastrarlo
  yo. Adam dijo haberlo adjuntado él mismo, pero al recargar «Crear versión de producción» (dos veces,
  en pestañas distintas) el cuadro de subida seguía vacío y el texto decía «Ningún app bundle... se
  incluirá en esta versión» — sin bundle real adjuntado pese a lo que se veía en su pantalla. Se le dio
  de nuevo la ruta exacta del archivo para que lo arrastre él. **Si retomas esto sin haber visto el
  cierre: entra a Play Console → NEXARA → Producción → esa versión en borrador y confirma con tus
  propios ojos que el app bundle 14 (1.0.5) aparece antes de tocar nada — esta sesión no logró
  confirmarlo.**
- **Hecho (margen por partida: de campo escondido a columna real; Adam insistió con captura):** el
  primer intento (campo «Margen %» bajo el título, ensanchado de 4.25rem a 6rem) seguía sin verse como
  algo editable — Adam mandó otra captura: «sigo sin ver la columna... solo el general», y luego «es
  una columna y se puede editar por partida... cada partida nueva puede llevar un porcentaje distinto».
  Costo y Margen % salieron del detalle (donde quedan Marca/Modelo/Descripción del PDF) y se volvieron
  columnas de verdad entre Cantidad y Precio — igual que el Excel de Quina. `columnasDeTabla()` pasó de
  7 a 9 columnas fijas (Costo y Margen no son de «Personalizar», nunca se imprimen en el PDF final); se
  actualizaron los dos quiebres angostos (`@container` ≤900px con columnas opcionales y ≤560px) para no
  descuadrar la rejilla. Verificado a mano en el navegador (ruta temporal `/tmp-preview-margen`, borrada
  después): costo 100 + margen 50 → precio 150 solo, subtotal se recalcula. web `tsc` 0, vitest 81/81
  archivos (688/688). **Desplegado** (`08c1bdb4`).
- **Hecho (iOS: build 6 a TestFlight, terminado en verde):** `CFBundleVersion` 5 → 6 (App Store Connect
  rechaza un build ya subido o menor), tag `ios-testflight-1.0.0-6` empujado → workflow
  `ios-testflight.yml` corrió en macOS runners y terminó `success` (run 36767760994). Trae los fixes de
  evidencia libre, checklist de vehículo y avatarUrl de sesión fusionados hoy desde Cursor Cloud Agent.
  **Falta:** en App Store Connect → TestFlight confirmar que el build 6 quedó disponible y, si aplica,
  mandarlo a revisión de Apple (el rechazo del 28-09 seguía pendiente de reenvío).
- **Hecho (Android: AAB firmado, build exitoso, sin subir a Play):** `VERSION_CODE` 13 → 14,
  `VERSION_NAME` 1.0.4 → 1.0.5 (commit `aef82e66`); `pwsh scripts/build-play-aab.ps1 -BumpVersionCode
  -VersionName 1.0.5 -Clean` → `BUILD SUCCESSFUL in 13m 34s`, AAB de 24.4 MB. Trae todos los arreglos
  acumulados sin subir (autoasignarse, evidencia libre, foto/nombre en «Más», auditoría de UI/UX, «Kit
  personal», el `DurationField` duplicado, evidencia libre en cola, checklist de vehículo). No hay
  publicación automática a Play configurada (sin cuenta de servicio ni fastlane): el `.aab` se mandó a
  Adam por archivo — **falta que él lo suba a mano** en Play Console → `mx.nexara.mobile.nativeapp` →
  Producción o prueba interna → Crear versión. El archivo queda en
  `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab` (no versionado; se
  pierde si se hace `-Clean` de nuevo sin respaldarlo antes). El `mapping.txt` de esta versión sí quedó
  archivado: `apps/mobile-native/play-releases/mapping-v14-1.0.5.txt`.
- **Hecho (cursor, verificación de producción + CI Android):** producción corre `489fe64b` (código
  idéntico a `135d4533`, que solo añadió este relevo); contenedores `nexara-web`/`nexara-api`
  recreados 18:46 UTC por otro despliegue y sanos; verificado dentro de los contenedores que el
  build trae el picker de horas/minutos (chunk de `pizarra/[userId]/asignar`) y la transacción de
  `addEvidencePhoto`. Migraciones: la última aplicada es `20260929180000_cotizacion_margen_general`
  y no hay nuevas. `app.`/`core.`/`nexara.com.mx` y `api.nexara.com.mx/api/health` responden 200.
  CI de `135d4533`: todo verde salvo Android, que compilaba y pasaba tests pero fallaba el chequeo
  de «errores crudos»: `EvidenceCaptureFlow.kt` mostraba `e.message` al adjuntar imagen → ahora
  `e.toUserMessage(...)`. Local: API `tsc` 0 y jest 2979/2979 (1 timeout del PDF solo bajo carga,
  pasa aislado); web `tsc` 0 y vitest 688/688 (1 timeout de viáticos bajo carga, pasa aislado);
  Android compile + unit tests OK. **Ojo:** en el servidor `deploy/docker/Dockerfile.web` tiene
  un cache-bust fijo editado a mano y hay `*.bak-recordarme-20260926` sin trackear; no se tocaron.
  En local queda sin commitear `cotizaciones/_editor/editor.module.css` de otro agente; no se tocó.
- **Hecho (margen % por partida en cotizaciones, pedido de Quina/Monica por WhatsApp):** el cliente
  pidió capturar costo/margen/precio por renglón, no un solo margen global — Adam mandó capturas de
  WhatsApp y un ejemplo en Excel. Cada partida (`CotizacionItem.marginPercent`, ya existía en el
  schema pero era un no-op para el precio) ahora, con costo interno puesto, calcula el precio al
  cliente como costo × (1 + margen/100) — markup sobre costo, igual que pidió Quina, NO el margen
  sobre venta que usa `sellFromCost` en el cotizador inteligente (son cosas distintas, no se tocó esa).
  Es aparte del margen de la cotización (`Cotizacion.marginPercent`, sigue yendo una sola vez sobre el
  total con IVA, sin tocar ese cálculo para no arriesgar cotizaciones ya enviadas) — si se usan los dos
  a la vez se suman, y el editor avisa de eso bajo el campo de margen general. El servidor recalcula el
  precio en `normalizeItems` (no confía en lo que mande el navegador). PDF interno: costo, margen % y
  precio por partida, más un renglón de margen ponderado de las partidas en el desglose. PDF final (el
  que ve el cliente): sin cambios, sigue sin costo ni margen, solo precio ya incluido. Sin migración
  real (solo un comentario `///` en el schema). Verificado: API jest 248/248 suites, 2979/2979 pruebas,
  `tsc` 0; web vitest 81/81 archivos, 688/688 pruebas, `tsc` 0. **Desplegado.**
- **Hecho (rescate de un checkpoint-commit de Cursor Cloud Agent que se llevó este trabajo a otra
  rama):** a medio hacer el margen por partida, la automatización de Cursor Cloud Agent hizo un commit
  de respaldo (`checkpoint before checking out cursor/cloud-agent-1790788798658-1ofgu`) de TODO lo sin
  confirmar en el checkout compartido — mi trabajo de cotizaciones mezclado con archivos que Cursor
  traía a medias (evidencia libre, picker de horas, checklist de vehículo) — y cambió el checkout a esa
  rama, dejando `main` local un commit adelante pero sin ese checkout activo. Nada se perdió (`git
  reflog` lo confirmó), pero hubo que separar con cuidado lo mío de lo de Cursor sin usar ningún
  comando destructivo (nada de `reset --hard`, `checkout --`, `clean` ni `stash drop`): `checkout main`
  → `reset --soft` al commit anterior (no toca el índice) → `git add` solo de mis archivos → el resto
  (ya duplicado byte a byte en la rama de Cursor, confirmado con `git diff` antes de tocar nada) a un
  `git stash` con nombre, que se queda ahí sin borrar. Esa rama de Cursor traía además un bug real:
  `CoreActivityFormScreen.kt` tenía la función `DurationField` pegada dos veces, idéntica — Kotlin la
  veía como overload conflictivo y no compilaba. Se dejó una sola copia, recompiló limpio, y la rama
  (con evidencia libre + picker de horas/minutos + **el pendiente de iOS que había quedado para una
  sesión con Mac: `ChecklistVehiculoView.swift` avisa antes de perder las fotos del checklist de
  vehículo al salir sin enviar**) se fusionó a `main` sin conflictos, con jest/vitest/tsc/Android en
  verde antes y después de fusionar, y se borró (local y remota) según la regla del repo. Se quitó de
  paso un script de depuración (`.ai/tmp-probe.js`) que se había colado en el checkpoint. **Ojo para
  quien retome:** queda un `git stash` viejo (mensaje «leftover: WIP de Cursor recuperado del
  checkpoint...») con versiones desactualizadas de `ActivityEvidenceFlow.tsx`, `OpsActivityForm.tsx` y
  `asignar/page.tsx` — ya están superadas por lo que se fusionó a main, se puede tirar cuando Adam lo
  pida por su nombre (`stash drop`), no antes.
- **Hecho (auditoría grande de bugs y UI/UX — Android + web):** Adam pidió «una pasada grandísima»
  a las apps móviles y a la web porque «tienen muchos errores». Se lanzaron 4 agentes de lectura en
  paralelo (Android, iOS, web operativo, web back-office) más el que arregló lo de «Kit personal»
  (commit `4129a7fc`, ver abajo). De ~28 hallazgos concretos con archivo y línea, se arreglaron los de
  mayor impacto y menor riesgo:
  - **Android:** «Vaciar cola» offline ya pide confirmación (borraba TODO sin avisar — mismo tipo de
    daño que la evidencia libre). El detalle de actividad ya no se queda mudo si falla un refresh tras
    cancelar/pasar de compañero (antes no decía nada y se veía el estatus viejo sin explicación). Los
    tres íconos del compositor de chat y el de «Opciones» del mensaje volvieron al tamaño de toque de
    Material3 (estaban forzados por debajo de lo accesible). «Abrir en la web» sin navegador instalado
    ahora avisa en vez de quedarse mudo. `MyProfileScreen` ya no adivina éxito/error buscando la
    palabra «guardado» en el texto (frágil).
  - **Web:** el detalle de actividad ya no borra toda la pantalla si un refresh falla después de una
    acción que sí funcionó (ahora conserva lo último bueno y avisa con «Reintentar», salvo que sea
    literalmente otra actividad la que nunca cargó). «Eliminar actividad» ya no convive con el modo
    editar (evitaba un caso raro donde el error de borrar podía perderse). «Asignadas por mí» ya tiene
    botón de reintentar. Los íconos del header del chat en móvil suben a 40px. Gastos y Pagos a
    empleados ya avisan antes de cerrar el modal con cambios sin guardar (mismo patrón que Documentos,
    pero les faltaba el prop `dirty`). Cuatro secciones de Contabilidad (periodos, centros de costo,
    presupuestos, presupuesto vs. real) y dos más (plantillas de rol en Usuarios, proyectos en el
    detalle de Cliente) dejaron de tragarse el error silenciosamente mostrando «no hay nada» en vez de
    avisar que algo falló.
  - **El bug recurrente de `limit=100`/`limit=50` (ya conocido, «siete pantallas» en agosto) seguía
    vivo en más lugares:** pólizas contables y movimientos bancarios ahora cargan por tandas de 500
    (igual que ya se hizo para Facturas) con «Cargar más» si hay más; **`users/hr-staff` se llamaba con
    `?limit=50` desde RH y `?limit=100` desde Sanciones, truncando la plantilla completa de cualquier
    empresa con más personal que eso — se quitó el parámetro: ese endpoint, sin `limit`, ya regresaba
    la lista completa sin paginar (estaba hecho para eso, solo que nadie lo estaba usando así).**
  - **iOS:** el agente confirmó que el diff de «foto y nombre arriba de Más» (commit `cc395ab8`)
    compila bien a mano (orden del init memberwise correcto). Encontró 7 más, el más importante:
    `ChecklistVehiculoView.swift` tiene el MISMO bug que se arregló para evidencia libre (fotos del
    checklist de vehículo solo en memoria, se pierden si se cierra la hoja o muere la app) — **no se
    tocó**, por no seguir apilando cambios de iOS sin poder compilarlos. Queda en la cola para quien
    tenga Mac, junto con el resto de hallazgos de iOS (detalle completo en la respuesta de esa sesión,
    no repetido aquí por espacio).
  Verificado: API sin tocar en esta ronda; web `tsc` 0, vitest 78/675 en dos rondas; Android
  `compileDebugKotlin` y `testDebugUnitTest` en verde en tres rondas. **Falta desplegar** (web) y
  **falta compilar + subir build nuevo** (Android — mismo pendiente que evidencia libre y
  autoasignarse, un solo build serviría para las tres cosas).
- **Fecha:** 2026-10-02
- **Hecho (bug real: «Kit personal» se perdía al asignar — Luis mandó captura por WhatsApp):** Luis
  (`coord_operaciones`) le mandó a Adam una captura: en el flujo de asignar (`/erp/pizarra/[userId]/asignar`,
  José Antonio de destino), marcó «Kit personal» sin tocar el buscador de «Almacén de herramientas» (lo
  dejó vacío), le dio «Asignar actividad» y la pantalla le devolvió «Error interno del servidor» junto al
  botón. Investigué a fondo todo el camino real de ese clic — creación de la actividad (`activities.service.ts`),
  RBAC de asignación cruzada de departamento Luis→Antonio (`asignacion-departamento.ts`, que ya documenta
  este mismo flujo de despacho), validación de inventario y kit en `activity-tools.service.ts`, y si las 216
  migraciones de Prisma estaban realmente aplicadas en producción (sí, una por una, sin faltantes) — sin
  lograr reproducir un 500 real con exactamente ese payload. Sí encontré y confirmé por `git log` una
  regresión concreta, del mismo commit que metió «Kit personal» (`4ecc6131`, 24-09): `guardarHerramientas`
  en `OpsActivityForm.tsx` se salta por completo el PUT a `/activities/:id/herramientas` cuando la lista de
  renglones está vacía (`herramientas.length === 0`) — una condición que tenía sentido ANTES de que
  existiera el flag de kit («si no hay nada que guardar, no llames a la API»), pero que nadie actualizó
  cuando se agregó `usaKit` como una segunda razón independiente para guardar. Resultado: marcar el
  checkbox sin agregar nada del almacén se veía bien en pantalla pero nunca llegaba a la API — la actividad
  quedaba con `usesPersonalKit=false` en silencio, sin aviso ni error. Arreglo: función pura nueva
  `debeGuardarChecklist(herramientas, usaKit)` en `lib/herramientas-checklist.ts`
  (`herramientas.length > 0 || usaKit`), usada en el gate de `guardarHerramientas`. De paso, el mock
  compartido de `activity-tools.service.spec.ts` (`build()`) nunca tuvo `prisma.activity.update` — la
  llamada que persiste `usesPersonalKit` dentro de la transacción — así que esa ruta llevaba desde el 24-09
  sin cobertura real (cualquier prueba que mandara el payload tal como lo arma el controller habría tronado
  con `TypeError: tx.activity.update is not a function`). Se agregó el mock y dos pruebas: una que manda
  exactamente la forma que manda el controller (objeto `{requisitos: [], usePersonalKit: true}`, no el
  arreglo plano viejo de las pruebas anteriores) y confirma que sí se llama `activity.update`, y otra que
  confirma que un guardado normal no lo toca por accidente. **Ojo:** no pude confirmar que ESTE fue el 500
  exacto que vio Luis — el contenedor de producción se recicló entre el reporte y esta sesión (deploy de
  16:13 de hoy, para otro fix) y se perdieron los logs con el stacktrace real. Si el «Error interno del
  servidor» vuelve a aparecer al asignar, lo primero es capturar `docker logs nexara-api` ANTES de
  redesplegar — `all-exception.filter.ts` sí registra `originalMessage` y `stack` completos, solo que no
  sobreviven a un `docker compose up` que recrea el contenedor.
  Verificado: API `tsc` 0, jest 245/246 suites en verde (2955/2956 — la 1 que falla,
  `propuesta-tecnica-pdf.spec.ts`, es un timeout de 5 s en un test de PDF ajeno a este cambio, pasa solo en
  aislado: es lento bajo `--runInBand` con 2 956 pruebas, no lo causó este fix); web `tsc` 0, vitest
  78/78 archivos, 675/675 en verde. Sin migración. **Desplegado a producción.**
- **Hecho (foto y nombre arriba de «Más», Android + iOS):** Adam pidió que se viera la foto de
  perfil y el nombre «arriba del todo» en el menú de la app, amigable. Ninguna de las dos apps tiene
  drawer: «Más» es lo más parecido a un menú de cuenta, así que ahí va, como primera tarjeta, con
  foto (o iniciales) + nombre + departamento, y lleva a Mi perfil al tocarla. Android (commit
  `a942d0eb`, compila y tests en verde) lee `SessionStore` local, sin red. iOS (commit `cc395ab8`,
  **sin compilar, sin Mac**) nunca guardaba `avatarUrl` en la sesión — se agregó el campo
  (`Codable` con default `nil`, las sesiones ya guardadas en Keychain siguen bien) y se hidrata en
  login y se refresca en `GET auth/profile`. Mismo pendiente que la evidencia libre: alguien con Mac
  debe compilar antes de generar build.
- **Fecha:** 2026-10-02
- **Hecho (evidencia libre que se perdía — API, web, Android, iOS):** Luis reportó que tomaba varias
  fotos de evidencia («fotos en sitio», sin campos), salía de la pantalla y volvía, y ya no estaban.
  Causa: esa foto solo se acumulaba en memoria del cliente (React state en web, `remember` de Compose
  en Android, `@State` en iOS); nada llegaba al servidor hasta tocar «enviar». Las fotos **por campo**
  nunca tuvieron este problema porque ya mandaban cada una de inmediato. Arreglo: nuevo endpoint
  `POST activity-evidence/:id/evidence-photos/draft` (commit `a21b1973`) que agrega una foto sin cerrar
  el paso — mismo espíritu que las de campo. Los tres clientes ahora mandan cada foto libre al tomarla,
  no al final: web (`ActivityEvidenceFlow.tsx`, mismo commit), Android (`EvidenceCaptureFlow.kt`, commit
  `2e32ed81`, reusa el interceptor de cola offline sin tocarlo — la ruta no estaba en ninguna lista de
  «solo en línea»), iOS (`EvidenceCaptureFlowView.swift` + `CoreRepository.swift`, sin commitear
  todavía). `removeEvidencePhoto` ya no exige el mínimo mientras se sigue capturando y ahora realinea
  `evidencePhotosGeo` al quitar una foto (antes quedaba desfasado).
  **iOS, nota importante:** `CapturedGeoPhoto` exige una `UIImage` local — no se puede reconstruir una
  miniatura real de una foto recuperada del servidor sin descargarla. Se optó por NO tocar
  `pendingPhotos` (sigue siendo solo lo capturado en esta sesión, para la miniatura) y agregar
  `confirmedPhotoURLs: [String]` como fuente de verdad para el conteo, el botón «Enviar» y el envío
  final — se hidrata del GET al abrir la pantalla. Si hay fotos recuperadas de un intento anterior, un
  texto lo avisa («N de un intento anterior ya guardadas») pero no se pueden quitar una por una desde
  ahí (limitación aceptada: si Adam quiere poder quitarlas, hace falta cargarlas con `AsyncImage` desde
  la URL, no se hizo por riesgo de compilar sin Mac para verificar). **No se pudo compilar ni correr
  tests de iOS en esta sesión** (Windows, sin Xcode): el cambio se revisó a mano con cuidado y siguiendo
  el patrón ya probado de `sendCampoPhoto`, pero alguien con Mac debe compilar antes de generar un
  build nuevo — sobre todo porque el build de iOS ya tenía pendiente el reenvío a Apple tras el rechazo
  del 28-09 (ver esa entrada más abajo).
  Verificado: API `tsc` 0, jest 246/2 954 (incluye `activity-evidence-draft-photos.spec.ts`, nuevo);
  web `tsc` 0, vitest 78/672; Android `:app:compileDebugKotlin` y `:app:testDebugUnitTest` en verde.
  Desplegado a producción (API + web). Android: falta compilar y subir un build nuevo (ver pendiente
  de «Auto-asignarme» abajo, mismo build serviría para las dos cosas).
- **Diagnóstico (David no puede autoasignarse actividades):** el código ya está arreglado desde ayer
  (commit `fad23c2e`, 28-09 20:23 UTC — el botón ya no se escondía con la cola vacía) pero **nunca se
  compiló un AAB con ese fix**: el último artefacto construido es `NEXARA-v1.0.2-vc11.aab`/mapping
  v12-1.0.3 del 22-09, seis días antes del fix. David sigue con esa versión instalada. Falta: subir
  `versionCode`/`versionName` (13/1.0.4, el siguiente libre — ver `apps/mobile-native/play-releases/`),
  `pwsh -File scripts/build-play-aab.ps1 -VersionCode 13 -VersionName 1.0.4 -Clean` (keystore y
  `key.properties` ya están en el repo local) y decidir con Adam cómo llega al teléfono de David:
  ¿subida formal a Play (revisión, tarda) o un APK de debug/release directo para probar ya? Este mismo
  build llevaría también el arreglo de evidencia libre de arriba.
- **Hecho (bug real: `/erp/perfiles` no abría para David, Antonio y Luis):**
- **Hecho (bug real: `/erp/perfiles` no abría para David, Antonio y Luis):** Adam probó con la cuenta de
  David (coordinador de operaciones) y el ítem «Perfiles» del menú se veía, pero al entrar rebotaba —
  igual le habría pasado a Antonio y Luis. Causa: `page-matrix.ts` (RBAC v2 del frontend, whitelist de
  páginas por rol) nunca tuvo `/erp/perfiles` registrado; `AppShell.tsx` tiene un guard
  (`accessGuardWarning` = `!canUserAccessPath(...)`) que redirige a la entrada del panel apenas detecta
  una ruta fuera de la whitelist del rol — el swap del ítem del menú («Mi perfil» → «Perfiles») usa un
  chequeo distinto (`cargarContextoAlta`), así que el link SÍ aparecía pero la página nunca cargaba. Solo
  CEO, `super_admin` y `dir_admin` tienen `/erp/**` y por eso a mí (probando como Christian) nunca me
  tocó. Agregado `'/erp/perfiles'` junto a `'/erp/my-profile'` en los 14 roles que no tienen ese comodín
  (arquitecto, dir_operaciones, coord_admin, administrativo, coord_operaciones, ing_campo, ing_soporte,
  enc_soporte, coord_ventas, vendedor, lider_diseno, disenador, rh, contabilidad). `cliente` (portal)
  sigue sin acceso, correcto. Prueba nueva en `page-matrix.spec.ts` que cubre los 14 roles + CEO/dir_admin
  (sí) + cliente (no), para que no se vuelva a colar. Sin migración. Verificado: web `tsc` 0, vitest
  78/672 en verde. **Falta desplegar.**
- **Último turno:** cursor
  edición, `AltaUsuarioPanel.tsx`). Ya aplicado, sin pruebas que lo referenciaran por texto.
- **Hecho (editar perfiles, no solo la foto):** Adam probó `/erp/perfiles` y solo tenía «Cambiar foto» por persona; pidió poder
  editar de verdad. El botón por persona pasa a «Editar» y abre un modal con foto, nombre y teléfono (los cambia cualquiera con
  el permiso, con quien le reporta; dirección con cualquiera de la empresa). Si quien edita es dirección, el modal suma tipo de
  usuario, departamento, jefe y número de empleado — para los demás esos cuatro ni se muestran, y si llegaran igual al API los
  rechaza con 403 (`UsersDelegationService.actualizarFoto`, nombre sin cambiar por no romper la firma que ya usa el controlador).
  Esos cuatro campos ahora reusan `UsersService.update` en vez de un `prisma.user.update` a mano: valida rol/departamento/jefe
  contra la empresa, sincroniza el número de empleado en la membresía y empuja el cambio a control de acceso (ACS), igual que
  la edición general de usuarios — antes se perdía ese empuje si se editaba desde aquí. Nadie puede quedar como su propio jefe;
  ni el dueño ni la cuenta de desarrollo se editan desde este módulo (antes no había ese candado). `equipoDirecto()`/
  `equipoCompania()` ahora también traen `roleKey`/`departmentId`/`managerId`/`employeeNumber` de cada persona para que el modal
  llegue precargado. Tipos `PersonaEquipo` (API y web) y `UpdateDelegatedUserDto` crecieron con esos cuatro campos opcionales.
  `apps/web/lib/delegated-users-api.ts`: `cambiarFotoEquipo` → `editarPersonaEquipo` (único caller, `AltaUsuarioPanel.tsx`, ya
  actualizado). Sin migración. Pruebas nuevas en `users-delegation.service.spec.ts` (permiso por campo, auto-jefe, cuentas
  protegidas) y `AltaUsuarioPanel.spec.tsx` (edición con y sin permiso de dirección). Verificado: API `tsc` 0, jest 245/2 947 en
  verde (incluida `users-delegation.service.spec.ts` con 21 pruebas); web `tsc` 0, vitest 78/671 en verde. **Falta desplegar.**
- **Hecho (Perfiles, segundo intento — página propia):** el primer intento metía Perfiles dentro de Organigrama; Adam dijo que
  no, tenía otro plan para esa página. Reconstruido como `/erp/perfiles` (nueva, propia): sin permiso avisa «Aquí no hay nada
  para ti todavía»; con permiso muestra exactamente lo mismo que antes (alta, fotos del equipo, botón «Mi perfil»). Organigrama
  vuelve a ser solo el árbol de lectura, intacto. En el menú de cuenta (abajo izquierda) y en el ítem lateral, «Mi perfil» pasa
  a «Perfiles» solo para quien tiene el permiso; los demás sin cambio. `equipoCompania()` en `users-delegation.service.ts`
  (dirección ve toda la empresa) igual que el primer intento. Sin registrar en `access-matrix.ts`/`page-matrix.ts` (mismo
  patrón que `/erp/acceso-cuentas`: sin middleware que lo exija, la página se autogestiona con `cargarContextoAlta`).
- **Hecho (foto de perfil faltante en Asistencias):** Adam subió fotos vía Perfiles y no se veían en `/erp/asistencias`, solo en
  Actividades. Causa: `getHierarchyAttendanceRange` (`attendance.service.ts`) nunca mandaba `avatarUrl` en la respuesta, y la
  tarjeta ni lo intentaba (siempre iniciales). Se agrega `avatarUrl` al DTO y la tarjeta ya muestra la foto real con
  `resolveUserAvatarUrl`, iniciales de respaldo si no hay. Sin migración.
- **Hecho (badges de checada deformados):** `Fuera de sitio · N m` y similares (`InsigniasChecada`) usaban `border-radius: 999`
  (pastilla); en la columna angosta el texto largo envolvía a varias líneas y el radio infinito los volvía un círculo/burbuja
  ilegible (Adam lo reportó con captura). Cambiado a `borderRadius: 8` fijo — envuelve bien sin deformarse.
- **Pendiente de aprobación (NO aplicado ni desplegado):** Adam pidió «mejora la UI de las cards de asistencia». Se le mostró
  una propuesta (widget de `visualize`, antes/después del header + entrada/salida/timer) sin tocar el código real todavía.
  Falta su respuesta antes de implementarla.
- Pruebas de este bloque: API 245 suites / 2 944; web 78 archivos / 668; `tsc` limpio en ambos. Despliegue sin migración
  (`bash deploy/update.sh`).
- **Hecho (tiempo previsto también es atraso):** `evaluarSemaforo` (`semaforo-actividad.ts`) gana un tercer motivo, `'plan'`:
  si `minutosReales` supera `minutosPlan`, la tarjeta queda roja igual que por pasar el inicio o el tope (gana el peor de
  los tres). En una actividad de varios días el plan es de una jornada y no cuenta (mismo criterio que ya tenía `excedida`).
  Conectado en los dos lugares que ya tenían plan/real a la mano: `tiemposDto` (`actividad-tiempos.ts`, usa `activities.service.ts`
  y `my-activities.service.ts`) y `calculaActividad` (`me/pizarra-kpi.ts`, la pizarra). El campo `excedida` del DTO no cambió,
  solo ahora también pinta el color. **El cron `ACTIVITY_OVERDUE` (campana/push a jefe y coordinación) NO se tocó a propósito**:
  sigue mirando solo fecha de inicio, tope y fin de periodo — una actividad roja solo por exceso de plan no dispara ese aviso.
  Si Adam también quiere eso, falta extender `activity-overdue-alerts.service.ts` (su SQL inicial no trae `horasPlan` ni
  candidatea por eso). Tipo `MotivoSemaforo` re-exportado desde `actividad-tiempos.ts` (antes solo vivía en `semaforo-actividad.ts`)
  para que `my-activities.service.ts` no lo reescribiera a mano (eso rompió `tsc` la primera vez; ya corregido). Sin migración.
  Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Deploy general de la mañana:** Adam pidió desplegar todo. `origin/main` tenía trabajo de Cursor de la noche sin desplegar
  (líneas de abajo: margen de cotización, cierre solo Servicios, TestFlight, y **alta de usuarios con foto fija** en
  `/erp/organigrama`). Se corrió `tsc` + suite completa de API y web en verde (`npx prisma generate` de por medio, por la
  migración `20260929180000_cotizacion_margen_general`) y se desplegó con `--with-migrate`. Confirmado sano.
- **Intento fallido: módulo «Perfiles» (revertido).** Adam pidió que, en el menú de cuenta, «Mi perfil» se volviera «Perfiles»
  para dirección y para quien tiene gente a su cargo (Antonio, Luis, David), mostrando toda la empresa o su equipo, con
  «Mi perfil» adentro también. Se construyó reusando `/erp/organigrama` (que ya tenía el alta delegada y el cambio de foto
  del equipo): `equipoCompania()` en `users-delegation.service.ts` para que dirección viera toda la empresa, el enlace del
  menú de cuenta y el ítem lateral de la barra apuntando ahí, y un botón «Mi perfil» dentro de `AltaUsuarioPanel`. Se
  desplegó (commit `89863409`) y **Adam dijo que no**: tenía otro plan para Organigrama y no quería nada de esto ahí.
  Se revirtió limpio con `git revert --no-edit 89863409` (commit `ba87cab8`, sin `git reset`/force), se re-probó todo en
  verde (API 245/2 938, web 77/666 — un fallo de `proyectos/nuevo/page.spec.tsx` fue flake bajo carga, confirmado al
  correrlo solo) y se redesplegó sin migración. **Producción volvió a «Mi perfil» normal en los dos lugares** (menú de
  cuenta y barra lateral). **Pendiente:** preguntarle a Adam dónde SÍ quiere que viva «Perfiles» (¿página nueva propia?)
  antes de volver a intentarlo. La alta de usuarios con foto fija (línea de abajo, de Cursor) sigue viva tal cual estaba,
  sin el añadido de «Perfiles».
- **Hecho (margen de cotización sobre el total con IVA):** no se desplegó. En `/erp/cotizaciones` el margen es un solo porcentaje, sin texto de ayuda y sin margen por partida en la tabla. 20 significa total final = (subtotal − descuento + IVA + IEPS − retención) × 1.20. El precio de la partida se guarda como se escribe; el porcentaje no lo reescribe. El campo es texto (no `type=number`) y el parseo no multiplica por 100: un Decimal `{ e: 1, d: [2040000] }` es 20.4, no 204, y «20,4» es 20.4. Vacío o 0 deja el total igual. El PDF final imprime precios y total ya con ese margen e IVA, sin costo ni margen. El PDF interno muestra costo, IVA, margen y total, y recalcula aunque el total guardado sea el de antes. La API devuelve el porcentaje como número. Sin migración: sigue `Cotizacion.marginPercent`. `sellFromCost` del cotizador inteligente no se tocó.
- **Hecho (cierre solo Servicios, margen y PDFs de cotización):** no se desplegó y no se tocó producción. (1) La foto de salida sigue siendo obligatoria y con GPS. La coincidencia con el punto de inicio (100 m) solo aplica si el departamento del responsable se llama Servicios (`Department.nombre`, normalizado). No hay entidad Área: el área es el departamento. `coreKind` servicio es otro eje (Sistemas también ejecuta servicios) y no decide la regla. El API es la fuente de verdad (`exigeMismaUbicacion` en la geocerca). Web, Android e iOS solo pre-bloquean si esa bandera es true; si falta, no bloquean. Las alertas de salida de zona en vivo no cambian. (2) El margen del cotizador es markup sobre el costo: precio = costo × (1 + %/100); 20 % de $100 = $120. Se agregó `Cotizacion.marginPercent` (nullable). Si la partida tiene el suyo, incluso 0, ese gana y no se reescribe. Si está vacío, hay costo y hay margen general, el precio sale de ese general y el de la partida se queda vacío para seguir heredando. Borrar el general no recalcula precios ya guardados. Una cotización nueva nace con 20 %. El margen sobre venta de la cotización inteligente (`sellFromCost`) no se tocó. (3) PDF interno (`GET …/pdf/internal`, solo `cotizaciones.access`): por partida costo, margen % , margen $ y precio, más totales de markup. PDF final (formato Nexara): el mismo de siempre, con el precio ya con margen, sin costo ni margen. En la web, «PDF final» y «PDF interno» (este solo si ve costos). En Android, los dos botones; la API responde 403 si el rol no ve costos. iOS no tiene pantalla de PDF de cotización. Migración `20260929180000_cotizacion_margen_general` (columna nullable, sin backfill). Despliegue cuando toque: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (TestFlight, subida):** `altool --upload-app` de Xcode 26 aborta al ver el bundle id de un `.bundle` de Firebase (`firebase-ios-sdk.FirebaseCore.resources`). Quitar la versión no bastó (runs 36481182560 y 36481867326). Borrar `CFBundleIdentifier` (16f8b141) cambió el error a «The main Info.plist did not contain CFBundleIdentifier» y el fallback no corrió: `$((dirname …))` es aritmética, bash 3.2 sale en 0 y el run 36483216893 quedó en verde sin subir el build 4. Ahora el id numérico se pide a la API de App Store Connect con la misma llave (esta app: `6814597698`), se sube con `altool --upload-package --apple-id --bundle-id` y la versión/build del IPA; si altool falla se prueba `--use-old-altool` y después `iTMSTransporter`. El paso sale en 1 si no hay acuse. Los identificadores de los bundles de privacidad se conservan. **Subido:** 1.0.0 (5), commit `0a69bdec`, tag `ios-testflight-1.0.0-5`, run https://github.com/AdamPark7014/NEXARA-app/actions/runs/36486467950 en verde con acuse `UPLOAD SUCCEEDED` y Delivery UUID `182fa17f-37aa-4ca4-b0d0-7dbdacbf7b1b`. En App Store Connect hay que elegir ese build cuando termine de procesar.
- **Hecho (alta de usuarios con foto fija):** en `/erp/organigrama`, «Dar de alta a alguien» solo sale si la persona tiene subordinados directos (`managerId`, activos, de su empresa; el lateral no cuenta) y puede crear algún tipo. El API lo vuelve a exigir: sin subordinados, `GET /api/users/delegated/contexto` trae `puede: false` y `POST /api/users/delegated` responde 403. Christian (CEO, usuario 1) ve el formulario completo: nombre, correo, contraseña, teléfono, foto, cualquier rol salvo otro CEO, super admin y cliente de portal, departamento, jefe y número de empleado. Obligatorios: nombre, correo, contraseña y rol. David (`operaciones@`) ve el básico (nombre, correo, contraseña, teléfono, foto) y solo crea instaladores (`ing_campo`); el rol y el jefe quedan fijos y el jefe es él. Antonio (`jose.ramirez@`) igual para soporte (`ing_soporte`). Luis (`direccion.operaciones@`) crea los mismos tipos que Antonio, también en básico, y el jefe es él. La concesión sigue siendo por correo (`users.creation_grants`), porque David y Luis comparten rol. La foto es archivo o cámara, recorte cuadrado centrado, vista en círculo, y se guarda en `User.avatarUrl`: es la que ya pintan la web, Android e iOS. No es la de entrada ni la de salida. La selfie de checada (`usarFotoComoAvatarSiFalta`) solo rellena el avatar si está vacío y no pisa esta foto. Desde el mismo módulo se cambia la foto de quien le reporta; dirección puede con cualquiera de la empresa (`PATCH /api/users/delegated/:id`). El teléfono va a `UserProfile.telefono`. Sin migración. Guía: `docs/ALTA-USUARIOS.md`. Despliegue (no corrido): `cd /var/www/nexara-app && bash deploy/update.sh`.
- **Hecho («deployalo todo», ~13:35-15:05):** Adam pidió desplegar todo; Cursor siguió subiendo commits sin parar durante toda la tarde
  (unas 10 tandas). Cada tanda: `git pull --ff-only` (o rebase si hubo choque), `npx prisma generate` cuando tocaba `schema.prisma`,
  `tsc` + suite completa de API y web en verde, push si había algo propio, y `bash deploy/update.sh` (`--with-migrate` cuando traía
  migración) en el servidor. Un conflicto real: `df566a73` (Cursor) metió marca/modelo/costo/margen dentro de la celda de descripción
  de `TablaPartidas.tsx` y rompió el Tab documentado (desc→unidad→cant→precio) más una prueba; se corrigió con `tabIndex={-1}` en esos
  5 campos, y ese fix chocó de nuevo al rebasar sobre `e5ade93e` (Cursor cambió el textarea a `TextoAuto`): se resolvió quedándose con
  `TextoAuto`/`onValor` + el `tabIndex={-1}`.
  **Hallazgo importante:** hay OTRA sesión (al menos una, de iOS/TestFlight, autor "claude-code" en sus commits) desplegando en el
  mismo servidor con el mismo patrón `setsid nohup ./deploy/update.sh --with-migrate &` sin que yo la lanzara — se vio un proceso vivo
  (ppid=1, sin cron/systemd/webhook) que no era mío. No hay colisión real (cada `update.sh` es idempotente: pull a lo último, build
  determinista, migraciones con `_prisma_migrations`), pero si dos deploys hacen `docker compose build` a la vez puede haber carreras
  raras. Vale la pena que Adam sepa que puede haber más de un agente desplegando a la vez.
  **Estado final verificado (15:05):** servidor en `ddcb9475` (todo el código de esta tarde), 5 contenedores healthy, endpoints
  públicos responden bien; lo único más nuevo en origin/main es `16f8b141` que solo toca `.github/workflows/ios-testflight.yml`
  (no afecta api/web, no necesita redeploy).
- **Hecho (avatar de «Mi equipo», foto de Carolina):** `attendance.service.ts` (`usarFotoComoAvatarSiFalta`, línea ~92) toma la
  selfie de la primera checada como `avatarUrl` cuando está en `null`, y se queda fija — por eso salían selfies de checada en vez
  de fotos de perfil (evidencia real: David Morales Zenón). Se armó un widget comparando el tamaño real del aro (74px) con la selfie
  actual contra un recorte cara+hombros de la tarjeta de marca que mandó Adam; aprobó y pidió subir la de Carolina. Subida a
  `/var/www/nexara-app/uploads/users/1790629211392-carolina.jpg` (recorte 480×480 de la tarjeta original) y `User.avatarUrl` actualizado
  para `soporte@nexara.com.mx` (id 13). Verificado que el archivo existe y el registro apunta bien; NO se pudo probar con `curl` porque
  `/uploads/*` exige sesión (correcto, no es bug). Adam va a mandar las 18 tarjetas restantes para repetir el recorte y la subida.
  **Pendiente decidir con Adam:** si además se apaga `usarFotoComoAvatarSiFalta` (para que nadie más se quede con una selfie fija) una
  vez que todos tengan foto real, o se deja como respaldo para altas nuevas sin foto.
- **Hecho (foto en cada punto, web y apps):** en el detalle de la actividad, «Evidencia por campos» ya no dice que las fotos solo se toman desde la app. El responsable y quien sigue asignado ven en cada punto «Tomar foto» (cámara del navegador, `capture` en móvil) y «Adjuntar» (archivo o captura). También vale Ctrl+V y arrastrar sobre el hueco. Si hay varios puntos pendientes, hay que soltar o pegar sobre ese hueco. En despacho, el lead que solo reparte no sube. Quien solo mira el detalle no ve los botones. En Android e iOS, en cada punto, «Adjuntar» es un botón al lado de «Tomar foto» (galería o archivo); la foto de entrada y la de salida siguen siendo solo cámara. Android `versionCode` 13 / `versionName` 1.0.4 (incluye «Auto-asignarme» con la cola vacía). iOS `CFBundleVersion` 4, marketing 1.0.0 (TestFlight ya tenía 1.0.0 build 3). Sin migración. Despliegue web: `cd /var/www/nexara-app && bash deploy/update.sh`. El APK/AAB no lo genera el CI: en el portátil, `pwsh -File scripts/build-play-aab.ps1 -VersionCode 13 -VersionName 1.0.4 -Clean` (hace falta `key.properties` y el keystore). El AAB queda en `apps/mobile-native/android/app/build/outputs/bundle/release/app-release.aab`. iOS: tag `ios-testflight-*` dispara `.github/workflows/ios-testflight.yml` (secretos de Apple en el repo).
- **Hecho (eliminar actividad, solo Christian):** en `/erp/actividades/{id}` el botón «Eliminar actividad» va en la misma fila que Pasar a otro compañero, Cancelar actividad y Editar, y solo lo ve el usuario 1. Pide confirmación y vuelve a la pizarra. `DELETE /api/activities/:id` responde 403 a cualquier otro id (el servicio, no el permiso de gestionar actividades). La matriz de URLs abre ese DELETE solo al rol CEO; el servicio vuelve a exigir el usuario 1. Es borrado lógico: `deletedAt` ya existía; la migración `20260928260000_activity_deleted_by` agrega `deletedById`. No se usa `delete()` de Prisma porque el middleware lo reescribe y perdería quién la borró. El folio siguiente sigue contando las filas borradas para no reutilizar AN-0001. Pizarra, Mi equipo, listas, detalle, KPIs (incluido el `groupBy` del tablero y el SQL de ranking), app móvil (mismos endpoints), búsqueda global y la del chat filtran `deletedAt IS NULL`. Una solicitud de equipo ya no enlaza el folio si la actividad está borrada. La pizarra escucha `activity:updated` y `entity:updated` (modelo Activity); el tablero de operaciones y la app móvil ya escuchaban `entity:updated`, que el middleware emite al guardar. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (eliminar mensaje del chat, solo Christian):** en `/erp/chat` el menú de cada mensaje tiene «Eliminar» solo si el usuario es el 1 (Christian). Pide confirmación. `DELETE /api/chat/messages/:id` responde 403 a cualquier otro id, aunque armen la petición. Puede borrar cualquier mensaje de cualquier autor en cualquier canal o DM de su empresa (no hace falta ser miembro). Es borrado lógico: `deletedAt` ya existía; la migración `20260928250000_chat_message_deleted_by` agrega `deletedById`. El texto se queda en la fila para auditoría y la API no lo devuelve. Las consultas (lista, hilo, fijados, búsqueda, no leídos, reacciones, edición) filtran `deletedAt: null`. El pin se quita en la misma escritura y la vista previa del canal pasa al mensaje anterior. El aviso en vivo va a la sala de la empresa: `chat:message-deleted` (web, iOS y Android ya lo escuchan) y `chat:message:deleted`. Los clientes lo quitan de la lista, de fijados y de la búsqueda; si una respuesta lo citaba, muestra «Mensaje eliminado» sin el texto; el contador de no leídos baja si ese mensaje todavía contaba. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (texto del aviso de atraso):** el push y la campana dicen «Actividad atrasada». Al responsable y a quien está asignado: «Tu actividad {AN} · {título} está atrasada. Asegúrate de cumplirla en tiempo y forma.» Al jefe y a la coordinación: «La actividad {AN} · {título} de {nombre} está atrasada.» Al tocarla se abre `/erp/actividades/{id}` (web, Android e iOS ya leen ese `relatedUrl`). Sin migración nueva. Si `20260928200000_actividad_atrasada` aún no está aplicada: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`. Si ya está: `bash deploy/update.sh`.
- **Hecho (semáforo de actividades):** el recuadro ya no sale naranja por prioridad Media ni por «Sin iniciar». Rojo solo si pasó `fechaInicio` sin arrancar o pasó el tope (`fechaMaxima` / `fechaEntregaEsperada`; con periodo, el fin del último día) sin terminar. Naranja si faltan 30 min o menos (`UMBRAL_POR_VENCER_MIN`). En tiempo: borde azul si no arrancó, verde si ya va. Misma regla en pizarra, Mi equipo y listados. El cron `actividades-atrasadas` (cada 5 min) avisa campana + push (`ACTIVITY_OVERDUE`) al responsable, asignados, su jefe directo y la coordinación del departamento, una vez al entrar en rojo (`overdueAlertedAt`). Recordatorio optativo en `system_settings` clave `activities.overdue_reminder_hours` (0 = solo una vez). Umbrales: `docs/SEMAFORO-ACTIVIDADES.md`. Migración `20260928200000_actividad_atrasada`. No hay variables nuevas: el push usa `WEB_PUSH_VAPID_*` y, para el APK, `FIREBASE_SERVICE_ACCOUNT_JSON`. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (autoasignarse con la cola vacía):** en la app Android, «Auto-asignarme» solo salía si había algo por hacer. Con la cola en cero y una hecha hoy (Luis: Por hacer 0, Hechas hoy 1) la pantalla ya no está vacía y el botón desaparecía. Ahora el encabezado lo muestra siempre que se pueda autoasignar, y con la cola vacía hay además el botón grande, aunque haya hechas hoy o seguimiento. Web e iOS ya lo enseñaban en ese caso. Vale para todos los roles que entran a Mis actividades (la API manda `canSelfAssign`). Sin migración. La web no cambia: hace falta una build nueva de Android.
- **Hecho (viñetas de la partida):** el corte a media palabra del PDF de NEX-MG76022606-0001 («Dim», «Indicadores LE», «Alimentac», «ench») es el texto que ya estaba guardado: antes de e5ade93e cada guardado hacía `name.slice(0, 200)` y la columna era `varchar(200)`. Pasarla a `text` no recupera lo que se perdió. El generador ya imprime el texto completo (sin maxLines, ellipsis ni alto fijo). Hay que volver a pegar la ficha. Al imprimir y en la vista previa, cada `•` (y un `-` o `*` con espacios) baja a su renglón con sangría francesa; lo de antes de la primera viñeta se queda como párrafo. Al pegar en el título o en la descripción, el editor hace lo mismo. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh`.
- **Hecho (cliente corporativo al asignar servicio):** en `/erp/pizarra/:id/asignar`, con actividad de servicio, quien ya puede crear o asignar la actividad (encargado de soporte, operativos y el resto del personal interno) ve «+ Nuevo cliente corporativo». El alta pide solo el nombre; correo, teléfono y RFC son opcionales, crea el cliente tipo CORPORATIVO, lo deja seleccionado y no mira el sector del padrón (Daniela, cuyo sector es comercial, también puede por esta vía; por el padrón sigue sin poder). «Editar» sale sobre el elegido solo si ya puede editar clientes (el encargado sí, el operativo no). `GET ventas/clientes?sector=CORPORATIVO` devuelve todos los corporativos de la empresa, sin filtro de dueño ni de sector. La migración `20260928220000` dejó CORPORATIVO solo cuando el uso más reciente fue una actividad de servicio; empate o sin uso quedó COMERCIAL, así que el select puede salir vacío con datos reales y el botón crea el que falte. Sin migración nueva. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (alta de proyecto, solo nombre y cliente):** al crear un proyecto —alta rápida desde la actividad y el asistente `/erp/proyectos/nuevo`— lo obligatorio es el nombre y el cliente. Fechas, responsable, presupuesto, sitios, descripción, cronograma, alcance y equipo son opcionales y se completan después en el proyecto. `startDate` de `operational_projects` pasa a nullable (migración `20260928240000_proyecto_inicio_opcional`). El DTO profesional y el de `operational-projects` ya no exigen la fecha; si no hay responsable, queda quien lo crea. El alta rápida ya no rellena el inicio con hoy. En el detalle, borrar el inicio planeado también se guarda. El cliente ya solo exigía el nombre (RFC, razón social y dirección siguen opcionales en BD, DTO y UI). Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (adjuntar evidencia):** en todas las actividades y para todos los roles, las fotos de evidencia (libres y por campo) se pueden tomar con la cámara o adjuntar desde galería, explorador, captura, y en escritorio también arrastrando o con Ctrl+V. Se valida que sea imagen (el PDF solo si el campo lo admite; estos campos no lo admiten: el PDF sigue en la hoja de servicio), se rechaza lo vacío o lo de más de 15 MB y se comprime como la cámara (lado 1280, JPEG 0.6, tope 5 MB). Si no hay GPS la evidencia se guarda igual. La foto de entrada y la de salida con geocerca no cambian: siguen siendo solo cámara. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (actividades para todo el personal):** un empleado activo sin flags `acceso*` (Líder de Diseño, Administrativo, y el resto salvo cliente) crea una actividad, se la autoasigna y sube la foto y el GPS de lo suyo. Si `User.roleKey` y `Role.orgRoleKey` vienen vacíos, el rol se lee del nombre («Líder de Diseño» → `lider_diseno`, «Administrativo» no se confunde con director). Asignar a otra persona sigue exigiendo gestión: coordinación y gerencia asignan a cualquiera; el encargado, a su equipo; un ingeniero sin mando no sale de su departamento. `GET /api/users/assignable` ya no responde 403 a quien asigna (`coord_operaciones` y el resto de mandos). `GET /api/tool-requests/kits/users?userId=` lo consulta quien tiene `ACTIVITIES_MANAGE`, solo de esa persona. Un ping GPS con `actividadId` inexistente (o el id de la asignación) responde 400 o se guarda contra la actividad real; ya no es un 500 de llave foránea. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh` (sin `--with-migrate`).
- **Hecho (proyecto desde la actividad):** en crear/editar actividad, junto al proyecto, «¿No está el proyecto? Créalo aquí» pide solo el nombre y un cliente tipo PROYECTO (el buscador de `ClienteTipoPicker`). Al crearlo queda seleccionado. Fechas, alcance y equipo se completan después en Proyectos. `POST /operational-projects/alta-rapida` lo puede quien ya puede crear una actividad (`ACTIVITIES_VIEW`, `ACTIVITIES_MANAGE`, `CONSOLE_ACCESS` o `PEOPLE_VIEW`; el alta completa del proyecto sigue exigiendo gestión). El responsable es quien lo crea, el inicio queda vacío hasta que se capture, el tipo es OTRO y queda activo, en su `companyId`. Una cuenta de portal o de sucursal no puede. El cliente se elige entre los PROYECTO de la empresa (un operativo los ve para esto; el padrón sin filtro sigue siendo solo los suyos, y COMERCIAL no se abre). Si no existe, se crea ahí con solo el nombre (`altaProyecto`): sin RFC ni datos fiscales. Quien ya puede dar de alta clientes de su sector PROYECTO sigue usando el alta normal y puede completar datos en el mismo formulario. Un operativo no edita el padrón; Daniela no crea PROYECTO por el padrón, pero sí este nombre al crear la actividad. Sin migración. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh`.
- **Hecho (deploy general, ~13:35-14:10):** Adam pidió «deployalo todo». Al retomar, `origin/main` tenía 7 commits nuevos de Cursor sin
  tocar localmente (bóveda de contraseñas + varios `fix`/`feat` suyos); se hizo `git pull --ff-only`, `npx prisma generate` (el schema
  había cambiado) y se corrieron las suites completas antes de tocar nada: **API 237/2 779, web 73/648** en verde de entrada.
  Cursor's `df566a73` (fila de detalle marca/modelo/costo/margen dentro de la celda de descripción en `TablaPartidas.tsx`) rompió el Tab
  documentado (desc → unidad → cant → precio) y 1 prueba web; se corrigió con `tabIndex={-1}` en esos 5 campos (siguen editables por clic,
  ya no interrumpen el Tab). Mientras se probaba, Cursor subió 4 tandas más (incl. una migración de `sales_clients.tipo` y otra de
  `chat_message_reads`, y un cambio de `TextoAuto` en la misma `TablaPartidas.tsx` que dio un conflicto de rebase, resuelto quedándose con
  `TextoAuto`/`onValor` de Cursor + el `tabIndex={-1}` del fix). Cada rebase se volvió a probar entero (con `prisma generate` de por medio)
  antes de empujar: terminó en API 238/2 860, web 74/649, ambos `tsc` limpios. Push final `02b6856e`. Deploy con `--with-migrate` lanzado
  en el servidor y **terminado y verificado** (14:01): las tres migraciones del día (`credential_vault`, `sales_client_tipo`,
  `chat_message_reads`) están aplicadas, los 5 contenedores healthy/up, y `/`, `/login`, `/erp/acceso-cuentas` (200) y
  `/api/account-access/status`, `/api/chat/channels` (401 sin sesión, como toca) responden bien.
- **Bóveda de contraseñas (turno anterior de Claude, mismo día):** construida, desplegada y con la hoja del 21-09 cargada (16 cuentas en
  la empresa 1, verificadas). Ver más abajo la entrada «BÓVEDA DE CONTRASEÑAS construida». `VAULT_ENCRYPTION_KEY` vive en
  `/var/www/nexara-app/deploy/.env.nexara` (600) — Adam debe respaldarla.

- **Hecho (chat, visto):** en `/erp/chat`, cada mensaje propio muestra palomitas: una gris = enviado, dos grises = entregado (alguien ya lo tiene) y dos azules = lo vieron todos los destinatarios. Tabla `chat_message_reads` (`messageId`, `userId`, `readAt`, `companyId`; única por mensaje+usuario). `readAt` queda null hasta que se ve. Al abrir la conversación, lo visible se marca en lote (`POST /chat/channels/:id/reads`); si el cliente solo lo recibió, `POST .../delivered`. El remitente se entera por socket `chat:receipt` sin recargar. «Info» abre quién lo vio (nombre, avatar, hora America/Mexico_City) y quién no. El último leído del canal (`lastReadAt`) se conserva. Las lecturas no usan la llave `messageId_userId` (el aislamiento la aplana): van por findMany/createMany con `companyId`. Migración `20260928230000_chat_message_reads`. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (clientes en tres tipos):** cada cliente del padrón (`sales_clients`) tiene un solo `tipo`: COMERCIAL, PROYECTO o CORPORATIVO. Migración `20260928220000_sales_client_tipo`. Los que ya existían se clasifican por el uso más reciente: cotización → COMERCIAL, proyecto operativo (vía el cliente de operación) → PROYECTO, actividad de servicio (`coreKind = servicio`, o actividad con cliente y sin proyecto si no traía tipo) → CORPORATIVO. Si dos usos empatan en la fecha, o no hay ninguno, queda COMERCIAL. La fila de `sales_client_sectors` queda solo con ese tipo. El menú ya no tiene Clientes (la ruta `/erp/clientes` y el API siguen). COMERCIAL se busca, crea y edita dentro de la cotización. PROYECTO se lista, crea y edita en Proyectos. CORPORATIVO se busca, crea y edita al dar de alta una actividad de servicio. Solo el nombre es obligatorio (RFC, razón social, dirección, régimen, CP, correo). Siguen creando y editando coordinación, gerencia y encargados, y solo el tipo de su sector (Daniela comercial, Luis corporativo). Un operativo no edita el padrón; al crear una actividad de servicio puede dar de alta rápido un corporativo con nombre y contacto, sin RFC. Aislamiento por `companyId`. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
- **Hecho (cotización, condiciones y partidas):** en la pestaña Cotización, Tiempo de entrega, Garantía y Vigencia se editan (textarea, autoguardado en `opciones.condiciones`) y ese mismo texto es el del PDF y de la vista previa. Si el campo está vacío se conserva lo que ya imprimía el PDF (entrega: lo guardado en condiciones, si no `deliveryTime`, si no «15 días naturales…»; vigencia: «N días naturales (vence el dd/mm/aaaa)»). La descripción de la partida ya no se corta a 200 caracteres: `cotizacion_items.name` pasa de varchar(200) a text (migración `20260928200000_cotizacion_partida_nombre_largo`), el título y la descripción del editor crecen con el texto (saltos y viñetas) y la fila del PDF crece y sigue en la hoja siguiente. Typecheck y build de API y web en verde. Despliegue: `cd /var/www/nexara-app && bash deploy/update.sh --with-migrate`.
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
