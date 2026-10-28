# Cumplimiento, eficiencia por complejidad y evaluador con IA — propuesta

> Estado: **propuesta para aprobación de Adam** (22-10-2026; **v2 con la fórmula general el 28-10, §7**). Nada de esto está construido salvo
> lo marcado como «ya existe». Pedido de Adam: «proteger la sistemática completa de actividades…
> cumplimiento, horas, eficiencia, que se tarden menos o más dependiendo de la complejidad… y una
> infraestructura de IA súper robusta que genere un evaluador completo».

## 0. De dónde partimos (producción, últimos 45 días)

| Dato | Valor | Qué significa |
|---|---|---|
| Actividades | 268 de 18 personas | Muestra chica: cualquier métrica necesita corrección por pocos datos |
| Con tiempo estimado | 137 (51 %) | La mitad no tiene contra qué medirse |
| Asignaciones con plan propio (`horasPlan`) | 34 de 282 (12 %) | El plan por persona casi no se usa |
| Con horas reales | 240 (85 %) | El reloj sí se usa: el tiempo real es confiable |
| Tipo (`coreKind`) | 84 % «tarea» | **La complejidad no se captura hoy en ningún lado** |
| Revisiones de evidencia | 159 aprobadas (prom. 4.71/5), 3 devueltas | Calificación inflada: casi todo es 5, así casi no distingue |

Ya existe y se reutiliza: KPIs «en tiempo y forma» (`kpis-equipo.ts`, pesos 40/25/25/10),
sesiones de reloj con tope de 12 h y cruce con la jornada, revisión de evidencia con calificación,
geocerca y fotos con GPS, cierre «No cumplida» (desde hoy), `ClaudeService` (salida JSON,
tope diario por empresa, caché de prompt).

## 1. Principios (no negociables)

1. **Los números los calcula el código, no la IA.** Cada indicador es reproducible y auditable.
   La IA clasifica (complejidad), explica, detecta patrones y propone; nunca inventa un puntaje.
2. **Cumplir en tiempo y forma manda** (regla de Adam del 07-10). El reloj es dato, no mérito.
3. **Pocos datos = poca certeza.** Con 3 actividades nadie es «100 %»: cada indicador se ajusta
   hacia el promedio del equipo según su tamaño de muestra (contracción bayesiana) y muestra su
   nivel de confianza.
4. **Toda conclusión cita evidencia** (folios de actividad, fechas). Sin evidencia no hay juicio.
5. **Un humano aprueba.** La evaluación de IA es asesoría para el jefe; ninguna decisión laboral
   (pago, sanción, despido) sale sola de ella.

## 2. Capa 1 — Proteger la sistemática (integridad de los datos)

Medir bien exige que el dato no se pueda maquillar. Reglas nuevas:

- **Complejidad obligatoria al asignar** (Básica · Estándar · Compleja · Crítica) con **tiempo
  estándar** sugerido. La IA (Haiku) la propone con título, descripción, tipo, cliente, campos de
  evidencia, herramientas y tamaño del equipo; quien asigna confirma o corrige (queda registro
  de ambas). Una vez iniciada, complejidad y estándar se congelan; cambiarlos exige motivo y
  queda en el historial.
- **Catálogo de tipos de trabajo** (p. ej. «Mantenimiento CCTV», «Instalación de control de
  acceso», «Cotización»): la IA clasifica las 268 actividades históricas para arrancar; el tiempo
  estándar de cada tipo × complejidad sale de la **mediana real** de lo ya hecho (P75 = máximo) y
  se recalcula cada mes. Así «tardó más o menos» se mide contra lo que de verdad toma ese trabajo.
- **Banderas de integridad** (se marcan, no castigan solas; el jefe las ve):
  - reloj corriendo fuera de jornada o sin actividad en sitio (sesión sin GPS/geocerca);
  - foto de evidencia repetida (misma huella digital) o tomada lejos del sitio;
  - actividad creada después de hecha (fecha de alta posterior a la de inicio);
  - reprogramaciones repetidas antes del vencimiento (patrón para esquivar «No cumplida»);
  - autoasignadas de baja complejidad que inflan el conteo (cuentan solo si un superior valida);
  - **calificación indulgente**: cada revisor se calibra contra su propio promedio (un 5 de quien
    siempre pone 5 vale menos que un 5 de quien promedia 3.8).
- **Bitácora** de todo cambio de fecha, estimado, complejidad y estatus (amplía
  `activity_schedule_changes`).

## 3. Capa 2 — Indicadores (deterministas, por persona y periodo)

| Dimensión | Indicador | Fuente |
|---|---|---|
| Cumplimiento | % entregado antes del cierre de jornada; No cumplidas y su causa | `finRealAt`, `activity_non_compliances` |
| Calidad | aprobadas a la primera; calificación **calibrada por revisor**; devoluciones | `activity_evidence_reviews` |
| Eficiencia por complejidad | Σ tiempo estándar de lo entregado ÷ Σ tiempo real trabajado (>1 = más rápido que el estándar); valores extremos recortados | sesiones + catálogo |
| Carga | horas estándar entregadas ÷ horas en jornada | ya existe («carga») |
| Dificultad asumida | puntos de complejidad entregados (Básica 1 · Estándar 2 · Compleja 4 · Crítica 8) | complejidad |
| Asistencia | puntualidad, faltas justificadas | ya existe |

**Índice compuesto 0–100** con pesos configurables por empresa. Propuesta (Adam decide):
cumplimiento 35 · calidad 25 · eficiencia por complejidad 15 · asistencia 15 · uniforme 10.
Cada número lleva su muestra (n) y su confianza (alta/media/baja).

## 4. Capa 3 — Evaluador con IA

- **Cuándo:** semanal (lunes 7:00, la semana anterior) y mensual (día 1). También a pedido del jefe.
- **Entrada** (armada por código, nunca texto libre del usuario): los indicadores de la capa 2 con
  su confianza, el detalle por actividad (tipo, complejidad, estándar vs real, a tiempo, devoluciones
  y observaciones del revisor, incumplimientos y causa), asistencia, banderas de integridad,
  tendencia contra los 3 periodos anteriores y la referencia del equipo.
- **Modelo:** Sonnet 5.5 para evaluar; Haiku 5.5 para la complejidad al asignar.
  Costo estimado: ~0.03 USD por evaluación → ~3 USD al mes para 18 personas semanal + mensual.
- **Salida (JSON con esquema):** por dimensión un nivel (Sobresaliente · Cumple · En desarrollo ·
  No cumple) con justificación que cita folios; fortalezas; áreas de mejora con una acción concreta;
  riesgos (sobrecarga, patrón de incumplimiento, banderas); recomendación para el jefe; nivel de
  confianza. Si los datos no alcanzan, lo dice en vez de opinar.
- **Ajustes propuestos, no aplicados:** p. ej. «3 de 4 No cumplidas fueron por falta de material:
  no son imputables a la persona». El jefe acepta o rechaza; el índice solo cambia con su visto bueno.
- **Flujo humano:** borrador IA → el jefe revisa, edita y aprueba → la persona la ve y puede
  comentar o impugnar → queda cerrada. Se guarda con modelo, versión del prompt, entrada exacta
  y salida (auditable, repetible).
- **Calibración mensual del equipo:** distribución de niveles por jefe para detectar quién califica
  de más o de menos.

## 5. Fases

1. **Medición base** — complejidad + estándar al asignar (con sugerencia IA), catálogo inicial desde
   el histórico, eficiencia ajustada, confianza por muestra, ficha por persona. *(la más importante)*
2. **Integridad** — banderas, calibración de revisores, bitácora ampliada.
3. **Evaluador IA** — tabla de evaluaciones, tareas semanal/mensual, pantallas jefe/persona,
   aprobación e impugnación. Web primero; apps después.
4. **Prevención** — al asignar, aviso de riesgo de incumplimiento según la carga de la persona y su
   historial con ese tipo de trabajo.

## 6. Decisiones de Adam

1. **Pesos:** ~~¿se mete la eficiencia por complejidad al índice (35/25/15/15/10) o se queda 40/25/25/10
   y la eficiencia se muestra aparte?~~ Lo reemplaza la propuesta v2 (§7, decisiones 7.4).
2. **Complejidad:** ¿la confirma quien asigna con sugerencia de la IA (recomendado) o la pone la IA sola?
3. **Visibilidad:** ¿la persona ve su evaluación una vez aprobada por su jefe (recomendado)?
4. **Cadencia:** ¿semanal + mensual (recomendado) o solo mensual?

## 7. Propuesta v2 — la fórmula general (28-10-2026, desde la base de producción)

Adam (28-10): «analiza la base de datos, qué actividades han hecho, cuáles son los parámetros de medición… siento
que no hemos llegado a la fórmula general». Se consultó producción en solo lectura (28-09 → 28-10: 319 actividades
vivas, 322 asignaciones, 15 personas, 301 sesiones de reloj). El informe con el detalle por persona es interno y
**no vive en el repo** (es público): `C:\dev\secrets\nexara\desempeno-2026-10-28\`.

### 7.1 Lo que dice la base (agregado)

| Dato | Valor | Consecuencia |
|---|---|---|
| Actividades creadas por quien las ejecuta | 280 de 322 (87 %) | La persona decide qué registra y cuándo; alta → inicio tiene mediana de 0 h |
| Límite = fin del día del inicio | 290 de 290 | «A tiempo» = «la cerró hoy»; promedio del equipo 91 % |
| Aprobadas a la primera | 171 de 174 (98 %); 83 % con 5 | Calidad sin señal; el CEO hace 140 de 182 revisiones |
| Entregas sin ninguna revisión | 112, mediana 6.8 días | El cuello de botella es revisar |
| Categoría (`ticketTypeCustom`) | 100 valores escritos a mano; «Reporte / documentación» en 82, 29 mal puestas | El tipo de trabajo no se puede usar |
| Sin tiempo estimado | 180 de 319 (56 %); real ÷ estimado mediana 0.99 | El estimado lo pone la misma persona y se acomoda |
| Cuadrilla | solo 8 asignaciones con equipo > 1 | Dos personas abren cada una su actividad para el mismo trabajo |
| Ligadas a cliente / proyecto | 29 / 0 | No hay costo por servicio |
| Cierres automáticos de salida | 37; 7 sesiones llegaron al tope de 12 h | Higiene de checada y reloj |
| Geocerca | 150 alertas, 93 abiertas, a 12 km en promedio | El radio de 100 m sobre la foto de entrada es ruido en campo |
| Comida fuera de 15–16 | 65 pendientes de revisar, casi todas de campo | La ventana no le queda a la cuadrilla |

Duración real mediana por tipo (catálogo cerrado, clasificado con qwen3.5:9b local): cableado 7 h 29, instalación
6 h 08, trámite 7 h 18, cotización 4 h 04, diseño 4 h 08, levantamiento 3 h 36, documentación 1 h 57, correctivo
1 h 57, mantenimiento 1 h 55, logística 1 h 08, almacén 47 min. **Contar actividades (el «ritmo», 20 puntos) vale
igual un día de cableado que un correo**: castiga al campo y premia fragmentar.

### 7.2 La fórmula

Unidad: **hora estándar ganada**. Cada tipo × complejidad tiene un tiempo estándar T<sub>e</sub> (mediana real del
histórico, P75 = tope, recalculado cada mes). Lo entregado y aprobado gana su T<sub>e</sub>, no su reloj.

`Índice = 30·Confiabilidad + 25·Calidad + 30·Rendimiento + 15·Disciplina`

- **Rendimiento** = Σ T<sub>e</sub> aprobado ÷ horas disponibles, contra la meta de su familia (campo 60 %, oficina
  70 %). Reemplaza ritmo, ocupación, carga y tiempo adecuado, que quedan como diagnóstico.
- **Confiabilidad** = entregadas antes de su *hora compromiso* ÷ las que vencían (No cumplidas incluidas;
  reprogramar con visto bueno antes de vencer no es falla).
- **Calidad** = 60 % aprobadas a la primera + 40 % calificación calibrada por revisor (z contra su propio
  promedio); restan incidencias y retrabajo.
- **Disciplina** = puntualidad graduada × registro completo (salida checada, comida registrada). Uniforme solo con
  ≥ 80 % de entradas revisadas.
- Contracción: `(aciertos + 8·promedio del equipo) ÷ (n + 8)`; confianza alta ≥ 20 medidas, media 10–19, baja < 10
  (no se publica).
- Lo autoasignado gana la mitad de su T<sub>e</sub> hasta que un superior lo valida.
- **Retardo** graduado contra el horario de la persona (o su primera actividad programada si es antes):
  ≤ 15 min puntual 1.0 · 16–30 leve 0.6 · 31–60 retardo 0.3 · > 60 o sin checar 0.
- **Ineficiencia** = jornada no ganada, en cinco partes: exceso sobre el P75 (persona), retrabajo (persona), sin
  trabajo registrado (persona, salvo justificación), esperas por material/acceso/personal (planeación),
  traslados (logística).
- Por rol, misma fórmula: campo, oficina técnica/administración (T<sub>e</sub> por tamaño), comercial (cotización
  por tamaño + embudo como diagnóstico) y **coordinación** (rendimiento y confiabilidad de su equipo, revisión en
  ≤ 24 h hábiles, precisión de lo que planea).

### 7.3 Antes que los pesos: arreglar el instrumento

1. Catálogo cerrado de 18 tipos y complejidad al asignar (IA sugiere por la puerta única, quien asigna confirma);
   sin «Otro» con texto libre, que hoy genera los 100 valores, y sin «Reporte / documentación» como comodín.
2. Hora compromiso fijada por quien asigna; lo autoasignado lo valida el jefe.
3. Una actividad por trabajo con su cuadrilla (sugerir sumarse a la del compañero en el mismo sitio ese día).
4. Revisión con plazo de 24 h hábiles, visible en «Hoy» de cada jefe.
5. Calibrar calificación (motivo para 5 y para < 3; promedio del revisor contra el equipo).
6. Avisos de salida sin checar (18:15) y de reloj corriendo sin movimiento (3 h).
7. Comida de campo en ventana 13–17 sin revisión; geocerca contra el sitio de la actividad y solo con sesión abierta.
8. Ligar actividad a cliente/proyecto; uniforme por muestreo (2 entradas al azar por persona por semana).

### 7.3 bis Contraste con el tabulador y la hoja de entradas (28-10)

Adam mandó el tabulador vigente y la hoja «Control de entradas y salidas» del 19–23 oct. El detalle (montos
por persona) está en el informe interno, fuera del repo. Lo que afecta al código:

- La nómina se hace en Excel: `nomina_semanas` y `overtime_approvals` están vacías. El sueldo semanal de RH
  (`UserProfile.sueldoSemanal`) coincide con el tabulador en 4 personas, difiere en 7 y falta en 8.
- La hoja y el sistema dividen distinto: el día es ÷5 en la hoja y ÷7 en `sueldoDiario`, y la extra es sencilla en
  la hoja y ×2 en `montoExtras`. `montoExtras` no aplica la triple pasando de 9 h a la semana (LFT art. 68).
- En la hoja, el campo sale de las checadas y la oficina va fija 10:00–18:00, así que los retardos de oficina no
  llegan a la nómina.
- La cuadrilla entra a las 8:00 y hace 50–53 h por semana; todos tienen la plantilla de 10:00. Hay que capturar el
  horario de campo antes de medir retardo o extra.
- La fórmula toma del tabulador las familias de rol (administrativo, arquitecto, IDC, instalador, auxiliar,
  team leader, externo) y divide el rendimiento entre las horas pagadas (ordinarias + extra).

### 7.3 ter Pagos, costo y margen (28-10)

Se revisó en producción toda la sección de Finanzas, más cotizaciones, almacén y vehículos. Casi no tiene datos:
- Hay 0 semanas de nómina, pagos al personal, extras aprobadas, facturas, cobros, compras, salidas de almacén,
  bitácoras de vehículo, encuestas e incidencias.
- Hay 1 viático y 1 gasto, los dos pendientes.
- Las 50 cotizaciones siguen en DRAFT: ninguna marcada como enviada ni ganada, y solo 2 ligadas a su actividad.

El modelo ya prevé usar esos datos:
- **Por actividad:** costo = mano de obra (horas reales × sueldo semanal ÷ 40, más la extra pagada) + viáticos
  (`viatico_repartos`) + gastos + material + vehículo. Ingreso = factura (`invoices.activityId`) o, mientras no
  exista, la cotización aprobada (`Activity.cotizacionId`). Margen = ingreso − costo, agrupado por cliente, tipo
  de trabajo y coordinador.
- **Por persona,** cada parámetro entra en las cuatro dimensiones que ya existen:
  - Disciplina financiera dentro de Disciplina: viáticos comprobados en ≤ 3 días hábiles y con ticket.
  - Comercial: rendimiento = 50 % horas estándar de cotizaciones enviadas + 50 % cierre en monto; confiabilidad =
    tiempo de respuesta.
  - Contabilidad: factura en ≤ 2 días hábiles, nómina cerrada el lunes, cobranza.
  - Coordinación: margen de los servicios de su equipo.
- Mientras no haya datos, cada parte se muestra como «sin datos» y no resta.

Orden de adopción, de lo más barato a lo más laborioso: nómina semanal en control de nómina (en paralelo con el
Excel) → cotización enviada y su resultado → viáticos y gastos por actividad con ticket → factura ligada al servicio
y sus cobros → salidas de almacén por actividad.

### 7.4 Decisiones de Adam (v2)

1. ¿«Horas estándar ganadas» en lugar de ritmo + ocupación + carga + tiempo adecuado? (recomendado: sí)
2. ¿Pesos 30/25/30/15?
3. ¿Lo autoasignado gana la mitad hasta validarse (recomendado) o nada?
4. ¿Retardos graduados (recomendado)? ¿«3 retardos = 1 falta»? Es reglamento interno, no LFT: decidir con RH.
5. ¿Coordinadores medidos por su equipo (recomendado)?
6. ¿Una sola regla de pago para la hoja y el sistema? Semana = mensual × 12 ÷ 52, el mismo divisor del día en las
   dos y extra doble/triple; revisarlo con el contador.
7. ¿Horario de campo de 08:00 a 17:00 con comida?
8. ¿La hoja de entradas sale del sistema, con ajustes con motivo, en vez de capturarse a mano?
9. ¿Se corre la nómina de la semana del 26-10 en el sistema en paralelo con el Excel?
10. ¿Para el desempeño comercial solo cuenta la cotización marcada como enviada en el sistema?
