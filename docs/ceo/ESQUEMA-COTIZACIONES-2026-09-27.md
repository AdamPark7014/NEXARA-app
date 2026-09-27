# Esquema de cotizaciones estandarizadas — NEXARA
**Para:** Christian (CEO) y su desarrollador · **Versión 2 · 27-sep-2026**
**Objetivo:** que cotizar en el sistema sea más rápido que hacerlo en Excel/Word, con el mismo formato y marca, y que Christian solo **revise y apruebe**.

> **Qué cambió respecto a la v1:** la v1 era una propuesta. Ahora las plantillas, el catálogo y el kit de campo **ya están hechos en el código** (listos para cargarse a la empresa con un comando). Además se leyeron a fondo las 8 muestras y aparecieron **siete formas distintas de cotizar**; se anota cuáles ya cubre el sistema y cuáles todavía no.

---

## 1. Lo que el sistema ya da (no hay que construirlo)
- **Marca en el PDF:** logo, banda corporativa, `ventas@nexara.com.mx`, `sales.nexara.com.mx`, garantía «Instalación Nexara: 90 días sobre mano de obra».
- **Secciones:** Portada · Objetivo · Alcance · Planos · Partidas · Términos · Firma. Cada una se puede prender o apagar por cotización.
- **Segmentos:** `COMERCIAL`, `OBRA`, `LICITACION`, `SERVICIO`.
- **Folio y versiones:** el folio es `NEX-<clave de RH>-<consecutivo de 4 dígitos por persona>` (`NXR-AAAA-######` es solo el formato antiguo). Al enviarse suma las siglas de quienes intervinieron y la revisión (`…-R2`, `…-R3`); además cada edición guarda una versión numerada. Es el equivalente de tus «V1, V2, V5».
- **Costo y margen por partida:** `unitCost` y `marginPercent`, con el margen sobre el **precio de venta** (venta = costo ÷ (1 − margen); ejemplo real: costo 3,426.84 → venta 4,895.49 = 30 %). El PDF **interno** (costo del proveedor, margen bruto e IVA) ya existe. Hay una regla global de 20 % mínimo, pero **hoy no se revisa** al crear, editar ni enviar.
- **Paquetes:** «cámara bala instalada», «cámara domo instalada», «poste de 3 m instalado» generan sus partidas y el texto de alcance juntos.
- **Precios de CT** sincronizados y motor de cotización inteligente (`smart-quote`) para partidas de distribuidor.
- **Flujo de revisión interna:** una cotización se puede pasar a otra persona («falta el precio del NVR») antes de enviarse.

## 2. Lo que quedó hecho el 27-sep (en el repositorio, por cargar en producción)
Nueve plantillas base, el catálogo maestro y el kit de campo. Todas con cantidad 1 y **precio 0** (quien cotiza los llena; nada de precios inventados), sin clientes ni folios.

| # | Plantilla | Segmento | Para qué trabajo | Anticipo |
|---|---|---|---|---|
| 1 | Suministro de equipo | COMERCIAL | Cómputo, red, periféricos, UPS sin instalación | 50 % |
| 2 | Licenciamiento | COMERCIAL | Microsoft 365, Office, ESET, por licencia y vigencia | 100 % (contado) |
| 3 | Seguridad perimetral (Fortinet) | COMERCIAL | Firewall con licenciamiento, soporte del fabricante y configuración | 50 % |
| 4 | Red estructurada (cableado) | OBRA | Nodos Cat6, certificación, paneles y rack | 50 % |
| 5 | CCTV (videovigilancia) | OBRA | Cámaras, NVR, disco, switch PoE, instalación y puesta en marcha | 50 % |
| 6 | Control de acceso | OBRA | Terminales, cerraduras o torniquetes, controlador, alta de usuarios | 50 % |
| 7 | Póliza de servicio (mantenimiento) | SERVICIO | Preventivo/correctivo recurrente, cobrado por periodo | Por periodo |
| 8 | Proyecto integral (Formato V2) | OBRA | Multi-sistema con el catálogo completo (53 conceptos, 4 familias) | 50 % |
| 9 | Licitación / Gobierno | LICITACION | Propuesta para concurso: anexos técnico y económico | Sin anticipo |

- **Catálogo maestro:** los 53 conceptos del Formato V2 en sus 4 familias (Telecomunicaciones · Respaldo de energía · CCTV/Cómputo/Pantallas/Proyección · Infraestructura), más las familias, marcas y servicios reales de la sección 5.
- **Kit de herramientas y material de campo** (18 renglones, listo para el checklist de una orden de trabajo): memoria USB, SSD, case y cable SATA, patch cord, jacks y plugs RJ45, kit de ponchado con tester, generador de tonos, multímetro, desarmadores, pinzas, teclado, mouse, cinchos y laptop.
- **Garantía:** equipos con la del fabricante (mínimo 12 meses) y **90 días en mano de obra de instalación** en toda plantilla con instalación.
- **Cómo cargarlas** (lo hace el desarrollador; primero simula, después aplica; nunca pisa lo que ya editaste): `docs/PLANTILLAS-COTIZACION-NEXARA.md` en el repositorio.

## 3. Cómo cotiza Christian en realidad (7 formatos que se ven en las muestras)

| # | Formato real | Ejemplo de la muestra | ¿Lo cubre hoy el sistema? |
|---|---|---|---|
| A | **Presupuesto en el formato del cliente** (encabezado Proyecto · Fecha · Región · RITM · Requerimiento · SP · OC; catálogo con Código/Equipo/Marca/Modelo/Cant./P.U./Importe; segunda hoja de **levantamiento** por zona con la cantidad de cámaras por modelo) | «Formato Cotización V2» (CCTV para un cliente corporativo) | **Parcial.** Plantilla «Proyecto integral» sí. Faltan dónde guardar RITM/SP/OC/Región (no hay campos; hoy irían en el texto) y el código por partida. |
| B | **Venta a gobierno multi-sede**: una partida de equipo y una de licencia por cada sede, total de ~2.4 M | «Cotización Fortinet V5» (Poder Judicial) | **Parcial.** Plantilla «Seguridad perimetral»; falta agrupar partidas **por sede** con subtotal por sede. |
| C | **Anexo de licitación con precios escalonados**: cinco rangos de cantidad (mín./máx./precio) por centro de entrega, en MXN y en USD, ~870 filas | «Anexo 2. Formato de cotización» | **No.** El sistema tiene un solo precio por partida. Es la brecha más grande para licitaciones. |
| D | **Licencias con precio público y precio de compra** (proveedor, ahorro por 2 años) | «Cotización de licencias Office/ESET» | **Sí** (partida con costo y margen). Falta capturar «proveedor» por partida visible en el PDF interno. |
| E | **Materiales + descripción técnica + personal y días** (técnico, auxiliar, 3 días) para fabricar e instalar; incluye mantenimiento correctivo | «Cotización ARTA» | **Parcial.** Se cubre con Materiales + Mano de obra; los «personal × días» no son un campo. |
| F | **Cableado por planta** (Planta baja, alta…), nodos certificados, rack, organizadores, PDU, condiciones de pago «contado» y fecha de vencimiento | «Cotización Cableado Cancún» (10 páginas) | **Parcial.** Plantilla «Red estructurada»; falta agrupar por planta/área. |
| G | **Documento interno con costo, margen e IVA** | «NXR-2026-351119 interno» | **Sí.** |

## 4. Reglas del negocio (parámetros que ya viven en las plantillas)
| Parámetro | Valor |
|---|---|
| Emisor | New Engineering Expertise And Resource Advancement S.A. de C.V. (RFC NEE240925V73) |
| Moneda / IVA | MXN, IVA 16 % (USD disponible con nota de tipo de cambio) |
| Anticipo por omisión | Comercial 50 % · Obra 50 % · Licencias 100 % · Póliza por periodo · Licitación 0 % |
| Vigencia por omisión | 15 días (30 en licitación) |
| Garantía | Fabricante en equipos; 90 días en instalación |
| Margen | Sobre el precio de venta, por partida (30 % por omisión con CT; regla global de 20 % mínimo, sin conectar) |
| Grupos del PDF técnico | Equipos · Materiales · Mano de obra (con subtotal) |

## 5. Catálogo real (minado de 331 documentos; frecuencia = qué tanto cotizas)
| Familia | Marcas / conceptos (por frecuencia) |
|---|---|
| CCTV / Videovigilancia | Hikvision (170), HiLook, Hanwha, Dahua, Axis, Bosch, Honeywell — domo/bullet/PTZ, NVR (123)/DVR |
| Cómputo / Servidores | **Lenovo (399)**, Dell — workstations, servidores |
| Pantallas / Proyección / Videowall | Samsung (61), Epson, Yealink — videowall (95) |
| Redes / Cableado | Cisco (48), UniFi/Ubiquiti (40), Meraki, Aruba, TP-Link, Grandstream, Panduit — switch (285), **fibra (599)**, Cat6 (184), nodos, rack (407) |
| Energía | APC — UPS (109) |
| Almacenamiento | Western Digital (27) |
| Licencias / Software | Microsoft/Office (54), ESET (26), Kaspersky, Sophos — **licencia (445)** |
| Seguridad perimetral | Fortinet/FortiGate (23), SonicWall |
| Telefonía / VoIP | Yealink (16), Grandstream, 3CX — conmutador (38) |
| Control de acceso | torniquete (68), biométrico |
| Detección | alarma (168), incendio (115) |
| Satelital | Starlink (13) |

**Servicios:** mano de obra (483), instalación (276), soporte (184), mantenimiento (145), configuración (113), capacitación (17), póliza.

## 6. Brechas para que cotizar quede «a la perfección» (orden sugerido)
1. **Precios escalonados por cantidad y centro de entrega** (formato C). Sin esto, las licitaciones de gobierno se siguen llenando a mano en Excel.
2. **Partidas agrupadas por sede / planta / área** con subtotal (formatos B y F).
3. **Referencias del cliente en la cotización:** RITM, SP, OC, región y proyecto del cliente (formato A). Un campo tipo «referencias» que salga en la portada.
4. **Botón «crear factura desde esta cotización»** (hoy no existe en la web) y «convertir en proyecto» — es lo que cierra el ciclo cotización → cobro.
5. **Importar cotizaciones históricas** (84 archivos locales): empezar por las recientes (Fortinet V5, Cancún, Licencias, ARTA) para validar el formato, después el resto por lote. Se necesita que Christian entregue los archivos.
6. Mostrar **proveedor y costo** en la vista interna de cada partida y un **«ahorro por 2 años»** para licencias multi-año.

## 7. Cómo debe usarlo Christian (con el sistema ya cargado)
1. Alguien del equipo elige la plantilla, escribe el cliente y llena cantidades y precios.
2. Se pasa a revisión interna si falta algo.
3. **Christian revisa el PDF interno (costo, margen, total) y aprueba.** Hoy `aprobar` y `enviar` **no tienen tope de monto ni de rol**: solo un descuento mayor a 15 % pasa por la bandeja de Aprobaciones. Los topes propuestos ($50 k coordinación de ventas · $250 k Dirección de Operaciones · $1 M CEO) están escritos pero sin conectar; Christian confirma los montos.
4. Se envía al cliente con un enlace donde puede **firmar o rechazar**; el sistema avisa de las que están por vencer (al creador y al dueño de la oportunidad) y de las vencidas (a las 06:00 también al CEO).
5. **Al firmar el cliente** (y si la cotización está ligada a una oportunidad) se crea solo: oportunidad ganada → proyecto comercial → proyecto operativo y un **pedido borrador al distribuidor (CT)**. La aprobación interna solo dispara el borrador a CT y la actividad; **no crea el proyecto** (pendiente). **La factura no sale de la cotización** (pendiente).
