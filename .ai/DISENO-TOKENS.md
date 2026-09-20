# Sistema de tokens de NEXARA

> **Regla única:** ningún color, tamaño, radio, sombra ni duración se escribe a mano.
> Si no hay token para lo que necesitas, se añade aquí primero y luego se usa.
> Archivo fuente: `apps/web/app/ui-tokens.scss` (se importa **el último** en `app/layout.tsx`).

---

## 1. Qué capa usar

El producto tiene tres familias de tokens conviviendo. No son un error: cada una
tiene un ámbito. Lo que **no** se debe hacer es mezclarlas dentro de un mismo componente.

| Familia | Dónde se declara | Para qué | ¿La uso en código nuevo? |
|---|---|---|---|
| `--ui-*` | `app/ui-tokens.scss` | **Paneles** (`(panels)/`, `components/ui/`, `components/base/`, AppShell) | **Sí. Es la capa por defecto.** |
| `--surface`, `--primary`, `--text-*`, `--border`, `--state-*` | `app/globals.scss` | Semánticos históricos, tema claro/oscuro, sitio público y subdominios | Solo si tocas código que ya los usa |
| `--nx-*` | `app/globals.scss` | Manual de marca + capa «premium» del sitio público | Solo sitio público |

**Si estás escribiendo un panel, usa `--ui-*` y nada más.**

---

## 2. Superficies — profundidad sutil, no plana

Tres peldaños reales. La profundidad se construye con **superficie + borde**;
la sombra solo lo remata. **Sin degradados y sin desenfoque.**

| Token | Claro | Oscuro | Cuándo |
|---|---|---|---|
| `--ui-bg` (= `--ui-surface-0`) | `#f4f7fa` | `#0b1120` | Fondo de la página / del área de contenido |
| `--ui-surface` (= `--ui-surface-1`) | `#ffffff` | `#0f172a` | Tarjeta, panel, modal, barra lateral |
| `--ui-surface-2` (= `--ui-surface-sunken`) | `#f8fafc` | `#111a2e` | Superficie **hundida**: `thead`, filas zebra, wells, campos de solo lectura |
| `--ui-surface-3` (= `--ui-surface-raised`) | `#ffffff` | `#16213a` | Superficie **elevada**: popover, dropdown, tooltip, menú flotante |
| `--ui-hover` | `#f1f5f9` | `#172136` | Fondo de fila/opción en hover |
| `--ui-active` | `#e7edf4` | `#1d2942` | Fila/opción seleccionada o pulsada |
| `--ui-track` | `#eef2f6` | `#1b2438` | Carril de progreso, barra, slider |

```css
.tarjeta {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-elev-1);
}
.tarjeta thead { background: var(--ui-surface-2); }
.menu           { background: var(--ui-surface-3); box-shadow: var(--ui-elev-pop); }
```

> En oscuro `--ui-surface-3` está **por encima** de `--ui-surface`, no por debajo:
> en oscuro se eleva aclarando, no oscureciendo.

---

## 3. Texto — cuatro niveles, ni uno más

| Token | Claro | Oscuro | Cuándo |
|---|---|---|---|
| `--ui-fg` | `#0f172a` | `#e2e8f0` | Texto primario: títulos, valores, cuerpo |
| `--ui-fg-2` | `#475569` | `#94a3b8` | Secundario: etiquetas, descripciones, encabezados de columna |
| `--ui-fg-3` (= `--ui-fg-muted`) | `#94a3b8` | `#64748b` | Terciario / apagado: metadatos, placeholders, ayudas |
| `--ui-fg-4` (= `--ui-fg-disabled`) | `#b6c1cf` | `#4a5569` | Deshabilitado. **Solo para `:disabled`**, nunca para texto vivo |
| `--ui-fg-on-brand` | `#ffffff` | `#ffffff` | Texto sobre relleno de marca |

**No uses `--ui-fg-3` para «hacerlo más discreto».** Si un texto importa, es `--ui-fg-2`.

---

## 4. Bordes — tres pesos

| Token | Claro | Oscuro | Cuándo |
|---|---|---|---|
| `--ui-border-subtle` | `#eef2f6` | `#16202f` | Separadores internos: entre filas, entre campos de un grupo |
| `--ui-border` | `#e2e8f0` | `#1e293b` | Borde por defecto: tarjeta, input, botón secundario |
| `--ui-border-strong` | `#cbd5e1` | `#334155` | Hover de control, divisor de sección, borde de tabla exterior |

Siempre `1px`. Un borde más grueso es un error de token, no de diseño.

---

## 5. Semánticos — cada estado trae cuatro piezas

Para **cada** estado existen: relleno, fondo tenue, borde y **dos** textos.

| Pieza | Patrón | Significado |
|---|---|---|
| Relleno | `--ui-<estado>` | Color sólido: punto, barra, badge relleno, icono |
| Fondo tenue | `--ui-<estado>-bg` | Fondo de chip, alerta o fila resaltada |
| Borde | `--ui-<estado>-border` | Borde de ese chip o alerta |
| Texto sobre fondo tenue | `--ui-<estado>-text` | **El que se usa el 90 % de las veces** |
| Texto sobre relleno sólido | `--ui-<estado>-fg` | Solo cuando el fondo es `--ui-<estado>` a pelo |

Estados disponibles: `brand`, `success`, `warning`, `danger`, `info`, `violet`, `neutral`.

```css
/* Chip de estado — el patrón correcto */
.chip-aviso {
  background: var(--ui-warning-bg);
  border: 1px solid var(--ui-warning-border);
  color: var(--ui-warning-text);
}

/* Badge relleno — aquí SÍ va `-fg` */
.badge-peligro {
  background: var(--ui-danger);
  color: var(--ui-danger-fg);
}
```

> `--ui-warning-fg` es tinta oscura (`#241503`) en **ambos** modos: blanco sobre ámbar
> no llega a contraste legible. Los demás `-fg` se invierten en oscuro porque allí
> el relleno aclara.

Marca: `--ui-brand` (relleno), `--ui-brand-hover`, `--ui-brand-text` (texto de marca
sobre fondo neutro), `--ui-brand-bg` / `--ui-brand-soft` (fondo tenue),
`--ui-brand-border`, `--ui-brand-fg` (texto sobre el relleno).

**El teal de marca solo en:** botón primario, anillo de foco, navegación activa
y cifras clave. En ningún otro sitio.

---

## 6. Tipografía — seis papeles, no veinte tamaños

Se pide el **papel**, no el tamaño. Cada papel trae tamaño, interlineado, peso y tracking.

| Papel | Tamaño | Peso | Tokens | Cuándo |
|---|---|---|---|---|
| Título de página | 20px | 650 | `--ui-fs-page` `--ui-lh-page` `--ui-fw-page` `--ui-tracking-page` | El H1 de la vista. **Uno por pantalla** |
| Título de sección | 16px | 600 | `--ui-fs-section` `--ui-lh-section` `--ui-fw-section` `--ui-tracking-section` | Encabezado de tarjeta, bloque o grupo |
| Cuerpo | 14px | 400 | `--ui-fs-body` `--ui-lh-body` `--ui-fw-body` | Texto por defecto, celdas, párrafos |
| Etiqueta | 13px | 550 | `--ui-fs-label` `--ui-lh-label` `--ui-fw-label` | `label`, botón, pestaña, encabezado de columna |
| Metadato | 12px | 500 | `--ui-fs-meta` `--ui-lh-meta` `--ui-fw-meta` | Fecha, contador, ayuda bajo un campo, badge |
| Leyenda | 11px | 500 | `--ui-fs-caption` `--ui-lh-caption` `--ui-fw-caption` `--ui-tracking-caption` | Pie de gráfica, nota legal, overline |

Extra, para datos: `--ui-fs-stat` / `--ui-lh-stat` / `--ui-fw-stat` / `--ui-tracking-stat` (24px) — KPI y métricas.

```css
.titulo-de-pagina {
  font-size: var(--ui-fs-page);
  line-height: var(--ui-lh-page);
  font-weight: var(--ui-fw-page);
  letter-spacing: var(--ui-tracking-page);
  color: var(--ui-fg);
}

.importe {
  font-size: var(--ui-fs-stat);
  font-weight: var(--ui-fw-stat);
  font-feature-settings: var(--ui-numeric); /* cifras tabulares, columnas alineadas */
}
```

Los tamaños crudos (`--ui-text-xs` … `--ui-text-stat`) **siguen existiendo** y los
papeles apuntan a ellos. Código existente no se rompe; código nuevo usa el papel.

Fuentes: `--ui-font` (Inter, toda la interfaz) y `--ui-font-mono` (identificadores,
UUID, folios, JSON).

---

## 7. Espaciado, forma, elevación y movimiento

### Espaciado — 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48

`--ui-s0` `--ui-s1` `--ui-s2` `--ui-s3` `--ui-s4` `--ui-s5` `--ui-s6` `--ui-s7`

Guía: dentro de un control `--ui-s1`/`--ui-s2`; entre campos `--ui-s3`;
padding de tarjeta `--ui-s4`; entre tarjetas `--ui-s4`; entre secciones `--ui-s5`/`--ui-s6`.

### Radios

`--ui-radius-sm` 6px (chip, badge) · `--ui-radius` 8px (**por defecto**: botón, input) ·
`--ui-radius-lg` 12px (tarjeta, modal) · `--ui-radius-xl` 16px (contenedor grande) ·
`--ui-radius-pill` (píldora, avatar).

### Elevación — mínima, y nada más

| Token | Cuándo |
|---|---|
| `--ui-elev-0` | Plano. Un elemento apoyado en su superficie: se separa con **borde**, no con sombra |
| `--ui-elev-1` | Tarjeta, panel. El 95 % de los casos |
| `--ui-elev-2` | Elemento arrastrado, tarjeta en hover que se levanta |
| `--ui-elev-pop` | Solo lo que **flota**: popover, dropdown, modal, toast |

`--ui-shadow-sm` y `--ui-shadow-pop` se conservan como alias de `--ui-elev-1` y `--ui-elev-pop`.

**Prohibido:** sombras fuera de esta escala, `backdrop-filter`, degradados decorativos.

### Movimiento

| Token | Valor | Cuándo |
|---|---|---|
| `--ui-duration-fast` | 120ms | Hover, foco, cambio de color |
| `--ui-duration-base` | 180ms | Despliegue, acordeón, cambio de pestaña |
| `--ui-duration-slow` | 260ms | Modal, drawer, entrada de página |
| `--ui-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | **Por defecto** |
| `--ui-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Algo que entra |
| `--ui-ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Algo que se mueve entre dos puntos |

Nunca `transition: all`. Se nombran las propiedades.

### Foco

`--ui-ring` (marca) y `--ui-ring-danger`. Van en `box-shadow` sobre `:focus-visible`,
nunca se quita el foco sin poner un sustituto visible.

### Medidas

`--ui-control-h` 32px · `--ui-control-h-lg` 36px · `--ui-row-h` 40px ·
`--ui-topbar-h` 52px · `--ui-nav-item-h` 32px.

---

## 8. Modo oscuro

El tema es `body.dark` (lo pone `ThemeContext`), **no** `prefers-color-scheme`.

- Todo token `--ui-*` que dependa del tema está declarado en `:root` **y** en `body.dark`.
- Si añades un token de color, **lo declaras en los dos sitios**. Un token sin pareja
  en oscuro es un bug.
- **Trampa conocida:** un token declarado en `:root` (= `html`) que haga
  `color-mix(… var(--otro) …)` se calcula con el valor de `html`, y `html` está
  *fuera* de `body.dark`. Por eso los derivados (`-border`, `-bg`) se repiten
  literalmente dentro de `body.dark` en vez de heredarse.
- Lo mismo con los alias de la capa de compatibilidad: se declaran sobre `body`,
  `.public-friendly` y `[data-nx-panel="web"]`, porque esos dos últimos ámbitos
  reescriben los semánticos y el alias tiene que resolverse contra **su** valor.

---

## 9. Capa de compatibilidad (final de `ui-tokens.scss`)

La auditoría encontró nombres que el código consumía y que **nadie declaraba**.
Un `var()` sin fallback ni definición invalida la propiedad: el fondo queda
transparente, la sombra desaparece, el radio cae a 0 y `border-color` cae a
`currentColor` — bordes del color del texto. Eso explica buena parte del
«se ve plana y sucia a la vez».

Cada huérfano queda enganchado al semántico que le corresponde:

| Alias | Apunta a |
|---|---|
| `--bg`, `--bg-primary` | `--background` |
| `--surface-alt` | `--surface-2` |
| `--surface-elevated` | `--background-elevated` |
| `--card-bg` | `--surface` |
| `--text`, `--text-2`, `--text-3` | `--text-primary` / `-secondary` / `-tertiary` |
| `--muted-foreground` | `--text-tertiary` |
| `--border-color` | `--border` |
| `--positive`, `--state-success` | `--success` |
| `--state-error` | `--danger` |
| `--panel-accent` | `--primary` |
| `--elev-sm`, `--elev-md` | `--nx-panel-elev-1` / `-2` |
| `--page-padding-bottom` | `--page-padding-y` |
| `--font-geist-sans`, `--font-geist-mono` | `--font-base` / `--ui-font-mono` |
| `--public-border` | `--border` |
| `--public-surface-strong` | `--surface` |
| `--public-hero-bg` | `--background-elevated` |
| `--public-shadow` | `--shadow` |
| `--public-radius-xl` | `--nx-radius-xl` |
| `--public-nav-pill` / `-active` | `--surface-2` / `--primary-soft` |
| `--public-nav-text` | `--text-secondary` |
| `--ui-bg-2` | `--ui-surface-2` |

También se arreglaron en oscuro `--elev-1`, `--elev-2` y `--nx-hairline`,
que estaban calculados solo para claro.

**Estos alias son deuda, no API.** Al tocar un archivo que los use, se sustituye
por el token real y se borra el alias cuando ya no quede ningún uso.

---

## 10. Lo que queda por hacer (siguiente ola)

La auditoría contó **2 333 literales hexadecimales** (343 valores distintos) y
**1 033 literales `rgb()/rgba()`** en `components/` y `app/`, fuera de las hojas de
tokens. Son colores que no responden al tema: en oscuro se quedan como estaban.

Concentración (archivos con más literales hex):

| Archivo | Literales |
|---|---|
| `components/WorkspaceChat.module.css` | 159 |
| `app/(panels)/integra/_access.module.css` | 108 |
| `app/page.module.css` | 83 |
| `app/(panels)/integra/_panels.module.css` | 80 |
| `app/(panels)/integra/integra.module.css` | 67 |
| `app/(panels)/erp/cotizaciones/_editor/editor.module.css` | 66 |
| `components/PageState.tsx` | 59 |
| `app/(panels)/crm/quotes/builder/smart-quote.module.css` | 57 |
| `app/(panels)/integra/_soc.module.css` | 47 |
| `components/TicketsInventoryManager.tsx` | 46 |
| `components/ActivityEvidenceFlow.tsx` | 44 |
| `components/ProjectCostTracker.module.css` | 42 |
| `components/PanelLogin.module.scss` | 40 |
| `components/presence/EnSitioStrip.module.css` | 39 |
| `app/(panels)/erp/hr/lunch-breaks/page.tsx` | 38 |

Los hex más repetidos ya tienen token y solo hay que sustituirlos:

| Hex | Repeticiones | Token |
|---|---|---|
| `#fff` / `#ffffff` | 349 | `--ui-surface` (fondo) o `--ui-*-fg` (texto sobre relleno) |
| `#b91c1c` | 73 | `--ui-danger-text` |
| `#16a34a` | 64 | `--ui-success` |
| `#b45309` | 62 | `--ui-warning-text` |
| `#dc2626` | 52 | `--ui-danger` |
| `#6b7280` / `#64748b` | 73 | `--ui-fg-3` |
| `#ef4444` | 41 | `--ui-danger` (oscuro) |
| `#f59e0b` | 36 | `--ui-warning` (oscuro) |
| `#e5e7eb` | 36 | `--ui-border` |
| `#15803d` | 36 | `--ui-success-text` |
| `#d97706` | 29 | `--ui-warning` |

Pendiente aparte: `--ig-*` (Integra) y `--doc-*` viven dentro de módulos CSS
concretos y duplican la escala de `--ui-*` (`--ig-fs-*` es una tercera escala
tipográfica). Al migrar Integra, apuntarlos a `--ui-*` en lugar de mantener
tres escalas paralelas.

---

## 11. Checklist antes de abrir PR de UI

- [ ] Cero `#hex` y cero `rgb()/rgba()` en el archivo que tocaste.
- [ ] Cada color es `--ui-*` (paneles) o el semántico que ya usaba el archivo.
- [ ] Probado en claro **y** en oscuro (`body.dark`).
- [ ] Tipografía por papel, no por tamaño suelto.
- [ ] Sombra dentro de la escala `--ui-elev-*`. Sin `backdrop-filter`, sin degradados.
- [ ] Radios y espaciado de la escala, sin valores intermedios.
- [ ] Foco visible con `--ui-ring`.
