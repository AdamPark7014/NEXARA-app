# Cumplimiento, eficiencia por complejidad y evaluador con IA — propuesta

> Estado: **propuesta para aprobación de Adam** (22-10-2026). Nada de esto está construido salvo
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

1. **Pesos:** ¿se mete la eficiencia por complejidad al índice (35/25/15/15/10) o se queda 40/25/25/10
   y la eficiencia se muestra aparte?
2. **Complejidad:** ¿la confirma quien asigna con sugerencia de la IA (recomendado) o la pone la IA sola?
3. **Visibilidad:** ¿la persona ve su evaluación una vez aprobada por su jefe (recomendado)?
4. **Cadencia:** ¿semanal + mensual (recomendado) o solo mensual?
