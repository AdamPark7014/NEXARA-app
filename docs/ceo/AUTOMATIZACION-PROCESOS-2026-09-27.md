# Automatización de procesos NEXARA
**Para:** Christian (CEO) y su desarrollador · **Versión 2 · 27-sep-2026** (verificado línea por línea contra el código del ERP)

## Conclusión
Core hace solo **mucho más** de lo que hace cualquier hoja de Excel: avisos, alertas de retraso, cierres, sincronización de precios, cotizaciones que vencen, etc. **Pero para que tú solo revises y apruebes todavía faltan cuatro conexiones**, y la más importante no es técnica sino de configuración:

1. **Tu bandeja de Aprobaciones estaba vacía** aunque el sistema generaba solicitudes: los pasos que trae de fábrica no tenían a nadie asignado. *(Corregido hoy: ya te aparecen y te llega el aviso con el importe.)*
2. **Los topes de monto no están conectados.** Cualquiera con permiso puede enviar o aprobar una cotización o una compra, de cualquier monto. Tú decides qué montos ya no necesitan tu firma y se conectan.
3. **Facturación electrónica apagada:** se factura a mano en el portal del SAT y no existe «facturar esta cotización».
4. **Nómina quincenal a medias:** se calcula la pre-nómina, pero no hay calendario de quincenas, ni aviso, ni dispersión bancaria.

> **Qué cambió respecto a la v1:** la v1 daba por automatizadas cosas que el código hace solo a medias, y no decía a qué hora corre cada cosa (algunas corrían 6 horas antes de lo que pensabas). Esta versión lo corrige, y lo que se arregló hoy está marcado.

---

## 1. Lo que el sistema hace solo (horarios reales, hora de México)

**Operación y actividades**
| Qué | Cuándo | A quién / cómo |
|---|---|---|
| SLA por vencer en 30 min y SLA vencido | Cada 1 y cada 5 min | Administradores de consola, en app y push. Solo actividades ligadas a un cliente |
| Tiempo excedido de una actividad | Cada 15 min | Responsable, jefes y CEO |
| Escalación de SLA a la cadena de mando | Cada hora | Cadena con CEO (no repite en 2 h) |
| Evidencias por revisar más de 24 h | 09:00 diario | Responsable |
| Herramientas por vencer / kits por inspeccionar | 08:00 / 08:30 diario *(corregido a hora de México)* | Titular y supervisores |
| Visitas de póliza → orden de trabajo automática | Cada hora | Se generan solas; al cerrar una visita se programa la siguiente |

**Personas**
| Qué | Cuándo | A quién / cómo |
|---|---|---|
| Cierre automático de jornadas abiertas | 23:30 diario | Sale = menor entre entrada + 9 h y 23:30; avisa a jefes y dirección |
| Avisos de comida | 14:50 y 16:05, L–V | Personal |

**Dirección**
| Qué | Cuándo | A quién / cómo |
|---|---|---|
| **«Tu día» (nuevo)** | 08:00 L–V | CEO de cada empresa, app y push; nada si no hay pendientes; una vez al día |

**Ventas y cotizaciones**
| Qué | Cuándo | A quién / cómo |
|---|---|---|
| Cotizaciones vencidas | 06:00 diario y cada 30 min | Autor, jefes y CEO (06:00); creador y dueño de la oportunidad (cada 30 min) |
| Cotizaciones por vencer | Cada hora | Creador y dueño de la oportunidad (no CEO) |
| Precios del distribuidor CT | Cada 15 min y a las 06/14/22 h | Actualiza el catálogo global; **no reprecia cotizaciones ya armadas** |

**Compras y almacén**
| Qué | Cuándo | A quién / cómo |
|---|---|---|
| OC por llegar (≤ 3 días) | 09:00 diario *(corregido: corría 03:00 hora de México)* | **Correo** al creador de la OC |
| **OC atrasadas (nuevo hoy)** | 09:30, L–V | App y push: comprador y su cadena de mando (incluye al CEO) — un solo resumen por persona |
| Stock crítico | Cada 2 h | Almacén, compras y Dir. Administrativa |
| Recalcular mínimos/máximos | 03:00 *(corregido: corría a las 21:00)* | Solo productos circulantes; avisa a almacén, compras y Dir. Admin |

**Finanzas**
| Qué | Cuándo | A quién / cómo |
|---|---|---|
| Facturas vencidas | 08:00 diario *(corregido: corría 02:00)* | **Correo** al creador de la factura, incluye cuentas por pagar, sin dedupe. No llega al CEO ni hay aviso en app. Necesita el correo de salida configurado |
| Margen de proyectos | Cada hora y 10:00 *(corregido)* | CEO y directores |
| Cierre contable con lista de bloqueos | Al cerrar | Facturas sin XML, banco sin conciliar, pólizas en borrador, pre-nómina abierta |

## 2. Lo que se dijo antes y no era exacto
| Afirmación anterior | Realidad |
|---|---|
| «La nómina se calcula sola desde las asistencias» | **Parcial.** La pantalla de pre-nómina calcula en vivo (horas netas de comida). Crear los borradores es un clic manual y usa otro cálculo (horas brutas con comida). Sin ISR, IMSS ni CFDI de nómina |
| «Recordatorios de OC (9 am)» | Era correo, solo de las que llegan en ≤ 3 días, y salía a las 03:00. Hoy 09:00 y, además, aviso de atrasadas |
| «Correo diario (8 am) de facturas vencidas» | Salía a las 02:00, solo al creador. Hoy 08:00; sigue sin llegar al CEO |
| «Alertas de SLA cada 1–5 min» | Cierto, pero solo actividades con cliente y solo a administradores |
| «Cotizaciones por vencer/vencidas» | Horarios ciertos; no llegan al CEO salvo el de las 06:00 |
| «Sincronización CT cada 15 min» | Cierto; solo si hay credenciales FTP y no reprecia cotizaciones existentes |
| «Recálculo de inventario a las 3 am» | Corría a las 21:00 hora de México |

## 3. Arreglado hoy en el código (por desplegar)
- **Tu pantalla «Hoy»** mostraba **cero facturas vencidas y cero stock bajo aunque las hubiera**: contaba un estado que nadie escribe y consultaba una tabla que no existe. Ahora las vencidas salen por fecha de vencimiento y solo de cobranza; el stock bajo, de las existencias reales; **por cobrar y por pagar ya restan lo cobrado/pagado**; las actividades «Asignada» ya cuentan como abiertas.
- **Bandeja de Aprobaciones:** los pasos sin aprobador aparecen en la bandeja de la dirección y avisan con el importe («… OC #99 por $48,250.00»). Cada solicitud muestra ahora **de qué es y de cuánto** (título, cliente/proveedor, importe) y abre la cotización en Core.
- **«Tu día» (nuevo):** cada mañana hábil a las 08:00 un solo aviso al CEO con lo que espera algo de él — aprobaciones con importe, facturas vencidas por cobrar, OC atrasadas, cotizaciones que vencen en 3 días, actividades atrasadas/por validar y, cuando cierra la quincena, «tu pre-nómina está lista»— y el mismo resumen en un panel en «Hoy». Si no hay nada, no manda nada.
- **Nómina quincenal:** el sistema ya conoce el calendario (cortes el 15 y el último día) y avisa a quien ve «Pagos a personal».
- **Topes de aprobación por monto (opcional):** cada empresa puede fijar desde qué monto una cotización o una OC necesita la autorización de dirección; sin configurar no cambia nada.
- **Menos ruido:** cada persona puede elegir «solo el resumen y lo urgente» (sin avisos de asistencias, evidencias enviadas, «se creó…»).
- **Viáticos:** el aviso llega a quien le toca el siguiente paso (el CEO al final).
- **Avisos de la mañana** (cobranza, OC, mantenimientos, margen, vehículos, herramientas, reabastecimiento) ya corren en hora de México.
- **«Pagos a personal» solo CEO** (por empresa); **aviso de OC atrasadas**; **revisión previa de facturación** y arreglos previos (dígito verificador del RFC, CP del emisor, IVA 0 %, respuesta sin UUID).

## 4. Lo que falta para «el CEO solo revisa y aprueba» (prioridad)
| # | Falta | Qué ya existe | Quién |
|---|---|---|---|
| 1 | **Definir hasta qué monto se aprueba solo** (topes de cotizaciones y compras) | **Mecanismo ya hecho** (opt-in por empresa); falta el monto. Referencia de las reglas antiguas: viáticos ≥ $10 k Dir. Admin; cotizaciones $50 k / $250 k / $1 M; compras $25 k / $200 k | **Christian decide montos** · desarrollador corre un script |
| 2 | ~~Importe en la bandeja web~~ hecho. **Aprobar cotizaciones, OC y pagos desde el celular** | Android aprueba viáticos/gastos y flujos; iOS solo viáticos | Desarrollador |
| 3 | ~~Resumen de cobranza para el CEO~~ hecho en «Tu día». Falta «trabajo cerrado sin facturar» | `activityId` en la factura | Desarrollador |
| 4 | **Botón «facturar esta cotización/proyecto»** y **timbrado real** | Módulo de timbrado completo, apagado | Desarrollador + Christian |
| 5 | **Cotización aprobada por dentro → proyecto** | Al firmar el cliente sí se crea; al aprobar internamente no | Desarrollador |
| 6 | **Nómina quincenal:** calendario de cortes, aviso «tu pre-nómina está lista», un solo cálculo de horas, CLABE/banco por empleado y layout de dispersión | Pre-nómina neta, póliza al pagar | Desarrollador + Christian (datos) |
| 7 | **Facturación recurrente de pólizas** | Contrato con cuota mensual y visitas | Desarrollador |
| 8 | **Licitaciones:** recordatorio de fechas críticas, enlazar a cotización, precios por rango | Módulo de licitaciones con fechas y documentos | Desarrollador |
| 9 | ~~Menos ruido~~ hecho como opción («solo el resumen y lo urgente»). Falta activarla para Christian si la quiere por omisión | Preferencia por persona | Christian decide |

## 5. Otras mejoras del propio sistema (`docs/erp-automation-map.md`)
**Media (P1):** resúmenes semanales de CxC/CxP · salud de webhooks · borrador automático de requisición por faltantes · recordatorio de cierre contable si hay bloqueos +3 días.
**Baja (P2):** resumen matutino de cotizaciones por vencer por vendedor · alerta si un sitio de cámaras lleva +24 h sin reportar.
**Evaluada y no implementada:** pre-nómina «pre-llenada» al cierre (ver punto 6: crear borradores solos bloquearía el cierre contable y hoy hay dos cálculos de horas distintos).

## 6. Para el desarrollador
Patrones a reutilizar: `@Cron` con `timeZone: WORKDAY_TIMEZONE`, `NotificationsService`, `NotificationHierarchyService.cadenaDeMando`, `WorkflowService` (`notifyStep`, `esAprobadorDeRespaldo`), `ModulePolicyService`. Mapa completo: `docs/erp-automation-map.md`. Facturación: `docs/CFDI-GO-LIVE.md`.
