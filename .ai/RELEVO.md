# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-08-27
- **Rama:** mejora/calidad-y-web

## Hecho en este turno

### Tests de `apps/web` — el hueco principal, cerrado
- Runner nuevo: **Vitest 2.1 + Testing Library + jsdom**. Config en
  `apps/web/vitest.config.mts` (alias `@/*` replicados a mano desde `tsconfig.json`)
  y `apps/web/vitest.setup.ts` (limpia `localStorage` entre tests; stubs de
  `matchMedia`, `IntersectionObserver`, `createObjectURL`).
- **10 ficheros de spec, 99 tests, todos en verde.** Prioridad tal como se pidió:
  - Multi-tenant: `lib/tenant.spec.ts` (7), `components/CompanySwitcher.spec.tsx` (10),
    `lib/api-base.spec.ts` (11 — incluye la cabecera `X-Company-Id`).
  - Guardas de ruta por rol: `lib/rbac/page-matrix.spec.ts` (12),
    `lib/rbac/role-mapping.spec.ts` (12), `lib/legacy-path-remap.spec.ts` (10),
    `components/RoleGuard.spec.tsx` (8).
  - Formularios con validación: `components/ClientCreationForm.spec.tsx` (8),
    `components/BranchesForm.spec.tsx` (9), `lib/ops-activity-form.spec.ts` (12).
- Scripts: `npm test` en `apps/web`; en la raíz `test:web` y `test` = api + web.
- **CI**: job `Tests · Web` añadido a `.github/workflows/ci.yml`, después del de API.

### Bug de producción encontrado por los tests
`apps/web/lib/legacy-path-remap.ts:80` — el destino del remapeo era `'/tickets$1'`,
pero `joinRemapTarget()` **concatena**, no sustituye grupos de regex. Un bookmark
de portal `/panel/tickets/9` acababa en `/tickets$1/9`, ruta que la whitelist del
rol `cliente` no reconoce: **el cliente veía un bloqueo**. Corregido, con test de
regresión.

### Otros
- **A1-3** `apps/api/src/gps/dto/update-gps.dto.ts`: era un stub vacío. Completado
  como `PartialType(OmitType(CreateGpsDto, ['usuarioId']))` — se omite `usuarioId`
  a propósito (reasignar un ping falsearía recorrido y asistencia, y saltaría la
  comprobación que `GpsController.create()` ya hace). Spec nueva con 11 casos que
  replica el `ValidationPipe` global de `main.ts` (`whitelist` + `forbidNonWhitelisted`).
- **A1-5** `apps/tmp/` eliminado (6 archivos versionados + 3 logs). El script
  `apps/api/scripts/smoke-cotizacion-pdf.ts:45` escribe ahí y **recrea el directorio
  solo** (`mkdirSync recursive`), así que no se rompe; se añadió `apps/tmp/` a
  `.gitignore` para que no vuelva al árbol.
- **A1-4** `docs/DEUDA-TECNICA.md` nuevo. **El conteo real de TODO/FIXME es 5, no ~31**
  (ver el porqué en el §0 del documento).
- **A1-9** Worktrees y ramas: ver «Higiene» abajo.
- **A1-10** `docs/PLAN-MEJORA-ERP.md` marcado obsoleto en cabecera, con tabla de
  contraste entre lo que afirma y la realidad de `main`. **No se borró.**
- `apps/web/app/components/Footer.tsx`: enlace a `/legal/eliminar-cuenta` añadido.
  La página existía y estaba en el sitemap pero **ningún enlace de la UI llevaba a
  ella**, y Google Play exige que sea alcanzable desde la navegación.

### Higiene de worktrees y ramas (A1-9)
Auditado **antes** de tocar nada. **No había trabajo sin integrar en ninguno.**

| Qué | Commits únicos vs `main` | Acción |
|---|---|---|
| worktree `angry-hofstadter-3f8b2a` | 0, árbol limpio | `git worktree remove` |
| worktree `erp-improvement-plan-f51bd7` | 0, árbol limpio | `git worktree remove` |
| `claude/angry-hofstadter-3f8b2a` | 0 | `git branch -d` |
| `claude/erp-improvement-plan-f51bd7` | 0 | `git branch -d` |
| `refactor/roles-purge-v2` | 0 | `git branch -d` |
| `seo-serp-favicon` | 0 | `git branch -d` |

- Se usó `git branch -d` (rechaza ramas no fusionadas), nunca `-D`.
- **Las ramas remotas siguen ahí**: `origin/refactor/roles-purge-v2`,
  `origin/seo-serp-favicon`, `origin/claude/erp-improvement-plan-f51bd7`.
  Nada se perdió; se recuperan con `git checkout -b <rama> origin/<rama>`.
- Los worktrees duplicaban `apps/api/prisma/migrations` con copias **viejas y
  subconjunto** de las 149 de `main` (68 y 146). Ninguna migración huérfana.
  Recuperados ~615 MB y las búsquedas globales ya no salen duplicadas.

## A medias — CUIDADO
- nada

## No tocar
- `apps/web/app/(subdomains)/tickets/layout.tsx` — heredado del turno anterior.
- `NEXARA-credenciales-usuarios-v4.xlsx` — hoja de credenciales, no versionada.
- `apps/api/prisma/seed-demo-users.ts` — **17 contraseñas en claro de cuentas VIVAS
  de producción.** No rotar, no mover, no reescribir historial. El job `fugas` de
  `.github/workflows/ci.yml` lleva `continue-on-error: true` justo por esto:
  **dejarlo así** hasta que Adam decida.
- `package-lock.json` — el diff es enorme (~11 k/8,6 k líneas) porque npm 11
  renormaliza el fichero al instalar. Es ruido de formato, no de dependencias:
  la entrada de `@nestjs/passport` quedó byte a byte idéntica a `main`.

## Estado verificado al cerrar
- `npx tsc --noEmit -p apps/api/tsconfig.json` → limpio
- `npx tsc --noEmit -p apps/web/tsconfig.json` → limpio (las specs entran en el
  `include`, así que también se comprueban)
- API: **70 suites / 509 tests** en verde (antes 69 / 498)
- Web: **10 ficheros / 99 tests** en verde (antes 0)

> Aviso de entorno local: `apps/api/node_modules` estaba vacío en esta máquina y el
> typecheck de la API fallaba con `Cannot find module '@nestjs/passport'`. **No era
> un problema del repo** — el paquete está declarado y en el lock desde antes. Se
> arregla con `npm install` en la raíz. CI hace `npm ci` y nunca lo vio.

## Siguiente paso
1. **A1-2 · Playwright e2e de UI.** Vitest cubre unidades y componentes aislados;
   no hay ni un flujo de extremo a extremo. Empezar por login → selección de
   empresa → una ruta de cada panel.
2. **A1-6 · Observabilidad.** No hay APM, ni alertas, ni uptime para ~15 subdominios
   en producción. Ya existe `apps/api/src/observability/` para extender.
3. **A1-7 · Runbooks de incidente + manual de operador.** No existen.
4. **A1-8 · Cerrar `docs/native-parity-matrix.md`.** OJO, **el encargo describía
   `apps/mobile` (Next/Capacitor) y en disco no existe**: hay `apps/mobile-native`,
   que es Android/iOS nativo (Gradle/Kotlin + Xcode). La retirada de la variante
   Capacitor parece hecha ya. Verificar contra la matriz antes de dar por cerrado.
5. **Deuda de producto** en `docs/DEUDA-TECNICA.md`: NOC con datos sintéticos, PAC
   en modo mock (bloqueado en producción por diseño), SCIM anunciado sin implementar,
   notificaciones de comida sin WebSocket, y 3 ficheros muertos con 0 referencias.
6. Los **2 stashes** siguen ahí sin tocar. Se revisaron y ya están integrados en
   `main`, salvo el enlace del Footer que este turno rescató a mano. No se
   descartaron: eso lo decide Adam (`git stash list`).
