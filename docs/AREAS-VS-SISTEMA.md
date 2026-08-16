# Las cinco áreas del organigrama frente al sistema

Contraste entre lo que hace cada área según el organigrama de NEXARA y lo que el
ERP soporta hoy. Cada hueco está verificado contra el esquema o el código, no
supuesto.

Leyenda: **✅ cubierto** · **⚠️ parcial** · **❌ no existe**

---

## 1. Dirección General — Christian Eduardo del Pozo Sánchez

| Necesidad | Estado |
|---|---|
| Vista ejecutiva del negocio | ✅ `executive` + `analytics/bi/executive` |
| KPIs fiables | ✅ *ahora* — leían cero por el estatus partido; corregido e instrumentado |
| Cadena de reporte del organigrama | ⚠️ solo `User.managerId`, un árbol plano |

**El hueco:** el organigrama define una cadena explícita —Ingeniería → Arquitecto
→ Administración → Dirección— y el sistema solo tiene "quién es tu jefe". No hay
forma de expresar que un reporte de servicio **sube por esos tres escalones**, ni
de saber en cuál está detenido.

---

## 2. Administración — Karen Elizalde · Mónica García

| Responsabilidad | Estado |
|---|---|
| Facturación | ✅ `Invoice` + timbrado CFDI/PAC |
| Cotizaciones | ✅ `Cotizacion` (y ahora con mano de obra facturable) |
| Seguimiento a clientes | ✅ `SalesClient` + CRM |
| Control documental | ✅ `ManagedDocument`, `DocumentCategory`, `DocumentVersion` |
| **Compras con Mayorista** | ❌ |

**El hueco:** cero coincidencias de `mayorista`/`wholesale`/`distribuidor` en todo
el esquema. Existe `Supplier` y `PurchaseOrder` genéricos, sin distinguir al
mayorista del proveedor puntual: no hay condiciones de crédito, niveles de precio
por volumen ni tiempos de entrega pactados. Comprar a mayorista —que el
organigrama nombra como función propia— se hace hoy como cualquier otra compra.

---

## 3. Operaciones — Luis Joel Aguilar · David Morales

| Responsabilidad | Estado |
|---|---|
| Planificación de servicios | ✅ calendario + contratos de mantenimiento |
| Seguimiento de proyectos | ✅ `OperationalProject` |
| Reportes de campo | ✅ `ServiceSheet` |
| **Asignación de personal** | ⚠️ un solo `responsableId` |
| **Control de materiales** | ❌ |

**Los dos huecos, y son los más caros:**

**Asignación de personal.** `Activity.responsableId` es uno solo. Una instalación
de CCTV con tres técnicos se registra con un responsable y los otros dos no
figuran en ninguna parte: ni sus horas, ni sus viáticos, ni su presencia en la
evidencia.

**Control de materiales.** `StockMovement` tiene `productionOrderId` pero **no
`activityId`**. Es imposible responder *"¿qué material consumió este servicio?"*
— justo lo que el organigrama pone como función de Luis y David, y justo lo que
Ingeniería debe enviar según la caja "SE ENVÍA: Material utilizado".

Sin ese enlace tampoco se puede calcular el costo real de una actividad ni el
margen verdadero del proyecto.

---

## 4. Arquitecto — Josué Teodulo Cervantes

| Responsabilidad | Estado |
|---|---|
| Diseño y planeación de proyectos | ✅ |
| Supervisión de operaciones | ✅ vía alcance jerárquico |
| **Validación final de trabajos** | ❌ |

**El hueco más importante de todo el análisis.** El organigrama lo dice dos
veces: *"Validación final de trabajos"* entre sus funciones, y en el flujo diario
*"Josué valida y envía a Administración y Dirección"* (17:00–18:00).

Ese paso **no existe en el sistema**. Hoy la actividad se cierra **sola** en
cuanto están todas las evidencias (`service-sheets.service.ts`): pasa a
`Finalizada` sin que nadie la valide. El control de calidad que la empresa tiene
en su organigrama no está implementado.

Es además el que menos cuesta cerrar: el motor de aprobaciones ya está enchufado
al cierre (Fase 8), así que basta con definir un flujo `ACTIVITY_CLOSURE` con
Josué como aprobador del paso 1 — sin tocar el esquema.

---

## 5. Área Creativa — Daniela Galindo Almazán

| Responsabilidad | Estado |
|---|---|
| Publicaciones en redes | ✅ `SocialPost` (red, contenido, media, programación, estado) |
| Diseño / branding / foto y video | ✅ vía gestión de contenido y `/uploads` |
| Permisos sobre el contenido | ✅ *ahora* — antes lo editaba cualquier empleado |
| **Métricas de publicaciones** | ❌ |

**El hueco:** `SocialPost` no tiene un solo campo de resultado —ni impresiones,
ni alcance, ni interacción, ni clics—. El flujo diario dice *"Creativa envía
métricas y avances"* a las 17:00, pero no hay dónde registrarlas: hoy solo se
puede decir que algo se publicó, no cómo funcionó.

---

## 6. Ingeniería — los 8 técnicos

| Responsabilidad | Estado |
|---|---|
| Instalaciones y mantenimiento | ✅ |
| Evidencias fotográficas | ✅ `Evidence` + flujo de evidencia |
| Reportes de servicio | ✅ `ServiceSheet` |
| Cuidado de herramientas | ✅ bien modelado: 6 modelos de herramienta |

De la caja **"SE ENVÍA"** del organigrama, siete conceptos:

| Concepto | Estado |
|---|---|
| Reportes de servicio | ✅ |
| Evidencias fotográficas | ✅ |
| Avances de proyectos | ✅ |
| Observaciones | ✅ campo en la hoja de servicio |
| **Material utilizado** | ❌ sin enlace movimiento↔actividad |
| **Incidencias / Problemas** | ⚠️ sin tipificar; van en texto libre |
| **Recomendaciones** | ⚠️ sin campo propio |

---

## 7. El ritmo de trabajo — no existe en el sistema

El organigrama describe cómo opera la empresa día a día y semana a semana:

- **10:00** reunión diaria: agenda, prioridades, servicios programados, materiales
- **10:15–17:00** ejecución
- **17:00–18:00** cierre y reportes
- **Lunes** planeación semanal · **Miércoles** revisión de avances · **Viernes**
  junta de cierre con resultados, problemas y lecciones aprendidas

**Nada de esto está modelado.** No hay modelo de reunión, agenda ni acta —cero
coincidencias en el esquema—. El pulso operativo de NEXARA vive fuera del ERP,
así que los acuerdos, las lecciones aprendidas y las metas semanales no quedan
ligados a las actividades y proyectos a los que se refieren.

---

## Estado

| # | Qué | Área | Estado |
|---|---|---|---|
| 1 | **Validación del Arquitecto** al cerrar actividad | Arquitecto | Código listo · **falta activar el flujo** |
| 2 | **Material por actividad** (`StockMovement.activityId`) | Operaciones | ✅ desplegado |
| 3 | **Multi-asignación** de técnicos | Operaciones | ✅ desplegado |
| 4 | **Métricas de publicación** | Creativa | ✅ desplegado |
| 5 | **Mayorista**: condiciones de crédito y precio por volumen | Administración | ✅ desplegado |
| 6 | **Incidencias y recomendaciones** tipificadas | Ingeniería | ✅ desplegado |
| 7 | **Ritmo operativo**: reuniones, acuerdos, junta de cierre | Todas | ✅ desplegado |

El punto 1 **no depende del código**: la infraestructura está puesta y probada,
pero encenderla cambia cómo cierran su trabajo los 8 técnicos, así que espera a
que se decida el momento y se avise al equipo. Basta con crear un
`WorkflowDefinition` con `entityType = ACTIVITY_CLOSURE` y al Arquitecto como
aprobador del paso 1.

---

## Decisiones de negocio tomadas al implementar

Se dejan por escrito porque no se deducen del código y condicionan lo demás:

- **La mano de obra se factura.** `calculateLine()` cobra
  `producto + horas × tarifa`; antes las horas se capturaban y no llegaban al
  total.
- **Los viáticos son individuales.** Cada asignado solicita los suyos
  (`Viatico.usuarioId` + `actividadId`); no se prorratean. Al reasignar, quien
  entra genera los suyos y los del anterior quedan a su nombre.
- **Reasignar reinicia `fechaAsignacion`.** Si no, el SLA seguiría midiendo
  desde una asignación que ya no corresponde a nadie, y ese número alimenta los
  informes de incumplimiento.
- **El responsable anterior permanece como APOYO**, salvo que se pida
  retirarlo: conserva el contexto del trabajo hecho.
- **El escalón por volumen no se suma al descuento de convenio.** El escalón ya
  es el precio negociado para ese volumen; encimarle el descuento lo contaría
  dos veces.
- **El crédito avisa, no bloquea.** Rebasar el límite del mayorista genera un
  aviso visible para quien autoriza; la orden sigue siendo posible porque a
  veces urge, y el flujo de autorización de OC ya existe.
- **Un acuerdo exige responsable; una lección aprendida y un riesgo, no.** Un
  acuerdo sin dueño es un deseo, y es lo que vuelve inútil la junta del viernes.
- **"Vencido" se calcula, no se guarda.** Una bandera almacenada exige un cron
  que la refresque y queda mintiendo el día que ese cron falla.
