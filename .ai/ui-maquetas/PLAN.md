# NEXARA · Rediseño UI/UX v2: maquetas y plan de aplicación

Fecha: 2 oct 2026 · Estado: **propuesta para aprobación del dueño** (nada del código de la app se ha tocado).

Carpeta: `.ai/ui-maquetas/`. Volver a generar los PNG: `pwsh -File .ai/ui-maquetas/render.ps1` (o `-Solo web-` / `-Solo movil`).

| PNG (`png/`) | Qué muestra |
|---|---|
| `web-sidebar.png` | Barra lateral nueva + página «Resumen» (Hoy) en claro |
| `web-sidebar-oscuro.png` | Lo mismo en oscuro |
| `web-sidebar-colapsado.png` | Riel de iconos con contadores y tooltip con atajo |
| `web-actividades.png` | Página de módulo tipo: encabezado con acciones ordenadas, KPI, chips, tabla con estado, foto, avance y acciones por fila, barra de selección |
| `web-actividades-vacio.png` | Estado vacío con filtro activo |
| `web-formulario.png` | Alta de actividad: secciones en tarjetas, obligatorios, ayudas, validación en línea, lista de pendientes y pie fijo |
| `web-detalle.png` | Ficha de actividad: cabecera de estado, pasos, galería de evidencias, línea de tiempo y panel lateral |
| `movil-inicio.png` / `movil-inicio-ios.png` | Inicio móvil: jornada, aviso, actividad actual, siguientes y navegación inferior (Material 3 / iOS) |
| `movil-actividad.png` / `movil-actividad-ios.png` | Detalle de actividad con pasos de evidencia y acciones grandes al pulgar |
| `componentes.png` | Hoja de botones, campos, insignias, KPI, tabla, avisos y toasts |

Piezas: `base.css` (tokens y componentes propuestos), `movil.css`, `maqueta.js` (iconos, avatares, barra lateral compartida y `?tema=oscuro`, `?rail=1`, `?vacio=1`, `?ios=1`), `fonts/` (Inter), `fotos/` (copias de `apps/web/public/fotos`).

---

## 1. Problemas detectados (medidos en el código)

1. **Dos librerías de componentes compitiendo.** `components/base` (Button de 32 px con 3 variantes, 37 importaciones) y `components/ui` (Button con 6 variantes y 4 tamaños, 93 importaciones; `PageHeader` 49, `EmptyState` 51, `InlineAlert` 70, `DataTable` 64, `KpiCard` 13, `MetricStrip` 37). Por eso cada módulo se ve distinto y no hay una jerarquía de botones que se repita.
2. **Estilos sueltos en las páginas.** En `app/(panels)` hay 1,919 `style={{…}}` en 160 archivos (pizarra 135, warehouse 103, asistencias 85, actividades 71). También hay 200 `<button>` crudos (en cotizaciones son 68, contra solo 3 `<Button>`), además de 323 `<input>` y 108 `<select>` hechos a mano. `FormField` existe pero solo tiene 14 usos. Resultado: formularios largos sin agrupar y con etiquetas, ayudas y errores distintos en cada pantalla.
3. **Jerarquía visual plana.** La dirección «Minimalista» actual usa controles de 32 px, tarjetas con borde y sin elevación, y texto terciario `#94a3b8` (2.8:1, el propio archivo de tokens lo marca como insuficiente). `Stat` muestra solo etiqueta, número y pista, sin icono, tendencia, semáforo ni composición, así que todos los KPI pesan igual y nada guía la vista hacia lo urgente.
4. **Barra lateral sin orden de trabajo.** En `access-matrix.ts` el grupo «Hoy» junta hasta 13 módulos (Resumen, Chat, Mis actividades, Actividades, Asistencias, KPIs, Clientes, Cotizaciones, Proyectos, Reuniones, Aprobaciones, Analítica…), mezclando la operación del día con lo comercial. Los iconos se registran como emojis (`📊`, `🏠`, `🧾`) y se traducen en `ShellIcons`. Los renglones miden 32 px y el ancho es de 240 px.
5. **El móvil no comparte la marca ni el arranque.** En Android `NxColors.Brand = #2563EB` (azul) y en iOS `NxBrand.primary` es el mismo azul, mientras la web usa el teal de marca `#1F9E84`. No existe pantalla de Inicio: al entrar, el usuario cae directo en Actividades (`CoreShellView` → `.actividades`) y «Más» es un botón de la barra superior, no una pestaña. El tema oscuro de Compose existe, pero no se activa porque las pantallas leen `NxColors` directamente.

Otros: acciones de página dispersas (cada módulo ordena sus botones a su manera), tablas sin acciones por fila ni selección múltiple, avatares con iniciales aunque la API entrega `avatarUrl`, y el estado de actividad como texto sin color uniforme (`activity-labels.ts` con hex sueltos).

---

## 2. Decisiones del sistema (tokens v2)

Se **evolucionan** los `--ui-*` de `apps/web/app/ui-tokens.scss`: se conservan los nombres y se cambian valores. Lo nuevo se agrega aparte, para que nada se rompa.

| Tema | Hoy | Propuesta |
|---|---|---|
| Marca | `#1f9e84`; el teal solo en el primario | Igual `#1F9E84`; texto `#12715E`; suave `#E7F5F1` / `#CFECE4`. Se usa también en el activo del menú, los pasos y el avance |
| Acentos (del logotipo) | — | Cielo `#3AA9CC` (Redes), magenta `#A64CA6` (Acceso), naranja `#EE8A2A` (Obra), CCTV en teal. Son color de **categoría**, nunca de estado |
| Estados | 6 tonos | Los mismos 6 (éxito, aviso, peligro, info, violeta=revisión, neutro), con un solo mapa estado→tono para actividades, cotizaciones y asistencias |
| Texto | fg-3 `#94a3b8` (2.8:1) | fg-3 `#6B7889` (≈4.6:1); fg-4 solo para deshabilitado |
| Tipografía | 12/13/14/16/20/24 | Inter: leyenda 11, meta 12, etiqueta 13, cuerpo 14, sección 16, título **22**, cifra **28** |
| Controles | 32 px (36 lg) | **36 px** por defecto, 32 compacto en tablas, **44** grande y táctil. Botón con peso 600 |
| Botones | primario, secundario, fantasma | Primario · Secundario · **Tonal** · Terciario · **Peligro** · **Peligro suave**, con estados de cargando, deshabilitado, foco, botón dividido y atajo |
| Radios | 8 / 12 | 8 controles · 12 avisos · **16 tarjetas** · 20-24 en móvil |
| Elevación | sin sombra en tarjetas | Tarjeta = borde + `e1` mínimo; menús `e2`; diálogos y toasts `e3` |
| Espaciado | 4/8/12/16/24/32 | El mismo, con 20 y 40; páginas a 32 px de margen y 24 entre bloques |
| Barra lateral | 240 px, 32 px por renglón | 264 px / riel de 68 px, renglones de 32 px, indicador lateral, contadores y tarjeta de usuario con jornada |

Reglas de composición (las que hacen que «se vea profesional»):
- **Un solo primario por pantalla**, a la derecha y en este orden: terciario → secundario → primario.
- Toda página de módulo sigue la misma secuencia: encabezado, pestañas, franja de 4 KPI, tarjeta de lista (barra de herramientas con buscador, chips y vista) y tabla con estado, foto, avance y acciones al pasar el mouse.
- Todo formulario va en secciones (tarjetas numeradas), con `*` en obligatorios, ayuda bajo el campo, error que reemplaza la ayuda, lista de pendientes a la derecha y pie fijo con Guardar o Cancelar.
- Toda ficha lleva cabecera de estado con pasos, pestañas, contenido a la izquierda y datos clave a la derecha.
- En móvil, la acción principal va abajo, al alcance del pulgar (52-58 px), y la navegación inferior tiene 5 destinos: Inicio, Actividades, Chat, Asistencia y Más.

---

## 3. Plan de aplicación por etapas

Orden pensado para que **el cambio se propague solo**: primero tokens y componentes base, que ya consumen casi todas las pantallas, y después módulo por módulo. Tamaños: **S** ≤ medio día, **M** 1-2 días, **L** 3-5 días.

### Etapa 1 · Tokens (S)
- `apps/web/app/ui-tokens.scss`: nuevos valores de fg-3, título 22, cifra 28, `--ui-control-h: 36px`, `--ui-radius-xl` en tarjetas, `--ui-elev-1` en tarjetas, acentos de categoría y `--ui-sidebar-w: 264px`.
- Prueba: pasar visualmente por Resumen, Actividades, Cotizaciones y Almacén en claro y oscuro. No cambia ningún nombre.

### Etapa 2 · Componentes base unificados (M)
- `components/base/Button.tsx` + `base.module.css`: variantes `tonal`, `danger` y `danger-ghost`; tamaños `sm/md/lg`; props `loading`, `iconStart`, `kbd`.
- `components/ui/Button.tsx` pasa a ser un **envoltorio** que traduce sus props viejas (`accent`, `link`, `xs`) al Button base. Así cambian de golpe las 93 importaciones, sin tocar los módulos.
- Lo mismo con `ui/PageHeader` → `base/PageHead` (zona de acciones ordenada), `ui/EmptyState` → `base/EmptyState`, `ui/InlineAlert` → `base/Alert`, y `ui/KpiCard` y `ui/MetricStrip` → `base/Stat`, que gana `icon`, `trend`, `meter` y `semaforo`.
- `components/ui/FormField.tsx` y `base/estados.tsx`: `Input`, `Select`, `DateInput`, `Textarea`, `Switch` y `Checkbox` con estados de foco, error y válido, más `FormSection` y `FormFooter` fijo.
- `base/piezas.tsx`: `StatusBadge` alimentado por **un solo mapa** de estado→tono (sustituye los hex de `lib/activity-labels.ts`); `Kind` para el tipo de trabajo.
- `base/estados.tsx` `Avatar`: foto real (`avatarUrl`) con punto de presencia.
- `components/Toast`: diseño con icono, acción y «Deshacer».
- Tests: los `.spec.tsx` existentes de botones y formularios deben seguir en verde.

### Etapa 3 · Barra lateral y marco (M)
- `components/app-shell/AppShell.tsx` + `AppShell.module.scss`: 264 px, buscador con `Ctrl K` (ya existe `CommandPalette`), grupos plegables, renglón activo con indicador, contadores, tarjeta de usuario con foto, rol, presencia y jornada, y riel colapsado con tooltips (ya existe `nx-shell-collapsed`).
- `lib/access-matrix.ts`: reordenar el campo `group` a **Hoy · Clientes y obra · Recursos · Finanzas · Mi cuenta** (Mi cuenta plegada). Solo cambia el agrupado, no los permisos.
- `ShellIcons.tsx`: un juego de iconos de trazo uniforme por módulo, en lugar del emoji de `access-matrix`.
- Contadores: reutilizar lo que ya consulta el shell (notificaciones) y agregar los de aprobaciones, actividades y viáticos donde exista endpoint. No se inventan rutas.

### Etapa 4 · Plantillas de página (M)
- `ModulePage` (encabezado, pestañas, franja de KPI, barra de herramientas con chips y vista, `DataTable` con acciones por fila, barra de selección y vacío), `FormPage` (secciones y pie fijo) y `RecordPage` (cabecera con pasos, pestañas, galería, línea de tiempo y panel lateral).
- `components/ui/DataTable.tsx`: acciones al pasar el mouse, selección múltiple con barra flotante y celdas de persona, avance y estado.

### Etapa 5 · Módulos, del más usado al menos usado
| Módulo | Archivos clave | Tamaño |
|---|---|---|
| Actividades / pizarra | `erp/pizarra/page.tsx`, `erp/actividades/*`, `mis-actividades` | M |
| Detalle de actividad | `erp/actividades/[id]/*` (evidencias, historial) | M |
| Alta de actividad | formulario de actividad (`lib/ops-activity-form.ts` + página) | M |
| Cotizaciones | `erp/cotizaciones/*` (22 archivos; 68 `<button>` crudos) | L |
| Almacén | `erp/warehouse/VistaAlmacen.tsx`, `erp/almacen/*` (103 estilos sueltos) | M |
| Asistencias | `erp/asistencias/*` | M (**otro agente lo edita ahora: va al final o se coordina**) |
| Clientes, Proyectos | `erp/clientes/*`, `erp/proyectos/*` | M |
| Finanzas y contabilidad | `erp/contabilidad/*`, `finance/*` | L (**pagos a empleados en edición por otro agente**) |
| Chat | `WorkspaceChat.tsx` | ya tiene maquetas propias en `.ai/chat-maquetas/`; solo hereda tokens |

En cada módulo: cambiar `style={{}}` por clases o componentes, `<button>` por `Button`, `<input>` por `Input`, y ordenar las acciones del encabezado.

### Etapa 6 · Apps nativas (L, en coordinación con quien las edita hoy)
- **Android** `ui/enterprise/EnterpriseComponents.kt` (`NxColors`) y `ui/theme/Theme.kt`: marca a teal `#1F9E84` y su escala, radios 12/16/20, botones de 52 dp. `NxNavigation.kt`: barra inferior M3 con pastilla y badges. Nueva `InicioScreen` (jornada, aviso, actividad actual y siguientes) como primera pestaña. `ActivityDetailScreen.kt`: lista de pasos y dock inferior con acción grande. **M + M + M**
- **iOS** `UI/Enterprise/NxBrand.swift` y `NxDesignSystem.swift`: el mismo teal. `CoreShellView.swift`: pestaña Inicio y «Más» como pestaña. `ActivityCoreDetailView.swift`: dock inferior. Títulos grandes y tab bar nativa (ver `movil-*-ios.png`). **M + M**
- Después: activar el esquema oscuro haciendo que las pantallas lean el tema en vez de `NxColors` (S por pantalla).

### Etapa 7 · Que no se vuelva a ensuciar (S)
- Regla ESLint (`no-restricted-syntax`) en `app/(panels)`: avisar ante `<button>` crudo, hex en `style` y nuevos `style={{}}` con color o tamaño.
- Actualizar `.ai/DISENO-TOKENS.md` con la tabla de la sección 2.

**Ruta corta para que el dueño vea el cambio pronto:** etapas 1, 2 y 3 (≈ 4-5 días). Con eso todas las pantallas heredan botones, tarjetas, KPI, insignias y la barra lateral nueva, sin tocar módulo por módulo. Después siguen Actividades y Cotizaciones.
