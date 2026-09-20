# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-20
- **Rama:** feat/pulir-hijas (base `mejora/calidad-y-web` @ a750fe4b)
- **HEAD:** Pantallas hijas de Contabilidad en lenguaje llano

## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Turno anterior (cursor, a750fe4b)

Escritorio de Contabilidad: menú en tareas humanas, hub «¿Qué hay que hacer
hoy?» con 3 cifras y 3 atajos. Dejó anotado que las hijas seguían con jerga.

## Hecho este turno

Adam: «PULELO» — la misma ola de lenguaje, ahora en las pantallas hijas.
Solo texto y presentación: ni lógica, ni cálculos, ni contratos de API, ni
permisos. Ningún valor que viaja al servidor cambió de nombre; se traduce al
pintarlo.

### Catálogo único — `apps/web/lib/finance-status-labels.ts`

Era solo `FINANCE_STATUS_LABELS`. Ahora concentra **todas** las traducciones de
enums de contabilidad, para que dos hermanas no llamen distinto a lo mismo:

- `paymentMethodLabel` — `BANK_TRANSFER` → «Transferencia»
- `satFormaPagoLabel` / `satMetodoPagoLabel` / `satUsoCfdiLabel` — claves del
  SAT con su significado al lado («03 · Transferencia electrónica»)
- `satMotivoCancelacionLabel` — las cuatro causas, en palabras
- `auditActionLabel` / `auditEntityLabel` / `auditFieldLabel` — la bitácora
- Estados que faltaban: `IGNORED`, `PARTIAL`, `PLANNED`, `CANCELED`

Todos caen al valor crudo si la clave no está: no se inventa traducción.

### Jerga retirada

- **Facturas**: `ESTATUS_FACTURA` duplicaba el catálogo → se borró. «UUID CFDI»
  → «Folio fiscal». «CFDI con XML» / «Sin XML» → «Timbrada / Sin timbrar ante
  el SAT». «Contraparte» → «Cliente o proveedor». «Vencida · 12d» → «12 días».
- **Por cobrar / Por pagar**: «UUID fiscal» → «Folio fiscal». Las tres claves
  del SAT ya se leen. Los pagos aplicados decían `BANK_TRANSFER`. «en 4 d» →
  «en 4 días». «Documentos» → «Facturas». Bug: «Todos los proveedor**s**».
- **Conciliación**: «candidato» (palabra del emparejador) → «coincidencia».
  «El emparejador no devolvió motivos» → «NEXARA no anotó en qué se parecen».
  «Prueba con otro contador» — en contabilidad un contador es una persona.
- **Auditoría**: pintaba `CREATE`, `Invoice` y los nombres de campo del modelo
  tal cual. Ahora «Alta», «Factura», «Fecha de vencimiento»; la clave queda en
  el `title` y el buscador filtra por ambas.
- **Proveedores**: «Sin RFC — no entra a DIOT» → «…declaración mensual de
  proveedores». `metodo` crudo en los pagos.
- **Proyectos / Reportes**: «transacciones» (palabra de base de datos) →
  «movimientos», como en el resto del escritorio.

### Consistencia entre hermanas

- «Estatus» → **«Estado»** en las 7 columnas donde aparecía (proveedores,
  proyectos). Las demás hijas ya decían «Estado».
- «Días vencido» → **«Vencida»**, como en Por cobrar.
- «Recargar» → **«Reintentar»**; «% margen» → «% de margen»; «Rango» → «Fechas».
- 12 plurales `(s)` / `(es)` escritos de verdad.

### Errores y vacíos

- Siete alertas pintaban `message={error}` pelado. Ahora las tres respuestas:
  qué pasó, por qué y qué hacer, junto al elemento afectado y con Reintentar.
- Facturas no distinguía el vacío por filtro: ahora sí, con «Limpiar filtros».
- Fechas ISO (`2026-09-20`) que se pintaban crudas en Reportes y Presupuestos →
  `fechaLegible` en `reportes-contabilidad.tsx`, también para las columnas de
  tipo fecha que manda el API.

## Puerta de calidad

- `npx tsc --noEmit -p apps/web/tsconfig.json` limpio.
- `npm test --workspace=apps/web`: **980/980 en 82 archivos**.
  Correr la suite **sola**: en paralelo con la de la API, el spec del editor de
  cotizaciones se pasa de los 5 s por CPU y da un rojo falso.

## A medias

- Deploy de este UX a Hetzner (sigue pendiente del turno anterior).
- `movimientos`, `polizas` y `pre-nomina` quedaron fuera de esta ola: no
  estaban en el encargo. `movimientos` aún dice «Contraparte» y `pre-nomina`
  tiene un `persona(s)`.

## Siguiente

1. Deploy + smoke de Contabilidad completa (hub + hijas).
2. Si Adam quiere cerrar el círculo: misma pasada en movimientos, pólizas y
   pre-nómina.

## No tocar

Puente NAS · cotizaciones de prueba · `components/ui/` y el shell (otro agente
en paralelo).
