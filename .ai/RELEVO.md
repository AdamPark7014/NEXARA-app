# RELEVO

- **15-11 ~19:30 México (claude-code) — Asignar con IA por tipo y elementos, cotización editable, cotización ligada en todo tipo. NO desplegado.**
  - Asignar con IA: «instalar 4 cámaras en IPADE» = proyecto (prompt), `elem` en la salida y respaldo en código
    (`ai/asistente/elementos.ts`) → `camposEvidencia` (Cámara 1…4 × antes/en progreso/después; mantenimiento solo
    antes/después; junta, trámite y comercial sin campos; tope 40). Sin proyecto activo y con cliente: `proyectoNuevo`
    en vez de pasar a tarea. La tarjeta (`AsistenteIA.tsx`) muestra «Evidencia» editable (nombre, momentos, quitar,
    agregar) y el proyecto nuevo editable; al confirmar crea el proyecto con `operational-projects/alta-rapida`
    (ahora acepta `serviceClientId`), la actividad y `PUT evidencia-campos`.
  - Clientes: el alta rechaza nombres de relleno («N/a», «Varios», «Sin cliente»; `esNombreDeRelleno`). Siglas y
    mayúsculas ya empataban (BUAP ↔ Benemérita…, ipade ↔ IPADE), medido con el padrón real (40 clientes).
  - Cotizar con IA: cada renglón dice «Pediste: «…»», tipo (segmento) e IVA se corrigen antes de usarla;
    `destinoDe` toma el último «para» (antes «1000 tarjetas para control de acceso y 2 lectores para X» perdía los lectores).
  - Cotización ligada en cualquier tipo de actividad (`CotizacionDeActividad`, visible si ya hay una o si puede
    cotizar); solo la comercial avanza con el estado de la cotización (`sincronizarActividad` filtra).
  - Cadena Cursor → Codex → Claude: Cursor dejó el primer borrador y se colgó; su segunda corrida y Codex no pudieron
    usar la terminal (hooks de PowerShell envueltos en bash). Lo terminé yo.
  - Pendiente: descarga masiva del SAT (falta la e.firma; el CSD ya está en `/etc/nexara-secrets/sat/csd`), revisión
    con IA de calificaciones, avisos por chat, diseñador de proyectos. Desplegar pide OK de Adam.

- **15-11 ~10:30 México (claude-code) — Aprobaciones como bandeja única y menú «Por estrenar» (Adam: «lo que consideres apropiado»).**
  - Aprobaciones nunca tuvo datos (`workflow_instances` = 0). `lib/bandeja.ts` junta evidencias por revisar (me/revisiones,
    paraTi), viáticos Pendiente, horas extra y descuentos de la semana pasada (control-semanal), solicitudes de equipo y
    firmas de flujo; cada fuente callada si da 403. `components/approvals/BandejaUnica.tsx` arriba de las firmas; cifras y
    filtros de flujo solo si hay firmas. El número del menú = `contarBandeja` (sin la nómina, que pesa).
  - `me/navigation` devuelve `porEstrenar` (almacén sin stock ni movimientos, documentos, compras en cero por empresa); el
    menú los manda a «Por estrenar», al final y plegado (`FOLDED_GROUPS_STORAGE_KEY` v3).
  - Este despliegue también lleva `4e07de69` (dependencias Node 26/npm 12) que estaba sin desplegar.

- **15-11 ~01:05 México (claude-code) — Dependencias al día con Node 26.13.1 / npm 12.2.2 (solo parches y menores). NO desplegado.**
  - Subidas: next 15.5.29, MUI 7.3.11, maplibre-gl 6.18.0 (con sus `.mjs` copiados a `public/maplibre/`), sass 1.108,
    recharts 3.10, hls.js 1.7, axios 1.21.1, openai 6.49, nodemailer 10.5, firebase-admin 13.10, bullmq 5.81.5,
    express 5.3 (raíz), zod 4.6.7 (raíz), testing-library y especificadores de Nest 10.4.22 / Prisma 5.22 (ya estaban en el lock).
    `@testing-library/jest-dom` se queda en 6.9.1: npm marca la 6.10.0 como deprecada («minor con cambios que rompen»).
  - **npm 12 bloquea los scripts de instalación de las dependencias.** `package.json` lleva ahora `allowScripts`
    (Prisma, sharp, esbuild, @parcel/watcher, msgpackr-extract, protobufjs, @firebase/util, @nestjs/core; `canvas: false`,
    que no tiene binario para Node 26 y nunca compiló aquí). npm 10 (Docker) ignora ese campo.
  - npm 12 dejó `next` dentro de `apps/web/node_modules`: `scripts/next-build-resilient.js` ya lo resuelve con
    `require.resolve` desde la web (antes ruta fija a la raíz). El lock nuevo pasa `npm ci --dry-run` con npm 10.9.9
    (el de `node:22-slim`), para api y para web.
  - Node 25+ trae un `localStorage` global vacío que tapaba al de jsdom: las 248 pruebas de la web caían. Arreglo en
    `apps/web/vitest.config.mts` (`poolOptions.forks.execArgv: ['--no-experimental-webstorage']`).
  - Verificado con Node 26: typecheck, 439 archivos de pruebas de API, 248 de web (2,143 pruebas), `build:server`,
    `AppModule` carga, `next start` sirve `/contacto` y el mapa se dibuja con calles. Mayores pendientes y su costo:
    `C:\dev\.ai\dependencias-2026-11.md`.
  - No tocado: `apps/web/lib/integra-shared/_lib.ts` y `.codex/` (cambios ajenos sin commitear desde el 07/09-11).

- **14-11 ~22:10 México (claude-code) — El ERP vive solo en `app.nexara.com.mx` (Adam cambió core → app en el DNS).**
  - En GoDaddy solo quedan raíz/`www`, `app.`, `api.`, `email.` y `autodiscover.`; `core.`, `integra.` y los demás
    subdominios de páginas ya no resuelven. El middleware mandaba `app.` → `core.` (308) y el ERP no abría.
  - `586c310c7`: canónico de todos los paneles = `app` (`middleware.ts`, prueba `middleware-dominio-app.spec.ts`),
    subdomain-config/panel-urls/access-matrix/handoff/panel-home, SSO (callback `https://app.nexara.com.mx/api/auth/oidc/callback`),
    apps móviles y docs. Desplegado web + API con relevo (`/root/deploy-app-dominio.sh`, log en `/root/deploy-app-dominio.log`).
  - Traefik: solo `app-frontend` sirve páginas; `core-a-app` (301, raíz → `/erp/pizarra` para no hacer bucle con el 308
    viejo que guardan los navegadores) por si `core` vuelve al DNS; integra conserva aviso del NVR, go2rtc y `/api`.
    Health check del web: `hostname: app.nexara.com.mx` + `followRedirects: false`.
  - Certificado propio de `app.` (Let's Encrypt, vence 13-02-2027): se quitó de `acme.json` el certificado de `console`
    que llevaba `app.` como SAN con 15 hosts muertos (respaldo en `/root/respaldo-acme-20261115/`). Traefik reiniciado ~3 s.
  - Google Cloud (cliente «NEXARA Core (login web)», con el sí de Adam): agregado URI 2
    `https://app.nexara.com.mx/api/auth/oidc/callback` (se dejó el de core.). Probado: Google ya lleva a «Elige tu cuenta»
    en vez de `redirect_uri_mismatch`; el login completo con Google lo prueba Adam con su cuenta.
  - Adam: `core` NO vuelve al DNS («todo ahora en app»). Pendiente suyo: equipos/agentes con `integra.nexara.com.mx`.
  - **Apps 1.4.1 (~22:45):** la 1.4 instalada (iOS build de `72cd839a4`) solo usaba `core.` en las ligas del chat que abre
    en el navegador (facturas, asistencia ajena); todo lo demás va a `api.nexara.com.mx`, que no cambió, y no hay
    actualización obligatoria: la 1.4 sigue funcionando mientras sale la nueva. `77c09d364`: Android armaba la URL con el
    subdominio del panel en `WebPanelUrl` (`/erp`→core, `/tickets`→portal), aparte de `CORE_WEB_BASE`; ahora `/erp`→app y el
    portal no tiene web (app./tickets da 404). 1,098 pruebas de Android, paridad app-web e `ios-static-check` en verde.
  - **Android 24 (1.4.1)** subida a Play (AAB de `be8988b`, SHA-256 F2607201…8E77, sin `core.` en el dex), enviada a
    revisión: lanzamiento completo 100 %, 0 dispositivos pierden compatibilidad, publicación gestionada apagada (sale sola).
  - **iOS 1.4.1 (17): enviada a App Store el 15-11 ~00:35 México, `WAITING_FOR_REVIEW`, `AFTER_APPROVAL`** (sale sola).
    La primera corrida (`43676732062`) falló al subir: `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. El que faltaba
    era el **contrato de licencia del Apple Developer Program** en developer.apple.com/account (no en Negocio de ASC);
    Adam lo aceptó y la API se abrió ~30 min después. Corrida `43684319731` subió el build 17 (VALID); la versión heredó
    10 capturas de iPhone 6.7", cuenta de revisión y notas (3,908 car.), cifrado `false`. Novedades: ligas a app.
    Script para la próxima: `scripts/asc_publicar.py` (estado, builds, preparar, enviar). Siguientes números: Play 25, iOS 18.
  - Play: la 24 pasó las comprobaciones y está «en proceso de revisión» (la ficha pública aún dice 1.4.0).
  - Pendientes en ASC → Negocio (no bloquean hoy): declarar estatus de comerciante para la UE y el «Acuerdo para apps
    gratuitas» tiene versión nueva disponible.
  - Laptop: `JAVA_HOME` apunta a `jdk-21.0.10.7-hotspot`, que ya no existe; el instalado es `jdk-21.0.13.21-hotspot`
    (Gradle falla sin ajustar `JAVA_HOME` en el comando).
  - Navegadores que ya visitaron `app.` guardan el 308 viejo a `core.`: se arregla borrando «Imágenes y archivos en caché».

- **2026-11-14 (claude-code) — Limpieza de documentación (Adam: «quita documentación y unifica»).** Borrados 25 documentos obsoletos sin referencias (auditorías, planes y prompts viejos; están en el historial de git). Índice único del repo: `docs/INDICE.md`; índice de todos los proyectos: `C:\dev\DOCS.md`; memoria compartida de Codex/Claude/Cursor/Grok: `C:\dev\.ai\memoria`. RELEVO recortado a los 3 turnos más recientes.

- **11-11 ~11:30 México (claude-code) — Accesos propios y visibilidad de reuniones (Adam, 11-11).**
  - `SHARED_SESSION_URL_RULES`: mfa/status|setup|confirm|disable, workflow/my-pending y ai/voz/estado para todo rol; sus
    `@RBAC({})`. Prueba `sesion-propia-todos.spec.ts` recorre los 18 roles. `formatApiError` ya no enseña «no puede acceder a GET /api…».
  - Reuniones: `meetings/visibilidad.ts` (`veReunion` + `ReunionVisibleGuard` en los dos controladores). Dirección ve
    todo; columna `soloDireccion` (migración 20261111170000) en true para todas las previas; las nuevas las ven asistentes,
    quien condujo y sus jefes hacia arriba. Lista y lecciones filtran. Web: «Comenzar a grabar» pregunta quién está.

- **10-11 ~15:30 México (claude-code) — Perfil de arquitecto (Adam: Josué y Jorge Leonardo asignan obra).**
  - `arquitectoAlcanzaA` (`me/equipo-alcance.ts`): rol `arquitecto` llega a quien reporta a operaciones@ (David) o
    jose.ramirez@ (José Antonio), por jefe y no por correo. Crea tarea/proyecto/obra por rol (Josué sigue con su fila
    por correo, con comercial); a sistemas se le suma obra solo cuando asigna un arquitecto. Asignar con IA abierto al rol.
  - Salvador, Erick, Ricardo y Genaro faltaban en RECEIVE_BY_EMAIL (solo recibían tarea): ya reciben obra.
  - Jorge Leonardo Plácido Torres: Adam lo da de alta en Perfiles (rol Arquitecto) y guarda sus claves en
    `secrets/PASSWORDS NEXARA.xlsx`; Claude no crea cuentas con contraseña.

- **10-11 ~19:30 México (claude-code) — Core premium, ola 1 (Adam: «sí», con cada pestaña y la barra lateral).**
  - Estilo del prototipo del 08-11 pasado a código como bloque final en cada módulo base: `AppShell.module.scss` (menú de
    noche en los dos temas vía `--sb-*`, buscador, activo verde, barra superior translúcida), `base.module.css` (título 30 px,
    primario con relieve), `piezas` (Stat en tarjeta), `ModulePage` (lista), `DataTable`, `DashKit` (banda de Hoy) y `ui/PageHeader`.
  - Ola 2: Análisis de Nómina (`components/finance/AnalisisNomina.tsx`, seis semanas del Control semanal) arriba de los
    pagos registrados; tokens claros `--ui-bg` #f3f5f9 y `--ui-elev-1/2` con la sombra premium; bandas de Costos,
    Vehículos y Desempeño con el mismo azul noche. Recorridas 16 pantallas; faltan subpestañas y editores (cotización, CCTV).


_Turnos anteriores recortados el 2026-11-14 (limpieza de documentación). Historial completo: `git log -p -- .ai/RELEVO.md`._
