# RELEVO

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
  - Pendiente de Adam: decidir si vuelve `core` al DNS para ligas viejas; publicar apps móviles nuevas; equipos/agentes
    con `integra.nexara.com.mx`.
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
