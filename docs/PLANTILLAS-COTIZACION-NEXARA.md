# Plantillas de cotización de NEXARA

Nueve plantillas base (una por tipo de cotización del negocio), el catálogo maestro de partidas
(Formato V2) y el catálogo de kits de herramientas de campo. Todo es **dato** versionado en el repo;
un seed idempotente carga las plantillas en la empresa que se elija.

| Qué | Dónde |
|---|---|
| Plantillas base | `apps/api/src/cotizaciones/plantillas-base.ts` |
| Catálogo de partidas (Formato V2), familias/marcas/servicios y kits de herramientas | `apps/api/src/cotizaciones/catalogo-partidas-base.ts` |
| Lógica de la siembra (crear / actualizar / omitir) | `apps/api/src/cotizaciones/plantillas-siembra.ts` |
| Seed | `apps/api/prisma/seed-nexara-plantillas.ts` (`npm run seed:plantillas`) |
| Pruebas | `plantillas-base.spec.ts`, `plantillas-siembra.spec.ts` |

## Las plantillas

Cada una es un `ContenidoPlantilla` completo: objetivo, alcance en bloques, términos, anticipo, moneda
MXN, secciones y columnas del PDF, condiciones comerciales y partidas de referencia. Todas las partidas
van en cantidad 1 y **precio 0** (quien cotiza los llena); la única excepción es la mano de obra de
instalación de cámara de la plantilla de CCTV, que trae el precio genérico que ya existe en `PAQUETES`.
No llevan clientes, folios ni contactos.

| Plantilla | Segmento | Para qué trabajo | Anticipo |
|---|---|---|---|
| Suministro de equipo | COMERCIAL | Venta de equipo (cómputo, red, periféricos, UPS) sin instalación | 50 % |
| Licenciamiento | COMERCIAL | Microsoft 365, Office, ESET: por licencia y vigencia | 100 % (contado) |
| Seguridad perimetral (Fortinet) | COMERCIAL | Firewall FortiGate con licenciamiento, soporte del fabricante y configuración inicial | 50 % |
| Red estructurada (cableado) | OBRA | Nodos Cat6, certificación, paneles y rack del cuarto de comunicaciones | 50 % |
| CCTV (videovigilancia) | OBRA | Sistema IP: cámaras, NVR, disco, switch PoE, instalación y puesta en marcha | 50 % |
| Control de acceso | OBRA | Terminales, cerraduras o torniquetes, controlador y alta de usuarios | 50 % |
| Póliza de servicio (mantenimiento) | SERVICIO | Mantenimiento preventivo y correctivo recurrente, cobrado por periodo | Por periodo, sin anticipo |
| Proyecto integral (Formato V2) | OBRA | Proyecto multi-sistema con el catálogo maestro completo (53 conceptos, 4 familias) | 50 % |
| Licitación / Gobierno | LICITACION | Propuesta para un procedimiento de contratación: anexos técnico y económico, catálogo de conceptos | Sin anticipo |

Cómo se usan: en **Nueva cotización** se elige la plantilla (o `/erp/cotizaciones/nueva?plantilla=<id>`),
se escribe el cliente, se quitan las partidas que no aplican y se llenan cantidades y precios.

Detalles que conviene saber:

- **El objetivo** de red, CCTV, acceso y proyecto integral no trae beneficios escritos: salen de las
  partidas reales al imprimir. En las demás (licencias, seguridad perimetral, póliza, licitación,
  suministro) van escritos, sin cifras, porque los derivados de las partidas no aplicarían.
- **Los términos** solo reescriben lo que el texto por omisión del segmento no cubre. El pago por
  anticipo sigue al porcentaje que se capture. Con instalación cobrada, los términos dicen que la
  instalación está incluida (y sin ella, «solo suministro»), igual que en cualquier cotización.
- **Garantía**: equipos con la garantía del fabricante (mínimo 12 meses salvo indicación por partida) y
  **90 días en la mano de obra de instalación** en toda plantilla con instalación.
- **Exclusiones y entrega** reutilizan los bloques del editor (`plantillasDeAlcance`), no son copias.
- **Proyecto integral**: sus partidas son el catálogo del Formato V2 en su orden (Telecomunicaciones,
  Energía, CCTV/cómputo/pantallas/proyección, Infraestructura). Se conservan solo los conceptos que
  aplican; los que queden sin cantidad y precio no forman parte de la propuesta (lo dicen los términos).

## Cómo cargarlas

El seed **no adivina la empresa** y por omisión **no escribe nada** (simulación).

```bash
cd apps/api

# 1. Ver las empresas (id, slug, nombre) si no sabes cuál es
npm run seed:plantillas -- --list-companies

# 2. Simulación: imprime qué crearía, actualizaría u omitiría
npm run seed:plantillas -- --company-slug=<slug>
npm run seed:plantillas -- --company-id=<n>          # alternativa por id

# 3. Aplicar
npm run seed:plantillas -- --company-slug=<slug> --apply
```

En el contenedor de producción (ahí solo existe `dist/`, el seed carga de ahí los módulos compilados,
así que primero debe estar desplegada una versión que incluya estos archivos):

```bash
docker exec nexara-api sh -c 'cd /app/apps/api && npm run seed:plantillas -- --list-companies'
docker exec nexara-api sh -c 'cd /app/apps/api && npm run seed:plantillas -- --company-slug=<slug>'
docker exec nexara-api sh -c 'cd /app/apps/api && npm run seed:plantillas -- --company-slug=<slug> --apply'
```

Qué hace con cada plantilla (llave: empresa + nombre, sin acentos ni mayúsculas):

| Situación | Acción |
|---|---|
| No existe | **CREAR** |
| Existe y es idéntica a la base | Sin cambios |
| La sembró el seed, nadie la editó y la base cambió | **ACTUALIZAR** |
| Existe y difiere (editada, o creada a mano con ese nombre) | **Omitir** y reportar en qué campos difiere: nunca se pisa |
| Existe archivada | **Omitir**: se respeta que se haya quitado de la lista |

Correrlo N veces no duplica. Todo se escribe en una sola transacción. Las filas sembradas llevan un
marcador `_semilla` (origen, clave y hash del contenido) dentro del JSON: es lo que permite distinguir
«sembrada y sin tocar» de «editada»; la API y el editor lo ignoran. El seed usa un `PrismaClient`
directo (como los demás seeds) y estampa el `companyId` elegido en cada fila.

## Cómo agregar más plantillas

1. En `plantillas-base.ts`, agrega una constante `PlantillaBase` (usa `bloque()`, `partida()`,
   `opciones()`, `objetivo()` y `nota()`; para exclusiones y entrega, `bloqueDeEditor()`) y súmala a
   `PLANTILLAS_BASE`. Reglas: sin clientes ni folios, precio 0 (salvo genéricos de `PAQUETES`), cantidad 1,
   nombre único, `clave` estable y contenido ya en forma canónica.
2. Si necesitas conceptos nuevos del catálogo, agrégalos a `CATALOGO_PARTIDAS_V2` (o a las familias) en
   `catalogo-partidas-base.ts`.
3. Corre `npx jest src/cotizaciones/plantillas-base.spec.ts src/cotizaciones/plantillas-siembra.spec.ts`
   (verifica que pase por `normalizarContenidoPlantilla` sin perder nada, que no haya nombres de
   clientes, meta-texto interno ni precios inventados, y que los términos no se contradigan con las
   partidas). Ajusta la lista esperada de claves en el spec.
4. Vuelve a correr el seed: la plantilla nueva se crea y las ya sembradas sin editar se actualizan.
   Si alguien guardó a mano una plantilla con el mismo nombre, el seed la deja como está y lo avisa.

## Catálogo de kits de herramientas

`KITS_HERRAMIENTAS` (en `catalogo-partidas-base.ts`) trae el kit **«Kit de herramientas y material IDC de
campo»**: las 18 herramientas y materiales de la hoja original, con su cantidad, marcados como
`HERRAMIENTA` (se devuelve) o `MATERIAL` (se consume o se deja en sitio).

**Por qué datos y no una tabla.** El esquema no tiene «definición de kit»: `ToolInventoryItem` es una
herramienta física con serie, `ToolKitAssignment` la asigna a una persona y `ActivityToolRequirement` es
un renglón del checklist de una OT (`descripcion` + `cantidad`). Un kit de campo es justamente una lista
de esos renglones, así que el kit se guarda con esa misma forma y no hace falta migración.

**Cómo se conectará.** `requisitosDeKit(kit)` devuelve `[{ descripcion, cantidad }]`, que es lo que
`ActivityToolsService.definirRequisitos` ya recibe (y normaliza con `normalizarRequisitos`). Para
ofrecer «aplicar kit» en la asignación de una OT basta con exponer `KITS_HERRAMIENTAS` por un endpoint
de solo lectura y mandar `requisitosDeKit(kit)` como requisitos. Si más adelante los kits deben ser
editables por el usuario, ahí sí conviene un modelo propio (`ToolKitTemplate` + renglones) y este módulo
sirve de semilla.

## Lo que no quedó dentro de las plantillas

- **Encabezado del Formato V2** (proyecto, fecha, región, RITM, requerimiento, SP, OC): son datos de
  cada cotización, no de la plantilla; se capturan al cotizar.
- **Código y familia V2 de cada partida**: `PartidaDePlantilla` no tiene esos campos, así que viven en
  el catálogo (`CATALOGO_PARTIDAS_V2`) y las familias se ven en los bloques de alcance del proyecto
  integral.
- **Cantidades y precios** de las cotizaciones de muestra: se descartaron a propósito.
