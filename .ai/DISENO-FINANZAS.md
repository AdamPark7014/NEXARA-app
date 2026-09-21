# Diseño de las pantallas financieras — contrato único

Aprobado por Adam el 20-09-2026 sobre una muestra de la pantalla de Gastos.
**Todas** las pantallas de contabilidad y finanzas siguen esto. Si una pantalla
necesita salirse, se anota el porqué en el reporte; no se decide sola.

El problema a resolver, en sus palabras: las secciones se ven «nada
profesionales y súper insípidas», y los formularios poco serios.

## Las seis reglas

### 1. El dato manda, el adorno se calla

Fuera las rejillas de `KpiCard` con resplandor, elevación al pasar el ratón y
minigráfica. Entra `MetricStrip` (`@/components/ui/MetricStrip`): una tira de
celdas con etiqueta de 11px, cifra de 20px en cifras de ancho fijo
(`tabular-nums`) y una pista de qué la compone («7 gastos», «bloquean el
cierre»). Ocupa un cuarto del alto y dice más.

`KpiCard` se queda donde ya vive fuera de finanzas; aquí no se usa.

### 2. Tabla densa, no tarjetas

Filas de ~9px de alto útil, separadas por una línea de 1px, sin zebra ni
bordes gruesos. Los montos van **alineados a la derecha** y en `tabular-nums`,
para que se puedan comparar de un vistazo. El contexto secundario (quién lo
pidió, el proyecto, una advertencia) va en 11px gris bajo el concepto, no en
columnas extra que ensanchan la tabla.

Usa el `DataTable` que ya existe. Si una columna no se lee en móvil, se colapsa
bajo el concepto; no se hace scroll horizontal.

`MetricStrip` acepta `onClick` cuando la celda filtra la vista en el sitio, y
`href` cuando lleva a otra pantalla. Usa `href` para navegar: hacerlo con un
manejador rompe ctrl+clic y «abrir en pestaña nueva», que es justo lo que hace
una contadora cuando quiere revisar dos cosas a la vez.

### 3. El estado es un punto y una palabra

`StatusDot` (`@/components/ui/StatusDot`), no pastillas rellenas. Con veinte
filas, las pastillas convierten la tabla en un semáforo y deja de distinguirse
lo que urge.

`StatusDot` no parte el texto de renglón por defecto, porque un estado partido
en dos se lee mal. Cuando la etiqueta es una frase —el motivo de una
incidencia, por ejemplo— pásale `wrap`, o la celda ensancha la tabla entera.

Tono `neutral` para los estados normales del flujo. Color **solo** cuando el
renglón pide acción o algo salió mal: `warning` por autorizar o por vencer,
`danger` vencido o sin comprobante, `success` liquidado.

### 4. Un solo botón primario por pantalla

El primario es la acción que la persona vino a hacer (`Registrar gasto`,
`Timbrar`, `Conciliar`). Todo lo demás —exportar, actualizar, filtrar— va en
gris. Hoy compiten varios botones llamativos y ninguno destaca.

Altura 32px, texto de 13px: es exactamente `size="sm"` de `Button`, que se
subió de 30/12 a 32/13 para que el contrato sea cumplible desde las pantallas.
Nada de botones gigantes.

### 5. Formularios con jerarquía

Usa `FormField` / `FormGrid` de `@/components/ui/FormField` (Finanzas reexporta
como `FinanceField` / `FinanceFormGrid` por compatibilidad), que ya acepta:

- `hint` — la duda se resuelve **bajo el control**, al capturar, no después del
  error. Ej. «Pesos, con IVA incluido».
- `optional` — se marca lo opcional en la etiqueta. Marcar lo obligatorio con
  asterisco rojo llena el formulario de alarmas para decir lo normal.
- `error` — bajo el campo, reemplaza al `hint` mientras esté.

Rejilla de dos columnas (`FinanceFormGrid`); lo que necesite ancho completo usa
`fullWidth`. Las acciones van al pie, separadas por una línea, alineadas a la
derecha: cancelar en gris, guardar en primario.

### 6. Color con significado, no de decoración

Superficies neutras. El acento aparece en un botón primario, un enlace y los
estados que piden acción. Nada de degradados, sombras marcadas ni bordes de
colores. Si la pantalla está sana, se ve gris y tranquila.

## Las tres reglas que más se incumplen fuera de contabilidad

Salieron de mirar pantallas reales ya desplegadas. Valen para TODO el ERP, no
solo para finanzas.

### 7. Una fila de ceros no informa: no se pinta

Cuando no hay ni un registro, la tira de cifras **no se muestra**. Cuatro celdas
en `$0` encima de un «Sin viáticos» ocupan el sitio de lo único que ayuda ahí:
el texto que dice de dónde sale el primer renglón y el botón para crearlo.

La condición es el conteo real (`rows.length === 0`, `total === 0`), no que las
cifras sean cero: un mes que de verdad cerró en cero SÍ se enseña, porque eso es
información.

### 8. Los filtros son una barra, no un formulario

Búsqueda, selectores y acciones van **en una fila**, sin caja propia y sin
fondo. Hoy es común ver el buscador dentro de un recuadro y, debajo, el
selector de estado dentro de otro, los dos a todo lo ancho: dos contenedores y
tres renglones de alto para dos controles.

Un control ya tiene su propio borde; meterlo en una caja es dibujar el borde dos
veces. La acción principal va a la derecha de esa misma fila.

### 9. Ni una caja dentro de otra caja

Pestañas dentro de una píldora, dentro de un panel, dentro de una tarjeta. Cada
nivel añade un borde y un relleno que no aportan jerarquía: la dan el espaciado
y la tipografía.

Regla práctica: si al quitar un borde no se pierde ninguna información ni se
confunde qué agrupa con qué, **sobraba**.

## Lo que no se toca

- **Nada de lógica de negocio.** Esto es una ola visual: no se cambian
  contratos de API, cálculos, permisos ni consultas.
- **No se borran funciones.** Si una acción existe hoy, sigue existiendo
  después; puede cambiar de sitio o de énfasis, no desaparecer.
- **Aislamiento por empresa**: no se toca. Cualquier llamada nueva mantiene
  `companyId`.
- Estados de carga, vacío y error se conservan; si faltan, se añaden
  (`EmptyState`, `InlineAlert` + `formatApiError`).

## Puerta de calidad

`npx tsc --noEmit` limpio en web, y `npm test --workspace=apps/web` sin perder
ninguna de las 970 pruebas en verde.
