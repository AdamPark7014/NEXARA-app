# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-18
- **Rama:** muestra/ui-minimalista (sale de mejora/calidad-y-web 494debf6) — MUESTRA para Adam, sin push ni deploy
- **HEAD:** este commit — lo desplegado en Hetzner (prueba) sigue siendo e6f885ff de mejora/calidad-y-web

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Muestra «1 · Minimalista» (rama muestra/ui-minimalista, 18-09) — espera visto bueno de Adam

- Base: tokens `--ui-*` en `apps/web/app/ui-tokens.scss` (claro + `body.dark`), Inter 14 px (`--nx-font-app`,
  sin preload) y piezas en `apps/web/components/base/` (PageHead, Tabs, Button/ButtonLink, Badge, Card/CardHead,
  StatRow/Stat, Segmented, Toolbar/SearchInput, EmptyState, Skeleton/SkeletonRows, Alert, Avatar, InfoPopover,
  clases `tabla`).
- Shell (`components/app-shell`): menú blanco con renglones de 32 px y activo teal, barra superior de 52 px
  quieta (rol y «En línea» en gris), migas con «Detalle» para ids y solo la página actual en teléfono.
  Vale para todos los paneles que usan AppShell.
- Pantallas: `/erp/pizarra` (equipo), `/erp/cotizaciones` (lista), `/erp/asistencias/indicadores` (ranking por
  persona) y su detalle (frase en palabras + línea de tiempo con escala común + actividades con «por qué cuenta»).
  Lógica de lectura nueva en `lib/kpis-lectura.ts` (con spec). Se quitaron `KpiResumen`/`KpiLineaDeTiempo`.
- Capturas antes/después (claro/oscuro, 1440/390) en el scratchpad de la sesión `muestra-ui\`.
- Si Adam aprueba: migrar módulo por módulo con las piezas de `components/base` (ver el reporte del commit).
- Ojo para capturar en worktrees con junction de node_modules: `next.config.js` hace `poll: 1000` en dev y el
  servidor se queda girando; para capturas se apagó el poll localmente (NO se commiteó).

## Este turno (claude-code, 18-09) — requisitos «Tareas/Dashboard» y cotizaciones

Requisitos de Adam: tabla «Tareas/Dashboard» (evidencia, aceptación, periodo, KPIs) +
`Downloads/Primera cotizacion  (1).pdf` (referencia del PDF) + `Downloads/gantt_seguimiento_proyectos (1).xlsx`
(hoja «Desarrollo») + `Downloads/V1_Nomenglaturas_Nexara.xlsx`. Entrega de avances: viernes 18-09.

### Integrado y desplegado

1. **PDF de propuesta** (`2235edec`): rehecho en vectores (Adam NO quiere la portada con captura del video
   público), con todos los campos de su referencia: portada (cliente/proyecto/folio/fecha/versión, índice 01–04),
   01 objetivo (intro + beneficios + cierre), 02 alcance (título + intro + subsecciones con viñetas), 03 planos a
   página completa, 04 cotización (datos empresa, cliente, N°, emisión, validez, tabla, subtotal/IVA/total,
   términos con etiqueta, firma). Sin filas de subtotal por grupo (como la referencia). «Página n de N».
   Correo: usa el perfil de empresa (en el servidor dice `contacto@`; la referencia `gerencia@`).
2. **Logo en todos los PDFs de producción** (`6a1ffeb0`): `loadPdfAsset` busca junto al build.
3. **Solo «Iniciar actividad»** (`ebf98b4d`): `POST me/activities/:id/iniciar` sella `inicioRealAt`;
   `aceptar` es alias; `rechazar` → 403 para el asignado. Web/Android/iOS sin «No puedo tomarla».
4. **Periodos** (`9ac41ade`, migración `20260918120000_actividades_periodo` APLICADA): `periodoInicio/Fin`,
   «Día N de M», SLA/semáforo contra fin de periodo, asistencia acepta la sucursal todo el periodo,
   `GET/POST /proyectos/:id/programacion|programar-actividades`, rango «Del/Al» en asignar.
5. Antes en el turno: `/api/proyectos` + `/erp/proyectos`, evidencia por campos (web + apps alineadas al
   contrato), fix `RefObject` del build web, fix tenencia al crear proyecto. Otra sesión dejó la web en verde
   (`62b3bb93`, 744/744 vitest) — detalle en su commit.

6. **KPIs** (`d9677c98`, migración `20260918130000_asistencia_uniforme` APLICADA): `GET /api/me/kpis/equipo`
   (+ `/:userId`), `PATCH /api/attendance/:id/uniforme`; web `/erp/asistencias/indicadores` (+ detalle por
   persona) y ✓/✗ de uniforme junto a la foto de entrada. Supuestos por confirmar con Adam: oficina 09:00 /
   campo 08:00 con 15 min, extra > 8 h netas entre semana o todo sáb/dom, comida sin regreso = 60 min.
7. **Editor de cotizaciones** (`e6f885ff`): tipo documento en el orden del PDF (portada, 01–04), autoguardado,
   vista previa real, «Enviar por correo», folio explicado en lista y detalle, «Asignar folio»
   (`POST /cotizaciones/:id/refoliar`), `propuesta-payload.ts` arma el payload del PDF. Filas del PDF sin IVA
   (antes no cuadraban con el subtotal) y en el orden del editor.

### Decisiones pendientes de Adam

- **Estilo visual**: dijo que la UI de los módulos y el PDF siguen sin convencerle. Se le mostraron 3
  direcciones de PDF (A corporativo sobrio / B tecnológico oscuro / C editorial) y 3 de pantallas
  (1 minimalista / 2 panel ejecutivo / 3 documento con vista previa) y se le pidió una referencia real.
  Plan: guía visual → muestra aprobada → aplicar a todos los módulos. Para revisar pantallas hace falta
  que él inicie sesión en el panel lateral.
- `scripts/refoliar-borradores.js` (dry-run por defecto, `CONFIRMAR=SI`) — gasta un número del contador
  del autor por borrador; no correr sin su sí.
- Partidas del editor: hacerlas más compactas (tipo hoja de cálculo).

### Pendiente / conocido

- **Puestos sin Core** (pregunta para Adam): `dir_operaciones`, `coord_admin`, `coord_ventas`, `vendedor`,
  `disenador`, `rh`, `contabilidad` no abren `/erp/pizarra` ni `/erp/asistencias` con Core-only.
- **Google Maps**: sin cuenta de facturación activa; clave web sin restricción de aplicación; Android usa otra
  clave (`local.properties`); no borrar la vieja. Memoria `nexara-google-maps-claves`.
- `activities.controller.spec.ts` («scopes an ops manager…») falla desde antes: su prisma falso no trae `user`.
- Proyectos API: al cambiar responsable queda el anterior como RESPONSABLE; PLANNED→ACTIVE no pone
  `actualStartDate`; borrar documento no borra el archivo.
- El flujo de evidencia del navegador no sabe de campos (solo apps). iOS: cambios de hoy sin compilar.
- Revisión visual en web pendiente: Adam debe iniciar sesión él (no se escriben contraseñas).

### No tocar

Puente NAS.
