# Encargo: Mesa de la contadora con IA, ola 1 (17-11-2026)

Para: Cursor (codifica) → Codex (pule) → Claude (revisión final). Repo NEXARA-app, solo `main`, reglas de AGENTS.md (commit `--only` de tus rutas, `npm run typecheck && npm run test` en verde, línea `Agente:`). **No desplegar**: Adam aprueba.

Usuaria: la Contadora General, Paulina (`finanzas@nexara.com.mx`, entra por `MESA_CONTABLE_EMAILS` en `apps/api/src/accounting/mesa-contable/mesa-por-correo.ts`). Hoy factura en el portal del SAT y Excel. Objetivo: que haga su trabajo entero en Core, con la IA haciendo la captura y ella solo revisando y corrigiendo.

Regla de oro (Adam): **todo lo que haga la IA se ve y se edita antes de guardarse o timbrarse.** La IA propone un borrador; nada se timbra, contabiliza ni paga sin un clic de una persona. Cada propuesta muestra de dónde salió cada dato (archivo, renglón, XML) y un nivel de confianza.

Reutiliza lo que ya existe, no lo dupliques:
- IA: `apps/api/src/ai/claude/claude.service.ts` (Haiku para leer documentos; Sonnet solo si Haiku falla la validación). Registra costo por llamada como los otros módulos de `src/ai`.
- Descarga masiva SAT: `apps/api/src/pac/descarga-masiva/` (commit 0314c02). Ya solicita/verifica/descarga paquetes.
- Facturas: modelo `Invoice` (emitidas y recibidas, `MovimientoVinculo`), revisión previa `mesa-contable/revision-factura.ts`, timbrado `src/pac` (Facturama).
- Tickets de viáticos: `src/gestion-viaticos/` (commit 6eff7b3), lista «Por facturar» con fecha límite.
- Clientes: detector de duplicados de `src/ai/duplicados` (UAP = Benemérita Universidad Autónoma de Puebla, mayúsculas/minúsculas).
- Excel: `exceljs` ya está en api y web.

## 1. Buzón SAT automático (sustituye a «Mis Comprobantes»)
Inspirado en Aspel COI / CONTPAQi (visor de documentos digitales) y ContaDigital (descarga automática).
- Cron diario 06:00 México con `runScheduledJob`: solicita emitidos y recibidos de los últimos 3 días; el día 1 de cada mes, el mes anterior completo. Reintenta con espera si el SAT responde «en proceso». Interruptor por variable de entorno.
- Cada XML se parsea y se guarda como `Invoice` (recibida → `supplierId`; emitida → cruza por `cfdiUuid` con la que timbró Core). Idempotente por `cfdiUuid`. Proveedor nuevo → `Supplier` con RFC y razón social del XML (mismo RFC = mismo proveedor).
- Por cada recibido guarda: tipo (I/E/P/N), método/forma de pago, uso, IVA trasladado/retenido, ISR retenido, estatus SAT (vigente/cancelado) y si el emisor está en la lista 69-B del SAT (EFOS): descarga el CSV público del SAT una vez por semana y marca en rojo proveedores presuntos o definitivos.
- Pantalla `/erp/contabilidad/buzon-sat`: pestañas Recibidos / Emitidos / Cancelados / Alertas (69-B, sin póliza, cancelado después de pagado, sin pago ligado). Filtros con presets de fecha (punto 5). Descarga ZIP de XML+PDF del rango y Excel.
Aceptación: con la e.firma montada, en la mañana el buzón tiene los CFDI del día anterior sin que nadie haga nada; un XML repetido no duplica nada; un proveedor 69-B aparece en Alertas.

## 2. Pólizas automáticas con IA de los CFDI recibidos
Inspirado en Aspel COI (contabilización automática de XML), CONTPAQi (plantillas de asiento), Odoo (modelos de conciliación).
- Por cada recibido nuevo propone la póliza: cuenta de gasto/costo según el proveedor (aprende de las últimas pólizas de ese RFC), IVA acreditable, retenciones, proveedor por pagar. Sin historial, la IA sugiere la cuenta del catálogo según los conceptos del XML y explica por qué en una línea.
- Si coincide una orden de compra, recepción de almacén, ticket de viático o actividad (RFC, importe ±1 %, fecha ±7 días), lo liga y lo dice («Ticket #123 de Lizeth, actividad Instalación UAP»).
- Bandeja «Por contabilizar» en la Mesa: cada propuesta editable en línea (cuenta, centro de costo, proyecto/actividad, importe); botones Aceptar, Aceptar todas las de confianza alta, Corregir. Al corregir, la regla se guarda para ese proveedor.
- Nada entra a `JournalEntry` sin aceptar.
Aceptación: un CFDI de gasolina de un proveedor ya usado sale con la cuenta correcta y ligado a su ticket; uno nuevo sale con sugerencia y explicación; corregir una cuenta cambia la sugerencia del siguiente CFDI de ese RFC.

## 3. Factura desde PDF, Excel, cotización o texto, con borrador editable
Inspirado en Odoo (OCR) y en lo que pidió Paulina el 13-11 (el portal no deja pegar y la saca por inactividad).
- En «Por facturar» y en Facturas: botón «Armar con IA». Acepta PDF, imagen, Excel, Word, una cotización de Core o texto pegado.
- La IA devuelve el borrador completo: cliente (resuelto contra el catálogo con el detector de duplicados; si no existe, propone alta con RFC/régimen/CP validados con `sat/validate-rfc` y `fiscal-lookup`), uso CFDI, forma y método de pago, conceptos con clave SAT de producto y unidad, cantidades, precios, IVA y retenciones.
- Cantidades con sentido: cada concepto muestra texto y cantidad por separado; una cantidad atípica (ej. 1,000 tarjetas junto a 19 lectores) se marca para revisión y la descripción dice qué es («Tarjeta de proximidad — 1,000 piezas»), nunca «1,000 dispositivos».
- Se abre en el editor de factura normal con todo editable y cada campo marcado «IA» hasta que la persona lo toca. Antes de timbrar corre `revision-factura.ts`. Timbra Facturama solo con el clic de Timbrar.
Aceptación: pegar el PDF de una orden de compra arma la factura en menos de 15 s con todo editable; «uap» se resuelve al cliente existente; nada se timbra solo.

## 4. Tickets de viáticos leídos por IA
Inspirado en Expensify / Odoo Gastos.
- En `gestion-viaticos`, al subir la foto del ticket la IA llena comercio, RFC si viene, fecha, hora, importe, IVA, litros y combustible (si es gasolina), folio y web de facturación. Todo editable antes de enviar.
- Si la gasolinera tiene portal de autofactura conocido, muestra el enlace y los datos a copiar; recuerda que es el mismo día.
- Cuando llega el CFDI por el Buzón SAT (punto 1) se liga solo al ticket por RFC+importe+fecha y el ticket pasa a «Facturado».
Aceptación: foto de ticket de gasolina → campos llenos y editables; al día siguiente su CFDI aparece ligado.

## 5. Excel dinámico y presets de fecha en toda la contabilidad
- Componente único de rango de fechas en web: Hoy, Ayer, Esta semana, Semana pasada, Este mes, Mes pasado, Este trimestre, Trimestre pasado, Este año, Año pasado, Personalizado. Recuerda la última elección por pantalla.
- Filtro de estado precargado por pantalla (ej. Facturas: Borrador / Timbrada / Pagada / Vencida / Cancelada).
- Botón Excel en Buzón SAT, Por facturar, Por contabilizar, Facturas, CxC, CxP, Pólizas, Conciliación, Estados: respeta filtros, encabezado con empresa/rango/fecha de generación, montos numéricos con formato es-MX, totales con fórmula, autofiltro y primera fila fija.
Aceptación: «Mes pasado» en Facturas descarga un Excel con los mismos renglones que la pantalla y totales que cuadran.

## Fuera de esta ola
Nómina ISR/IMSS/SUA y timbrado; facturar descuenta existencias con costo promedio; pre-cálculo ISR/IVA mensual; XML de pólizas y auxiliares; activos fijos; cobranza automática; asistente contable en el chat.

## Diseño
Mismo sistema visual de Core (plantilla de listas). Tabla densa y profesional, columnas fijas, acciones por renglón, panel lateral para editar sin salir de la lista, chips de estado con color, ninguna pantalla vacía sin explicación.

## Ampliación E2-E4 (17-11)
Adam aprobó E2, E3 y E4 de la investigación de sistemas líderes. Mismas reglas: solo main, commit `--only`, pruebas en verde, **no desplegar**. Si lo hecho en los puntos 1-2 choca con esto, manda esta versión.

### E2. Ajustes a los puntos 1 y 2
- Los CFDI del SAT van en una **tabla nueva** (UUID único, RFC emisor/receptor, total, tipo I/E/P/N, método PUE/PPD, estatus SAT, XML, ligas opcionales a `Invoice` y a `JournalEntry`), no directo en `Invoice`. La factura en libros se liga a ese registro.
- La pantalla se llama «Buzón SAT» pero va en `/erp/contabilidad/cfdi`, con pestañas Recibidos / Emitidos / Cancelados / Alertas.
- El job nocturno usa BullMQ (ya está en apps/api) envuelto con `runScheduledJob` como los demás crons.
- Tres listas de cruce SAT contra libros: CFDI sin póliza, póliza sin UUID, CFDI cancelado en SAT que sigue contabilizado. Más la alerta 69-B.

### E3. Pólizas automáticas y REP
- Plantillas de póliza por tipo de CFDI (ingreso, egreso, pago, nómina), editables por la contadora.
- Cuenta sugerida = la última usada con ese RFC; Haiku solo para RFC sin historial y solo como sugerencia.
- BUG a corregir: `apps/api/src/pac/cfdi-xml.builder.ts` ~línea 326 calcula el IVA del complemento de pago con `/1.16` fijo. Debe salir de las tasas reales de la factura relacionada (16 %, 8 % frontera, 0 %, exento, retenciones de IVA e ISR). Pruebas unitarias para cada tasa.
- Tablero PPD: facturas con saldo, pagos recibidos sin REP emitido, pagos a proveedor sin REP recibido.
- Pólizas en XML (contabilidad electrónica, PLZ) junto al catálogo y la balanza que ya existen.
- Bloqueo de periodo: suave (solo la contadora puede mover) y duro (nadie).

### E4. Conciliación bancaria con reglas
- Importar estado de cuenta CSV, OFX y Excel en el servidor, con layouts de BBVA, Banorte y Santander como mínimo (sobre `accounts/:id/transactions/import` que ya existe).
- Reglas guardadas: «si el concepto contiene X, cuenta Y».
- Empate por puntaje (monto, fecha ±3 días, referencia, RFC) con las 3 mejores propuestas y botón Aceptar.
- Tablero «Mi cierre» para Paulina con barra de avance: bancos conciliados, CFDI sin póliza, REP pendientes, DIOT, EFOS 69-B.

Reglas extra: cambios visuales notables con maqueta y visto bueno de Adam antes de darlos por buenos (detrás de rutas nuevas, sin reemplazar pantallas existentes sin aviso); migraciones con fecha y hora exactas.
