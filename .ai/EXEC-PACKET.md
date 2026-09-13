# EXEC-PACKET — NEXARA-app

- **Escrito por:** Claude (cabeza)
- **Fecha:** 2026-09-13
- **Rama:** mejora/calidad-y-web
- **Estado:** LISTO PARA CURSOR
<!-- Estados: BORRADOR → LISTO PARA CURSOR → EN EJECUCION → CERRADO -->

## Objetivo
Hacer **amigables, intuitivos y fáciles** (petición de Adam) los módulos Core **Actividades** (pizarra, ficha de persona, asignar) y **Asistencias**, para encargados y técnicos no técnicos que usan el celular. Solo copy, layout, tamaños de toque y estados vacíos/carga/error, con el estilo de `erp/mis-actividades` (ya hecho por Claude).
**Fuera de alcance:** API, Prisma, reglas de asignación (Luis/despacho/puente Antonio), flujo de datos de asignar, páginas `/ops/*`, app móvil.

## Criterios de éxito
- [ ] Ningún texto visible con jerga interna: «OT», «AN» como título, «LEAD», «subtree», «seed», «jerarquía», «lunch-breaks», «Telemetría», «ERP · Personas», «managers (CEO / subtree)», estatus crudos («En Proceso», «Por Validar») ni `coreKind` en minúsculas.
- [ ] Todo botón/enlace tocable ≥ 40px de alto; textareas/inputs con `font-size` ≥ 16px (evita zoom en iOS).
- [ ] Cada pantalla tiene una acción principal visible sin hacer scroll en 375px.
- [ ] Carga, vacío y error con estado propio (vacío estilo 🎉 de mis-actividades); un error de refresco NO borra los datos ya mostrados.
- [ ] Pasos de asignar numerados en secuencia (1, 2, 3…) sin saltos.
- [ ] Tras asignar, la ficha de la persona muestra «✅ Actividad asignada».
- [ ] tests: `tsc` de web solo con los 4 errores previos (ver Tests); `vitest lib/ops-activity-form.spec.ts` verde.
- [ ] verificación manual: los 8 checks de «Tests / verificación» en 375×812 y en escritorio, claro y oscuro.

## Contexto mínimo a cargar (≤7 archivos)
- `apps/web/app/(panels)/erp/mis-actividades/page.tsx` — **referencia de estilo** (Chip, Stat, btnPrimary/btnSecondary, estados vacío/carga, `estatusUi`, `priorityUi`, `kindLabel`, `formatWhen`, `formatMinutes`, banner con `?nueva=`).
- `apps/web/lib/activity-kinds.ts` — `ACTIVITY_KINDS`, `ASSIGNMENT_CHARGES`, `isAreaManagerEmail`, `isCeoEmail`. **No cambiar reglas.**
- `apps/web/components/ui/Button.tsx` — tamaños sm 30 / md 36 / lg 44px.
- `apps/web/app/(panels)/erp/pizarra/[userId]/asignar/page.tsx`
- `apps/web/components/ops/OpsActivityForm.tsx`
- `apps/web/app/(panels)/erp/pizarra/[userId]/page.tsx`
- `apps/web/app/(panels)/erp/asistencias/page.tsx`

## Archivos a tocar (máx 12)
| Archivo | Acción | Notas |
|---------|--------|-------|
| `apps/web/lib/activity-labels.ts` | crear | Mover desde mis-actividades: `PRIORITY_UI`/`priorityUi`, `ESTATUS_UI`/`estatusUi`, `kindLabel`, `formatWhen`, `formatMinutes`, `shortName`. Exportar también `initials()` (hoy copiada 4 veces). |
| `apps/web/app/(panels)/erp/mis-actividades/page.tsx` | editar | Solo importar los helpers de `activity-labels.ts` y borrar los locales. Cero cambios de lógica. |
| `apps/web/app/(panels)/erp/pizarra/page.tsx` | editar | Paso 3 |
| `apps/web/app/(panels)/erp/pizarra/[userId]/page.tsx` | editar | Paso 4 |
| `apps/web/components/pizarra/DespachoPendingPanel.tsx` | editar | Paso 5 |
| `apps/web/app/(panels)/erp/pizarra/[userId]/asignar/page.tsx` | editar | Paso 6 |
| `apps/web/components/ops/OpsActivityForm.tsx` | editar | Paso 7 (solo tono `core`; el tono `ops` no cambia) |
| `apps/web/app/(panels)/erp/asistencias/page.tsx` | editar | Paso 8 |
| `apps/web/components/AttendanceForm.tsx` | editar | Paso 8 (copy y tamaños) |
| `apps/web/components/AttendanceGpsDayPanel.tsx` | editar | Paso 8 (coordenadas → «Ver en mapa») |
| `.ai/RELEVO.md` | editar | Cierre |

> Los números de línea son aproximados (auditoría de 13-09 11:35; OpsActivityForm cambió después). **Localiza por el texto citado**, no por la línea.

## Pasos numerados (hiperdetallados)
1. **Arranque.** `pwsh -File C:\dev\scripts\relevo\relevo.ps1 estado`. Debe estar limpio y el último commit ser de Claude «Mis actividades…». Si hay cambios sin commitear, `relevo.ps1 salvar` y para. `packet.ps1` → marca Estado `EN EJECUCION`.
2. **Helpers compartidos** (`lib/activity-labels.ts`): copia tal cual las funciones de mis-actividades listadas en la tabla, añade `initials(name)` (misma implementación que `pizarra/page.tsx` ~L18). Añade `CHARGE_LABEL = { ejecucion: "La hace él/ella", despacho: "La reparte a su equipo" }`. En mis-actividades reemplaza las definiciones locales por imports. Commit: «Core UX: helpers de etiquetas compartidos».
3. **Pizarra** (`erp/pizarra/page.tsx`):
   - a. Chips de estado (~L286-306): conviértelos en **filtros** con estado local `filter: BoardUserStatus | "todos"`; chip activo con borde `var(--primary)`; añade chip «Todos». Botones ≥40px.
   - b. Etiquetas: «Activo»→«Trabajando», «Atrasado»→«Atrasado», «Inactivo»→«Sin entrada hoy», «Sin actividad»→«Libre». Color de «Libre»: gris (`var(--text-tertiary)`), no azul. Texto en `lib/team-board-api.ts` ~L71-83 **solo las etiquetas**.
   - c. Punto de color del avatar (~L100): añade el texto del estado junto al nombre (no solo `title`).
   - d. Líneas de actividad (~L147-184): fuente 12.5px, muestra `NN%` junto a la barra, cambia «· Despacho/· Ejecución» por `CHARGE_LABEL`.
   - e. Cada tarjeta: botón «＋ Asignar» (≥40px) → `/erp/pizarra/${u.id}/asignar`. No para la propia tarjeta del viewer (esa usa «Mis actividades»).
   - f. Carga/vacío/error (~L308-313): vacío estilo 🎉 de mis-actividades; error con botón «Reintentar».
   - g. Poll de 30s (~L225): en error **no** hagas `setData(null)`; conserva los datos y muestra aviso pequeño «No se pudo actualizar · Reintentar». Añade «Actualizado hh:mm» junto a «Actualizar».
4. **Ficha de persona** (`erp/pizarra/[userId]/page.tsx`):
   - a. Mueve «Asignar actividad» (~L372-389, hoy al final) **debajo del header**, `btnPrimary` ≥44px. Sigue oculto si `isSelf`; en su lugar, si `isSelf`, enlace «Ver mis actividades» → `/erp/mis-actividades`.
   - b. «← Equipo» (~L118-134): `minHeight: 44`, padding `8px 0`, texto «← Volver al equipo».
   - c. Actividad en curso (~L222-226): título = `act.titulo` (grande); debajo «Folio {anNumber}» pequeño; estatus con `<Chip>` de `estatusUi`.
   - d. Historial (~L302-306): reemplaza `h.estatus`, `h.coreKind` y badge por chips: `estatusUi(h.estatus)`, `kindLabel(...)` (con subtipo de tarea), `CHARGE_LABEL`. Filas sin evidencia: sin cursor pointer; con evidencia: flecha «▾/▸».
   - e. PDF (~L346-359): quita `<object>`; pon enlace «📄 Abrir hoja de servicio» (`target="_blank" rel="noreferrer"`).
   - f. «Check-in» (~L200) → «Entrada». Si no hay puesto, no muestres el email (~L177): muestra «Equipo NEXARA».
   - g. `fetchTeamBoardHistory(...).catch(() => [])` (~L75): guarda el error y muestra «No se pudo cargar el historial · Reintentar» en lugar de «Sin historial todavía».
   - h. Banner: si la URL trae `?asignada=<id>`, muestra arriba «✅ Actividad asignada» (verde, se cierra con ✕). Lee `window.location.search` en `useEffect` (no `useSearchParams`, evita el error de Suspense en build).
5. **Despacho pendiente** (`components/pizarra/DespachoPendingPanel.tsx`):
   - a. Título «PENDIENTE DE DESPACHO» → «Te toca repartir». Botón «Despachar al equipo» → «Elegir quién la hace». **Mantén los nombres** («Mándala a Antonio…»): decisión de Adam, el equipo es chico y se entiende mejor con nombres.
   - b. Contador al elegir: si hay cupo (`parseDispatchHeadcount`), muestra «{seleccionadas} de {cupo} personas».
   - c. Éxito/error con estado explícito `{ kind: "ok" | "error"; text }` en vez de `msg.includes("Asignado")` (~L274-277); muéstralo junto al botón.
   - d. «revisa la jerarquía» (~L170) → «No hay gente de tu equipo disponible. Avísale a dirección.»
   - e. Checkboxes: toda la fila tocable ≥44px (ya es `<label>`; sube padding a `12px`).
6. **Asignar** (`erp/pizarra/[userId]/asignar/page.tsx`):
   - a. Borra el párrafo de reglas internas bajo «1 · Tipo de actividad» (~L431-435, empieza «Solo se muestran tipos válidos para…»). Sustituye por: «Solo ves los tipos que {nombre} puede recibir.»
   - b. Numeración: calcula `const steps = [...]` según lo que se muestra (tipo → encargo si aplica → equipo si aplica → datos) y usa el índice+1 en cada título. Nada de `"3"`/`"4"` literales (~L650, ~L834).
   - c. Copy: «Despacho a equipo» se queda como título, pero la ayuda dice «La reparte a su gente». «Ejecución directa» → ayuda «La hace él/ella». Quita «se asignará como LEAD» (~L683) → «también se avisará a {nombres} para coordinar». Quita «revisa el seed / jerarquía» (~L632) → «No encontramos a Antonio en el tablero. Avísale a dirección.»
   - d. Textareas (~L496, ~L779, ~L808): `fontSize: 16`.
   - e. Tras crear con éxito: `router.push(\`/erp/pizarra/${userId}?asignada=${activityId}\`)` en los 3 `router.push` de `handleSuccess` que van a la ficha (no en `onCancel`).
   - f. `teamError` (~L387, hoy arriba): muéstralo **también** justo encima del formulario del último paso.
7. **Formulario** (`components/ops/OpsActivityForm.tsx`) — **solo cuando `tone === "core"`**:
   - a. Oculta el input deshabilitado «AN (automático)» y el texto «AN sugerido» del `actions` de `Section`.
   - b. Labels visibles (≥13px, `var(--text-secondary)`) arriba de: Título («¿Qué hay que hacer?»), minutos («¿Cuánto tiempo toma? (min)»), tope («Máximo permitido (min)»), indicaciones («Indicaciones para todos»).
   - c. Indicaciones: cambia `<input>` por `<textarea rows={3}>` con `fontSize: 16`.
   - d. Botón enviar: `size="lg"` en tono core; −/+ de fotos `minWidth: 44, minHeight: 44`.
   - e. Modal «Tipo personalizado» (~L434): `var(--card-bg, #fff)` → `var(--surface)` (bug de modo oscuro; aplica a ambos tonos).
   - f. **No tocar**: `selfAssign`, `TAREA_TIPOS`/`tareaTipo`, `buildActivityPayload`, validaciones, `loadMeta`.
8. **Asistencias** (`erp/asistencias/page.tsx`, `AttendanceForm.tsx`, `AttendanceGpsDayPanel.tsx`):
   - a. Copy: «ERP · Personas» (~L417) → «Asistencias»; «managers (CEO / subtree)» (~L484) y «asistencia del subtree» (~L597) → «tu equipo»; «lunch-breaks (misma API que RRHH)» (~L894) → quitar; «(gps/team)»/«Telemetría» (~L959-960) → «Recorrido del día»; «Capturar + GPS» (AF ~L625) → «Registrar con ubicación»; `item.type` crudo (AF ~L731) → «Entrada»/«Salida»/«Comida».
   - b. Coordenadas crudas (~L988-991 y G ~L71-98): reemplaza por botón «📍 Ver en mapa» (`https://www.google.com/maps?q=${lat},${lng}`, `target="_blank"`), ≥40px.
   - c. KPIs (~L492): `gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))"`. Los chips de filtro (~L566-594) duplican los KPIs: haz los KPI clicables como filtro (usa `KpiCard` con `onClick` de `components/ui`) y elimina la fila de chips.
   - d. Toda la tarjeta de persona es el `Link` (~L675-689), no solo el nombre. Horas sin segundos (~L104): `hour: "2-digit", minute: "2-digit"`.
   - e. Tamaños: filtros, tabs (`PanelTabs` solo en esta página vía `style`/prop si existe; si no, no tocar el componente), selector de fecha (~L421-435) y toggle GPS a ≥40px.
   - f. Equipo: botón «↻ Actualizar» + «Actualizado hh:mm». En refresco silencioso con error (~L254) **no** hagas `setMembers([])`; conserva la lista y muestra aviso.
   - g. Errores (~L91, ~L255, ~L276, ~L307): no mostrar `res.text()` crudo; usa `formatApiError(e, "No se pudo cargar…")` de `@/lib/erp-api`.
   - h. Tick de 1s (~L391): muévelo a un componente `<LiveTimer since={iso} />` local para que no re-renderice toda la página.
   - i. **No ocultes** tabs por rol (Comidas/Trayectoria): solo añade bajo cada tab una línea que diga qué ve esa persona («Aquí ves tus comidas y las de tu equipo»).
9. **Verificación** (sección siguiente) → `docker compose up -d --build web` → checks manuales.
10. **Cierre:** reescribe `.ai/RELEVO.md` entero (hecho, verificado, a medias), `packet.ps1 close`, `relevo.ps1 cerrar -Agente cursor -Mensaje "Core UX: Actividades y Asistencias amigables"`. Un commit por paso 2-8 está bien; el último con RELEVO.

## Tests / verificación
```powershell
cd C:\dev\apps\NEXARA-app\apps\web
npx tsc --noEmit -p .
# Esperado: SOLO estos 4 errores previos y ajenos:
#   components/app-shell/CommandPalette.tsx (329,43) y (351,25)
#   lib/evidence-flow-helpers.ts (38,29)
#   lib/module-guides.ts (17,14) falta "erp-clients"
npx vitest run lib/ops-activity-form.spec.ts
cd C:\dev\apps\NEXARA-app
docker compose up -d --build web
docker compose ps web
```
Checks manuales (DevTools 375×812 y escritorio; claro y oscuro), sesión de un encargado (David o Luis):
1. Pizarra: filtrar por «Atrasado» y volver a «Todos»; «＋ Asignar» abre asignar de esa persona.
2. Ficha: «Asignar actividad» visible sin scroll; historial con chips en español; «Abrir hoja de servicio» abre el PDF.
3. Asignar a David: pasos 1-2-3-4 seguidos; sin párrafo de reglas; tras crear, ficha con «✅ Actividad asignada».
4. Asignar a Luis → Servicio: sigue saliendo solo «Despacho a equipo» + personas (regla intacta).
5. Tarea: el selector «Tipo de tarea» sigue obligatorio; «Otro» vacío bloquea.
6. Mis actividades y «＋ Auto-asignarme» siguen funcionando igual.
7. Asistencias: sin textos técnicos; «📍 Ver en mapa»; KPIs filtran; no parpadea «Sin registros» al refrescar.
8. Modal «Tipo personalizado» legible en modo oscuro.

## Workers (Cursor los dirige; un writer por worktree)
- **NO_LLM** (rg / git / tests / lint / playwright):
  `rg -n "OT\b|\bAN\b|LEAD|subtree|seed|jerarqu|lunch-breaks|Telemetr|ERP · Personas|Check-in" "apps/web/app/(panels)/erp" apps/web/components/pizarra apps/web/components/AttendanceForm.tsx apps/web/components/AttendanceGpsDayPanel.tsx`
  (repetir al final: solo deben quedar identificadores de código, no texto visible)
- **LOCAL** — revisión de copy barata antes de cerrar:
  `pwsh -File C:\Users\adpoz\Projects\ai-oss-2026\scripts\ollama-worker.ps1 -Action map -Repo "C:\dev\apps\NEXARA-app" -ItemsInline "apps/web/app/(panels)/erp/pizarra/page.tsx;apps/web/app/(panels)/erp/asistencias/page.tsx" -Prompt "Lista textos visibles en español con jerga técnica o inglés en {{item}}. Solo la lista."`
  (verifica cada hallazgo con rg; el worker local inventa)
- **MCP / Firecrawl / n8n / Temporal**: no aplica.

## Worktrees
- No hace falta: un solo writer (Cursor) sobre `mejora/calidad-y-web`. Claude no escribe mientras el packet esté EN EJECUCION.

## No hacer / riesgos
- No tocar API, Prisma, migraciones ni `apps/api/**`.
- No cambiar reglas en `lib/activity-kinds.ts` (`forcesDespachoOnly`, `forcesEjecucionOnly`, `servicioShouldGoToBridge`, `kindsForAssignment`, `TAREA_TIPOS`, `AREA_MANAGER_EMAILS`).
- No cambiar el flujo de datos de asignar (equipo se suma tras crear). Riesgo conocido: reintentar tras `teamError` duplica la actividad → **anotar en RELEVO como siguiente**, no arreglar aquí.
- No tocar `/ops/*`, `components/ui/*` (salvo usar), ni la app móvil.
- **Nunca enlazar a rutas fuera de `/erp`** (petición de Adam 13-09). El detalle de actividad en Core es `/erp/actividades/:id` y `/erp/actividades/:id/evidencias` (reutilizan las páginas de OPS vía `ActivityDetailShell core`). El middleware redirige `/ops/**`, `/crm/**`, etc. con `coreSurfaceRedirect` (`lib/core-surface.ts`), pero los enlaces nuevos deben ir directo a `/erp`.
- No usar `useSearchParams` en páginas nuevas/editadas (error de Suspense en `next build`).
- Colores: preferir `var(--success)`/`var(--danger)` en código nuevo; no hace falta migrar los existentes.
- `next start` en Docker sirve el build horneado: sin `docker compose up -d --build web` no verás cambios.
- Prohibido `git reset --hard`, `git checkout --`, `git clean`, `git stash drop`.

## Handoff a Cursor
Implementa `.ai/EXEC-PACKET.md` de NEXARA-app paso a paso sin cambiar la arquitectura; cierra con relevo.
