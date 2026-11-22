# RELEVO

- **21-11 ~20:58 México (claude-code, nube; Cursor/Codex no alcanzables) — Vuelta 13 de pulido: en almacén, un número de serie que ya salió no puede volver a salir. Sin migraciones; sin desplegar.**
  - **El hueco:** una serie es una pieza, pero la misma serie se podía registrar en dos salidas (etiqueta leída dos
    veces, serie tecleada mal o un reintento). En la base local de demostración estaba el caso: `DS-2CD-0001` en
    `SM-000003` y otra vez en `SM-000004`. El historial decía que la misma cámara estaba en dos obras.
  - **La regla (`warehouse/evidencia-salida.ts`, pura):** `seriesQueSiguenFuera` mira el movimiento más reciente que
    nombra cada serie, dentro del mismo producto y la misma empresa. Si es una salida, una baja o un consumo de
    producción, la serie sigue fuera. Una devolución o una entrada posterior la regresa; un traspaso entre
    almacenes no la saca.
  - **Dónde se aplica (`warehouse.service.ts`, `assertSeriesEnAlmacen`):** al registrar una salida, baja o consumo con
    series, antes de mover existencias; y al agregarle series después a una salida ya registrada (sin compararla
    contra sí misma). Responde 400 con un aviso que dice qué hacer: «La serie DS-1 ya salió en el movimiento SM-3 y
    no ha regresado. Revisa la etiqueta o registra primero su devolución.» Con varias, las nombra todas.
  - **Lo que NO hace:** no corrige lo ya capturado (si en producción hay series repetidas en dos salidas, ahí siguen;
    falta un reporte para encontrarlas); no impide dar entrada dos veces a la misma serie; y como no hay llave única
    en la base (pediría migración), dos salidas simultáneas de la misma serie todavía podrían pasar las dos.
  - **Paridad:** API hecho · Web no aplica (el escáner y Movimientos ya muestran el aviso del servidor con
    `formatApiError`) · Android e iOS no aplica (`mensajeAlmacen` y `EscaneoReglas.mensaje` muestran ese mismo aviso;
    revisado en el código, no en un teléfono).
  - **Verificado:** `npm run typecheck:api` 0; jest API 537 suites, 6,727 pruebas; `nest build` termina bien. La web no
    cambió desde `d222b94` (vitest 299 archivos y 2,419 pruebas, y `next build` completo). `serie-ya-salio.spec.ts` (12 pruebas, 9 se vieron fallar antes del
    cambio). La consulta real de Prisma (`series: { array_contains: [serie] }`) se corrió en modo lectura contra la
    base local: encuentra la serie exacta dentro del arreglo, no confunde una parecida y respeta la exclusión del
    propio movimiento. No se probó en navegador (el entorno local está apagado) ni en producción.

- **21-11 ~20:46 México (claude-code, nube; Cursor/Codex no alcanzables) — Vuelta 12 de pulido: «hoy» después de las 6 de la tarde, horas que se recorrían al editar, y una página que no compilaba para producción (error mío de la vuelta 2). Sin migraciones; sin desplegar.**
  - **OJO, primero esto: `main` no compilaba la web desde `d99aa9a` (21-11, 16:38 México).** En
    `app/(subdomains)/tickets/[branch]/page.tsx` un guion mío puso un `import` arriba de `"use client"` (el archivo
    empezaba con una marca invisible, BOM, y el guion no reconoció la directiva). Next exige la directiva primero: la
    compilación de producción falla con «The "use client" directive must be placed before other expressions». Ni los
    tipos, ni vitest, ni el CI lo detectan (el CI no compila la web). Comprobado compilando ese archivo con el propio
    compilador de Next en la capa de servidor: la versión de `main` da ese error; la corregida compila como componente
    de cliente. **Cualquier despliegue de `main` entre `d99aa9a` y este commit habría fallado al construir la web.**
    Ya está corregido y hay dos candados en `lib/hoy-en-mexico.spec.ts`: nada de código antes de `"use client"` y
    ningún archivo con BOM.     **Segundo error, encontrado al correr la compilación completa (`next build`) sobre `e7ed958`:**
    `app/(panels)/erp/hr/incidencias/page.tsx` exportaba un ayudante (`textoTipo`, desde `d2a8aa5`, vuelta 3) y Next
    lo rechaza («is not a valid Page export field»). Se le quitó el `export` (solo se usa ahí) y hay un tercer
    candado: páginas y layouts solo exportan lo que Next permite. **Con esa corrección `next build` termina bien
    (289 páginas estáticas generadas). `e7ed958` por sí solo todavía no compila: el bueno es el commit siguiente.**
    Lección: antes de decir que `main` se puede desplegar, correr `cd apps/web && node ../../scripts/next-build-resilient.js`.
  - **La causa del resto, una sola:** el servidor corre en hora universal y `toISOString()` también la da en el
    navegador. Para ambos el día cambia a las 18:00 de México.
  - **Servidor (`workDateKey`, y nuevos `workDateKeyOf` y `addDaysToKey` en `common/time/workday.ts`):** de las 6 de
    la tarde en adelante salían con fecha de mañana la póliza automática de un desembolso y la del costo de una
    salida de almacén (`accounting.service.ts`), la factura que nace de un proyecto vendido y su vencimiento, el
    pago a empleados, la comprobación y el depósito de viáticos, la orden de venta de una cotización ganada, el
    gasto administrativo, la orden de compra y los nombres de archivo de varios reportes. En RH, la tendencia de
    14 días se armaba con días UTC.
  - **Tablero de despacho (`activities.service.ts`):** «Completadas hoy» contaba desde las 18:00 de ayer y se vaciaba
    a las 18:00 de hoy. Ahora es la medianoche de la empresa. **Ventana para editar el inicio** (mismo archivo):
    «desde ayer» se medía con el día del servidor; después de las 6 pm rechazaba un inicio de ayer por la mañana.
    **Aviso de prioridad** (`activity-evidence.service.ts`): comparaba contra las actividades del día UTC.
    **Ventas** (`getPeriodStart`): semana, mes y año de la empresa (la semana sigue empezando en domingo).
  - **Web, horas que se recorrían al guardar:** la ficha de una actividad (`erp/actividades/[id]`, botón Editar)
    llenaba «Fecha inicio» y «Fecha finalización» recortando el instante del API (hora universal) y al guardar lo
    leía como hora local: las 9:00 se veían como 15:00 y, con solo cambiar la descripción, la actividad quedaba
    seis horas después; además reenviaba el inicio aunque nadie lo tocara y el servidor lo rechazaba por la
    ventana si era de días atrás. «Entrega esperada» mostraba el día siguiente si la entrega era después de las
    6 pm y, al cambiarla, mandaba la medianoche universal (las 6 pm del día anterior). Ahora
    `lib/campo-fecha.ts`: los campos trabajan en la hora de quien edita, solo se manda la fecha que la persona
    cambió, y al cambiar el día de la entrega se conserva la hora que tenía (sin entrega previa, fin de ese día).
    Lo mismo en Comunicados (`erp/news`): reprogramar un comunicado lo movía seis horas.
    **Para el hilo de actividades:** no se tocó ninguna regla (semáforo, «No cumplida», un día por actividad); solo
    qué instante se muestra y se manda.
  - **Web, «hoy» por omisión (`diaEnMexico`):** fecha de pago al cobrar una factura, fecha de la hoja de servicio,
    orden de compra y recepción (y el calendario, que desde las 6 pm no dejaba elegir hoy), fecha de baja, inicio
    de proyecto del cliente, rangos de reportes de tickets, asistencia y contabilidad, y nombres de archivo.
  - **Pendiente visto y no hecho:** `vehicle-gps.controller.ts:40` toma el día por omisión en UTC (vehículos es de
    otro hilo); `activity-overdue-alerts.service.ts:70` usa `setUTCHours(0,0,0,0)` (reglas de atraso, hilo de
    actividades; no se revisó a fondo); `tool-requests/kit-inspecciones.ts:52` suma días con el reloj del servidor;
    `lib/cotizacion-documento.ts hoyISO`, `ComidasPanel` y `CarteraView` usan el día del navegador (correcto en
    México; mal solo con el equipo en otra zona). El paso «Tests · Web» del CI falló en `7f90d88` y pasó en
    `46c114d` sin cambios en la web: hay alguna prueba inestable por ubicar.
  - **Paridad:** API hecho · Web hecho · Android e iOS no aplica (no arman «hoy» en hora universal ni tienen esos
    formularios de edición; se revisó con búsqueda en el código, no en un teléfono).
  - **Verificado:** `npm run typecheck` 0; jest API 536 suites, 6,715 pruebas; vitest web 299 archivos, 2,419 pruebas. Cada corrección tiene una prueba que se vio fallar antes del cambio:
    `hoy-de-la-empresa.spec.ts` (8), `hoy-en-actividades.spec.ts` (6), 5 más en `workday.spec.ts`,
    `campo-fecha.spec.ts` (10) y `hoy-en-mexico.spec.ts` (4). Las del servidor corren en UTC y en hora de México.
    No se probó en navegador ni en producción (el entorno local de esta sesión está apagado).

- **21-11 ~20:29 México (claude-code, nube; Cursor/Codex no alcanzables) — Vuelta 11 de pulido: descargas y pantallas que salían vacías o negadas por no recibir la empresa, y «este mes» con el reloj del servidor. Sin migraciones; sin desplegar.**
  - **La causa, una sola:** los servicios buscan con `companyWhere(empresa)` o `requireCompanyId(empresa)`. Sin empresa
    el primero filtra por `companyId: -1` (cero filas) y el segundo responde 403 «Empresa requerida». Es el candado
    correcto, y el middleware de Prisma no lo afloja (si el `where` ya trae `companyId`, lo deja). El defecto estaba
    en quien llama: varias rutas ya tenían la empresa a la mano y no la pasaban. No hay fuga de datos en ninguna; al
    revés, no devolvían nada.
  - **Cómo se encontraron:** un barrido con el compilador de TypeScript (lectura solamente) sobre todo `apps/api/src`:
    cada llamada que omite un parámetro opcional `companyId` (o lo manda `null`/`undefined`), y una segunda pasada
    para la empresa que viaja dentro de un objeto (`filters.companyId`, `opts.companyId`). 45 llamadas marcadas; se
    leyó cada una. 15 fallaban de verdad; el resto es a propósito (sitio público, tareas programadas, banderas de
    plataforma). Los dos guiones quedaron en el borrador de la sesión, no en el repo.
  - **Lo que no funcionaba y ya funciona:**
    - *Excel de actividades* (`GET activities/export/xlsx`, página Exportaciones): bajaba sin renglones para todos.
    - *Reporte del ticket en PDF*: portal de clientes, portal de sucursal y el del propio técnico
      (`activity-evidence/:id/report`) respondían 404. Web, Android e iOS lo piden; se arregla en el servidor para
      los tres. Ahora viaja la empresa de la propia actividad, que la ruta ya había validado como de quien pregunta.
    - *Portal de clientes*: PDF y XML de la factura, y PDF de la cotización, respondían 404. Igual: la empresa del
      registro ya validado.
    - *Resumen del proyecto comercial* (`GET ventas/proyectos/:id/resumen`): 403 siempre; es lo que usa
      `/erp/proyectos/comercial/:id` para llevar al proyecto, así que esa liga mostraba «Empresa requerida».
    - *Crear el proyecto de una oportunidad* y *desplegarlo en campo* cuando el cliente aún no existe en operación:
      403. Lo mismo, en silencio, al ganar la oportunidad (el alta automática se tragaba el error).
    - *Adjuntar a una oportunidad una cotización hecha en la plataforma*: 404.
    - *Inicio del CRM móvil* (`GET mobile/crm/home`): 403 siempre. Hoy ninguna app lo consume; queda listo.
  - **Fechas en Exportaciones (`exports.service.ts`):** el rango se armaba con `new Date('AAAA-MM-DD')` y `setHours` del
    servidor: lo capturado después de las 18:00 de México salía en el archivo del día siguiente. Las columnas con
    hora (`createdAt`, `fechaAsignacion`, `fechaCreacion`) usan `workDateRange`; las que guardan solo el día
    (`issueDate` de factura y cotización, `startDate` de proyecto) se comparan por día calendario en UTC explícito,
    sin depender de la zona del proceso.
  - **«Este mes» con el reloj del servidor:** `new Date(y, m, 1)` y `now.getMonth()` leen UTC. La tarde del último día
    del mes el tablero de dirección ya contaba el mes siguiente (en ceros), y lo cerrado esa tarde se sumaba a ese
    mes; en metas de ventas eso movía también la comisión. `workMonth`, `workMonthOf` y `calendarMonthColumnRange`
    (`common/time/workday.ts`) dan el mes de la empresa. Aplicado en `executive.service.ts` (ventas del mes, del
    anterior y del año; actividades y tickets terminados; mejores vendedores), `sales-targets.service.ts`
    (desempeño y comisión, y la búsqueda de la meta por año y mes) y `mobile-crm.controller.ts`. Lo facturado en el
    mes sigue por día calendario (la fecha de factura no lleva hora), igual que el cierre real de proyectos.
  - **Pendiente visto y no hecho:** quedan meses armados con el reloj del servidor en contabilidad
    (`workspace-reports`, `workspace-ledger`), que comparan sobre todo columnas de solo día y piden revisarse una por
    una con la contadora; al ganar una oportunidad el alta automática corre con un actor que solo trae `id`, y las
    reglas de acceso al cliente (`assertPuedeVerCliente`) pueden negarla en silencio a quien no es dueño: no se
    tocó porque cambia quién puede qué.
  - **Paridad:** API hecho · Web no aplica (no cambió: consume las mismas rutas, que ahora responden) · Android e iOS
    no aplica (piden el reporte del ticket por las mismas rutas; sin cambio en la app).
  - **Verificado:** `npm run typecheck` 0; jest API 534 suites, 6,696 pruebas en verde (corrida completa); la web no cambió desde su corrida en verde de la
    vuelta 10 (297 archivos, 2,405 pruebas). Cada corrección tiene una prueba que se vio fallar antes del cambio:
    `ventas-empresa-interna.spec.ts` (6), `portales-descargas-empresa.spec.ts` (7), `mobile-crm-home.spec.ts` (4),
    `activities-export-empresa.spec.ts` (4), `exports-fechas.spec.ts` (13), `executive-mes.spec.ts` (4) y 4 más en
    `workday.spec.ts`. No se probó contra la base real ni en producción: son pruebas con la base simulada.

- **21-11 ~20:16 México (claude-code, nube; Cursor/Codex no alcanzables) — Décima vuelta de pulido: los Excel que se descargan y las fechas de los reportes. Sin migraciones; sin desplegar.**
  - **Cómo se revisó:** cada Excel se generó con datos de demostración, se convirtió a PDF con LibreOffice (así se ve
    cómo se imprime) y se leyó hoja por hoja. Los de operación (actividades, evidencias, vehículos, viáticos,
    asistencia, KPIs, pre-nómina) ya usaban el tema de `common/excel/reporte-excel.ts` y estaban bien. Los de
    contabilidad no.
  - **Contabilidad, tres libros fuera del tema:**
    - *Buzón SAT, CFDI y Por contabilizar (web, `lib/contabilidad-excel.ts`):* armaban su propio libro, sin banda ni
      logo, con la fecha como texto («2026-10-05T00:00:00.000Z»), los estatus como en la base y sin configuración de
      impresión (la mitad de las columnas caía en una segunda hoja). Ahora traducen sus columnas y delegan en
      `exportToExcelAsync`, el tema que usan las otras ~60 pantallas. Misma firma; se agregaron `titulo`,
      `etiquetas`, `ajustar` y `generadoPor`. Un importe que no viene queda vacío (antes se escribía 0).
    - *Buzón SAT (API, `GET accounting/.../buzon-sat/excel`):* era un volcado crudo (fecha «###», «Generado» en ISO
      con hora del servidor). Ahora sale de `crearReporte` con `COLUMNAS_BUZON_SAT`. Nadie lo llama desde la web hoy;
      queda parejo por si se usa.
    - *Estados financieros (API):* tenía formato propio y, al imprimir, el comparativo y la variación se iban a otras
      hojas (5 en total). Conserva sus fórmulas y secciones y toma la banda, tipografía, encabezado e impresión del
      tema: una hoja de ancho por estado, nombres largos ajustados, pie «Página N de M», «Generado por».
  - **Piezas nuevas del tema (API):** `escribirBanda`, `registrarLogo`, `estiloEncabezado`, `configurarImpresion` y
    `EXCEL_FUENTE`, exportadas de `reporte-excel.ts` para las hojas que no son una tabla plana. `escribirHoja` las usa:
    mismo resultado (sus 31 pruebas no cambiaron).
  - **Tema web (`lib/export-excel.ts`):** una celda con texto ajustado dejaba la fila en su alto fijo y Excel solo
    enseñaba el primer renglón. Ahora la fila crece (`lineasDeTexto`, gemelo del API) y hay `ajustar` por columna.
    Aplica a todas las pantallas que exportan textos largos.
  - **Control de nómina:** «CONTROL DE NÓMINA NEXARA» con acento (la pestaña ya decía «Nómina»); «ENTRADA» se partía en
    «ENTRAD / A» (columna de 8.5 a 9.5); «MIÉRCOLES 30» era el único día en dos renglones (13 a 14). El formato de
    Adam no cambió.
  - **Fechas de los reportes (falla de datos, no de diseño):** el tope de un rango se armaba con
    `${dia}T23:59:59.999Z` o con la hora del servidor, que corre en UTC: el día terminaba a las 18:00 de México. Lo
    registrado esa tarde quedaba fuera del reporte de su día y aparecía en el del siguiente. `workDateRange` y
    `parseWorkDateEnd` (`common/time/workday.ts`) convierten días de la empresa en instantes. Aplicado en: panel y PDF
    de viáticos, panel y PDF de gastos, PDF de actividades, movimientos de almacén (ahí «hasta el 21» además cortaba
    al *empezar* el 21), inventarios (consola, portal de cliente y de sucursal) e historial propio de evidencias. Solo
    columnas con hora; las `@db.Date` (facturas, pólizas, incidencias) ya estaban bien y no se tocaron.
  - **Gastos administrativos salía vacío:** `GET expenses/analytics` y `expenses/report.pdf` no pasaban la empresa al
    servicio, así que el filtro caía en el candado «sin empresa no hay filas» (`companyId: -1`): el panel y su PDF
    salían en ceros para todos, aunque la lista de la misma pantalla sí mostraba los gastos. Ahora la empresa viaja
    desde el controlador, igual que en la lista. El candado sigue: sin empresa no devuelve nada.
  - **Textos:** «Kárdex» con acento en el PDF de almacén, como en la pantalla.
  - **Prueba que ya venía en rojo:** `ComoSeHace.spec.tsx` fallaba desde ab230df (20-11): ese commit cambió el
    encabezado de la tabla al nombre común del momento (`MOMENTO_LABEL`, «En progreso», el mismo de Android) y la
    prueba se quedó esperando «Durante». Se puso al día la aserción (una línea; no se saltó ni se apagó nada). Con
    esto la corrida de la web queda completa en verde y el trabajo de pruebas web del CI deja de estar en rojo.
  - **Pendiente visto y no hecho:** las pantallas de la mesa contable (buzón SAT, CFDI, por contabilizar) siguen con
    estilos en línea y enseñan los estatus crudos; `GET audit/export.csv` es técnico a propósito (ISO, inglés).
    Consultas que arman su filtro con `companyWhere(x)` sin que el controlador les pase la empresa: no es fuga (el
    middleware de Prisma ya filtra por empresa toda petición), es el riesgo contrario, que salgan vacías como la de
    gastos. Un barrido con el compilador (llamadas que omiten un `companyId` opcional que el método usa para
    filtrar) dio 14: la más visible es `GET activities/export/xlsx`, el Excel de actividades de la página
    Exportaciones, que por lo mismo baja sin renglones; también `kb` (artículo y categorías), `projects`
    (`findAll`/`findOne`), `mobile-crm` (agenda) y `generateTicketReport` desde los portales. Sin corregir aquí: es
    la siguiente vuelta, con su prueba cada una.
  - **Paridad:** API hecho · Web hecho · Android e iOS no aplica: no descargan estos Excel ni consumen el panel de
    gastos (`GastosApi.kt` lo dice), y los filtros de fecha los resuelve el servidor para todos.
  - **Verificado:** `npm run typecheck` 0; jest API 528 suites, 6,654 pruebas en verde (corrida completa; después solo cambió el ancho de una columna del buzón y se repitieron sus 7 suites, 22 pruebas); vitest web 297 archivos, 2,405 pruebas, todas en verde. Pruebas nuevas:
    `estados-financieros-excel.spec.ts` (10), `buzon-sat-excel.spec.ts` (6), `expenses-analytics.spec.ts` (5),
    `contabilidad-excel.spec.ts` (4), más 5 en `workday.spec.ts` y 1 en `export-excel.spec.ts`.
  - **Antes y después (datos de demostración):** `rediseno/antes-despues-2026-11-21/excel-contabilidad.png` en los
    archivos del proyecto. Se vio con LibreOffice, que sustituye Segoe UI: conviene abrir uno en Excel tras el
    despliegue.

- **21-11 ~19:45 México (claude-code, nube; Cursor/Codex no alcanzables) — Novena vuelta de pulido: los PDF que salen de la plataforma. Sin migraciones; sin desplegar.**
  - **Cómo se revisó:** los 15 documentos que usan el tema común (`common/pdf/nexara-pdf-theme.ts`) se generaron con
    datos de demostración, se pasaron a imagen y se leyeron hoja por hoja, antes y después. La cotización al cliente
    (generador propio) quedó idéntica pixel por pixel: no se tocó su diseño.
  - **Fallas de raíz, en el tema (las heredaban todos):** las piezas (`drawInfoCard`, `drawKpiCards`,
    `drawSummaryBox`, `drawTableHeader`) dejaban el cursor donde terminó su último texto y cada documento sumaba
    espacio «a ojo»: quedaba una franja en blanco bajo el encabezado de cada tabla y huecos disparejos. Ahora dejan el
    cursor donde empezaron. Los renglones del encabezado se encimaban cuando uno no cabía; el título de una sección se
    quedaba solo al final de la hoja (ahora salta con su contenido); una palabra más ancha que su columna se partía a
    la mitad («APROBA / DO») y ahora se achica; el recuadro de resumen medía cada renglón con alto fijo y encimaba los
    largos; `pdfTruncate` cortaba con «...» y ahora con «…».
  - **Pie y hojas:** el pie salía solo en la última hoja y sin número. `drawNexaraFooterOnEveryPage` lo pinta en todas
    y agrega «Página N de M» cuando hay más de una. El reporte de actividades abría una hoja en blanco solo para el
    pie. Once títulos de sección se imprimían dos veces al saltar de hoja (acta, reporte al cliente, reporte de
    actividad, hoja de servicio).
  - **Fechas y horas:** el servidor corre en UTC y los documentos imprimían esa hora: un movimiento de almacén de las
    19:30 salía a la 01:30 del día siguiente, y «Generado» igual. `pdfFecha`, `pdfFechaHora` y `pdfPeriodo` usan la
    zona de la empresa (`WORKDAY_TIMEZONE`); una fecha guardada sin hora (medianoche UTC) se imprime tal cual, sin
    recorrerse un día. Los periodos se leen «01/11/2026 al 21/11/2026» (antes «Periodo: Periodo: 2026-11-01 → …»).
    El reporte comercial empieza semana, mes y año a la medianoche de la empresa. La «→» no existe en las fuentes
    incrustadas y se imprimía como un bloque negro: `pdfCambio` usa «›».
  - **Textos:** estatus, prioridades, categorías y tipos salían con el valor interno (`APPROVED`, `IN_PROGRESS`,
    `CORRECTIVO`). Pasan por `etiquetaDe` y los mapas de `common/excel/etiquetas.ts`, los mismos de los Excel, para
    que el PDF diga lo que dice la pantalla. «Landed cost» → «Costos adicionales», «Total OT» → «Actividades»,
    «Top empleados» → «Pagado por empleado», «Email» → «Correo». «Pipeline» y «Leads» se quedan: así se llaman en la
    web.
  - **Documento por documento:** la orden de venta se guardaba **vacía** (0 bytes: el generador devolvía el búfer
    antes de que pdfkit terminara de escribir); ahora es una promesa que se resuelve al cerrar el documento. El
    comprobante de almacén trae dónde firman quien entrega y quien recibe. En el contrato de mantenimiento las firmas
    ya no se van solas a otra hoja. El reporte al cliente ya no deja la sección «Evidencias por ticket» vacía y dice
    «Aún en atención» si el ticket no ha cerrado. En el reporte de actividad y la hoja de servicio el logo del
    cliente tapaba los rótulos de la primera tarjeta: se movió arriba a la derecha (**no se vio con un logo real**:
    conviene abrir uno tras el despliegue).
  - **No cambió:** qué datos trae cada reporte, sus filtros, permisos ni rutas. Tampoco los generadores con diseño
    propio (orden de compra, evidencias de actividad, cotización), que siguen con Helvetica.
  - **Pendiente visto y no hecho:** los filtros de fecha de viáticos, gastos y actividades cortan el día en UTC para
    registros con hora (uno de las 19:00 cae en el día siguiente); las tarjetas «Desglose» parten «nombre — monto» en
    columnas angostas; los Excel de esta vuelta no se revisaron (`control-nomina-excel.ts:338` dice «NOMINA»).
  - **Paridad:** API hecho · Web, Android e iOS no aplica: los documentos los arma el servidor y las apps solo los
    descargan.
  - **Verificado:** `npm run typecheck` 0; jest API 525 suites, 6628 pruebas en verde (`common/pdf/nexara-pdf-theme.spec.ts` 15 pruebas y
    `common/pdf/reportes-pdf.spec.ts` 12, nuevas); web sin cambios desde la vuelta anterior.

- **21-11 ~19:14 México (claude-code, nube; Cursor/Codex no alcanzables) — Octava vuelta de pulido: los correos que manda la plataforma. Sin migraciones; sin desplegar.**
  - **Qué había:** ocho correos armados en cinco servicios. Seis traían su propia copia del mismo HTML y dos no traían
    ninguno: la cotización le llegaba al cliente como cuatro renglones sin formato, con asunto «Cotizacion» y la
    dirección larga a la vista. Las copias compartían tres fallas: el logo (`logo-nexara.png`, 343×374) se pintaba a
    120×40, estirado al triple; la cabecera solo declaraba un degradado, que Outlook no pinta (letras blancas sobre
    blanco); y con las imágenes bloqueadas no quedaba ni el nombre.
  - **Marco único (API, `common/email/correo-nexara.ts`):** `correoNexara` y sus piezas (`saludo`, `parrafo`,
    `recuadro`, `dato`, `botonDeCorreo`, `ligaDeRespaldo`, `despedida`). Logo a 37×40 con «NEXARA» en texto al lado
    (se lee aunque las imágenes estén bloqueadas); con `EMAIL_LOGO_URL` solo se fija el alto, porque de un logo ajeno
    no se conoce la proporción. Color de respaldo en la cabecera, ancho fijo para Outlook, `lang="es"`, texto de
    avance para el buzón y botón con el color en la celda. `escaparHtml` y `conSaltos` para todo lo que escribe una
    persona; `aTextoPlano` saca la versión en texto; `remitenteConNombre` pone «NEXARA» como nombre del remitente en
    los correos a clientes (el buzón enseñaba «ventas») y respeta el que ya trae nombre.
  - **Cada correo, en su archivo y con versión en texto:** cotización (`cotizaciones/correo-cotizacion.ts`: asunto
    «Cotización FOLIO», botón «Revisar y firmar la cotización», el mensaje de quien envía en un recuadro; sin nombre
    de cliente saluda «Hola,» y ya no «Hola cliente,»), acceso al portal y encuesta
    (`service-clients/correos-portal.ts`: «Contraseña» en vez de «Password», «Se genero», «se marco», «tu opinion»),
    contacto nuevo y respuesta (`contact-messages/correos-contacto.ts`: «Categoría», «Correo», «Teléfono»; «A
    continuacion», «mas dudas»), noticia (`news/correo-noticia.ts`: «Estas recibiendo… estas suscrito»), minuta
    (fecha «20 de noviembre de 2026» en vez de «2026-11-20») y los cinco avisos internos de `email.service.ts`
    (títulos sin mayúsculas de más; «día/días» también en el asunto).
  - **Fallas que no eran de texto:** el nombre de quien se suscribe o escribe desde el sitio (formulario público) y el
    del cliente entraban al HTML sin escapar en noticias, respuesta a contacto, acceso al portal y encuesta. «Ver
    noticia» llevaba a la portada: ahora abre la noticia (`/blog/slug`) cuando es de la empresa del sitio, que es la
    única que el blog publica; para las demás sigue yendo a la portada. El remitente de respaldo de encuesta y
    noticias era `no-reply@nexara.com`, un dominio ajeno: ahora `nexara.com.mx` (solo aplica si falta `SMTP_FROM`).
  - **No cambió:** a quién se manda, cuándo, las copias, los adjuntos, las ligas del portal y de firma, ni la
    configuración SMTP. Mandar la contraseña del portal por correo sigue igual (ya era así).
  - **Cómo se revisó:** cada correo dibujado en Chromium a 680 y 375 px con datos de demostración; ninguno se
    desborda. Antes y ahora de los dos que recibe el cliente: `rediseno/antes-despues-2026-11-21/correos.png` en los
    archivos del proyecto. No se probó en Outlook ni Gmail reales: conviene mandarse una cotización de prueba tras el
    despliegue.
  - **Paridad:** API hecho · Web, Android e iOS no aplica: los correos los arma y manda el servidor.
  - **Verificado:** `npm run typecheck` 0; jest API 6,601 de 6,601 en 523 archivos (`common/email/correos.spec.ts`, 16 pruebas
    nuevas); web sin cambios desde la vuelta anterior.

- **21-11 ~18:15 México (claude-code, nube; Cursor/Codex no alcanzables) — Séptima vuelta de pulido: que el servidor nunca conteste en inglés. Solo textos; sin migraciones; sin desplegar.**
  - **Validación de formularios (API, `common/validacion-es.ts`):** unas 1,300 reglas de `class-validator` no traen
    mensaje propio y contestaban con el texto de la librería: «amount must be a positive number», «property stock
    should not exist». `ValidacionEnEspanolPipe` es el `ValidationPipe` de siempre (mismas opciones en `main.ts`,
    mismo 400, misma forma `message: string[]`) y solo traduce esos textos por defecto: «El monto debe ser mayor que
    cero», «Falta la descripción», «La cantidad del renglón 2 debe ser un número entero», «El campo «stock» no se
    admite aquí». Unos 90 campos comunes llevan su nombre como se dice («el monto», «la fecha de inicio»); el resto
    sale «el campo «x»». El mensaje propio de un DTO y cualquier texto que no se reconozca pasan intactos. La prueba
    corre contra la librería real, con las mismas opciones del servidor.
  - **Mensajes de error (API, 86 en 28 archivos):** 23 estaban en inglés («Project not found», «Engineer already
    assigned to this project», «Invalid base64 image data», «Image file too large. Max size: 5MB…», «Cannot close
    project…») y 22 en español sin acentos («Fecha invalida», «Rango invalido», «Credenciales invalidas», «Decision
    invalida», «Cotizacion no encontrada», «Solo se permiten imagenes o PDF»). Ahora «Proyecto no encontrado», «Esa
    persona ya está asignada a este proyecto», «La imagen pesa 6.20 MB y el máximo es 5 MB», «Fecha no válida»,
    «Rango de fechas no válido»… El aviso de presupuesto decía «Costs $X > Budget $Y»; ahora «los costos ($X) superan
    el presupuesto ($Y) por $Z». Solo cambia el texto: mismos códigos y mismas condiciones. Antes de tocar cada uno se
    buscó en web, Android, iOS y pruebas: ninguno dependía del texto viejo. No se tocaron los de máquinas (métricas,
    OIDC, `Idempotency-Key`, API keys) ni los que pone el marco («Unauthorized», «Forbidden resource», «File too
    large»): iOS reconoce esos por su texto y Android por su código.
  - **Web:** `formatApiError` traduce también los genéricos del marco, solo cuando llegan con su texto exacto
    (como JSON o como texto): «Unauthorized» → «Tu sesión expiró. Vuelve a iniciar sesión.», «Forbidden resource» →
    «No tienes permiso para esta acción.», «Too Many Requests» → «Demasiados intentos seguidos. Espera un momento y
    vuelve a intentarlo.», «Payload Too Large» / «File too large» → «El archivo pesa más de lo permitido.», «Bad
    Gateway» y parecidos → «El servidor tuvo un problema…». «Bad Request», «Not Found» y el «Validation failed
    (numeric string is expected)» de un id mal formado en la URL (585 `ParseIntPipe`) no dicen nada: gana la frase de
    la pantalla («No se pudo guardar…»). Un mensaje redactado por el servidor nunca se toca. Los lugares que
    leen el texto crudo para decidir (`esErrorSinAcceso`, `HerramientasChecklist`, proyectos) siguen igual, y la
    bitácora de contabilidad reconoce el permiso también con la frase nueva. «Solo se permiten imágenes o PDF.» en la
    solicitud de viáticos.
  - **iOS:** los datos de demostración (`DemoFixtures+PorRol.swift`) repiten los textos nuevos del servidor.
  - **Paridad:** Web hecho · API hecho (textos) · Android hecho: muestra el mensaje del servidor, ya en español, y los
    genéricos del marco ya los traducía por código (`ApiErrors.kt`); solo cambió un comentario · iOS hecho: igual
    (`NxFriendlyError`), más los datos de demostración.
  - **Prueba que fallaba según la hora (API, `attendance-duplicados.spec.ts`):** «una jornada abierta de AYER se cierra
    sola» usaba «ahora menos 24 h» como fecha del día; de las 18:00 a la medianoche de México ese instante ya cae en
    el día de hoy y la prueba fallaba. Ahora arma el día con `workDateColumn`, como el servicio. El servicio no cambió.
  - **Verificado:** `npm run typecheck` 0; jest API 6,584 de 6,585 en la corrida completa (la que falló era la prueba de asistencias de arriba; corregida y vuelta a correr sola, 8 de 8); vitest web 2,399 de 2,400 (solo `ComoSeHace.spec.tsx`, ajena y ya conocida); `ios-static-check.py`
    sin problemas.

- **21-11 ~18:00 México (claude-code, nube; Cursor/Codex no alcanzables) — Sexta vuelta de pulido: tema oscuro legible y teléfono con el dedo. Sin migraciones; sin desplegar.**
  - **Cómo se midió:** un navegador recorrió las 26 pantallas del menú a 390 px, en claro y en oscuro, midiendo lo que se
    sale de la pantalla, los controles de menos de 24 px y el contraste de cada texto contra su fondo real. Nada se
    desborda. En oscuro salieron tarjetas blancas con letra clara (contraste 1.1:1) en Costos, Vehículos y Asistencias.
  - **Causa (web, `app/ui-tokens.scss`):** un alias declarado en `:root` (`--ui-bg-2: var(--ui-surface-2)`) se resuelve
    en `:root` con el valor del tema claro y `body.dark` lo hereda ya resuelto: cambiar el token de origen no lo mueve.
    Quince alias estaban así (`--ui-bg-2`, `--ui-surface-sunken`, `--ui-surface-raised`, `--ui-fg-muted`,
    `--ui-fg-disabled`, `--ui-primary`, `--ui-focus-outline`…), usados por unas 60 reglas de 29 archivos: asistencias,
    comidas, festivos, guardias, almacén, herramientas, costos, pizarra, chat, mapas, dirección. Ahora se vuelven a
    declarar en `body.dark`. Comprobado compilando las hojas con sass y leyendo el valor en Chromium: `--ui-bg-2` en
    oscuro pasó de `rgb(248,250,251)` a `rgb(14,21,34)`.
  - **Candado:** `lib/tokens-oscuro.spec.ts` lee las cinco hojas globales y falla, nombrando el token, si un alias de
    `:root` depende de algo que el tema oscuro cambia y no se repite en `body.dark` (o en `body`).
  - **Anillo de foco (web, `app/globals.scss`):** `--ring-soft`, `--nx-panel-ring` y `--nx-panel-ring-accent` se
    declaraban en `:root` con `var(--primary)` / `var(--accent)`, que viven en `body`: quedaban sin valor y el anillo
    de foco de campos y botones de la capa antigua (`utilities.scss`) no se pintaba en ningún tema. Ahora se declaran
    en `body`. `--nx-panel-hairline-strong` y `--nx-panel-surface-overlay-strong` se suman a sus hermanos en oscuro.
  - **Con el dedo:** enlace de regreso de `PageHead` (18 px de alto), «Ver el detalle de…» en Desempeño (18 px) y el
    nombre en las tarjetas de Asistencia (21 px) crecen solo en pantallas táctiles (`pointer: coarse`); en Usuarios la
    casilla de 18 px ahora se marca tocando toda su celda y el nombre mide 25 px de alto.
  - **Hallazgos sin tocar:** en tema claro `--nx-panel-hairline`, `--nx-panel-hairline-soft` y
    `--nx-panel-surface-overlay` tampoco tienen valor (mismo motivo: `--border` y `--surface` viven en `body`); 44
    reglas caen a su respaldo `var(--border)` y 8 estilos sin respaldo se quedan sin borde (asistencia de RH,
    `ModuleStub`, pestañas de roles, portales). Arreglarlo aclara bordes en muchas pantallas: se deja para una vuelta
    con vista previa. El índice de una persona dada de baja en Desempeño va al 60 % de opacidad (contraste 2.9:1): es
    a propósito, queda anotado.
  - **Vista previa local:** el servidor de la web de esta sesión llegó a su límite de tiempo y se detuvo a media vuelta;
    las correcciones se comprobaron con las hojas compiladas en un navegador y con pruebas, no recorriendo pantallas.
  - **Paridad:** Web hecho · API no aplica (no se tocó) · Android no aplica: tema y tamaños táctiles propios (Material) ·
    iOS no aplica: igual (SwiftUI, colores del sistema de diseño de la app).
  - **Verificado:** `npm run typecheck` 0; vitest web 2397/2398 (solo falla `ComoSeHace.spec.tsx`,
    que ya fallaba antes y no es de esta vuelta); la API no cambió (jest 6580/6580 de la cuarta vuelta).
- **21-11 ~17:50 México (claude-code, nube; Cursor/Codex no alcanzables) — Quinta vuelta de pulido: que nada se vea roto ni engañe cuando el servidor no contesta. Sin migraciones; sin desplegar.**
  - **Cómo se probó:** un navegador recorre las 26 pantallas del menú con la cuenta de demostración mientras se corta
    `/api/**` (sin red) y, en otra pasada, se contesta 500 a todo (como en medio de un despliegue). Antes: casi todas
    enseñaban «Failed to fetch», el texto del navegador en inglés, y ocho dejaban además un estado que no era cierto.
    Después: las 26 avisan en español y las 26 ofrecen «Reintentar»; ninguna enseña texto crudo.
  - **Aviso de red en un solo lugar (web):** `lib/red-caida.ts` envuelve `fetch` una vez (`app/providers.tsx`) y, solo
    para llamadas a la API propia, cambia el `TypeError` del navegador por «No se pudo conectar con el servidor. Revisa
    tu internet y vuelve a intentarlo.». Sigue siendo `TypeError` y guarda el original en `cause`; `AbortError`, las
    llamadas a terceros y las respuestas del servidor pasan intactas. `formatApiError` hace lo mismo con textos que le
    lleguen ya como cadena, y traduce el «Internal server error» genérico y el «HTTP 502» pelón a «El servidor tuvo un
    problema. Vuelve a intentarlo en un momento.». Un mensaje propio del servidor se sigue mostrando tal cual.
  - **Estados que engañaban, corregidos:**
    - Costos (resumen, por proyecto y tarifas): sin respuesta del servidor decía «Esta sección es de dirección,
      contabilidad y coordinación» a quien sí tiene acceso. Sigue cerrado por defecto (no da acceso si no contestó),
      pero dice «No se pudo abrir Costos» con el motivo y «Reintentar». Un 401/403 real sigue mostrando el «no es tuya».
    - Chat: sin lista de conversaciones se veía vacío y en calma («Elige un canal…»). Ahora «No se pudo abrir el chat»
      con «Reintentar»; en teléfono, donde solo se ve la lista, el aviso sale ahí.
    - Mesa contable: «Nada urgente, puedes cobrar, pagar o cuadrar el banco» con palomita verde aunque el resumen no
      hubiera cargado. Ahora «No se pudo revisar». De paso el periodo se lee «del 1 nov 2026 al 21 nov 2026» (antes
      «2026-11-01 → 2026-11-21») en el subtítulo, el aviso de error y los vacíos.
    - Aprobaciones: tres avisos apilados más un «Failed to fetch [Reintentar]» sin estilo. Sin red se dice una sola
      vez; si falla solo un bloque, cada uno lo dice con su aviso normal (la bandeja única ya usa `InlineAlert`).
    - Diseños de cámaras, Reuniones y Mi kit de herramientas: mostraban «Todavía no hay…» o «No tienes…» debajo del
      error. Ahora dicen que no se pudo cargar. En Reuniones la tarjeta del micrófono ya no se adelanta mientras la
      página no cargó (tapaba el «Reintentar» en teléfono).
    - Desempeño del equipo: el error no traía «Reintentar». Usuarios: decía «0 resultados» y «0 cuentas» junto al error.
  - **«..» en avisos:** diez avisos pegaban «. Se muestra lo último que cargó.» a un error que ya traía su punto.
    `errorSeguidoDe(error, frase)` en `lib/erp-api.ts` los une bien (almacén, pizarra, compras, organigrama, viáticos,
    pagos a empleados, alta de vehículo, reabastecimiento).
  - **Accesibilidad:** auditoría de las 27 pantallas del menú: ningún botón sin nombre, campo sin etiqueta ni imagen
    sin descripción. No hubo que corregir nada.
  - **Paridad:** Web hecho · API no aplica (no se tocó) · Android no aplica: ya traduce el fallo de red en un solo
    lugar (`data/api/ApiErrors.kt`, «Sin conexión, revisa tu red e intenta de nuevo.») y tiene cola sin conexión ·
    iOS no aplica: igual (`NxParityComponents.swift`, «Sin conexión a internet. Revisa tus datos o Wi‑Fi.»).
  - **Verificado:** `npm run typecheck` 0; vitest web 2396/2397 (solo falla
    `ComoSeHace.spec.tsx`, que ya fallaba antes y no es de esta vuelta); la API no cambió desde la corrida en verde de
    la cuarta vuelta (jest 6580/6580) y arriba solo entraron capturas de iOS, así que no se volvió a correr.
- **21-11 ~17:15 México (claude-code, nube; Cursor/Codex no alcanzables) — Cuarta vuelta de pulido: capas a pantalla completa recortadas en teléfono, horas y fechas parejas, avisos del servidor sin «(s)» ni jerga, asistencia contra puertas en lenguaje llano. Sin migraciones. En main, NO desplegado.**
  - **Franja de 16 px en teléfono y tableta (web):** `globals.scss` limita toda ventana a `100vw - 16px` por debajo de
    900 px con `:where([role="dialog"], [class*="modal"], [class*="Modal"], [class*="drawer"]…)`. Esa red de seguridad
    también alcanzaba a las capas a pantalla completa (el fondo lleva el `role="dialog"` o su clase dice «modal»), que
    quedaban 16 px cortas: se veía una franja de la página a la derecha. Eran 17: menú del sitio público, cámara y
    «Revisa tu foto» de evidencias, ventana de checada, revisión de evidencia, vista previa de Excel, Centro operativo
    y «Mis actividades» de la pizarra, visores de comidas y de evidencias del equipo, historial de producto en almacén,
    reportes de ventas, chat y las del editor de videovigilancia. Cada una declara ahora `max-width: none`; la regla
    global quedó comentada para que las siguientes no caigan en lo mismo. Comprobado midiendo en 390, 820 y 1280 px.
  - **Candado de desplazamiento:** el menú y el buscador del sitio público y los dos portales (`components/sitio`,
    `components/portal`) ya usan `useScrollLock` (bloquea en `<html>`); era el pendiente de la vuelta de las 16:40.
  - **Horas y fechas (web):** 49 formatos de 45 archivos escribían «08:02 a.m.»; ahora «8:02 a.m.», como ya lo hacían
    `hora12Texto` y el asistente. Los de 24 h (`hour12: false`, `h23`, `en-GB`), los relojes que corren y el Excel no
    se tocaron. 11 formatos sin año escribían «21-nov» (así sale `day: "2-digit"` + `month: "short"` en es-MX); ahora
    «21 nov». Las fechas con año de contabilidad («01 sep 2026», con prueba) quedan igual.
  - **Avisos del servidor:** fuera «usuario(s)», «día(s)», «falta(s)», «factura(s)»… en cuentas y roles, RH, tickets,
    ventas, compras, avisos de cotización por vencer, correo de atraso, contrato de mantenimiento, prenómina y control
    de nómina, contabilidad (cierre, balanza, catálogo, alertas) y preparación de timbrado, con `contarEs` o la frase
    completa en singular y plural. De paso, sin jerga: «5 cuentas activas nunca han entrado» (antes «usuario(s)
    activo(s) sin primer login»), «por demasiados intentos fallidos» (antes «por force brute»), «en riesgo de irse: sin
    una venta ganada en 180 días» (antes «riesgo de churn (sin win 180d)»). Solo cambian textos; 5 pruebas que fijaban
    el texto viejo se actualizaron (`pre-nomina`, `sugerencia-nomina`, `control-nomina`, `period-close`,
    `factura-cotejo`). Hilos de nómina y contabilidad: son líneas sueltas, si traen cambios sin publicar en esos
    archivos la fusión es de texto.
  - **Asistencia contra puertas:** el panel decía «Híbrido Integra ↔ ERP», «Solo ACS», «Checador sin ACS» y explicaba
    cómo ligar con «User.employeeNumber» y «personCode». Ahora «Checador frente a puertas», «En ambos / Solo checador /
    Solo puerta», «Checada sin puerta», y la explicación (viene de `attendance-hybrid.service.ts`) en lenguaje llano.
    Título «Asistencia del equipo» (antes «Asistencia · Gestión»), «En la oficina ahora», Excel con las mismas columnas
    renombradas.
  - **RH:** la sección de multas se llama «Multas y sanciones» en el menú, la pestaña, el título y las migas (antes
    «Multas e incidencias» en el menú e «Incidencias» en la pestaña), y la bitácora «Bitácora de incidencias»; así
    «incidencias» ya no nombra dos pantallas distintas.
  - **Hallazgos sin tocar:** `useMotorGrabacion` confirma «detener sin concluir» con `window.confirm` (se deja: también
    se usa desde la ventana flotante de la grabación); en la pizarra conviven «Por empezar» y «Sin iniciar», igual en
    Android e iOS y con pruebas en las tres (es del hilo de actividades); el riel de RH no filtra pestañas por rol y
    por eso no se le sumaron Medidas ni Cargos por pérdida; con datos de demostración una salida futura suma dos veces
    las horas en la tarjeta de asistencia (no pasa con datos reales: la salida nunca es futura).
  - **Paridad:** Web hecho · API hecho (textos) · Android no aplica: las apps tienen sus propias ventanas y formatos de
    hora, y los avisos del servidor que muestran les llegan ya corregidos · iOS no aplica, por lo mismo.
  - **Verificación:** `npm run typecheck` en 0 (API y web); jest 6580/6580 con `TZ=America/Mexico_City`; vitest 2390/2391, la
    falla es `ComoSeHace.spec.tsx`, de antes y sin tocar. Después se trajo 37dc578 (solo Android e iOS de vehículos,
    sin archivos en común). `scripts/ios-static-check.py` sin problemas. En navegador: menú del sitio a 390 px
    (cubre la pantalla, la página no se mueve y se suelta al cerrar), asistencia del equipo y cuentas.

- **21-11 ~16:55 México (claude-code, nube; Cursor/Codex no alcanzables) — Tercera vuelta de pulido: pantallas de RH que eran formularios sin estilo, tabla de préstamos, ventanas propias en vez de `window.prompt` y avisos de herramienta vencida una vez al día. Sin migraciones. En main, NO desplegado.**
  - **RH (web):** Bitácora de incidencias (`hr/incidencias`), Medidas disciplinarias (`hr/medidas`) y Cargos por
    pérdida (`hr/cargos-perdida`) eran HTML sin estilo (inputs y botones del navegador). Rehechas con `PageHeader`,
    `HrModuleRail`, `Card`, `Field`, `DataTable`, `StatusBadge` y `EmptyState`; estilos en `incidencias.module.css` y
    `components/hr/rh-legal.module.css`. Misma lógica, mismas llamadas y mismos permisos. En Cargos por pérdida la
    conformidad firmada y el rechazo se piden con `PedirTexto`. Pendiente de fondo ahí: sigue pidiendo el número de la
    actividad y enlaces a evidencia/PDF en vez de un selector y un cargador de archivos (pide soporte de subida en la API).
  - **Sin `window.prompt`:** rechazar una baja en Aprobaciones (`BandejaUnica`) y devolver el plan en Supervisión ya usan
    `PedirTexto` (ventana de la plataforma, con motivo mínimo en el rechazo).
  - **Préstamos de herramienta (web):** en la tabla de solicitudes el nombre ya no se parte letra por letra (ancho
    mínimo en la celda; `width` de `DataTable` es solo una pista), el avance va compacto con «Aprobó X» debajo, «Pedida
    el…» pasó bajo la devolución (el Excel conserva todas las columnas) y aprobar, entregar y recibir quedan siempre a
    la vista (`rowActionsAlwaysVisible`, también en prórrogas y en recolección de almacén). La línea de tiempo escribe
    «21 nov, 4:34 p.m.».
  - **Avisos de vencido (API):** `checkOverdueTools` corría cada hora y creaba un aviso «URGENTE» por préstamo vencido
    cada vez. Ahora corre a las 9:00 de México y `avisarPrestamosVencidos()` avisa una sola vez al día por préstamo,
    con el día pactado bien leído (`prestamoVencido`, `textoDiaDePrestamo`, `inicioDeHoyEnMexico` en
    `plazo-prestamo.ts`): «La herramienta «X» debía regresar el 24 nov. Devuélvela o pide más plazo.» Prueba:
    `avisos-vencidos.spec.ts`. Ojo: esa tabla (`toolRequestNotification`) todavía no la lee ningún cliente; mostrarla y
    mandarla por push va con la ola de avisos.
  - **Navegación:** RH ya no repite «Plantilla» en dos filas (la de adentro dice «Personas»); las migas no repiten el
    grupo cuando se llama igual que la página («Hoy > Hoy»); rótulos de «Cargos por pérdida» y «Medidas disciplinarias».
  - **Corrección a la sección de 16:40:** el aviso del candado de jornada no llegó directo al hilo de Core (no recibe
    mensajes de otros hilos); se le pasó al coordinador.
  - **Hallazgos sin tocar:** sitio público y portales bloquean el desplazamiento en `body`; en la pizarra conviven «Por
    empezar» y «Sin iniciar»; «actualizado a las 04:42 p.m.» en Dirección; en el riel de RH «Incidencias» lleva a multas
    y «Bitácora» a incidencias; aviso en almacén cuando una serie ya salió (ola de ciclo de vida por serie).
  - **Paridad:** Web hecho · API hecho (avisos de vencido) · Android no aplica: estas pantallas de RH y la tabla de
    préstamos de escritorio no existen en la app, y los avisos los arma el servidor · iOS no aplica, por lo mismo.
  - **Verificación:** `npm run typecheck` en 0 (API y web); jest 6580/6580 con `TZ=America/Mexico_City`; vitest 2380/2381, la
    falla es `ComoSeHace.spec.tsx`, de antes y sin tocar. Después se trajo 457b41a (capa de datos de vehículos, solo
    archivos nuevos): tipos de web en 0 y su prueba nueva 10/10. `scripts/ios-static-check.py` sin problemas.

- **21-11 ~16:40 México (claude-code, nube; Cursor/Codex no alcanzables) — Repaso de procesos con la plataforma montada en local (Postgres + Redis + API + web, datos de demostración): errores reales corregidos y pantallas alineadas. Sin migraciones. En main, NO desplegado (se va con el siguiente despliegue de cualquier hilo).**
  - **Candado de jornada (hilo «mejoras de código de NEXARA Core», avisado por medio del coordinador):** el 409 `JORNADA_NO_ABIERTA` salía del
    servidor SIN su código: `AllExceptionsFilter` solo copiaba `error`, y el candado manda `code`. Ningún cliente abría
    «Registra tu entrada»; la persona veía el texto suelto dentro del formulario. Ahora el filtro pasa el código propio
    (`codigoPropio`, solo `MAYUSCULAS_CON_GUION`) en `code` y `errorCode`, sin sugerencias genéricas. En la web la barrera
    solo se abría si la llamada pasaba por `erpFetch` y ~140 archivos usan `fetch` directo: `vigilarRespuestasDeJornada()`
    (`lib/jornada-candado.ts`, montado en `BarreraJornada`) vigila todos los 409. Android e iOS buscan el código en el
    cuerpo (ese código de las apps llega con la próxima versión publicada): con esto sí lo van a encontrar, sin más
    cambio. Comprobado en navegador con un técnico sin entrada.
  - **Préstamos de herramienta, fechas:** lo que se pacta es un día y cada cliente lo mandaba distinto (web: medianoche
    UTC, que en México es la tarde anterior; prórroga web: 23:59 local; apps: mediodía UTC). La web mostraba la devolución
    un día antes y la daba por vencida desde las 18:00 del día anterior. Servidor: `tool-requests/plazo-prestamo.ts`
    (`diaDePrestamo`, `plazoDePrestamo`, `nuevaDevolucion`) lee el día que la persona quiso decir y guarda siempre el
    mediodía de México, en alta y en prórroga; mensajes claros en vez de «Parámetros de la petición inválidos». Web:
    `lib/dia-pactado.ts` (misma regla) en `ToolRequestsTable`, `MisPrestamos`, `ToolRenewalsTable`; vencido = el día
    pactado ya pasó (como Android/iOS). Se puede pedir y regresar el mismo día en la web, igual que en las apps (el
    selector ya lo dejaba elegir y la validación lo rechazaba). Las filas viejas se leen bien en la web sin tocar la
    base; las apps leen los 10 primeros caracteres de la fecha, así que una prórroga vieja pedida en la web (23:59
    local) les sale un día después: solo las ya guardadas, las nuevas quedan parejas.
  - **Chat:** `url-matrix` daba a CEO y DIR_ADMIN la pantalla del chat pero no escribir (403 al mandar mensaje o marcar
    leído; los `ceo` reales no lo notaban por ser superadmin por correo). Regla nueva con prueba: quien ve `/erp/chat`
    puede escribir (`chat-escribe-quien-lo-ve.spec.ts`). Ojo, hilo de roles: `url-matrix.ts` tiene además cambios sin
    publicar en el checkout de la laptop (ver la sección de 15:45 de más abajo); al traer main puede pedir fusión a mano.
  - **Ventanas (web):** `useScrollLock` bloqueaba en `<body>`, pero quien desplaza es `<html>`: la página de atrás seguía
    moviéndose y, peor, `body` pasaba a ser el contenedor de lo `sticky`, así que el menú lateral y la barra de arriba
    se iban de su lugar al abrir cualquier ventana con la página desplazada. Ahora bloquea en `<html>` (`lockScroll`),
    y la paleta Ctrl+K, el cajón móvil del menú y la memoria técnica usan la misma pieza. Sitio público y portales
    (`components/sitio`, `components/portal`) siguen con su bloqueo propio en `body`: no se tocaron.
  - **Piezas compartidas:** Mesa de viáticos y Supervisión ya usan `PageChrome` + `PanelTabs` + `EmptyState` y tokens
    `--ui-*` (eran las dos pantallas con encabezado, pestañas y botones propios); sin cambio de lógica ni de permisos.
    Avisos de tope de la mesa solo cuando de verdad se llegó al tope. Almacén sin la segunda fila de filtros en vacío.
    Desempeño: la columna Persona ya no corta los nombres. Títulos sin «· Gestión» / «· Aprobación» (`section-views.ts`).
  - **Textos:** fuera los «día(s)», «producto(s)», «persona(s)» en web (`lib/plural.ts`), API (`common/contar-es.ts`),
    Android e iOS; «Tu desempeño» habla de tú; resumen de dirección «1 evidencia sin revisar: es tuya» (antes «1 tuyas»);
    vacío de Cotizaciones sin jerga («el servidor emite el folio con tu nomenclatura»).
  - **Hallazgos sin tocar (siguientes vueltas):** el cron `checkOverdueTools` crea cada hora un aviso «URGENTE» por
    préstamo vencido en `toolRequestNotification`, tabla que ni la web ni las apps leen (va con la ola de avisos push);
    una serie ya despachada en almacén se puede volver a despachar (ola de ciclo de vida por serie); la tabla de
    préstamos queda apretada a 1440 px; RH muestra dos filas de pestañas que empiezan con «Plantilla»; migas «Hoy > Hoy».
  - **Paridad:** Web hecho · API hecho · Android: textos hechos; candado y fechas no piden cambio (ya leen el código y el
    día igual) · iOS: igual que Android. Pantallas alineadas (viáticos, supervisión, ventanas): solo web, las apps
    tienen su propio sistema de diseño. Publicar las apps sigue pidiendo el OK de Adam.
  - **Verificación:** sobre lo último de main (c72b099): `npm run typecheck` en 0 (API y web); jest 6576/6576 con
    `TZ=America/Mexico_City` (sin ella fallan las 4 de `accounting/qa-adversarial.spec.ts`, de antes y sin tocar);
    vitest 2380/2381, la falla es `ComoSeHace.spec.tsx` («Durante»), del hilo de actividades y sin tocar.
    `scripts/ios-static-check.py` sin problemas. Android e iOS no se compilan en la nube: los compila el CI al subir.
  - Para repetir la plataforma en local (nube, sin Docker): `service postgresql start`, base vacía + `prisma migrate
    deploy` + semillas de demostración, `redis-server`, API con `nest start` (`DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`,
    `TZ=America/Mexico_City`) y `next dev --turbopack`. Para escribir como un usuario hace falta su `AttendanceDay`
    abierto (candado) y su fila en `user_companies`.

- **21-11 ~15:45 México (claude-code, nube; Cursor/Codex no alcanzables) — Evidencia en cada entrega: herramientas y almacén (API, web, Android, iOS). En main 3a83af3; API y web llegaron a producción con el despliegue de otro hilo (21-11 21:31 UTC, `ac75ed7`), migración aplicada; las apps siguen sin publicarse. En ese mismo despliegue entraron 295c1a8 (capa visual «Firma NEXARA v3») y d17bf58 (fuentes con `next/font/local`).**
  - Ola 1 del plan https://claude.ai/artifact/8mmmcCKxyzWUbQ7xv2VcDn (NEXARA contra los líderes de flotilla, herramienta,
    almacén e ingeniería). Vehículos lo lleva el hilo de perfiles; el acceso con rostro al área restringida, el de la VPN.
  - Migración `20261121204500_evidencia_prestamos_y_salidas` (aditiva, columnas anulables): `tool_requests`
    (deliveryPhotos, deliveredById, returnCondition, returnPhotos, returnNotes, receivedById) y `stock_movements`
    (fotos, series, recibidoPorId). Fotos en `uploads/tools` y `uploads/almacen`, servidas tras sesión.
  - Herramientas: `POST tool-requests/:id/deliver` y `/return` aceptan JSON (como antes) o multipart con `fotos`.
    `return` con `condicion` (BIEN | DESGASTE | DANADA | INCOMPLETA | EXTRAVIADA) exige foto (salvo extraviada) y
    explicación (salvo bien o desgaste); dañada o incompleta → pieza IN_REPAIR, extraviada → RETIRED. Sin `condicion`
    vale la regla vieja (con `damageDescription` = dañada), para las apps publicadas. Reglas puras en
    `tool-requests/evidencia-prestamo.ts`. La entrega sin foto NO se rechaza en el servidor todavía: las apps
    publicadas no mandan fotos; la web y las apps nuevas la exigen y las listas marcan «Salió sin foto».
    Cuando las tiendas tengan la versión nueva se puede volver obligatoria en la API.
  - Almacén: `POST stock/movements` y `/por-codigo` aceptan `series`, `recibidoPorId`, `activityId`;
    `GET stock/receptores`, `GET stock/receptores/:id/actividades`, `POST stock/movements/:id/evidencia`
    (8 fotos por subida, 12 por movimiento). Reglas en `warehouse/evidencia-salida.ts`. Igual: el servidor acepta la
    salida sin evidencia (apps viejas) y Movimientos la marca «Sin foto», «Sin responsable», «Sin actividad».
  - Web: `components/herramientas/EvidenciaPrestamo.tsx` (hojas de entregar y recibir, antes y después) y
    `MisPrestamos.tsx`; `ToolRequestsTable` leía mal a quien pidió y quien aprobó (salía «N/A»), corregido en
    `lib/tool-requests-api.ts`. Almacén: `VistaAlmacen.tsx` (diálogo de movimiento y visor de evidencia) y
    `ScannerAlmacenPanel.tsx`; las series entran con el lector USB, una por renglón.
  - Android: `ui/console/herramientas/HerramientasEvidencia.kt` + `EvidenciaPrestamoRules.kt`,
    `ui/console/more/EvidenciaSalidaRules.kt` y `AlmacenEscaneo.kt`. iOS: `UI/Core/Extras/HerramientasEvidencia.swift`,
    `EvidenciaReglas.swift`, `AlmacenEscaneo.swift`; el modo demostración lee los campos del multipart en
    `tool-requests` y tiene `stock/receptores`. Las fotos se toman con la cámara en vivo, no de la galería.
  - Pendiente (olas siguientes, ver el plan): tablero y suplente de Iván, carrito de varias herramientas, devolución
    de kit con faltantes, avisos push, bloque de vehículo/herramienta/material en la actividad, IA que lea series y
    compare antes/después, ciclo de vida por número de serie, devolución contra salida. Publicar las apps pide el
    OK de Adam.
  - Verificación: sobre lo último de main (con 8c207c1): prisma generate y tsc de API y web en 0; jest 6535/6539, las 4 fallas
    son `accounting/qa-adversarial.spec.ts` por la zona horaria del contenedor (UTC; con `TZ=America/Mexico_City`
    pasan 23/23, archivo sin tocar); vitest 2364/2365, la falla es `ComoSeHace.spec.tsx` («Durante»), del hilo de
    actividades y sin tocar. Android e iOS no se pueden compilar en la nube: los compila el CI al subir. iOS no
    tiene objetivo de pruebas unitarias; `scripts/ios-static-check.py` sin problemas.

- **21-11 ~16:55 México (claude-code, nube) — Vehículos: capa de datos de web, Android e iOS para la captura guiada. Sin pantallas, sin migraciones.**
  - Las pantallas esperan el visto bueno de Adam a la maqueta https://claude.ai/artifact/7qbmJfGA3WopSJPr86bAjS. Esto deja
    lista la conexión con las rutas de 8c207c1 para que las pantallas solo consuman.
  - Web: `lib/vehiculos-captura.ts` (pasos, tiempos de los 8 cuadros, multipart con `capturaVersion=2`, firmas, bloque de
    la actividad, daños, incidencias, cuadros del video en el navegador) + spec 10/10.
  - Android: `ui/console/vehiculos/CapturaGuiadaRules.kt` (puro, mismos textos que la web) + `CapturaGuiadaRulesTest.kt`
    (11 pruebas; corridas en un proyecto Gradle aparte junto con `ChecklistVehiculoRulesTest`, 24/24),
    `data/api/VehiculosCapturaApi.kt`, `data/vehicles/CapturaGuiadaRepository.kt` (la salida/devolución viaja con la cola
    sin señal, igual que el checklist; tope de video 60 MB) y `data/vehicles/CuadrosVuelta.kt` (MediaMetadataRetriever,
    endereza cuadros sin rotar).
  - iOS: `UI/Core/CapturaGuiadaRules.swift`, `Data/CapturaGuiadaRepository.swift` (sin cola, como el checklist; usa
    `ChecklistVehiculoAccion.path`), `Util/CuadrosVuelta.swift` (AVAssetImageGenerator, `.mov` → `.mp4` sin recomprimir).
  - Verificación: vitest del archivo 10/10, tsc web 0, `ios-static-check` sin problemas. El código Android de datos y todo
    iOS los compila el CI (no hay SDK de Android ni Swift en la nube).

- **21-11 ~15:40 México (claude-code, nube; Cursor/Codex no alcanzables) — Vehículos: captura guiada de 5 pasos, daños con IA, incidencias y avisos de retraso. Solo API. En main 8c207c1; llegó a producción con el despliegue de otro hilo (21-11 21:31 UTC), migración aplicada, interruptor apagado.**
  - Todo detrás de `vehiculos.captura_guiada` (system_settings, apagado por omisión; en prod NO existe la fila). Apagado:
    se acepta el checklist de 7 fotos, el km menor al último registro entra con alerta `KM_MENOR` (no bloquea), no se
    avisa a Liz de alertas de km, no corre la comparación con IA ni los avisos de retraso. Prendido: salida solo con la
    captura guiada (la devolución acepta las dos), salida de inventario pide actividad, no se pide unidad para actividad
    cerrada, km menor = 400 salvo `forzarKm` de quien tiene `vehicles.review`, avisos cada 10 min (8–20 h).
  - Migración `20261121205244_vehiculos_captura_guiada` (aditiva): columnas en VehicleControl (encargadoId,
    capturaVersion, video*, firmas, lecturasKm, kmEsperados, alertasKm, avisosRetraso, analisisDanos*), tablas
    `vehicle_damage_findings` y `vehicle_incidents`, 3 valores nuevos de NotificationType.
  - Reglas puras: `vehicles/captura-guiada.ts`, `kilometraje.ts`, `avisos-retraso.ts`, `danos-ia.ts`; servicio
    `danos-vehiculo.service.ts` (Sonnet 5.5, 6 pares por llamada a 768 px), cron `avisos-retraso.service.ts`,
    interruptor `interruptor-vehiculos.ts`. Rutas nuevas: GET `vehicles/captura-guiada`, GET
    `vehicles/por-actividad/:id`, POST `vehicles/:id/firmas`, GET/PATCH `vehicles/danos`, POST
    `vehicles/:id/analizar-danos`, GET/POST/PATCH `vehicles/incidencias` y PATCH `incidencias/:id/cobro` (solo superadmin).
    `checkout` de inventario con `actividadId` crea un uso ligado a la actividad; `end-use` libera la unidad del inventario.
  - url-matrix: COORD_ADMIN con `/api/vehicles/**` approve (Liz no podía ni aprobar aunque tiene `vehicles.review`) y
    3 rutas nuevas en CORE_RECURSOS. Avisado al hilo de roles.
  - Pendiente: web (captura, bandeja de daños de Liz, bloque en la actividad), Android/iOS (video de la vuelta con
    extracción de 8 cuadros, firma), tras el visto bueno de Adam a la maqueta https://claude.ai/artifact/7qbmJfGA3WopSJPr86bAjS.
    Revisar `client_max_body_size` de nginx/Traefik para el video (tope en la API: 80 MB por archivo).
  - Verificación: tsc API 0; jest 6500/6504, las 4 fallas son `accounting/qa-adversarial.spec.ts` por zona horaria del
    contenedor (UTC); con `TZ=America/Mexico_City` pasan 23/23, archivo sin tocar.

- **20-11 ~14:20 México (claude-code) — NAS_EXPORT_TOKEN.** El compose ya pasa `NAS_EXPORT_TOKEN` a nexara-api (desde `deploy/.env.nexara`, donde quedó un valor aleatorio de 64 hex con respaldo `.env.nexara.bak-20261120-nasexport`). Toma efecto en el próximo deploy autorizado. Antes, en esta sesión: puerta `nas-portal` (acacfd9) y `nas.nexara.com.mx` activo en Traefik (`/opt/traefik/config/nas.yml`); prod sigue en da83c772.
- **20-11 ~14:15 México (claude-code) — Quién ve qué, Entrega 2 (montos, contratos, archivos). En main (b68c91dc5 API, bf57ef14e web), NO desplegado.** Todo va detrás de `visibilidad.compartimentada` (system_settings; apagado = como antes; en prod NO existe la fila). `common/visibilidad/montos.ts` tiene `ocultarMontos` (montos en null con `montosOcultos: true`), `limpiarEntradaSinPrecios` (un PATCH con el monto vacío no borra el guardado) y `ocultarContratos`. `OcultarMontosInterceptor` va en proyectos, projects, operational, work-projects, cotización ganada, costos, ficha de vehículos, ventas/* y accounting/workspace; en este último, `@MontosParaContadora` deja ver a la contadora por su puesto. `veTodoCostos` es solo superadmin con el interruptor prendido. `SoloConPreciosGuard` protege los PDF de ventas/reportes. En el chat, la tarjeta de proyecto trae `montoOculto`. En main.ts, /uploads usa `VisibilidadService.puedeAbrirArchivo`: fotos de evidencia para autor, jefes y superadmin; project-docs CONTRATO solo con Ver precios; un archivo sin registro sigue como antes. La web dice «Confidencial»; las apps no muestran presupuestos. Verificación en e518a7504: gen/tsc 0, jest 6375/6375, vitest 2328/2329; la única falla, OpsProjectDetailShell, es inestable bajo carga (sola pasa 4/4, archivo sin cambios). Despliegue a prod pedido vía coordinador: respaldo hecho (`/root/respaldos-predeploy/nexara-20261120-antes-visibilidad.dump`), pero el lanzamiento quedó bloqueado por permisos en espera del OK directo de Adam. El compose no pasa NAS_EXPORT_TOKEN. El botón «Pedir revisión» (Seguimiento.tsx) sigue fuera de main; el parche está en el scratchpad de la sesión.
- **20-11 ~15:30 México (claude-code; Cursor/Codex no usados) — Quién ve qué, Entrega 1 (registros). NO desplegado.**
  - Política central `apps/api/src/common/visibilidad/` (pura + servicio + interceptor + guard + `PATCH users/:id/accesos`).
    `User.accesos` (migración `20261120180734_accesos_persona`): `precios.ver`, `cotizaciones.ver_todas`; sale en
    `auth/profile` (`accesos`, `capacidades`) y en `req.user`. Casillas en la ficha de Usuarios (solo superadmin).
  - Cotizaciones: ve quien la creó, `asignadoA`, participantes, superadmin o `cotizaciones.ver_todas`. Interceptor
    `CotizacionVisibleInterceptor` en todo `/cotizaciones/:id` y en smart-quote (versiones, pedidos CT) → 404.
    Filtro en consulta en lista, core, partidas frecuentes, cotizar con IA, chat/ligas, exportes, actividad reciente,
    «Dirección» y cotización abierta. BI agregado y ejecutivo: solo superadmin (`SoloSuperAdminGuard`).
  - «Pedir revisión»: `POST cotizaciones/:id/pedir-revision` + `GET cotizaciones/revisores`, rol `REVISION_PEDIDA`
    (migración `20261120180800_revision_pedida`). Botón web hecho en el clon, SIN subir (espera captura/OK).
  - Evidencias: quien la subió + su cadena de jefes (`managerId`, sin jefe → cuelga de dir_operaciones) + superadmin,
    en `/evidences`, review-history, ZIP, campos, detalle/listas de actividades, chat (búsqueda) y hojas de servicio.
  - Pendiente / no tocado: kpis-equipo (usa el alcance de team-board, congelado), timeline de actividad (solo fechas),
    evidencias-escaladas (cron), workflow; montos y archivos van en la Entrega 2.

- **18-11 ~19:30 México (claude-code; Cursor cayó por conexión, Codex no usado) — Olas 0 y 1: resumen y pendientes.**
  - Producción: 922db7b8 (Tere/rh, castigo por IP con `IP_BAN_EXEMPT=187.191.42.145` en `deploy/.env.nexara` del
    servidor, Luis/Liz/dirección con `ACTIVIDADES_GESTION_URL_RULES`) y luego 2d1c0a6c (semáforo web = API,
    hora en 24 h con «¿Quisiste decir p. m.?»). Datos: 14 actividades autoasignadas a. m.→p. m. corregidas con el OK
    escrito de Adam; respaldo en la tabla `respaldo_ampm_20261118`. Quedan AN-0410/0411/0412 (4-11) sin corregir.
  - En main SIN desplegar: bae7fbc1b Android (TimeInput + pregunta p. m., sin publicar), 8d6b2a69d lote A (20 tipos
    nuevos en NotificationType + migración `20261118132000_avisos_rh_bajas_viaticos`; aviso al CEO en autos),
    984c62c93 lote B (Editar por permiso, Entregar con código, Ctrl+V por puntos), y el lote C (C1 chat sin
    escritura por lectura + no leídos en un GROUP BY + `GET chat/unread-count`; C2 lastSeenAt cada 5 min; C3 bajas
    solo a quien puede y sin recontar por menú, usuarios por empresa en revisiones; C4 una renovación en vuelo y
    solo si faltan < 2 h; C5 índices `20261118190000_indices_velocidad`; C6 `runScheduledJob` salta la vuelta si la anterior sigue corriendo; `waitForCompletion` no existe en
    @nestjs/schedule 4.1.2 de la API).
  - Pendiente: chat «Supervisión» hecho en el clon y SIN subir (espera visto bueno de Adam, capturas en un artifact
    privado). C6 sin `pg_try_advisory_lock`: con el pool de Prisma el candado de sesión se toma y suelta en
    conexiones distintas; hace falta un candado por tabla con vencimiento o `xact_lock` dentro de una transacción.
    C3 sin endpoint de conteo en servidor (habría que replicar `armarBandeja`). C7 Android ciclo de vida: no hecho.
    `CoreActivityKindsTest.unknownPeopleOnlyGetTarea` falla desde a671f6754 (tipo Administrativa), ajeno.
  - Método: el checkout compartido tiene sucios ajenos (schema, url-matrix, me.service…); trabajé en un clon fuera del
    repo (`%TEMP%
x-verif`, node_modules por junction y su propio `prisma generate`) y subí desde ahí.

- **18-11 ~13:10 México (claude-code) — Lote T2: «IP temporarily blocked» del 17-11. NO desplegado (espera OK).**
  - Causa (access log de Traefik): 17-11 13:49–14:49 MX la IP 187.191.42.145 (oficina) quedó bloqueada; la
    disparó PUT/POST de la cotización 83 con «..» → 400 «Suspicious input detected» 3+3 puntos; 607 rechazos.
  - `security.utils`: sin `..`/`%2e%2e` en el patrón del CUERPO (siguen en la URL); puntos con caducidad
    (`IP_BAN_STRIKE_WINDOW_MS`, 10 min); bloqueo 15 min (`IP_BAN_WINDOW_MS`); `IP_BAN_EXEMPT` (coma separada);
    `onEvent` → `[ip-ban] punto|bloqueo ip motivo ruta` en el log de la API (ruta sin querystring).
  - `main.ts`: solo suman puntos honeypot, método no permitido, host inválido y ruta sospechosa; content-type,
    origen, prototype pollution e input sospechoso se rechazan sin puntos. Prueba `common/security/ip-ban.spec.ts`.
  - Pendiente: poner `IP_BAN_EXEMPT=187.191.42.145` en el servidor cuando Adam confirme que es la oficina.

- **18-11 ~12:45 México (claude-code; Cursor/Codex no usados por urgencia) — Lote T: Tere (rol rh) no veía nada.**
  - Causa: la matriz y los @RBAC le cerraban `GET /api/users/hr-staff|roles|departments|:id`, `PATCH /api/users/:id/hr`,
    `GET /api/attendance/hierarchy/range` y `GET /api/analytics/bi/engineers`; la Plantilla hace Promise.all y
    caía entera en «No se pudo actualizar», igual que Asistencias («No tienes permisos para esta acción»).
  - Arreglo: reglas nuevas solo en el bloque `ROLES.RH` de `url-matrix.ts`; HR_VIEW en GET (hr-staff, :id,
    hierarchy/range, bi/engineers), HR_MANAGE en PATCH :id/hr; `getAccessibleUsers` acepta HR_VIEW y
    `isCompanyWideAttendanceViewer` cuenta `rh`. PATCH/DELETE /api/users/:id, sesiones, jefe y roles siguen cerrados.
  - Prueba: `common/rbac/rh-plantilla-tere.spec.ts` (9). Rojo ajeno sin commitear al cerrar: `tsc` en
    `costos/libro-costos.service.ts` (VehicleControl.actividadId opcional) y 8 casos rh de `actividad-propia-rbac`/
    `festivos-rbac` (la otra sesión quitó ACTIVIDAD_PROPIA a rh en url-matrix).

- **17-11 ~09:00 México (claude-code; código de Cursor, sin pasada de Codex aún) — Encargo 06: Supervisión por renglones, medidas disciplinarias y cargo por pérdida, Excel por rangos, scroll del menú, mockup corporativo.**
  - Sube las migraciones `20261117194500_plan_renglones_medidas` y `20261117203000_cargos_por_perdida` cuyos modelos ya
    estaban en `schema.prisma` desde ac5afdbf4 (los arrastró el commit de contabilidad).
  - `src/supervision/plan-renglones.ts` (renglones con cliente/proyecto, pegar texto, programar uno/todo); `src/hr/
    medidas-disciplinarias` (sin multas, art. 107/423 LFT) y `src/hr/cargos-perdida` (art. 110 fr. I, cuotas a
    prenómina); web `/erp/hr/medidas`, `/erp/hr/cargos-perdida`, `components/excel/ExcelExportadorDinamico`,
    `lib/excel-rangos.ts`; `AppShell` con scroll propio del menú; `public/mockups/corporativo-2026-11/` (solo mockup).
  - Fallos ajenos al cerrar: `role-modules.spec` (vendedor, contabilidad, `/erp/almacen`) y `tsc` api en `warehouse`
    (StockMovementType readonly) vienen de cambios sin commitear de otra sesión (almacén/proyectos).

- **17-11 ~22:00 México (cursor) — Contadora ampliación E2–E4. NO desplegar: espera OK de Adam.**
  - E2: tabla `SatCfdi` (+ migración `20261117210000_contadora_e2_e4`); ingest escribe SatCfdi además de Invoice;
    job diario vía BullMQ (`buzon-sat.diario`) + `runScheduledJob`; UI Buzón en `/erp/contabilidad/cfdi`;
    cruces SAT (`GET …/buzon-sat/cruces`: sin póliza / póliza sin UUID / cancelado contabilizado / 69-B).
  - E3: plantillas I/E/P/N + endpoints; tablero PPD; export PLZ XML; `FiscalPeriod.bloqueoModo` + módulo
    suave/duro; bug IVA complemento de pago (`pago-impuestos-dr` + `cfdi-xml.builder`, tasas 16/8/0/exento).
  - E4: parsers CSV/OFX BBVA·Banorte·Santander; import-file + match-proposals (top 3); tablero Mi cierre
    (`/erp/contabilidad/mi-cierre`).
  - Pruebas unitarias propias 23 ok (pago-impuestos, parsers, reglas, cruces, mi-cierre, bloqueo).
  - Pendiente fino: aplicar `bloqueoModo` en todas las escrituras de periodo; historial de cuenta = última
    póliza del RFC (hoy sigue la regla aprendida); Excel binario → pedir CSV/filas.
  - No tocado: projects/supervision/hr/cctv ni otros sucios ajenos (salvo schema/tenant compartidos).
- **17-11 ~21:00 México (cursor) — Estándar de proyecto (ficha/plan/listo). SIN commit ni deploy (pedido de Adam).**
  - `proyecto-completitud.ts` (+spec): niveles FICHA/PLAN/LISTO; `proyecto-salud` con INCOMPLETO, tope 99 %, ponderación por hitos.
  - Schema: solo `createdById` (+rel) en OperationalProject; migración `20261117080000_proyecto_creado_por`.
  - Alta manual exige FICHA (400 ES); altas auto/quickCreate con `permitirIncompleto`; status ACTIVE exige PLAN, COMPLETED exige LISTO.
  - Cron `proyectos-incompletos` L–S 09:00; listado KPI/chip Incompletos; ficha banner + bloqueo terminar/arrancar.
  - Pruebas: `src/projects` 102 ok; vitest `proyectos` 25 ok. typecheck limpio en rutas de projects/proyectos.
  - Falta: selector «¿De qué proyecto es?» al crear actividad, bloque «Actividades del cliente sin proyecto»+Ligar,
    Asignar con IA (responsable/fechas/nombre), medidor FICHA→PLAN→LISTO editable campo a campo, sugerencia en vivo en /nuevo,
    cablear `avisarAlNacer` en todas las altas auto.
  - No tocado: cambios ajenos (contabilidad/buzón, RH, supervision, integra-shared, client-sectors dirty).
- **17-11 ~20:45 México (cursor) — Contadora ola 1 (puntos 1–5). NO desplegar: espera OK de Adam.**
  - Buzón SAT (src/accounting/buzon-sat/): cron 06:00 MX (BUZON_SAT_AUTO), ingest idempotente por UUID, 69-B, UI /erp/contabilidad/buzon-sat.
  - Pólizas IA + bandeja /erp/contabilidad/por-contabilizar (aceptar/corregir/aprender por RFC); nada a JournalEntry sin clic.
  - «Armar con IA» en Facturas y Por facturar (POST …/armar-factura); tickets viáticos con más campos + portal gasolinera + liga CFDI.
  - Presets de fecha + Excel (contabilidad-fechas, contabilidad-excel, RangoFechasContabilidad).
  - Migración 20261117060000_contadora_ola1. Pruebas unitarias buzón/cfdi/póliza/fechas en verde.
  - Nota: schema.prisma dirty compartía modelos de otro hilo (medidas/cargos); van en este commit porque Prisma es un solo archivo.
  - No tocado: projects/supervision/hr medidas ni otros sucios ajenos.
- **17-11 ~20:20 México (claude-code, código de Cursor) — Clientes sin relleno ni «A quien corresponda». Sin desplegar.**
  - `esNombreDeRelleno` rechaza AQC/variantes en altas nuevas; mensaje pide «Administración de <empresa>».
    Reutilizar el cliente histórico A QUIEN CORRESPONDA sigue si ya existe.
  - Cotizar con IA: sin cliente → `seguridad: 'falta'`, nombre vacío, aviso; ya no elige el genérico.
  - Web: `lib/cliente-relleno.ts`; alerta danger + botón deshabilitado en ClienteRapido, CotizarConIA y AsistenteIA.
  - CotizarConIA: Atención por omisión «Administración de <cliente>» viaja en `DatosDePropuesta.atencion`.
  - Pruebas: API ventas+cotizaciones 731 ok; web cliente-relleno/cotizar-ia/ClienteRapido/CotizarConIA/AsistenteIA(relleno) ok;
    `tsc` web limpio. API `tsc` sigue rojo por trabajo ajeno (buzón SAT / supervisión / medidas).
  - No tocado: contabilidad, schema, integra-shared ni otros sucios ajenos.

- **17-11 ~19:50 México (claude-code; Cursor codifica, Codex pule) — Reglas del grupo de WhatsApp: autos, reembolso, aviso a Luis, nómina por perfil.**
  - `approval-policy`: vehículos = solo coord_admin (Lizeth). Entrega/devolución de auto exige fotos panorámicas +
    tablero; ficha muestra antes/después lado a lado; aviso si km de regreso < salida.
  - Reembolso: desde 17-11 solo tickets aprobados con foto y razón entran a la nómina.
  - `activities/aviso-luis.ts`: actividad autoasignada o del mismo día → push + chat al Supervisor General
    (dir_operaciones; si no hay, al jefe). Evidencia enviada → chat al revisor.
  - `employee-payments/nomina-alcance.ts`: rh ve toda la nómina; administrativo solo si es `finanzas@` (modo totales:
    neto, descuentos y reembolso); Mónica/Daniela sin nómina. administrativo solo tiene el control semanal en
    url-matrix (no `/api/employee-pagos`). Pendiente: UI para configurar el alcance de la contadora.
  - No es mío: `apps/web/lib/contabilidad-fechas.ts` (hilo de contabilidad, hoy rompe el typecheck web).

- **16-11 ~18:45 México (claude-code; Cursor codifica, Codex pule) — Mesa de Lizeth y RH completo de Tere. Pendiente de desplegar.**
  - `src/gestion-viaticos/` + `/erp/gestion-viaticos` (tabla `viatico_tickets`, migración `20261116195000_viatico_tickets`):
    bandeja de la gestora (coord_admin), ticket con foto ligado a viático/actividad, aprobación de Lizeth, lista «Por
    facturar» de la contadora con fecha límite (gasolina = mismo día), recordatorio 15:00, costo por actividad.
  - RH (`src/hr/expediente`, `personal-import`, `alertas`, `rh-solicitudes.*`, `src/common/aprobaciones/`; migración
    `20261116234500_rh_expediente_aprobaciones`): expediente con datos sensibles solo rh/dirección, importar
    Base_Personal con vista previa, solicitudes de cambio de puesto/jefe/sueldo (dirección) y permisos (jefe; a las 24 h
    sube a Luis y luego a dirección) en la bandeja de Aprobaciones. Bajas siguen en su tabla propia.
  - Prod 16-11 (fuera de git): revisiones de evidencia de los 10 técnicos → Luis (`revisores_evidencia`); Lizeth
    renombrada (`lizeth.antonio@`); cuenta CEO de Getzemani Del Valle (id 70); bandeja de Christian limpiada (129
    evidencias aprobadas cal. 5, faltas sem. 9-15 justificadas, viático 1 borrado lógico, 40 horas extra rechazadas).
  - Siguiente en cola: `.ai/encargos/2026-11-16-cola-04-*` (autos solo Lizeth con fotos, reembolso, aviso a Luis,
    menú de rh/técnicos, nómina: rh ve todo, contadora por alcance).

- **16-11 ~18:30 México (claude-code, código de Cursor) — Asignar con IA: evidencia hiper profesional y reglas del grupo
  de WhatsApp (rigen 17-11). NO desplegado: espera OK de Adam.**
  - `ai/asistente/elementos.ts`: cada campo trae la foto pedida por momento (`notas`, por equipo; mantenimiento con su
    texto); instalación agrega «Grabador (NVR)» si no se nombró y «Pruebas y entrega»; plural sin número →
    «Cámaras (cantidad por confirmar)» + aviso; singular sin número es uno. Ningún tipo queda sin secuencia:
    administrativas y comerciales → «Capturas de pantalla» (no fotos del monitor) + «Archivo entregable»; junta →
    «Junta»; campo sin equipos → «Trabajo realizado» con texto por subtipo. Línea «Alcance: …» al final de indicaciones.
  - Tarjeta (`AsistenteIA.tsx`): la nota de cada campo se edita y viaja en `definirCamposEvidencia`.
  - Encargos en `.ai/encargos/2026-11-16-asignar-ia-*.md` (sin versionar). Las revisiones con Luis las llevó el hilo de personal.

- **16-11 ~13:50 México (claude-code; Cursor codifica, Codex pule) — Supervisor General: plan de mañana y cierre diario. NO desplegado.**
  - `src/supervision/` (tablas `planes_diarios`, `cierres_diarios`; migración `20261116122800_planes_diarios` SIN
    aplicar): coordinadores/encargados mandan el plan de mañana a su `managerId` (o a Luis); el supervisor lo marca
    programado o lo devuelve (aviso); faltantes; cron L-V 17:00 recuerda el plan y 18:30 el cierre. Cierre del día con
    actividades y asistencias de todo el árbol de `managerId`, entregado a dirección (solo `dir_operaciones` entrega).
  - Web `/erp/supervision` (pestañas Plan de mañana / Cierre del día). Visible para dirección, arquitecto,
    dir_operaciones, coord_admin, administrativo, coord_operaciones, enc_soporte, coord_ventas, lider_diseno y rh;
    `me/navigation` lo esconde a quien no tiene gente ni es encargado. No va en «Más» de las apps (no hay pantalla).
  - Sigue en cola para Cursor: `.ai/encargos/2026-11-16-cola-02-*` (mesa de Liz) y `cola-03-*` (RH de Tere).

- **16-11 ~12:50 México (claude-code; código de Cursor, pulido de Codex) — RH: bajas con aprobación de dirección, cadenas de viáticos/vehículos e incidencias. NO desplegado (Hetzner bloqueó la IP por factura sin pagar).**
  - Bajas (`src/users/bajas/`, tabla `user_deactivation_requests`): RH solicita → PENDIENTE y aviso push a dirección
    (ceo activos sin demo/tester ni developer@); dirección aprueba/rechaza/revierte; RH puede aplicar con «Christian ya
    autorizó» + justificación y dirección recibe aviso para revisar. Desactivar pone `estadoRRHH='Baja'`. Bandeja única:
    «Bajas por aprobar» y «Bajas para revisar». `BajasController` va antes que `UsersController` (si no, `users/:id`
    se come `users/bajas`). RH puede dar de alta ing_campo, ing_soporte, administrativo, vendedor, disenador, contabilidad.
  - `approval-policy.ts`: viáticos y vehículos = coord_admin (Liz) → ceo.
  - Bitácora de incidencias (`src/hr/incidencias/`, tabla `incidencias_personal`, `/erp/hr/incidencias`): CRUD,
    `aplicar-semana` → NominaDescuento sin duplicar ni escribir en semana cerrada, importar la hoja «Incidencias» del
    Excel de Tere; resumen por persona en la prenómina.
  - Migraciones `20261116104211_bajas_con_aprobacion` y `20261116104212_incidencias_personal` SIN aplicar en prod.
  - Pendiente en prod (autorizado por Adam 16-11 16:36 UTC): altas de Oscar Muñoz, Elisa Antonio (coord_admin) y Tere
    García (rh) con `alta-usuario.ps1`; Luis a `dir_operaciones` («Supervisor General») y todo el personal activo con
    `managerId` = Luis; filas `Role` para rh y dir_operaciones.
  - En curso aparte (Cursor): `src/supervision/` plan de mañana y cierre diario de Luis; su `app.module.ts` quedó
    truncado a media edición: revisar antes de commitear eso.

- **16-11 ~01:30 México (claude-code) — Ola 5: diseñador como proyecto formal (mockup aprobado por Adam: «continua»).**
  - API (`cctv-disenos`): `POST :id/digitalizar {url}` lee con IA el croquis ya subido (`digitalizar-ia.ts`, Haiku low,
    imagen reducida a 1568 px; `CCTV_DIGITALIZAR_MODELO` lo cambia sin desplegar) y regresa muros, áreas y cámaras en px
    del croquis + dudas; no guarda. Solo croquis de ese diseño por nombre. `POST :id/documentos` guarda documentos del
    expediente en `uploads/cctv-documentos/` (PDF, imagen, Excel, Word, PowerPoint, DWG/DXF; rechaza MZ/#!).
  - Web: «Revisa lo que leyó la IA» (`DigitalizarConIA.tsx`: plano con lo detectado encima, cámaras editables, ancho
    real para la escala, muros/áreas opcionales, dudas) → `aplicarLectura` (`lib/cctv/digitalizar.ts`). Se abre solo al
    subir el primer croquis, con «Digitalizar plano con IA» al empezar y en la pestaña Plano. «Expediente» en la cabecera
    (`ExpedienteProyecto.tsx`): datos del sitio, documentos (cada PDF o imagen se digitaliza con un clic) y «Qué falta
    para entregar» (`lib/cctv/expediente.ts`). Todo vive en `plano.expediente` del plano raíz: sin migración.
  - Cadena Cursor → Codex: no se usó en esta ola (en la anterior ninguno pudo usar la terminal); la hice yo.
  - Sin probar con sesión real en el navegador (el login es de Adam); pruebas de API y web en verde.

- **15-11 ~21:20 México (claude-code) — Descarga Masiva del SAT lista para cuando llegue la e.firma. NO desplegado.**
  - `pac/descarga-masiva/`: `credencial-efirma.ts` (lee `/etc/nexara-secrets/sat/efirma/{efirma.cer,efirma.key,password}`
    o las `EFIRMA_*` de siempre; RFC, serie y vigencia del .cer; periodo ≤ 1 año, cerrado y en el pasado) y
    `DescargaMasivaService` sobre `@nodecfdi/sat-ws-descarga-masiva` 2.0 (ESM: `import()` dinámico, verificado en
    `dist`). Rechaza el CSD (`Fiel.isValid`). ZIP en `uploads/sat-descargas/<rfc>/` (privada en `PRIVATE_UPLOAD_PREFIXES`).
  - Endpoints (facturación): `POST invoices/sat/descarga-masiva/solicitudes`, `GET …/solicitudes/:id`,
    `POST …/paquetes/:id/descargar`; `GET invoices/sat/descarga-masiva` ya detecta la carpeta.
  - `deploy/docker-compose.nexara.yml`: la API monta `/etc/nexara-secrets/sat/efirma` de solo lectura. El CSD ya está
    en `/etc/nexara-secrets/sat/csd` (lo subió Adam el 15-11); la e.firma la está pidiendo Adam.
  - Lock probado con `npm@10.9.9 ci --dry-run` (el de Docker).

- **15-11 ~20:50 México (claude-code) — Ola 4: revisión con IA de actividades calificadas y avisos por chat. NO desplegado
  (Adam: «subes todo de golpe cuando acabes»).**
  - `POST ai/revision/actividad/:id` (`ai/revision/`): el código mide a tiempo/tarde (mismo `limiteDeEntrega`), fotos por
    campo, incidencias y la última calificación; Haiku dice si la calificación corresponde, sugiere 1–5, por qué, qué
    atender y qué hacer. No guarda ni cambia nada. Ficha de la actividad: «Revisión con IA» (`RevisionConIA.tsx`), solo
    con `evidences.review` o `activities.manage`.
  - Avisos por chat (`ChatService.avisoDirecto` + textos en `chat/avisos-chat.ts`): mensaje directo de quien revisó al
    dueño de la evidencia (aprobada con calificación o devuelta con observaciones), de quien reporta una incidencia a quien
    asignó y al responsable, y de quien cerró o asignó a cada pendiente cuando queda «No cumplida». Nunca truena al que
    lo llama. ChatModule entra a ActivitiesModule y ActivityEvidenceModule; el grafo de Nest resuelve (preview).

- **15-11 ~19:30 México (claude-code) — Asignar con IA por tipo y elementos, cotización editable, cotización ligada en todo tipo. NO desplegado.**
  - Asignar con IA: «instalar 4 cámaras en IPADE» = proyecto (prompt), `elem` en la salida y respaldo en código
    (`ai/asistente/elementos.ts`) → `camposEvidencia` (Cámara 1…4 × antes/en progreso/después; mantenimiento solo
    antes/después; junta, trámite y comercial sin campos; tope 40). Sin proyecto activo y con cliente: `proyectoNuevo`
    en vez de pasar a tarea. La tarjeta (`AsistenteIA.tsx`) muestra «Evidencia» editable (nombre, momentos, quitar,
    agregar) y el proyecto nuevo editable; al confirmar crea el proyecto con `operational-projects/alta-rapida`
    (ahora acepta `serviceClientId`), la actividad y `PUT evidencia-campos`.
  - Clientes: el alta rechaza nombres de relleno («N/a», «Varios», «Sin cliente»; `esNombreDeRelleno`). Siglas y
    mayúsculas ya empataban (BUAP ↔ Benemérita…, ipade ↔ IPADE), medido con el padrón real (40 clientes).
  - Cotizar con IA: cada renglón dice «Pediste: «…»», tipo (segmento) e IVA se corrigen antes de usarla;
    `destinoDe` toma el último «para» (antes «1000 tarjetas para control de acceso y 2 lectores para X» perdía los lectores).
  - Cotización ligada en cualquier tipo de actividad (`CotizacionDeActividad`, visible si ya hay una o si puede
    cotizar); solo la comercial avanza con el estado de la cotización (`sincronizarActividad` filtra).
  - Cadena Cursor → Codex → Claude: Cursor dejó el primer borrador y se colgó; su segunda corrida y Codex no pudieron
    usar la terminal (hooks de PowerShell envueltos en bash). Lo terminé yo.
  - Pendiente: descarga masiva del SAT (falta la e.firma; el CSD ya está en `/etc/nexara-secrets/sat/csd`), revisión
    con IA de calificaciones, avisos por chat, diseñador de proyectos. Desplegar pide OK de Adam.

- **15-11 ~10:30 México (claude-code) — Aprobaciones como bandeja única y menú «Por estrenar» (Adam: «lo que consideres apropiado»).**
  - Aprobaciones nunca tuvo datos (`workflow_instances` = 0). `lib/bandeja.ts` junta evidencias por revisar (me/revisiones,
    paraTi), viáticos Pendiente, horas extra y descuentos de la semana pasada (control-semanal), solicitudes de equipo y
    firmas de flujo; cada fuente callada si da 403. `components/approvals/BandejaUnica.tsx` arriba de las firmas; cifras y
    filtros de flujo solo si hay firmas. El número del menú = `contarBandeja` (sin la nómina, que pesa).
  - `me/navigation` devuelve `porEstrenar` (almacén sin stock ni movimientos, documentos, compras en cero por empresa); el
    menú los manda a «Por estrenar», al final y plegado (`FOLDED_GROUPS_STORAGE_KEY` v3).
  - Este despliegue también lleva `4e07de69` (dependencias Node 26/npm 12) que estaba sin desplegar.

- **15-11 ~01:05 México (claude-code) — Dependencias al día con Node 26.13.1 / npm 12.2.2 (solo parches y menores). NO desplegado.**
  - Subidas: next 15.5.29, MUI 7.3.11, maplibre-gl 6.18.0 (con sus `.mjs` copiados a `public/maplibre/`), sass 1.108,
    recharts 3.10, hls.js 1.7, axios 1.21.1, openai 6.49, nodemailer 10.5, firebase-admin 13.10, bullmq 5.81.5,
    express 5.3 (raíz), zod 4.6.7 (raíz), testing-library y especificadores de Nest 10.4.22 / Prisma 5.22 (ya estaban en el lock).
    `@testing-library/jest-dom` se queda en 6.9.1: npm marca la 6.10.0 como deprecada («minor con cambios que rompen»).
  - **npm 12 bloquea los scripts de instalación de las dependencias.** `package.json` lleva ahora `allowScripts`
    (Prisma, sharp, esbuild, @parcel/watcher, msgpackr-extract, protobufjs, @firebase/util, @nestjs/core; `canvas: false`,
    que no tiene binario para Node 26 y nunca compiló aquí). npm 10 (Docker) ignora ese campo.
  - npm 12 dejó `next` dentro de `apps/web/node_modules`: `scripts/next-build-resilient.js` ya lo resuelve con
    `require.resolve` desde la web (antes ruta fija a la raíz). El lock nuevo pasa `npm ci --dry-run` con npm 10.9.9
    (el de `node:22-slim`), para api y para web.
  - Node 25+ trae un `localStorage` global vacío que tapaba al de jsdom: las 248 pruebas de la web caían. Arreglo en
    `apps/web/vitest.config.mts` (`poolOptions.forks.execArgv: ['--no-experimental-webstorage']`).
  - Verificado con Node 26: typecheck, 439 archivos de pruebas de API, 248 de web (2,143 pruebas), `build:server`,
    `AppModule` carga, `next start` sirve `/contacto` y el mapa se dibuja con calles. Mayores pendientes y su costo:
    `C:\dev\.ai\dependencias-2026-11.md`.
  - No tocado: `apps/web/lib/integra-shared/_lib.ts` y `.codex/` (cambios ajenos sin commitear desde el 07/09-11).

- **14-11 ~22:10 México (claude-code) — El ERP vive solo en `app.nexara.com.mx` (Adam cambió core → app en el DNS).**
  - En GoDaddy solo quedan raíz/`www`, `app.`, `api.`, `email.` y `autodiscover.`; `core.`, `integra.` y los demás
    subdominios de páginas ya no resuelven. El middleware mandaba `app.` → `core.` (308) y el ERP no abría.
  - `586c310c7`: canónico de todos los paneles = `app` (`middleware.ts`, prueba `middleware-dominio-app.spec.ts`),
    subdomain-config/panel-urls/access-matrix/handoff/panel-home, SSO (callback `https://app.nexara.com.mx/api/auth/oidc/callback`),
    apps móviles y docs. Desplegado web + API con relevo (`/root/deploy-app-dominio.sh`, log en `/root/deploy-app-dominio.log`).
  - Traefik: solo `app-frontend` sirve páginas; `core-a-app` (301, raíz → `/erp/pizarra` para no hacer bucle con el 308
    viejo que guardan los navegadores) por si `core` vuelve al DNS; integra conserva aviso del NVR, go2rtc y `/api`.
    Health check del web: `hostname: app.nexara.com.mx` + `followRedirects: false`.
  - Certificado propio de `app.` (Let's Encrypt, vence 13-02-2027): se quitó de `acme.json` el certificado de `console`
    que llevaba `app.` como SAN con 15 hosts muertos (respaldo en `/root/respaldo-acme-20261115/`). Traefik reiniciado ~3 s.
  - Google Cloud (cliente «NEXARA Core (login web)», con el sí de Adam): agregado URI 2
    `https://app.nexara.com.mx/api/auth/oidc/callback` (se dejó el de core.). Probado: Google ya lleva a «Elige tu cuenta»
    en vez de `redirect_uri_mismatch`; el login completo con Google lo prueba Adam con su cuenta.
  - Adam: `core` NO vuelve al DNS («todo ahora en app»). Pendiente suyo: equipos/agentes con `integra.nexara.com.mx`.
  - **Apps 1.4.1 (~22:45):** la 1.4 instalada (iOS build de `72cd839a4`) solo usaba `core.` en las ligas del chat que abre
    en el navegador (facturas, asistencia ajena); todo lo demás va a `api.nexara.com.mx`, que no cambió, y no hay
    actualización obligatoria: la 1.4 sigue funcionando mientras sale la nueva. `77c09d364`: Android armaba la URL con el
    subdominio del panel en `WebPanelUrl` (`/erp`→core, `/tickets`→portal), aparte de `CORE_WEB_BASE`; ahora `/erp`→app y el
    portal no tiene web (app./tickets da 404). 1,098 pruebas de Android, paridad app-web e `ios-static-check` en verde.
  - **Android 24 (1.4.1)** subida a Play (AAB de `be8988b`, SHA-256 F2607201…8E77, sin `core.` en el dex), enviada a
    revisión: lanzamiento completo 100 %, 0 dispositivos pierden compatibilidad, publicación gestionada apagada (sale sola).
  - **iOS 1.4.1 (17): enviada a App Store el 15-11 ~00:35 México, `WAITING_FOR_REVIEW`, `AFTER_APPROVAL`** (sale sola).
    La primera corrida (`43676732062`) falló al subir: `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. El que faltaba
    era el **contrato de licencia del Apple Developer Program** en developer.apple.com/account (no en Negocio de ASC);
    Adam lo aceptó y la API se abrió ~30 min después. Corrida `43684319731` subió el build 17 (VALID); la versión heredó
    10 capturas de iPhone 6.7", cuenta de revisión y notas (3,908 car.), cifrado `false`. Novedades: ligas a app.
    Script para la próxima: `scripts/asc_publicar.py` (estado, builds, preparar, enviar). Siguientes números: Play 25, iOS 18.
  - Play: la 24 pasó las comprobaciones y está «en proceso de revisión» (la ficha pública aún dice 1.4.0).
  - Pendientes en ASC → Negocio (no bloquean hoy): declarar estatus de comerciante para la UE y el «Acuerdo para apps
    gratuitas» tiene versión nueva disponible.
  - Laptop: `JAVA_HOME` apunta a `jdk-21.0.10.7-hotspot`, que ya no existe; el instalado es `jdk-21.0.13.21-hotspot`
    (Gradle falla sin ajustar `JAVA_HOME` en el comando).
  - Navegadores que ya visitaron `app.` guardan el 308 viejo a `core.`: se arregla borrando «Imágenes y archivos en caché».

- **2026-11-14 (claude-code) — Limpieza de documentación (Adam: «quita documentación y unifica»).** Borrados 25 documentos obsoletos sin referencias (auditorías, planes y prompts viejos; están en el historial de git). Índice único del repo: `docs/INDICE.md`; índice de todos los proyectos: `C:\dev\DOCS.md`; memoria compartida de Codex/Claude/Cursor/Grok: `C:\dev\.ai\memoria`. RELEVO recortado a los 3 turnos más recientes.

- **11-11 ~11:30 México (claude-code) — Accesos propios y visibilidad de reuniones (Adam, 11-11).**
  - `SHARED_SESSION_URL_RULES`: mfa/status|setup|confirm|disable, workflow/my-pending y ai/voz/estado para todo rol; sus
    `@RBAC({})`. Prueba `sesion-propia-todos.spec.ts` recorre los 18 roles. `formatApiError` ya no enseña «no puede acceder a GET /api…».
  - Reuniones: `meetings/visibilidad.ts` (`veReunion` + `ReunionVisibleGuard` en los dos controladores). Dirección ve
    todo; columna `soloDireccion` (migración 20261111170000) en true para todas las previas; las nuevas las ven asistentes,
    quien condujo y sus jefes hacia arriba. Lista y lecciones filtran. Web: «Comenzar a grabar» pregunta quién está.

- **10-11 ~15:30 México (claude-code) — Perfil de arquitecto (Adam: Josué y Jorge Leonardo asignan obra).**
  - `arquitectoAlcanzaA` (`me/equipo-alcance.ts`): rol `arquitecto` llega a quien reporta a operaciones@ (David) o
    jose.ramirez@ (José Antonio), por jefe y no por correo. Crea tarea/proyecto/obra por rol (Josué sigue con su fila
    por correo, con comercial); a sistemas se le suma obra solo cuando asigna un arquitecto. Asignar con IA abierto al rol.
  - Salvador, Erick, Ricardo y Genaro faltaban en RECEIVE_BY_EMAIL (solo recibían tarea): ya reciben obra.
  - Jorge Leonardo Plácido Torres: Adam lo da de alta en Perfiles (rol Arquitecto) y guarda sus claves en
    `secrets/PASSWORDS NEXARA.xlsx`; Claude no crea cuentas con contraseña.

- **10-11 ~19:30 México (claude-code) — Core premium, ola 1 (Adam: «sí», con cada pestaña y la barra lateral).**
  - Estilo del prototipo del 08-11 pasado a código como bloque final en cada módulo base: `AppShell.module.scss` (menú de
    noche en los dos temas vía `--sb-*`, buscador, activo verde, barra superior translúcida), `base.module.css` (título 30 px,
    primario con relieve), `piezas` (Stat en tarjeta), `ModulePage` (lista), `DataTable`, `DashKit` (banda de Hoy) y `ui/PageHeader`.
  - Ola 2: Análisis de Nómina (`components/finance/AnalisisNomina.tsx`, seis semanas del Control semanal) arriba de los
    pagos registrados; tokens claros `--ui-bg` #f3f5f9 y `--ui-elev-1/2` con la sombra premium; bandas de Costos,
    Vehículos y Desempeño con el mismo azul noche. Recorridas 16 pantallas; faltan subpestañas y editores (cotización, CCTV).


_Turnos anteriores recortados el 2026-11-14 (limpieza de documentación). Historial completo: `git log -p -- .ai/RELEVO.md`._



- **16-11 ~21:52 México (codex) — Pulido del estándar de proyectos de Cursor. SIN commit, push ni deploy por orden de Adam.**
  - Hecho: editor de faltantes + foco completar=1, FICHA→PLAN→LISTO y botones bloqueados; alta con ficha en paso 1 y nombre sugerido editable. Selector cliente/proyecto en web/IA y nativos; ligar actividades transaccional por empresa/cliente y fechas de México; API bloquea instalación sin proyecto. Avisos al nacer conectados, agrupados por persona/día local, escalado con historial al tercer día hábil y supervisor por rol/membresía. Salud no cierra por fecha real aislada ni con hitos pendientes.
  - Verificado: typecheck web verde; foco API 138/138 y web 80/80. Typecheck global: 4 errores ajenos de contabilidad. Suite completa API: 6028 pasan/46 fallan, 12 suites ajenas; web: 2256 pasan/2 fallan, clientes y cotizaciones ajenos. Detalle y lista exacta de rutas: .ai/REVISION-PROYECTOS-CODEX.md.
  - A medias / siguiente: QA visual 390/1536, compilar y recorrer móviles, integración con BD y notificaciones reales; corregir fallos globales desde sus sesiones responsables. Cliente inválido se corrige en padrón; banner no cambia identidad. No declarar producto visualmente validado.
  - No tocar: schema.prisma, contabilidad, RH, supervisión, CCTV, viáticos, vehículos, prenómina, AppShell, integra-shared y migraciones ajenas. Se preservó todo lo previo; sin producción.

- **17/11/2026, 09:09:19 México (codex) — Proyectos olas 2 y 3. SIN commit, push ni producción por orden de Adam.**
  - Hecho: OperationalProject maestro, alta comercial+operativo atómica, CRM/bookmarks resuelven el id operativo; WorkProject solo lectura y migrador en simulación por defecto (nunca ejecutado), clientes reales por empresa, histórico como nota, listado único sin perder reportes especializados. Project público documentado.
  - Hecho: material a costo de salida por actividad/proyecto y Sin ligar; lectura de sesiones/tarifas y otros rubros a fecha sin escribir, cerrado y tarifa histórica conservados, prioridad manual sin doble cargo. Ficha con diferencias/consumo/orígenes, márgenes y costo al terminar solo calculable; listado con semáforo y sobrecosto. Cron operativo comparte una lectura por empresa; avisos agrupados por persona/día con umbrales estrictos, dedupe, supervisor y membresías activas.
  - Verificado: Jest 411 pruebas distintas en focos/regresión (ventas/work-projects/projects259, costos92, avisos14, almacén7 y regresiones almacén/SLA39); Vitest63 (UI22, compatibilidad41). Typecheck web exit0. Typecheck API solo2 errores ajenos: accounting.service.ts561 isSuperAdmin en UserSelect y banco/estado-cuenta-import.service.ts72 falta skip. Prisma generate y AppModule preview PASS sin BD; diff-check propio limpio. QA SeccionCostos390/1536 en harness aislado sin overflow, capturas vistas.
  - A medias: integración con BD y avisos reales no ejecutados por alcance; migración 20261117083034_stock_proyecto_maestro creada sin aplicar. Suite amplia costos tiene una aserción ajena previa en vehiculos/lectura-ia sobre campos de ticket; foco propio92/92 verde.
  - Siguiente: revisar .ai/OLAS23-RESULTADO.md; inventario completo C:\dev\encargos\olas23-rutas.txt. Aplicar migración y validar integración en entorno autorizado posteriormente. Pull --rebase no puede ejecutarse con cambios ajenos sin commit; se preservan sin stash.
  - No tocar: contabilidad ajena, RH, supervisión, CCTV, viáticos, vehículos, prenómina, AppShell, integra-shared, page-matrix y migraciones ajenas. No se hizo commit, push, reset, stash ni despliegue.

## 21-11-2026 15:45 · claude-code · asistencia, cierre de jornada y candado (hilo «mejoras de código de NEXARA Core»)

En producción (origin/main `ac75ed7c9`):
- Pizarra con una sola regla de atraso (`semaforo-actividad.ts`), todas las atrasadas por persona, «Libre» solo por entregas de hoy.
- Cierre de jornada siempre: salida propia, automática, de jefe, barrido 00:10 y **al checar entrada** (`alChecarEntrada`, evento `ATTENDANCE_CHECKIN`). La pausa no protege.
- Turno de noche: entrada ≥ 18:00 no se corta a las 23:30 (`esEntradaDeNoche`, cron horario `cerrarJornadasDeNocheOlvidadas`); segundo turno el mismo día = jornada del día siguiente (`diaDeJornadaParaEntrada`); la salida toma el día de su jornada.
- Candado «sin entrada no se trabaja»: `attendance/candado-jornada*.ts`, interceptor global, 409 `JORNADA_NO_ABIERTA`; se apaga con `JORNADA_OBLIGATORIA=0`; exentos por id en `JORNADA_EXENTOS` (esa variable aún no está en el compose). Web: `BarreraJornada` + `lib/jornada-candado.ts`; apps: código listo, llega con la próxima versión publicada.
- Checada web por persona: `attendance.web_checkin_until.user.<id>` en `system_settings`. Luis (id 7) abierta hasta 2026-12-01.
- KPIs: `noSeMide` (RH y coord_admin fuera), `sinChecador` (RH no checa), entrega real.
- Resumen diario a dirección 8:30 (`activities/resumen-diario*.ts`), se apaga con `RESUMEN_DIARIO=0`.
- `scripts/verificar-commit.sh <commit> api|web`: tsc sobre el commit exportado. Úsalo antes de publicar: el checkout local va atrás de origin/main y un `tsc` local engaña (así falló un build el 20-11).

En disco SIN publicar, esperando el visto bueno de Adam para sus migraciones (no subir a main antes: el despliegue aplica toda migración que encuentre):
- Actividades de un solo día + desglose por día: `activities/actividad-un-solo-dia.ts`, `ai/asistente/asistente-desglose-dias.ts`, `OpsActivityForm.tsx`, formularios Android/iOS, migración `20261120214500_actividad_serie_diaria`.
- Horarios, horas extra (fuera de 10–18), productividad en tres ejes y pago de nómina (API): `attendance/horario/*`, `cierre-con-horario.ts`, `employee-payments/pago-semanal.ts`, `nomina-pago.service.ts`, migraciones `20261121140500_horario_dia_productividad` y `20261121162000_nomina_pago_semanal`. 1,509 pruebas en verde en local. Faltan pantallas web y apps.
- Ojo: Cursor tocó `common/rbac/url-matrix.ts` (archivo sucio de otra sesión) para restaurar `FORMATOS_ACTIVIDAD` a RH; no lo publiqué.

Encargos escritos sin empezar: `.ai/encargos/2026-11-20-ia-aprendizaje-recurrente.md`. Regla nueva para todos los agentes: `C:\dev\scripts\ai-os\PARIDAD-MOVIL.md`.
