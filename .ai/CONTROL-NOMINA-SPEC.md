# Control de nómina semanal (pedido de Adam, 05-10-2026)

Adam pidió un «control de pagos» basado en sus dos Excel hechos a mano, **perfeccionado y mejorando la forma en
que se hace**: hoy los llena a mano (sueldo y pago por hora en $0.00, «00:00» en amarillo cuando alguien no checó,
«Oficina/Foráneo/Descanso» tecleado por día). La meta es que el sistema lo arme solo con lo que ya sabe (checadas,
horario, viáticos, horas extra, guardias, faltas, geocerca, actividades) y que la persona de nómina solo revise,
ajuste lo excepcional y cierre la semana. Reglas de negocio vigentes: jornada 10:00–18:00 L–V, comida 15:00–16:00,
gracia 15 min, jornada ordinaria 8 h netas (`kpis-equipo.ts`), zona America/Mexico_City. «Cada duda: consulta la web
o Android» (la web y el API son la verdad).

## Formato 1 — «CONTROL DE ENTRADAS Y SALIDAS» (una semana, lunes→domingo)
- Encabezado teal (#1F9E84) con logo NEXARA y el lema «Conectando ecosistemas de tecnología»; título centrado
  «CONTROL DE ENTRADAS Y SALIDAS».
- Encabezado de DOS niveles: arriba el día («LUNES» y debajo el número, p. ej. «28»), abajo ENTRADA · SALIDA · HORAS.
- Una fila por persona (NOMBRE completo en mayúsculas en su Excel), orden alfabético o por área.
- Por día: ENTRADA y SALIDA en HH:MM (primera entrada, última salida), HORAS en decimal con 2 cifras (8.00, 7.97,
  10.67). En su Excel las HORAS son salida − entrada en bruto (con la comida dentro): 10:00→18:00 = 8.00.
- Sin checada en un día laborable: «00:00 · 00:00 · 0.00» con relleno AMARILLO (falta). Sábado y domingo vacíos
  con 0.00 salvo que haya checada/guardia.
- Última columna «HORAS SEMANA TOTAL» (suma).

## Formato 2 — «CONTROL DE NOMINA NEXARA» (misma semana)
- Misma cabecera con logo y lema; título «CONTROL DE NOMINA NEXARA».
- Columnas: NOMBRE · LUNES 28 · MARTES 29 · MIÉRCOLES 30 · JUEVES 01 · VIERNES 02 · SÁBADO 03 · DOMINGO 04 ·
  HORAS TOTALES · SUELDO · PAGO X HORA · VIÁTICOS · ÁREA/ACTIVIDAD · EXTRAS/PENDIENTE · SUBTOTAL · DESCUENTOS · TOTAL,
  con autofiltro en cada encabezado y una columna de notas a la derecha («* Toda la semana asignado a …»).
- Cada día dice dónde trabajó: «Oficina», «Foráneo», «Descanso» (o vacío si no aplica).
- ÁREA/ACTIVIDAD: «Operación», «Administrativo» (según departamento/rol).
- SUBTOTAL = sueldo del periodo + viáticos + extras; TOTAL = SUBTOTAL − DESCUENTOS (en su Excel SUELDO sale en $0
  porque no lo capturan; VIÁTICOS sí: $120.00, $83.00, $509.50).

## Mejoras sobre su proceso (lo que el sistema debe hacer solo)
1. **Lugar del día automático** (Oficina / Foráneo / Descanso / Falta / Falta justificada / Guardia / Vacaciones):
   - checada con `Attendance.sitioNombre` = oficina (geocerca `sitioOficina`) → «Oficina»;
   - checada en sitio de una actividad/sucursal, o `fueraDeSitio`, o actividad del día con `branchCity` fuera de
     Puebla/zona metropolitana, o viático de HOSPEDAJE que cubra el día → «Foráneo»;
   - sábado/domingo sin checada ni guardia → «Descanso»; guardia programada (`Guardia`) → «Guardia»;
   - día laborable sin checada → «Falta» (o «Falta justificada» si hay `AttendanceJustification`, «Vacaciones/Permiso»
     si hay `LeaveRequest` aprobado);
   - **se puede corregir a mano** por celda (queda marcado como ajuste manual, con quién y cuándo).
2. **Sueldo**: viene de `UserProfile.sueldoSemanal` y se puede editar desde el control (con permiso; queda auditado).
3. **Pago por hora**: misma fórmula que la sugerencia de nómina vigente (`sugerencia-nomina.ts`, `divisorDeHorario`):
   sueldo semanal ÷ horas semanales de su horario (÷48 si no tiene horario fijo). Mostrar la fórmula.
4. **Sueldo del periodo**: proporcional a lo trabajado como la sugerencia vigente, o completo si cumplió; las faltas
   injustificadas restan su día (descuento sugerido, editable). Explicarlo en la vista.
5. **Viáticos**: suma por persona de los viáticos aprobados/pagados de la semana (por `fechaSolicitud`), con el
   desglose al pasar el mouse/abrir.
6. **Extras/pendiente**: horas extra APROBADAS (`OvertimeApproval`) × pago por hora × 2 (regla de
   `prenomina-amount.ts`); las PENDIENTES se muestran aparte como «pendiente» con enlace a aprobarlas.
7. **Descuentos**: renglones manuales (concepto + monto) más los sugeridos (faltas injustificadas); nunca automáticos
   sin que alguien los acepte.
8. **Nota de la fila**: automática cuando toda la semana estuvo asignado/foráneo en la misma obra o cliente
   («* Toda la semana asignado a Hotel Casa Azul»), editable.
9. **Semana guardada**: el control se guarda por semana (borrador → revisado → cerrado). Cerrar la semana genera
   los pagos en Borrador de «Pagos a empleados» (uno por persona, con el desglose en concepto/nota) sin duplicar si
   ya existen para ese periodo. Una semana cerrada no se edita (se puede reabrir con permiso, auditado).
10. **Excel** idéntico a sus dos formatos (dos hojas en un archivo: «Entradas y salidas» y «Nómina»), con el amarillo
    de faltas, encabezado de dos niveles, sábado/domingo siempre presentes, logo y lema; más una hoja
    «Cómo se calcula». Archivo nuevo (no modificar el tema compartido `reporte-excel.ts` salvo exportar helpers).

## Permisos
Quien hoy tiene Pagos a empleados / contabilidad (CONTABILIDAD_MANAGE) y respetando la política del módulo
`employee-payments` (en NEXARA solo el CEO): ver y editar. RH (HR_MANAGE) solo ver horas/lugar, sin montos, si la
política no le da el módulo. Arreglar de paso el hueco: `preview-period` y `prenomina/batch` no aplican la política.

## Contrato API (el agente del servidor lo implementa; el de la web lo consume)
Base `employee-payments/control-semanal` (o `nomina/control-semanal`), `semana` = lunes `YYYY-MM-DD`:
- `GET ?semana=2026-09-28` → `{ semana: {inicio, fin, estado, cerradaPor?, cerradaAt?}, dias: [{fecha, nombre:'LUNES', numero:'28'}×7],
  filas: [{ userId, nombre, area, dias: [{fecha, entrada:'10:00'|null, salida:'18:00'|null, horas: 8.0, lugar:'Oficina',
  lugarOrigen:'auto'|'manual', falta:boolean, nota?}], horasTotales, sueldo, pagoPorHora, divisorHoras, viaticos,
  viaticosDetalle:[{id, concepto, monto, estatus}], extrasMonto, extrasMinutosAprobados, extrasMinutosPendientes,
  sueldoPeriodo, descuentos:[{id, concepto, monto, sugerido:boolean}], descuentosTotal, subtotal, total, notaFila }],
  totales: {…}, formula: {pagoPorHora:'…', subtotal:'…', total:'…'} }` (montos `null` para quien no ve montos).
- `PATCH /dia` `{semana, userId, fecha, lugar|null}` (null = volver a automático).
- `PATCH /fila` `{semana, userId, notaFila?, sueldoSemanal?}`.
- `POST /descuentos` `{semana, userId, concepto, monto}` · `DELETE /descuentos/:id` · `POST /descuentos/sugeridos/aceptar` `{semana, userId}`.
- `POST /cerrar` `{semana}` → genera EmployeePayment en Borrador; `POST /reabrir` `{semana, motivo}`.
- `GET /export.xlsx?semana=…` → Excel de dos hojas.
