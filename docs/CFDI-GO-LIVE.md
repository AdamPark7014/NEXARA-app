# Encender la facturación electrónica (CFDI 4.0) — runbook de puesta en marcha

Preparado el 27-sep-2026. Para el dueño (Christian) y para el desarrollador que lo acompaña.

> **Este documento no enciende nada.** El sistema ya sabe timbrar, pero hoy está en
> **modo de prueba (mock)**: si alguien "timbrara", el folio fiscal (UUID) sería
> inventado y no valdría ante el SAT. Encenderlo de verdad es un **acto fiscal
> irreversible**: cada CFDI timbrado existe ante el SAT y solo se puede cancelar
> con motivo, plazo y, a veces, aceptación del cliente. Por eso se enciende por
> etapas, con las dos personas presentes.

Leyenda:

- **[PERSONA]** solo una persona puede hacerlo (credenciales, certificados, decisión fiscal). Ningún agente o script lo hace por ustedes.
- **[DEV]** lo ejecuta el desarrollador.
- **[AUTO]** lo comprueba el sistema con la revisión previa (`pac:preflight` o `GET /api/pac/readiness`).

---

## 1. Dónde estamos hoy

| Cosa | Estado al 27-sep-2026 |
|---|---|
| Proveedor de timbrado (`PAC_PROVIDER`) | `mock` |
| Respaldo a mock (`PAC_FALLBACK_TO_MOCK`) | `1` en el archivo de entorno (en producción el código lo ignora y lo fuerza a apagado) |
| Dirección del proveedor (`FACTURAMA_BASE_URL`) | vacía |
| Facturas reales timbradas | 0 |
| Cómo factura Nexara | a mano en el portal del SAT |

Cómo comprobarlo en cualquier momento, sin riesgo (solo lee):

```bash
# En el servidor (la imagen solo lleva dist/):
docker exec nexara-api node /app/apps/api/dist/pac/pac-preflight.cli.js --db

# En una máquina de desarrollo, dentro de apps/api:
npm run pac:preflight -- --db
```

También existe `GET /api/pac/readiness` (lo pueden consultar **dirección general,
dirección administrativa y contabilidad**, nadie más; requiere el encabezado de
empresa como el resto de la API). Devuelve el mismo reporte en JSON. El reporte
**nunca** incluye contraseñas, tokens ni el contenido del certificado: solo sí/no,
estados y nombres de variables que faltan.

Cómo leerlo: `listoParaProduccion: true` solo cuando **no hay ningún bloqueo**.
`etapa` dice en qué punto van: `apagado_mock` → `configuracion_incompleta` →
`pruebas_sandbox` → `listo_para_produccion`. La lista `verificacionManual` son
cosas que el sistema **no puede ver** (por ejemplo, el certificado guardado en la
cuenta de Facturama) y que una persona debe confirmar.

---

## 2. Prerrequisitos

### 2.1 Cuenta del proveedor (Facturama) — [PERSONA: el dueño]

1. Cuenta de **sandbox** (pruebas). No factura de verdad; sirve para ensayar.
2. Cuenta de **producción**: contrato y **timbres (folios)** contratados. Sin timbres el proveedor rechaza el timbrado. *(Confirmar precios y paquetes con Facturama.)*
3. Tener a la mano el usuario y la contraseña de cada ambiente. Son distintos entre sandbox y producción. **No se comparten por chat ni se escriben en el repositorio.**

### 2.2 CSD, no e.firma — [PERSONA: el dueño con el contador]

| | **CSD** (Certificado de Sello Digital) | **e.firma** (FIEL) |
|---|---|---|
| Para qué | **Sellar las facturas** | Firmar trámites ante el SAT, descarga masiva |
| Archivos | `.cer` + `.key` + contraseña de la llave privada | `.cer` + `.key` + contraseña |
| Dónde se tramita | Portal del SAT, servicio de Certificados de Sello Digital, con la e.firma | En una oficina del SAT |
| ¿Sirve para facturar? | **Sí** | **No** (el SAT rechaza sellar con ella) |

- Con **Facturama** el CSD se **sube a la cuenta de Facturama** (sus pantallas de perfil fiscal / sellos digitales), no al servidor de Nexara. El sistema de Nexara **no** lo necesita en sus variables.
- Debe corresponder **al mismo RFC** que aparece como emisor de las facturas, y estar **vigente** (dura 4 años). El reporte avisa si un CSD cargado en el servidor vence en menos de 30 días, pero **no puede ver el que está en Facturama**: revisarlo a mano en su panel.
- Si el certificado que tienen en la mano tiene un número que no son 20 dígitos, probablemente sea la e.firma y no el CSD.

### 2.3 Datos fiscales de Nexara (emisor) — [PERSONA: el dueño con el contador]

Se toman de la **Constancia de Situación Fiscal** vigente y se capturan en el perfil de la empresa (o en los ajustes "empresa/fiscal"). Un CFDI 4.0 los valida contra el SAT; un dato mal escrito y el timbrado se rechaza.

| Dato | Regla |
|---|---|
| RFC | 12 caracteres (persona moral) o 13 (persona física) |
| Razón social | Igual que en la Constancia. En CFDI 4.0 el SAT compara el nombre; normalmente se escribe **sin** "S.A. de C.V." u otro régimen societario. *(Confirmarlo con el contador.)* |
| Régimen fiscal | Solo el código de 3 dígitos (`601`, `612`…) y compatible con el tipo de persona (por ejemplo, `601` es de persona moral; `612` de física) |
| Código postal fiscal | 5 dígitos exactos. Es el **lugar de expedición** de cada factura |

El reporte lista los campos que faltan (`rfc`, `legalName`, `fiscalRegime`, `fiscalPostalCode`) y valida formato, régimen y código postal.

> **Ojo:** al facturar, el sistema toma primero los **ajustes "empresa/fiscal"** y solo si no hay ninguno usa el perfil de la empresa. Antes de timbrar siempre se revisa el emisor **que aparece en el borrador** (ver etapa 2), no solo el perfil.

### 2.4 Datos de cada cliente al que se factura

CFDI 4.0 exige, y el SAT valida: **RFC**, **razón social exacta** (como su Constancia), **código postal fiscal**, **régimen fiscal** y **uso de CFDI** compatible con ese régimen. Además: forma de pago, método de pago (`PUE` pago en una exhibición / `PPD` pago en parcialidades o diferido), moneda y, por concepto, la **clave de producto/servicio** y la **clave de unidad** del catálogo SAT.

Pedir al contador, antes de empezar: las claves de producto/servicio que corresponden a lo que Nexara vende (cámaras, instalación, mantenimiento, cableado…), la política de `PUE` vs `PPD`, y la serie que se usará.

---

## 3. Variables de entorno — exactas y dónde se ponen

El compose de Nexara (`/var/www/nexara-app/deploy/docker-compose.nexara.yml`, **solo referencia, no se edita**) ya pasa estas variables al contenedor `nexara-api` tomándolas del archivo de entorno:

> **`/var/www/nexara-app/deploy/.env.nexara`** — es el archivo que leen `deploy/update.sh` y `deploy/nexara.sh` con `docker compose --env-file`. Está fuera de git (`.env.*` está ignorado). **Ahí se escriben los valores.**

`NODE_ENV=production` ya viene fijo en el compose.

| Variable | Sandbox (ensayo) | Producción | Nota |
|---|---|---|---|
| `PAC_PROVIDER` | `facturama` | `facturama` | En minúsculas y exacto; otro texto se comporta como `mock` |
| `PAC_FALLBACK_TO_MOCK` | `0` | `0` | En producción el código ya lo fuerza a apagado, pero se deja en `0` |
| `FACTURAMA_USER` | usuario **sandbox** | usuario de **producción** | [PERSONA] secreto |
| `FACTURAMA_PASSWORD` | contraseña sandbox | contraseña de producción | [PERSONA] secreto |
| `FACTURAMA_BASE_URL` | `https://apisandbox.facturama.mx` | `https://api.facturama.mx` | **Si se deja vacía, el sistema usa el sandbox sin avisar** |
| `CSD_CER_BASE64`, `CSD_KEY_BASE64`, `CSD_KEY_PASSWORD` | no se usan | no se usan | Solo hacen falta si algún día se cambia a Finkok o a SW con sellado local. Con Facturama el CSD vive en su cuenta |

Tres trampas conocidas:

1. **Poner credenciales antes o junto con el cambio de proveedor.** Con `NODE_ENV=production`, si `PAC_PROVIDER=facturama` y faltan usuario o contraseña, **la API no arranca** (el servicio de timbrado falla al inicializarse). Fuera de producción, en cambio, cae a mock sin avisar.
2. **`./deploy/nexara.sh restart` no relee el archivo de entorno.** Para que el contenedor tome los cambios hay que recrearlo:
   ```bash
   cd /var/www/nexara-app
   docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml up -d --no-build api
   docker logs --tail 50 nexara-api | grep -i "PAC inicializado"
   ```
   La línea debe decir `provider=facturama`. (Para ver qué variable quedó: `docker exec nexara-api printenv PAC_PROVIDER FACTURAMA_BASE_URL`. **Nunca** imprimir todo el entorno.)
3. **Las contraseñas no se pegan en chats, tickets ni commits.** Si alguna se filtra, se cambia en Facturama.

---

## 4. Orden de encendido por etapas

### Etapa 0 — Revisión previa (sin cambios) — [AUTO] + [DEV]

Correr la revisión (sección 1). Hoy debe decir **APAGADO (modo de prueba)**. Anotar el resultado. Antes de seguir, leer la sección 8 (riesgos conocidos): varios conviene corregirlos **antes** de la etapa 4.

### Etapa 1 — Sandbox de Facturama — [DEV] + [PERSONA]

**Recomendado: hacerlo en una máquina o entorno de desarrollo con su propia base de datos, no en el servidor de producción.** Una factura de sandbox también queda en los libros del sistema (estado "enviada", saldo por cobrar y póliza contable) aunque no valga ante el SAT; en producción habría que limpiarla con el contador.

1. [PERSONA] Crear la cuenta sandbox y subir a ella un **CSD de prueba** (Facturama/SAT publican RFC y certificados de prueba; confirmar en su documentación si el sandbox acepta también el CSD real).
2. [DEV] En el `.env` local de `apps/api`: `PAC_PROVIDER=facturama`, `PAC_FALLBACK_TO_MOCK=0`, `FACTURAMA_USER`, `FACTURAMA_PASSWORD` de sandbox y `FACTURAMA_BASE_URL=https://apisandbox.facturama.mx`.
3. [DEV] En esa base local, capturar como emisor el **RFC de prueba** que corresponda al CSD de prueba.
4. [AUTO] `npm run pac:preflight -- --db` debe decir **ENSAYO EN SANDBOX** y solo bloquear por "apunta al ambiente de pruebas" (y, en una máquina de desarrollo, por no estar en modo producción).

### Etapa 2 — UNA factura de prueba desde una cotización — [DEV] + [PERSONA]

Ruta: cotización aceptada → proyecto de ventas cerrado → orden → factura en borrador → timbrar.

- Hoy **no hay botón** "Facturar" en la web para esta ruta: el endpoint existe (`POST /api/accounting/invoices/from-sales-project/:projectId`) pero ninguna pantalla lo llama. [DEV] lo ejecuta con un token de prueba, o se usa **Nueva factura** en `/erp/invoicing` para un borrador manual.
- Antes de timbrar, abrir el borrador y verificar **con el contador**:
  - Emisor: RFC, razón social, régimen y código postal (los que **aparecen en el borrador**).
  - Receptor: RFC, razón social, código postal fiscal, régimen y **uso de CFDI**.
  - Forma y método de pago: con `PUE` la forma no puede ser `99`; con `PPD` la forma debe ser `99` *(el sistema hoy no lo valida: ver riesgos)*.
  - Cada concepto: clave de producto/servicio y clave de unidad correctas (no las de relleno), tasa de IVA correcta (16 %, 8 % o 0 %).
- Timbrar con el botón **Timbrar CFDI** en `/erp/invoicing/<id>`. **Solo una factura.**

### Etapa 3 — Validar UUID, XML, PDF y póliza — [DEV] + [PERSONA]

Checklist (todo debe cumplirse; si algo falla, **no se pasa a producción**):

- [ ] La factura quedó en estado enviada y tiene **UUID** de 36 caracteres.
- [ ] Se descarga el **XML** (botón XML) y **no está vacío**. Es el punto más probable de falla: si viene vacío, el adaptador no está guardando el XML que devuelve Facturama (ver riesgos 1 y 2).
- [ ] En el XML: `Version="4.0"`, `Emisor`, `Receptor` (incluye `DomicilioFiscalReceptor` y `RegimenFiscalReceptor`), `UsoCFDI`, `LugarExpedicion`, `FormaPago`, `MetodoPago`, `TimbreFiscalDigital`.
- [ ] **SubTotal, IVA y Total del XML = los del borrador, al centavo.**
- [ ] El **PDF** se abre. Si el botón no aparece o dice que no hay PDF, el adaptador no lo está guardando.
- [ ] Existe la **póliza contable** de esa factura: Contabilidad → Pólizas → referencia `INV-STAMP-<id de la factura>` (Debe cuentas por cobrar por el total; Haber ingresos por el subtotal e IVA trasladado). Detalle en la sección 7.
- [ ] **Cancelar** esa factura de prueba (sección 6) y comprobar que Facturama y el sistema muestran cancelada. Si Nexara factura a crédito, repetir con una factura `PPD` y probar el **complemento de pago**.
- [ ] Revisión previa sin errores nuevos: `facturas.timbradasSinPoliza` en 0.

Los ensayos en sandbox **no** aparecen en el SAT (el sandbox no reporta), así que la consulta de estatus ante el SAT no aplica en esta etapa.

### Etapa 4 — Producción — [PERSONA] go-live fiscal, con el desarrollador

Todo lo de esta etapa es **irreversible desde el primer timbre real**. No se hace en viernes tarde ni sin el contador localizable.

1. [PERSONA] **Elegir el momento** y avisar: nadie más timbra mientras se hace la prueba real.
2. [DEV] **Respaldo** de la base de datos (`pg_dump`) antes de tocar la configuración.
3. [PERSONA] En Facturama **producción**: contrato activo, timbres disponibles y el **CSD real subido y vigente**, del mismo RFC que el emisor.
4. [PERSONA] Editar `/var/www/nexara-app/deploy/.env.nexara` (sección 3): `PAC_PROVIDER=facturama`, `PAC_FALLBACK_TO_MOCK=0`, usuario y contraseña **de producción** y `FACTURAMA_BASE_URL=https://api.facturama.mx`. Comprobar que la línea se guardó sin comillas de más ni espacios.
5. [DEV] Recrear el contenedor (sección 3, trampa 2) y comprobar `provider=facturama` en el log y que la API arrancó.
6. [AUTO] Correr la revisión con `--db`. Debe decir **LISTO PARA PRODUCCIÓN** y **cero bloqueos**. Revisar las advertencias.
7. [PERSONA] Confirmar cada punto de **verificación manual** del reporte (CSD en Facturama vigente y del mismo RFC).
8. [PERSONA] Emitir **una sola factura real** a un cliente conocido, por una operación real ya pactada, de monto normal. **No se emiten "facturas de prueba" en producción:** todas son documentos fiscales reales.
9. [PERSONA] Validar ese CFDI en el **Verificador de CFDI del SAT** (verificacfdi.facturaelectronica.sat.gob.mx) con RFC emisor, RFC receptor, total y UUID. Debe decir **Vigente**.
10. [DEV] Repetir la checklist de la etapa 3 (XML, PDF, póliza) con esa factura real.
11. [PERSONA] Enviar XML + PDF al cliente. A partir de aquí, uso normal, con la revisión previa a la mano cada vez que cambie algo (certificado renovado, contraseña, RFC).

---

## 5. Checklist final de verificación (una hoja)

| # | Verificación | Quién |
|---|---|---|
| 1 | Revisión previa: `listoParaProduccion: true`, cero bloqueos | [AUTO] |
| 2 | CSD en la cuenta de Facturama: vigente, del mismo RFC que el emisor, no es la e.firma | [PERSONA] |
| 3 | Timbres disponibles en Facturama producción | [PERSONA] |
| 4 | Datos del emisor iguales a la Constancia de Situación Fiscal | [PERSONA] |
| 5 | Razón social del cliente, RFC, CP fiscal, régimen y uso de CFDI verificados contra su Constancia | [PERSONA] |
| 6 | Claves SAT de producto/unidad y tasa de IVA revisadas por el contador | [PERSONA] |
| 7 | UUID, XML (no vacío) y PDF presentes tras timbrar | [DEV] |
| 8 | Totales del XML = totales del borrador | [DEV] |
| 9 | Póliza `INV-STAMP-<id>` creada | [DEV] |
| 10 | Estatus "Vigente" en el Verificador del SAT | [PERSONA] |
| 11 | Respaldo de base de datos hecho antes del cambio | [DEV] |
| 12 | Plan de vuelta atrás leído por ambos (sección 9) | ambos |

---

## 6. Cancelar o corregir una factura

**Regla práctica:** una factura timbrada no se "borra". Se **cancela** ante el SAT con un motivo, o se corrige con una **nota de crédito**.

| Motivo | Cuándo | Requisito |
|---|---|---|
| **01** Emitida con errores **con** relación | Se emitió mal y se va a reemplazar por otra | Primero **timbrar la factura nueva**; la cancelación pide el **UUID de la sustituta** (folio de sustitución) |
| **02** Emitida con errores **sin** relación | Error y no se va a reemplazar | Ninguno adicional |
| **03** No se llevó a cabo la operación | La venta no ocurrió | Ninguno adicional |
| **04** Operación nominativa relacionada en una factura global | Solo si se usa factura global | Ninguno adicional |

Cómo hacerlo en el sistema: `/erp/invoicing/<id>` → **Cancelar** → elegir el motivo (con `01`, capturar el UUID de la sustituta). El botón "Cancelar" del listado usa **siempre el motivo 02**: si el motivo correcto es otro, hacerlo desde el detalle de la factura.

Lo que hay que saber:

- **Aceptación del receptor.** En general, cancelar facturas de más de $1,000 pesos requiere que el cliente acepte (tiene 72 horas; si no responde, se considera aceptada). Hay excepciones. *(Confirmar con el contador.)* Mientras el cliente no responde, el SAT muestra la cancelación **en proceso**.
- **Plazo.** El SAT limita hasta cuándo se puede cancelar (en general hasta el último día de febrero del año siguiente al de emisión). *(Confirmar el plazo vigente con el contador.)*
- **El sistema marca la factura como cancelada al instante**, aunque el SAT la deje "en proceso" o el cliente la rechace (ver riesgo 6). Después de cancelar, **consultar el estatus real**: en el detalle de la factura, botón de consulta ante el SAT, o el Verificador del SAT.
- **La póliza contable no se revierte sola** (sección 7). Reversarla a mano en Contabilidad → Pólizas. Si la factura tenía cobros registrados, también hay que tratarlos.
- No se puede timbrar ni cancelar con fecha en un **periodo contable cerrado**.
- Para un descuento, devolución o ajuste **parcial** conviene una **nota de crédito** (`POST /api/accounting/invoices/:id/credit-note`, tipo Egreso relacionado al UUID original) en lugar de cancelar.

---

## 7. Póliza contable: cómo se enlaza y qué pasa si falla

- Al timbrar una factura **por cobrar**, el sistema genera la póliza **automática** con la referencia **`INV-STAMP-<id de la factura>`**: Debe cuentas por cobrar (105.01) por el total; Haber ingresos (401.01) por el subtotal e IVA trasladado (208.01) por el impuesto. La referencia es única por empresa, así que no se duplica si se reintenta.
- **Es "dispara y olvida":** si generar la póliza falla (por ejemplo, un periodo contable cerrado), el timbrado **no se revierte** —ya existe ante el SAT— y solo queda una línea en el log de la API:
  `Factura timbrada SIN póliza contable — requiere asiento manual. facturaId=… folio=… uuid=… total=…`
- **No hay ningún proceso que la detecte o la regenere.** Cómo encontrarlas: la revisión previa cuenta `facturas.timbradasSinPoliza` (con `--db`), o en el servidor `docker logs nexara-api | grep "SIN póliza"`.
- **Cómo repararla:** crear en Contabilidad el asiento equivalente con **exactamente** esa referencia (`INV-STAMP-<id>`), con la fecha de la factura y el periodo abierto.
- **Cancelación:** la póliza **no** se revierte automáticamente. Reversar (contrapóliza) a mano.
- **Cobros:** cada cobro tiene su propia póliza (`PAY-<id>`): Debe bancos, Haber cuentas por cobrar.

---

## 8. Riesgos conocidos antes de encender (para el desarrollador)

Encontrados al preparar la revisión previa. **No se corrigieron aquí**; se listan con archivo y línea. Los marcados **(alto)** conviene resolverlos o verificarlos en sandbox **antes de la etapa 4**. Todas las rutas son de `apps/api/src/`.

| # | Sev. | Dónde | Riesgo |
|---|---|---|---|
| 1 | alto | `pac/adapters/facturama.adapter.ts:165-175` | `xml: data?.Xml \|\| ''` y `pdfUrl: data?.Pdf`. La respuesta de creación de Facturama normalmente **no** trae el XML ni el PDF (se descargan con una segunda llamada con el `Id` del CFDI). Si es así, la factura queda timbrada **sin XML** y `accounting.service.ts:2552` (`getInvoiceXml`) responde "no tiene XML". **Verificar en sandbox (etapa 3).** |
| 2 | alto | `pac/adapters/facturama.adapter.ts:177-193` | La cancelación llama `DELETE /cfdi/{uuid}`, pero Facturama identifica el CFDI por su **`Id` interno**, que el adaptador no guarda. Probablemente falle o cancele mal. Además `accepted: true` está fijo (`:188`). **Verificar en sandbox.** |
| 3 | alto | `accounting/accounting.service.ts:1947-1958` | La validación de "CP fiscal del emisor" se hace **después** del `throw` de errores, así que **nunca bloquea**: sin CP del emisor el adaptador usa el CP del receptor, o `00000`, como lugar de expedición (`facturama.adapter.ts:34`). El reporte de preparación sí lo bloquea. |
| 4 | alto | `accounting/accounting.service.ts:2015-2047`, `facturama.adapter.ts:150` | Sin **tiempo límite** en la llamada al PAC. Cualquier error (incluso un corte de red **después** de que Facturama ya timbró) devuelve la factura a borrador: reintentar puede **duplicar el CFDI** ante el SAT. Y si falla al guardar el resultado (`:2023-2047`), la factura queda en `STAMPING` para siempre: ningún proceso la recupera (el estado solo se muestra como "Timbrando"). |
| 5 | alto | `accounting/accounting.service.ts:2026-2029`, `facturama.adapter.ts:167` | Si la respuesta del PAC no trae UUID, se guarda `status: 'SENT'` **sin UUID** (Prisma ignora `undefined`) y la factura ya no se puede reintentar. Falta validar que `stamp.uuid` exista. |
| 6 | alto | `accounting/accounting.service.ts:2870-2887` | `cancelInvoice` ignora `accepted`: marca `CANCELLED` aunque el SAT la deje en proceso o el receptor la rechace, y **no revierte la póliza** `INV-STAMP-<id>` ni valida que el UUID sustituto (motivo 01) exista. |
| 7 | medio | `accounting/accounting.service.ts:1932-1951`; `prisma/schema.prisma:3845-3846`; `facturama.adapter.ts:39-40` | No se valida la combinación **forma/método de pago**: `PUE` con forma `99` y `PPD` con forma distinta de `99` las rechaza el SAT. El valor por defecto de la tabla es justo `FP99` + `PUE` (inválida). |
| 8 | medio | `accounting/accounting.service.ts:1880` | `ivaRate: Number(line.tax) \|\| 16`: una línea con IVA **0 %** se factura con **16 %**. |
| 9 | medio | `accounting/accounting.service.ts:1853, 1866, 160` | Valores de relleno silenciosos al facturar desde una orden: régimen del receptor `601` si el cliente no tiene, uso de CFDI `G03` fijo y clave de producto `80101500` por defecto. Un dato fiscal inventado puede pasar el PAC y ser incorrecto. Mismo patrón en el adaptador: `facturama.adapter.ts:48, 54` (`601`/`616`). |
| 10 | medio | `accounting/accounting.service.ts:2249-2252, 115-127` | `pickSettingValue` busca por "contiene" y uno de los candidatos de razón social es `empresa`: una clave de ajuste como `empresa_rfc` o `empresa_telefono` puede tomarse como razón social del emisor. Revisar el emisor en el borrador (etapa 2). |
| 11 | medio | `accounting/accounting.service.ts:1955` | `stampInvoice` llama `getInvoiceIssuerProfile()` **sin empresa**: solo ve ajustes de plataforma o el perfil principal. Correcto con una sola empresa; incorrecto con varias. |
| 12 | medio | `pac/sat.service.ts:435-448` (usado desde `:296` y la web: `apps/web/app/(panels)/erp/invoicing/page.tsx:285-288`) | El dígito verificador del RFC usa un diccionario **incompleto** (sin `&`, sin espacio, letras desplazadas) y no rellena a las personas morales: **rechaza RFC válidos** (probado con `EKU9003173C9`, `CACX7605101P8`…). La pantalla de facturas lo muestra al salir del campo RFC. La revisión previa usa su propia implementación correcta. |
| 13 | medio | `pac/adapters/facturama.adapter.ts:102-147` | Complemento de pago no probado: usa la clave `Complemento` (la respuesta usa `Complement`), no envía los impuestos por documento relacionado que exige Pagos 2.0 y podría faltar el tipo de documento. **Probar en sandbox** antes de facturar a crédito (`PPD`). |
| 14 | medio | `pac/adapters/facturama.adapter.ts:44, 85`; ausencias | Fijos: `Exportacion=01` y `ObjetoImp=02`. No hay **IVA exento**, ni **IEPS** (el sistema lo suma al total en `accounting.service.ts:1722,1730` pero ni el adaptador ni el constructor lo emiten → total del CFDI ≠ total del ERP), ni **factura a "público en general"** (`XAXX010101000` exige nodo de información global, que no existe). |
| 15 | bajo | `pac/adapters/facturama.adapter.ts:60-64, 83-87` | Manda importes de impuestos **sin redondear** (`base * tasa`); el redondeo a centavos que sí hace el ERP (`cfdi-xml.builder.ts:43`) no se aplica en este camino. Verificar que los totales coincidan (etapa 3). |
| 16 | bajo | `accounting/accounting.service.ts:2031-2034` vs `facturama.adapter.ts:37` | El folio guardado se corta a 12 dígitos pero al PAC se manda completo; y se deriva quitando letras del número interno (`A-1` y `B-1` → `1`). |
| 17 | bajo | `pac/sat.service.ts:351-361` | La consulta de estatus ante el SAT usa un `GET` con JSON; el servicio público del SAT es un servicio web SOAP. Es probable que devuelva "Error de consulta". Usar el Verificador web del SAT mientras tanto. |
| 18 | bajo | `pac/pac.service.ts:41-44,144` | Con un `PAC_PROVIDER` mal escrito, `provider` conserva el texto pero el adaptador es mock; `getPacInfo` reporta el valor mal escrito. La revisión previa lo detecta como bloqueo. |
| 19 | informativo | `pac/cfdi-xml.builder.ts:207, 235-276, 342, 326` | Solo aplica si se cambia a **SW/Finkok** (sellado local): la cadena original omite los nodos de impuestos, el total de traslados fija 16 %, y el complemento de pago fija IVA 16 % y solo toma el primer documento. **No usar SW/Finkok sin corregir esto.** Con Facturama no se usa. |
| 20 | informativo | `apps/web/lib/sales-api.ts:1207` | No hay botón en la web para facturar desde una cotización/proyecto; `invoiceSalesProject` no se usa en ninguna pantalla. |

---

## 9. Plan de vuelta atrás

**Principio:** volver a `mock` **apaga** el timbrado nuevo; **no deshace** ningún CFDI real ya emitido. Lo timbrado en producción sigue vigente ante el SAT hasta que se cancele por el procedimiento de la sección 6.

**Antes del primer timbre real (etapas 1 a 3, o etapa 4 hasta el paso 7):** todo es reversible.

1. Editar `/var/www/nexara-app/deploy/.env.nexara`: `PAC_PROVIDER=mock`, `PAC_FALLBACK_TO_MOCK=1` (o quitar las líneas de Facturama).
2. Recrear el contenedor:
   ```bash
   cd /var/www/nexara-app
   docker compose --env-file deploy/.env.nexara -f deploy/docker-compose.nexara.yml up -d --no-build api
   ```
3. Verificar: `docker logs --tail 50 nexara-api | grep -i "PAC inicializado"` debe decir `provider=mock`, y la revisión previa debe decir **APAGADO**.
4. Con `mock` en producción el sistema **bloquea** el timbrado ("No se puede timbrar: el servicio de timbrado todavía no está conectado"): es el estado seguro. Mientras tanto, se sigue facturando en el portal del SAT como hasta hoy.

**Si la API no arranca tras el cambio** (típico: `PAC_PROVIDER=facturama` sin usuario o contraseña): restaurar el archivo de entorno a como estaba y ejecutar el mismo `up -d --no-build api`. La base de datos no se toca en ninguno de estos pasos.

**Después de emitir CFDI reales:**

- Volver a `mock` solo impide emitir más. Las facturas ya emitidas siguen existiendo ante el SAT.
- Si alguna se emitió mal: cancelarla (sección 6) o corregirla con nota de crédito, y reversar su póliza.
- Si Facturama tuvo una falla y no se sabe si timbró: **no reintentar a ciegas** (riesgo 4). Consultar primero en el panel de Facturama y en el Verificador del SAT si el UUID ya existe.

---

## 10. Referencias en el código

| Qué | Dónde (`apps/api/src/`) |
|---|---|
| Selección del proveedor y candados de producción | `pac/pac.service.ts` |
| Adaptadores | `pac/adapters/{facturama,sw,finkok,mock}.adapter.ts` |
| CSD local (solo SW/Finkok) | `pac/csd.service.ts` |
| Timbrar / cancelar / póliza | `accounting/accounting.service.ts` (`stampInvoice`, `cancelInvoice`, `autoJournalForStampedInvoice`) |
| Revisión previa (lógica pura) | `pac/pac-readiness.ts` (pruebas: `pac/pac-readiness.spec.ts`) |
| Revisión previa (servicio, endpoint, CLI) | `pac/pac-readiness.service.ts`, `pac/pac.controller.ts`, `pac/pac-preflight.cli.ts` |
| Comando | `npm run pac:preflight -- [--db] [--company <id>] [--json]` (en `apps/api`) |
| Variables en el compose | `deploy/docker-compose.nexara.yml` (bloque "CFDI / SAT / PAC"); valores en `deploy/.env.nexara` |
