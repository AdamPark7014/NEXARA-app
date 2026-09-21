# RELEVO

- **Último turno:** claude-code
- **Fecha:** 2026-09-21
- **Rama:** `mejora/calidad-y-web`
- **HEAD:** bundle de release firmado y capturas de Play rehechas; Gastos, Pagos, Aprobaciones nativos
- **Verificado:** Android `testDebugUnitTest` 564/564 · web 65 archivos / 594 pruebas · API `company-tenant-pin` 7/7, `viatico-asignacion-lote` 8/8, `viatico-reparto` 41/41, `navigation-module-map` 5/5

## Listo para subir a Google Play (21-09, 12:45)

- **`app-release.aab`, versionCode 11**, firmado con la llave real de NEXARA
  (`CN=NEXARA, O=NEXARA, Puebla, MX`, SHA256withRSA, válida hasta 2053). **No**
  con la de depuración: se comprobó con `keytool -printcert -jarfile`.
  `key.properties` ya existía desde el 15 de julio con sus cuatro entradas; el
  archivo que hay que llenar **no** se llama `keystore.properties`.
- **Nunca generar un keystore nuevo.** `nexara-upload.jks` es la llave de subida
  ya registrada en Play. Una llave nueva hace que Play rechace toda subida
  futura, y recuperarlo es un trámite de días con Google.
- **Las ocho capturas** de `play-assets/screenshots/phone/` se rehicieron con la
  cuenta de revisión dentro de su tenant: gente `@demo.invalid`, folios
  `AN-DEMO-*`. Las anteriores eran del versionCode 10 y tres navegaban a paneles
  borrados.
- **Aislamiento del revisor verificado contra producción**: `company/mine`
  devuelve sólo `nexara-demo`, `me/board` cinco personas todas `@demo.invalid`,
  y tiene una actividad asignada.
- Falta, y es de Adam: la declaración de «Permisos de servicio en primer plano»
  (tipo `location`, con vídeo) en Play Console. Ver §6.5.1 del checklist — la
  guía decía que no aplicaba y era falso.

## Lo que quedó a medias

- **Documentos**: su agente construyó el módulo entero contra el repo del
  29-ago. El árbol aislado salió de `e08c5aa2` y no se dio cuenta (los de
  Gastos, Pagos y Aprobaciones sí, y se pusieron al día solos). Su rama
  `worktree-agent-a86c8daa824f28fbb` **no se debe fusionar**: hay que rehacerlo
  sobre la punta. Su análisis de la API sí sirve: el archivo no tiene endpoint,
  se sirve por `express.static` fuera de `/api` y con JWT; y `mimeType` y
  `fileSizeBytes` nunca los manda el formulario web.
- **Al crear árboles aislados, comprobar la base antes de trabajar.** Salen de
  bases distintas sin avisar.

## Estado de la ola móvil (21-09, cinco frentes en paralelo)

- **Cotizaciones** y **Herramientas** dejan de ser cascarones: pantalla nativa,
  lista y detalle. Ya no queda ningún módulo de «Más» que mande al navegador.
- **Actividades** y **Asistencias** rediseñadas contra las 9 reglas.
- **iOS** cerró cuatro huecos reales (salto de prioridad, aviso de sesión
  expirada, onboarding, permisos en Mi perfil). **Nada de iOS se compiló: no hay
  Mac.** Hay que pasarlo por Xcode antes de darlo por bueno.
- **Viáticos en lote** (`POST viaticos/assign/lote`) con su pantalla en la web.

### Dos hallazgos que siguen abiertos

1. **`GET /cotizaciones/core` devuelve 20 como máximo, no 200.** `take` es un
   *getter* (`this.limit ?? 20`) y el ValidationPipe global tiene
   `transform: true`, así que `query?.take` nunca es `undefined` y el `?? 200`
   es código muerto. Afecta a la web y a la app. `limit` tiene `@Max(100)`, así
   que pedir 200 desde el cliente daría 400: hay que decidir si esa lista pagina
   de verdad o lleva su propio tope. Es el mismo patrón del tope de 100.
2. **El alta de préstamo de herramienta no se puede completar.** Las dos
   personas que `tools-access.ts` autoriza a crear préstamos necesitan
   `GET tool-requests/inventory` para elegir la herramienta, y ese endpoint pide
   `tools.manage`, que no tienen. La pantalla lo dice en español en vez de
   fingir que funciona.



## Lo que se encontró hoy y hay que entender antes de tocar nada

`CompanyService.listForUser` —lo que responde `GET /company/mine`— llamaba a
`ensureMembership(userId, primaria, true)` **para todo el que lo llamara**. La
app móvil pide ese endpoint justo al entrar, así que cada login metía a la
cuenta en la empresa real de NEXARA y encima la dejaba como su predeterminada.

Consecuencias, las dos del mismo origen:

1. La cuenta de revisión de Google Play (`play.review@nexara.com.mx`, tenant
   `nexara-demo`) salía de su tenant en su primer login y `GET /me/board` le
   devolvía empleados reales con nombre y correo.
2. Sus propias actividades de demo dejaban de aparecer —`GET /me/activities`
   respondía vacío— porque su empresa activa pasaba a ser la 1 y la demo vive
   en la 2. Eso es el «Nada por hacer» que se veía en el emulador.

En el turno anterior se «arregló» volviendo a correr el sembrador. Eso sólo
limpia la fila; el siguiente login la volvía a crear. El arreglo real es el de
`listForUser`: sólo se auto-inscribe a quien no pertenece a ninguna empresa
(los usuarios heredados de cuando había una sola).

**La fila mala sigue en producción** y hay que borrarla *después* de desplegar
este cambio, si no vuelve a nacer. Ver «Pendiente de Adam».


## Puente — no cambiar

NAS Synology `192.168.9.32` / `nas-nexara` anuncia `192.168.9.0/24`.

## Pendiente de Adam, sin hacer

1. **Rotar la clave de Google Maps.** Se pegó en el chat más de una vez. Ningún
   agente la escribe en disco; Adam la pone en el servidor con el comando de
   `.ai/HARDENING-GAP.md`.
2. **«Asignar viático» no existe en la interfaz.** `POST viaticos/assign` está
   completo en la API (sella `origen: ASIGNACION` y `asignadoPorId`, y exige
   ligar a actividad o proyecto), `getErpViaticsAdminSectionConfig` da
   `canAssign: true`, y el subtítulo de la pantalla dice literalmente «Autoriza
   y **asigna** viáticos del equipo». Falta solo el botón y su formulario. No se
   construyó sin permiso porque crea un gasto a nombre de otra persona.
3. **Saldo del anticipo de viático:** `POR_DEVOLVER` y `POR_REEMBOLSAR` se ven
   pero no generan asiento. ¿Se descuenta en nómina o se registra como cuenta
   por cobrar?
4. **`minutosPagables` de pre-nómina:** 9 horas netas + 1 aprobada da 10
   «pagables». ¿Doble conteo, o extra a doble? `pre-nomina.spec.ts:64` lo fija
   en 10 h, así que hoy parece deliberado.
5. **El contrato dice 32px y yo pedí 40px.** Los agentes obedecieron el
   contrato y subieron a 40px solo con puntero grueso. Si Adam quiere 40px
   también con ratón, se cambia el contrato primero.

## Hecho este turno

Adam pidió dos cosas: que la cotización tuviera el diseño del PDF de viáticos,
y que se viera «muchísima más profesionalidad y UI/UX en todo el sistema». Y
mandó una captura de Facturas con un error.

### 1. La cotización adopta el tema corporativo

Banda superior, tres tarjetas arriba (total, anticipo, entrega) y fichas para
cliente y condiciones. Se renderizó y se miró antes de enseñarla, y así
aparecieron tres defectos viejos: los párrafos se medían sin `lineGap` y se
recortaba la última línea («pueden cambiar sin previo aviso» no salía);
Garantías repetía un renglón por partida; y las páginas de continuación metían
la tabla debajo del logo.

**Ningún PDF usaba las fuentes corporativas.** El tema registraba Montserrat e
Inter y dibujaba todo con `'Helvetica'` a pelo, y de los veinte generadores
solo `propuesta-tecnica` llamaba a `registrarFuentesCorporativas`. Ahora pedir
la fuente **es** registrarla (`fuente(doc, clave)`), así que los veinte
cambiaron de golpe. El PDF pasa de ~20 KB a ~133 KB: son las fuentes embebidas.

### 1 bis. El PDF de cotización tiene DOS generadores — ojo

`buildPdf(quote, internal)` en `cotizaciones.service.ts`: con `internal = false`
va a `buildPropuesta` → **`propuesta-tecnica-pdf.ts`**, que es lo que descarga
el cliente. `cotizacion-pdf.ts` es el formato interno, el único con costo de
proveedor y margen, y se usa además como respaldo si la propuesta revienta.

En este turno se pulió primero el equivocado. Adam lo vio enseguida: «el PDF de
cotizaciones sigue sin tener las estilizaciones». Los dos quedaron con el tema
corporativo, pero si alguien toca «el PDF de la cotización», el que se ve es el
de la propuesta técnica.

Del reporte de viáticos —la referencia que dio Adam— se trajeron: barra de
acento en portada, banda tintada con logo en cada hoja, tira de tres tarjetas
(total, anticipo, vigencia) sobre la tabla, cabecera de tabla en azul marino y
fichas con relleno gris. El anticipo llega nuevo al documento: `depositPercent`
existía pero solo alimentaba los términos.

Pendiente de decidir: si la portada lleva también la banda tintada. Se dejó
solo con la barra de acento.

### 2. Siete pantallas que no habían cargado nunca

La captura de Adam decía «limit must not be greater than 100». La vista pedía
`limit=200` y `PaginationQueryDto` topa en 100.

| Pantalla | Qué costaba |
|---|---|
| `erp/contabilidad/facturas` | 400 desde el primer día |
| `erp/invoicing` | el campo Cliente está condicionado a que la lista traiga algo: con `clientId` opcional en la API se podía guardar una factura de ingreso **sin cliente**, y esa no entra en cuentas por cobrar |
| `studio/leads` | alimentaba `promotedIds`: nunca se marcaba lo ya enviado → leads duplicados |
| `ops/support/new`, `ops/maintenance/contracts`, `ops/assets` | cliente obligatorio: no se podía abrir ticket, ni dar de alta contrato, ni guardar activo |
| `integra/settings` | además, `pedirIntegra` cuelga `siteId` de toda URL y `service-clients` es ruta ERP con DTO bajo `forbidNonWhitelisted`: moría por `siteId` con límite o sin él |

Ninguna recorta en silencio: se piden páginas hasta completar y, donde se topa
el techo, se dice cuántos de cuántos. `listUsers` pagina por dentro, lo que cura
de paso `integra/people`, que llamaba sin parámetros y enseñaba 20 usuarios
como si fueran todos.

### 3. Contrato visual en cotizaciones y finanzas

Tres reglas nuevas en `.ai/DISENO-FINANZAS.md`, sacadas de mirar pantallas ya
desplegadas: **(7)** una fila de ceros no informa, no se pinta; **(8)** los
filtros son una barra, no un formulario; **(9)** ni una caja dentro de otra.

Aplicadas a `crm/quotes`, `erp/cotizaciones`, las pestañas de cotización de
cliente y oportunidad, y `erp/finance/{viatics,expenses,employee-payments}`.
`FinanceModuleShell` estrena `variant="flat"` opcional; sus otros 14
consumidores no cambian.

De paso, defectos que no eran de estilo: `quote-supplier.module.css` empezaba
con una línea suelta que dejaba el panel de pedido a CT **sin ningún estilo**;
el detalle de cotización guardaba el error de «bajar PDF / enviar correo» y no
lo pintaba nunca; cuatro pantallas vaciaban la tabla al fallar un refresco; los
inputs de partida de la oportunidad no tenían **ningún** nombre accesible; y
`OpportunityDetailShell` se quedaba con el esqueleto puesto para siempre si la
sesión no llegaba a estar lista.

### 4. La puerta vuelve a ser puerta

- El suite web fallaba dos pruebas al azar. No eran las pruebas: `findBy*`
  espera 1 s por omisión y el límite por prueba eran 5 s, cuando la más lenta
  ya gasta 2,6 s sola. Ahora 4 s y 15 s. Dos pasadas seguidas, 1 003/1 003.
- `workspace-ar-ap.spec.ts` se ponía rojo **todas las tardes**: fabricaba «hoy»
  con el día UTC y el servicio define «hoy» como el día del servidor. En México
  coinciden hasta las 18:00.

## Verificación

- API: **196 suites, 2 179 pruebas**, verde.
- Web: **86 archivos, 1 003 pruebas**, verde dos pasadas seguidas.
- `tsc --noEmit` limpio en API y web.

## Deuda medida, no estimada

**81 pantallas** siguen con rejilla de `KpiCard` y **361 tarjetas sueltas**
fuera del ámbito de Cursor; 24 ya usan `MetricStrip`. Peores: `crm/reports`
(14), `studio/pages` (12), `erp/hr` (11). Reproducible con el script descrito
en `.ai/HARDENING-GAP.md`.

## Lo que hizo fallar el primer deploy

`configure({ asyncUtilTimeout })` se importaba de `@testing-library/react`,
cuyo `configure` acepta su propia Config; `asyncUtilTimeout` vive en la de DOM.
El `tsc` local lo daba por bueno y el build de Docker no, porque
`@testing-library/dom` es peer sin declarar y cada instalación resuelve la
suya. Ya está en `package.json`.

Dos lecciones que valen para el siguiente turno:

1. **El build local miente si reusa `.next/cache`**: se salta la revisión de
   tipos. Para reproducir lo del servidor hay que borrar `.next` antes.
2. **`ssh ... && ./deploy/update.sh` devuelve 0 aunque el build muera.** Hay que
   leer el log buscando `Failed to compile` y `ERROR:`, no mirar el código de
   salida.

## Segunda mitad del turno

### 5. Fuera todo lo que no es /erp — 77 300 líneas

Adam lo confirmó dos veces. Verificado antes de borrar: `integra`,
`ops` y `sales` .nexara.com.mx devuelven 308 a `core.nexara.com.mx/erp/pizarra`,
y dentro de core el middleware redirige el resto. Nada era alcanzable.

Borrados en commits separados por panel, revertibles uno a uno: `lab`
(717b8228), `studio` (fdbc6274), `ops` (f243b4b9), `crm` (5a1b0551) e `integra`
(dentro de 5e7d729a, ver abajo).

Dos excepciones: **cuatro pantallas de `ops` estaban vivas** —Core las
reexportaba, no las duplicaba— y se movieron con `git mv` a `/erp` sin tocar
lógica. E **integra conserva tres archivos** (`_lib`, `_caps`, `_PersonFace`)
que usa el shell; no generan ninguna ruta.

### 6. Actividades con el lenguaje que Adam aprobó

Dos bandas de cifras —seis de flujo en cero más otras cuatro— fundidas en tres
celdas. La tarjeta pasa de cuadro blanco de 200px con iniciales a foto redonda
con aro de estado y el encargo completo. **Centro operativo**: pantalla
completa para dejarlo en la pared, Esc para salir, refresco cada 60 s, sin
Christian ni Claudia (excluidos por correo, no por puesto: el cargo cambia, el
correo no).

### 7. Avisos que no avisaban

Doce tipos se emitían con un valor que no existe en el enum de Postgres, así
que el INSERT fallaba y el emisor se tragaba el error: **ninguna aprobación de
flujo ni descuento de cotización avisaba a nadie**, ni en web ni en el
teléfono. Migración `20260920160000_avisos_workflow_y_descuentos`, aditiva. El
doceavo (`SALES_PROJECT_MARGIN_ALERT`) lo destapó la prueba nueva, no la
auditoría.

Y 30 enlaces de aviso apuntaban a paneles borrados; ahora salen de
`app-urls.ts`. `/ops/my-viatics` se dejó intacta a propósito: no hay pantalla de
«mis viáticos» en Core y mandar al ingeniero a la de administración cambiaría
un rebote por un 403.

### 8. App móvil: el rechazo de Play

Leídos en Play Console, los dos motivos: falta `isMonitoringTool` (arreglado,
`versionCode` a 11, con guardia en el preflight) y **credenciales de revisión
incorrectas**. La cuenta `play.review@nexara.com.mx` no estaba en el seeder; se
añade con la contraseña por variable de entorno:

    PLAY_REVIEW_PASSWORD='...' npm run prisma:seed

Tres bloqueos más, de la auditoría y sin resolver:

1. **El `.aab` en disco es el rechazado** (v10, 17-09). Hay que recompilar.
2. **La declaración de datos de Play dice que la ubicación en segundo plano «no
   aplica»** y el manifiesto declara `FOREGROUND_SERVICE_LOCATION`. Google
   compara y bloquea. El vídeo que piden ya existe en `play-releases/`.
3. **Las instrucciones al revisor describen paneles borrados el 15-09.** El
   propio documento llama a eso «la causa nº1 de rechazo».

iOS **sí tiene Firebase** (la documentación del repo se contradice); falta la
llave APNs. Pero los Swift **nunca se han compilado**: sin Mac no hay fecha
creíble.

## Error propio que conviene no repetir

`git add -- <ruta>` seguido de `git commit` **no commitea esa ruta: commitea
todo el índice**. Con varios agentes en la misma worktree, mi commit del seeder
(5e7d729a) se llevó dentro las 114 bajas de integra que otro agente tenía
preparadas. El contenido es correcto; el mensaje miente. No se reescribió
porque había un agente escribiendo y rebasar encima destruye trabajo en vuelo.

Para revertir solo ese borrado:

    git checkout 5e7d729a^ -- "apps/web/app/(panels)/integra"

Lo correcto es `git commit -F msg -- <rutas>`, que limita el commit por
pathspec. Los commits posteriores ya lo usan.

## Aviso de relevo

Cuatro agentes escribieron a la vez en esta worktree. Uno hizo `git stash push`
y se llevó el trabajo sin commitear de otro; lo devolvió y se verificó que no
se perdió nada (lista de stashes con solo dos viejos de otras ramas). Pero
pasó, y la regla 5 existe justo para eso: **un writer a la vez**.

## No tocar

Puente NAS · cotizaciones de prueba de clientes reales · `components/ui/` y el
shell (otro agente) · Actividades y Asistencias (packet de Cursor).
