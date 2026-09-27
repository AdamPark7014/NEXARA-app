# RELEVO

- **Último turno:** cursor
- **Fecha:** 2026-09-27
- **Regla:** se trabaja **siempre directo en `main`**: sin ramas, worktrees ni PRs (Adam es el único programador).
  Está en las reglas de Cursor, `~/.claude/CLAUDE.md`, `C:\dev\CLAUDE.md`, `FUSION-PROTOCOL.md` y la plantilla EXEC-PACKET.
- **Única rama:** `main` en local, en GitHub y en el servidor. Cero worktrees. `mejora/calidad-y-web` ya no existe.
- **Servidor:** `/var/www/nexara-app` sigue `main`; `deploy/update.sh` despliega la rama actual.
- **Respaldo de todo lo borrado:** `C:\dev\.ai\archivo-nexara-2026-09-27\` — `todas-las-ramas.bundle`
  (224 ramas) + parches/zips de los 39 worktrees con cambios (`final\` = copia justo antes de borrar).
  Recuperar una rama: `git fetch C:\dev\.ai\archivo-nexara-2026-09-27\todas-las-ramas.bundle "refs/heads/<rama>:refs/heads/<rama>"`.

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
