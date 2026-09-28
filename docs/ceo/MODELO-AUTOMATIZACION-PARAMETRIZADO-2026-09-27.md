# Modelo de automatización parametrizado — NEXARA
**Para:** Christian (CEO) y su desarrollador · **Versión 2 · 27-sep-2026**
**Idea central:** todo tu trabajo cabe en **5 casos de uso**. Si cada uno fluye de punta a punta en el sistema, tú solo revisas y apruebas.

> **Qué cambió respecto a la v1:** la v1 describía el flujo ideal. Esta versión recorre **cada paso contra el código** y marca qué existe hoy (✅), qué existe a medias (🟡) y qué no existe (❌), y en cuáles pasos **tú apruebas** de verdad hoy y en cuáles deberías.
> Método: se analizaron tus muestras (presupuesto en formato del cliente, cotización a gobierno, anexo de licitación, licencias, materiales, cableado, PDF interno, kit de campo, nómina quincenal) y se cruzaron con los módulos.

---

## Los 5 casos de uso

### 1) VENTA / SUMINISTRO — segmento COMERCIAL
Equipo y licencias (Fortinet, ESET, Office, cámaras, switches, workstations).

| Paso | Cómo está hoy | |
|---|---|---|
| Cotización con plantilla, marca, costo y margen | 9 plantillas base, catálogo de partidas; margen sobre precio de venta (30 % por omisión con CT) | ✅ *(por cargar en tu cuenta)* |
| Revisión interna antes de enviar | Se puede pasar a otra persona con nota | ✅ |
| **Aprobación del CEO** | Sin configurar, `aprobar` y `enviar` no tienen tope (solo un descuento > 15 % dispara aprobación). **Con un tope por empresa** (hecho, opcional) una cotización que lo supera espera la autorización de dirección, que ve el importe en su bandeja | 🟡 → **falta que Christian fije el monto** |
| Envío y firma del cliente | Enlace público con firma o rechazo; vencimientos avisados | ✅ |
| Al firmar: oportunidad ganada, proyecto comercial y **pedido borrador al distribuidor (CT)** | Sí, si la cotización está ligada a una oportunidad | ✅ |
| Pedido a CT y compra | Manual; exige cotización aprobada y API de CT | 🟡 |
| OC, recepción y factura del proveedor con 3-way match | Existe; cada OC dispara aprobación (sin aprobador asignado hasta hoy) | ✅ |
| **Factura al cliente (CFDI)** | Módulo de timbrado apagado; **no existe «facturar esta cotización»** | ❌ |
| Cobro y cobranza | KPI corregido hoy; correo diario al creador; sin resumen para el CEO | 🟡 |

### 2) PROYECTO / OBRA — segmento OBRA
CCTV, redes/cableado, control de acceso, seguridad perimetral.

| Paso | Cómo está hoy | |
|---|---|---|
| Levantamiento y cotización multipartida | Plantillas CCTV, red, acceso, proyecto integral (catálogo de 53 conceptos) | ✅ |
| Cotización → proyecto | Al firmar el cliente se crea solo (oportunidad → proyecto comercial → orden → proyecto operativo, en curso al instante) | ✅ |
| Aprobación de proyecto > $500 k | Existe la regla, pero el proyecto arranca antes de que alguien la resuelva | 🟡 |
| Actividades, ingenieros, SLA, evidencias | SLA, horas extra, evidencias con revisión | ✅ |
| **Kit de herramientas de campo** | El checklist se define a mano por orden de trabajo y **bloquea iniciarla** si falta algo. El kit IDC (18 renglones) ya está como dato, falta exponerlo para cargarlo con un clic | 🟡 |
| Cierre de actividad y validación | Flujo opcional con validación del arquitecto | ✅ |
| **Factura por avance** | No existe el paso; la factura tiene campo de actividad que ningún código usa | ❌ |

### 3) PÓLIZA / SERVICIO — segmento SERVICIO
Preventivo/correctivo recurrente.

| Paso | Cómo está hoy | |
|---|---|---|
| Propuesta de póliza | Plantilla «Póliza de servicio» | ✅ |
| Contrato con frecuencia, SLA de respuesta/resolución y cuota mensual | `MaintenanceContract` | ✅ |
| Visitas programadas → orden de trabajo | Automático cada hora; reprograma la siguiente al cerrar | ✅ |
| Tickets con SLA | Alertas 1–5 min | ✅ |
| **Facturación recurrente** | No existe; la cuota solo alimenta ingresos recurrentes y portal | ❌ |

### 4) LICITACIÓN / GOBIERNO — segmento LICITACION
| Paso | Cómo está hoy | |
|---|---|---|
| Registro de la licitación (montos, garantía, fechas críticas, documentos: anexo técnico, garantía) | Módulo `Tender` con eventos | ✅ |
| Recordatorio de fechas críticas | Solo salen en calendario, **sin aviso** | ❌ |
| Cotización con anexos | Plantilla «Licitación / Gobierno»; **sin enlace a la licitación** | 🟡 |
| **Precios por rango de cantidad y por centro de entrega** (anexo con 5 rangos, MXN y USD) | No existe | ❌ |
| Fallo → contrato → ejecución | Al adjudicar crea la oportunidad ganada, **pero no el proyecto** | 🟡 |
| Fianzas | Solo un monto | 🟡 |
| Factura con uso CFDI de gobierno | Depende del timbrado | ❌ |

### 5) OPERACIÓN INTERNA — transversal
| Paso | Cómo está hoy | |
|---|---|---|
| Asistencias, retardos, extras aprobados | Checador, cierre automático, indicadores | ✅ |
| Pre-nómina del periodo | Pantalla en vivo (horas netas, extras aprobados, avisos) | ✅ |
| **Calendario quincenal (15 y último día) y aviso «lista para revisar»** | Hecho: política `payroll.schedule` y aviso dentro de «Tu día» para quien ve Pagos | ✅ *(por activar)* |
| Borradores de pago | Manual (un clic) y con **otro cálculo** de horas (brutas, con comida) | 🟡 |
| **Pagos a personal — solo CEO** | ✅ hecho hoy (por empresa); la contadora conserva Facturación | ✅ |
| Marcar pagado → póliza contable | Automático (cuenta de sueldos contra bancos), **sin paso del CEO** | 🟡 |
| CLABE/banco por empleado, layout de dispersión, ISR/IMSS, CFDI de nómina | No existen (solo CURP, RFC, NSS y alta IMSS) | ❌ |
| Compras y almacén | Requisición → RFQ → OC → recepción; mínimos/máximos | ✅ |
| Cierre contable | Checklist de bloqueos con justificación auditada | ✅ |

---

## Parámetros globales (aplican a todos)
`empresa emisora` · `cliente/receptor` · `catálogo (producto + costo + margen)` · `catálogo de partidas` · `kit de herramientas` · `plantilla de cotización` · `condiciones (garantía 90 d en instalación, IVA 16 %, moneda MXN/USD, anticipo, vigencia)` · `datos CFDI (uso, forma/método de pago, régimen, CP)` · **`umbrales de aprobación`** · **`calendario de nómina`**.

## Dónde apruebas tú (propuesta para confirmar)
| Qué | Hoy | Propuesta |
|---|---|---|
| Cotización | Cualquiera con permiso (**mecanismo de tope ya hecho**, sin activar) | Que solo lleguen a ti las de más de **$X** (montos de ejemplo: coord. de ventas hasta $50 k · Dir. de Operaciones hasta $250 k · tú desde $1 M — a confirmar) |
| Compra / OC | Cualquiera con permiso (o paso sin aprobador) | Que solo lleguen a ti las de más de **$X** (ejemplo: Dir. Administrativa hasta $25 k · tú desde $200 k) |
| Viático | Cadena por jerarquía; Dir. Admin desde $10 k; el CEO es paso final | Igual; **ya te avisan cuando llega a tu paso** |
| Gasto > $5 k | Workflow sembrado | Igual, con importe visible |
| Proyecto > $500 k | Regla sin freno real | Que el proyecto espere tu firma |
| **Pagos a personal** | ✅ solo tú | Además, que «marcar pagado» sea tuyo |
| Horas extra | Aprueba el jefe directo | Igual; tú solo ves el resumen |

## Qué falta para «todo conectado», en orden
1. **Cargar** plantillas + catálogo + kits en tu cuenta · **Activar** «Pagos solo CEO» → desplegar (desarrollador; listo).
2. **Definir topes y aprobadores** (tú) y conectarlos (desarrollador).
3. **Facturación:** botón «facturar desde cotización» + timbrado real por etapas (desarrollador + tú).
4. **Nómina quincenal:** calendario, aviso, un solo cálculo, CLABE y dispersión.
5. **Licitaciones:** precios por rango, recordatorios y enlace a cotización.
6. **Pólizas:** facturación recurrente.
7. **Importar** nómina y las 84 cotizaciones históricas por lotes.

> Con esto, cada caso queda conectado: cotizas → apruebas → proyecto/venta → compras → entregas → **factura timbrada** → cobras, con nómina y contabilidad enganchadas.
