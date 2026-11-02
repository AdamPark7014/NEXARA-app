# Cadena del negocio (Mapa de Core, Bloque A)

Una cotización ganada se volvía un callejón: «Aprobar» vivía en la pestaña Seguimiento, el proyecto se
creaba aparte con un asistente de 7 pasos y las actividades nacían sueltas. Ahora es un solo hilo:

```
Borrador → Enviada → Ganada → Proyecto → Factura → Cobro
```

## Qué hace cada pieza

| Paso | Dónde se ve | Qué hace |
| --- | --- | --- |
| ¿Cómo terminó? | Franja en la cotización enviada y columna en la lista (filtro «Por decidir») | La ganamos, La perdimos o Sigue en pláticas |
| La ganamos | `_editor/ComoTermino.tsx`, `POST cotizaciones/:id/ganar` | Aprueba, guarda cómo aceptó y crea el proyecto con las partidas como alcance |
| La perdimos | Mismo archivo, `POST cotizaciones/:id/rechazar` | Motivo de un toque; se puede retomar con versión nueva |
| Sigue en pláticas | `localStorage`, 3 días | Deja de preguntar a quien la consulta; no toca datos |
| Proyecto | `proyectos/[id]/page.tsx` | Barra completa, «Siguiente paso», «De dónde viene» y «Falta» |
| Nueva actividad | `_componentes/NuevaActividad.tsx`, `POST operational-projects/:id/activities` | Hereda cliente y proyecto; solo pregunta qué, quién y cuándo |
| Actividad suelta | `components/costos/PreguntaProyecto.tsx`, `GET costos/por-ligar/:id/sugerencia` | Pregunta una vez de qué proyecto es, solo a quien puede ligar |
| Hoy | `executive/ceo-brief.ts` | Avisa cuántas esperan respuesta y cuántas ganadas no tienen proyecto |

## Decisiones

- **«Aprobada» se muestra como «Ganada» y «Rechazada» como «Perdida».** En la base siguen `APPROVED` y
  `REJECTED`: Por facturar, compras y los avisos no cambian.
- **También cuenta un sí por WhatsApp o en persona.** Por eso existen `cotizaciones.aceptadaVia` y
  `aceptadaAt`, con `FIRMA` cuando firmó el enlace.
- **Ganar no se deshace.** Va primero porque tiene efectos (Por facturar, borrador de compra a CT). Si el
  proyecto falla después, la cotización queda ganada, se responde `errorProyecto` y se puede reintentar: la
  misma llamada crea lo que falte y no duplica si ya existe.
- **La autorización por monto se respeta.** `aprobar()` la sigue exigiendo; el diálogo enseña su mensaje y no
  crea nada.
- **Ganar crea el proyecto con `isSuperAdmin: true`.** Ganar es de quien vende y crear proyectos asignando a
  otros suele ser de quien coordina; el responsable se valida antes (activo y de la empresa).
- **Un borrador descartado también queda `REJECTED`,** pero se muestra como «Descartada» y no cuenta como
  perdida en la tira, porque nunca salió.

## Fuera a propósito

Plan de actividades con IA, marcar la partida en cada actividad, las apps del teléfono y el menú nuevo
(Bloque B). Ninguno bloquea este hilo.

## Para revisarlo sin dejar datos

Ganar no se deshace y no hay respaldos: no se prueba con cotizaciones reales. Se revisa con `window.fetch`
parchado en la pestaña (los `POST` no llegan a la API) y navegando sin recargar. El primer uso real lo hace
quien la gane de verdad.
