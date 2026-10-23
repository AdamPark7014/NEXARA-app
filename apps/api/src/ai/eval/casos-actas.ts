/**
 * Casos del eval del acta de reunión. Cada escenario trae el guion con el que se generó su
 * transcripción (`transcripciones/<id>.txt`, ver `generar-transcripciones.ts`) y la verdad
 * contra la que se califica: acuerdos (responsable y fecha), decisiones y pendientes sin
 * dueño. Fechas en AAAA-MM-DD calculadas desde la fecha de la reunión.
 */
export type TipoAcuerdo = 'ACUERDO' | 'LECCION' | 'RIESGO';

export type AcuerdoEsperado = {
  descripcion: string;
  /** Ids aceptables (catálogo); [null] = nadie de la empresa. */
  responsableId: Array<number | null>;
  /** Si nadie de la empresa: texto que debe conservar (p. ej. un contacto del cliente). */
  textoResponsable?: string;
  fecha: Array<string | null>;
  tipo: TipoAcuerdo;
  /** Palabras que la transcripción debe contener (revisión del generador). */
  pistas: string[];
};

export type EscenarioActa = {
  id: string;
  titulo: string;
  /** Fecha de la reunión (AAAA-MM-DD). */
  fecha: string;
  asistentesIds: number[];
  agenda?: string;
  minutos: number;
  /** whisper: texto corrido del transcriptor, sin hablantes. vtt: «Nombre: texto» por línea. notas: apuntes. */
  formato: 'whisper' | 'vtt' | 'notas';
  guion: string;
  acuerdos: AcuerdoEsperado[];
  decisiones: string[];
  pendientesSinDueno: string[];
  /** Lo que NO debe salir como acuerdo, decisión ni pendiente. */
  noDebe: string[];
};

export const ESCENARIOS_ACTA: EscenarioActa[] = [
  {
    id: 'r01',
    titulo: 'Arranque diario de soporte',
    fecha: '2026-10-19',
    asistentesIds: [11, 1, 3, 9, 2],
    minutos: 5,
    formato: 'whisper',
    guion: `Junta rápida de pie al inicio del día (lunes). Roberto (le dicen Beto) reparte el trabajo.
- Roberto le pide a Luis que vaya hoy a Bodegas Luna Angelópolis porque el DVR de la caja no graba. Luis dice «sí, voy saliendo de aquí».
- Roberto le pide a Toño Vázquez (Antonio Vázquez) que mañana cambie la fuente de poder de la cámara 4 del Colegio Andes. Toño acepta.
- Carolina dice que ella confirma con el Hospital San Rafael la visita del preventivo para el jueves.
- Deciden posponer la visita al Hotel Real hasta que llegue el material (lo dice Roberto y todos están de acuerdo).
- Alguien comenta que hay que actualizar el inventario de discos duros, pero nadie lo toma y cambian de tema.
- Bromas cortas sobre el tráfico y el café.`,
    acuerdos: [
      { descripcion: 'Revisar el DVR que no graba en Bodegas Luna Angelópolis', responsableId: [3], fecha: ['2026-10-19'], tipo: 'ACUERDO', pistas: ['DVR', 'Angelópolis'] },
      { descripcion: 'Cambiar la fuente de poder de la cámara 4 del Colegio Andes', responsableId: [9], fecha: ['2026-10-20'], tipo: 'ACUERDO', pistas: ['fuente', 'Andes'] },
      { descripcion: 'Confirmar con Hospital San Rafael la visita del preventivo', responsableId: [2], fecha: ['2026-10-19', '2026-10-22'], tipo: 'ACUERDO', pistas: ['San Rafael', 'jueves'] },
    ],
    decisiones: ['Posponer la visita al Hotel Real hasta que llegue el material'],
    pendientesSinDueno: ['Actualizar el inventario de discos duros'],
    noDebe: [],
  },
  {
    id: 'r02',
    titulo: 'Llamada con Hospital San Rafael',
    fecha: '2026-10-14',
    asistentesIds: [2, 11],
    minutos: 8,
    formato: 'notas',
    guion: `Apuntes que Carolina tecleó rápido durante una llamada con el jefe de mantenimiento del hospital (ing. Ochoa). Abreviaturas, sin acentos a veces, viñetas.
- Cliente molesto: la semana pasada urgencias se quedó sin cámaras 6 horas.
- Roberto se compromete a enviar la propuesta para cambiar 6 cámaras analógicas a IP a más tardar el lunes.
- Carolina agenda el preventivo trimestral para la primera semana de noviembre.
- Ochoa advierte que si urgencias se vuelve a quedar sin cámaras podrían rescindir el contrato (riesgo).
- Se acuerda cobrar la visita de emergencia del 10 de octubre a mitad de precio (decisión).
- Queda pendiente averiguar quién tiene la llave del site del 3er piso (nadie lo toma).`,
    acuerdos: [
      { descripcion: 'Enviar propuesta para cambiar 6 cámaras analógicas a IP', responsableId: [11], fecha: ['2026-10-19'], tipo: 'ACUERDO', pistas: ['IP', 'lunes'] },
      { descripcion: 'Agendar el preventivo trimestral', responsableId: [2], fecha: [null, '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'], tipo: 'ACUERDO', pistas: ['preventivo', 'noviembre'] },
      { descripcion: 'Si urgencias vuelve a quedarse sin cámaras el cliente podría rescindir el contrato', responsableId: [null], fecha: [null], tipo: 'RIESGO', pistas: ['rescindir'] },
    ],
    decisiones: ['Cobrar la visita de emergencia del 10 de octubre a mitad de precio'],
    pendientesSinDueno: ['Averiguar quién tiene la llave del site del 3er piso'],
    noDebe: [],
  },
  {
    id: 'r03',
    titulo: 'Revisión semanal de operaciones',
    fecha: '2026-10-12',
    asistentesIds: [12, 2, 11, 5, 7],
    minutos: 10,
    formato: 'whisper',
    guion: `Revisión semanal (lunes) que dirige Adriana.
- Jorge pedirá al proveedor 2 bobinas de cable UTP categoría 6, a más tardar el miércoles.
- Ricardo mandará el reporte de avance de la obra del CEDIS de Tox el viernes.
- Carolina cerrará los 4 tickets vencidos de Bodegas Luna antes del jueves.
- Lección: la semana pasada se perdieron las fotos de evidencia de Atlixco porque no se subieron el mismo día; las fotos se suben el mismo día.
- Adriana decide que desde hoy toda salida a campo se registra en NEXARA antes de salir.
- Alguien pregunta por los uniformes nuevos; nadie se hace cargo.`,
    acuerdos: [
      { descripcion: 'Pedir 2 bobinas de cable UTP categoría 6 al proveedor', responsableId: [7], fecha: ['2026-10-14'], tipo: 'ACUERDO', pistas: ['bobinas', 'miércoles'] },
      { descripcion: 'Enviar el reporte de avance de la obra del CEDIS de Tox', responsableId: [5], fecha: ['2026-10-16'], tipo: 'ACUERDO', pistas: ['reporte', 'viernes'] },
      { descripcion: 'Cerrar los 4 tickets vencidos de Bodegas Luna', responsableId: [2], fecha: ['2026-10-14', '2026-10-15'], tipo: 'ACUERDO', pistas: ['tickets', 'jueves'] },
      { descripcion: 'Subir las fotos de evidencia el mismo día', responsableId: [null], fecha: [null], tipo: 'LECCION', pistas: ['fotos', 'Atlixco'] },
    ],
    decisiones: ['Toda salida a campo se registra en NEXARA antes de salir'],
    pendientesSinDueno: ['Ver lo de los uniformes nuevos'],
    noDebe: [],
  },
  {
    id: 'r04',
    titulo: 'Seguimiento obra CEDIS Tox',
    fecha: '2026-10-07',
    asistentesIds: [5, 6, 12, 7],
    minutos: 12,
    formato: 'whisper',
    guion: `Seguimiento de la obra de videovigilancia del CEDIS de Grupo Tox (miércoles).
- Jorge informa que el proveedor de cámaras PTZ avisó un retraso de 3 semanas. Adriana: «Jorge, tú vigila ese tema con el proveedor». Es un riesgo para la obra.
- Deciden instalar primero las cámaras fijas mientras llegan las PTZ.
- Diana entregará los planos as-built de la nave 1 el viernes 16.
- Ricardo conseguirá 2 técnicos más para cablear la nave 2, a partir del lunes.
- Lección: hay que pedir el levantamiento de alturas antes de cotizar; en la nave 1 faltaron andamios.
- Queda en el aire confirmar con Tox si se puede trabajar de noche; nadie lo toma.
- Ruido de obra, interrupciones, alguien contesta el teléfono.`,
    acuerdos: [
      { descripcion: 'Vigilar el retraso de 3 semanas del proveedor de cámaras PTZ', responsableId: [7], fecha: [null], tipo: 'RIESGO', pistas: ['PTZ', 'semanas'] },
      { descripcion: 'Entregar los planos as-built de la nave 1', responsableId: [6], fecha: ['2026-10-16'], tipo: 'ACUERDO', pistas: ['planos', '16'] },
      { descripcion: 'Conseguir 2 técnicos más para cablear la nave 2', responsableId: [5], fecha: ['2026-10-12'], tipo: 'ACUERDO', pistas: ['técnicos', 'lunes'] },
      { descripcion: 'Pedir el levantamiento de alturas antes de cotizar', responsableId: [null], fecha: [null], tipo: 'LECCION', pistas: ['andamios'] },
    ],
    decisiones: ['Instalar primero las cámaras fijas mientras llegan las PTZ'],
    pendientesSinDueno: ['Confirmar con Tox si se puede trabajar de noche'],
    noDebe: [],
  },
  {
    id: 'r05',
    titulo: 'Junta comercial semanal',
    fecha: '2026-10-09',
    asistentesIds: [12, 4, 8, 6],
    minutos: 15,
    formato: 'vtt',
    guion: `Videollamada comercial (viernes). Transcripción de la plataforma con el nombre de quien habla al inicio de cada línea.
- Empiezan platicando del partido del Puebla del miércoles (2-1); no es tema de trabajo.
- María Fernanda enviará la cotización de control de acceso al Colegio Andes el martes.
- Diana hará el levantamiento en el Hotel Real de Cholula el miércoles 14.
- Alejandra revisará con contabilidad las facturas vencidas de Bodegas Luna antes de fin de mes.
- Adriana decide que el descuento máximo sin autorización de dirección es 8 %.
- María Fernanda comenta que Grupo Tox está cotizando con otro integrador y que si no bajamos precio podemos perder la ampliación (riesgo). Nadie toma una acción.
- Alguien propone dar 15 % de descuento a Tox; Adriana lo rechaza.
- Queda pendiente actualizar el catálogo de precios de 2027; nadie lo toma.`,
    acuerdos: [
      { descripcion: 'Enviar la cotización de control de acceso al Colegio Andes', responsableId: [4], fecha: ['2026-10-13'], tipo: 'ACUERDO', pistas: ['cotización', 'martes'] },
      { descripcion: 'Hacer el levantamiento en el Hotel Real de Cholula', responsableId: [6], fecha: ['2026-10-14'], tipo: 'ACUERDO', pistas: ['levantamiento', '14'] },
      { descripcion: 'Revisar con contabilidad las facturas vencidas de Bodegas Luna', responsableId: [8], fecha: ['2026-10-30', '2026-10-31'], tipo: 'ACUERDO', pistas: ['facturas', 'fin de mes'] },
      { descripcion: 'Grupo Tox cotiza con otro integrador: riesgo de perder la ampliación', responsableId: [null, 4], fecha: [null], tipo: 'RIESGO', pistas: ['integrador', 'ampliación'] },
    ],
    decisiones: ['El descuento máximo sin autorización de dirección es 8 %'],
    pendientesSinDueno: ['Actualizar el catálogo de precios de 2027'],
    noDebe: ['Dar 15 % de descuento a Tox (se rechazó)', 'Cualquier cosa del partido del Puebla'],
  },
  {
    id: 'r06',
    titulo: 'Coordinación Hotel Real de Cholula',
    fecha: '2026-10-15',
    asistentesIds: [6, 5, 11],
    agenda: 'Diseño de red, canalización y acceso remoto',
    minutos: 15,
    formato: 'vtt',
    guion: `Videollamada (jueves) con el ingeniero Salazar, jefe de mantenimiento del hotel (es del cliente, no de NEXARA). Líneas con el nombre de quien habla; Salazar aparece como «Ing. Salazar (Hotel Real)».
- Salazar se compromete a mandar los planos arquitectónicos actualizados mañana.
- Diana entregará el diseño de red con las VLAN en dos semanas.
- Ricardo programará la instalación de la canalización a partir del 3 de noviembre.
- Roberto configurará el acceso remoto al NVR para el hotel el lunes.
- Deciden usar switches PoE de 24 puertos en cada piso.
- Falta definir quién del hotel recibirá la capacitación; nadie lo resuelve.`,
    acuerdos: [
      { descripcion: 'Mandar los planos arquitectónicos actualizados', responsableId: [null], textoResponsable: 'Salazar', fecha: ['2026-10-16'], tipo: 'ACUERDO', pistas: ['Salazar', 'planos'] },
      { descripcion: 'Entregar el diseño de red con VLAN', responsableId: [6], fecha: ['2026-10-29'], tipo: 'ACUERDO', pistas: ['VLAN', 'dos semanas'] },
      { descripcion: 'Programar la instalación de la canalización', responsableId: [5], fecha: ['2026-11-03'], tipo: 'ACUERDO', pistas: ['canalización', 'noviembre'] },
      { descripcion: 'Configurar el acceso remoto al NVR del hotel', responsableId: [11], fecha: ['2026-10-19'], tipo: 'ACUERDO', pistas: ['remoto', 'lunes'] },
    ],
    decisiones: ['Usar switches PoE de 24 puertos en cada piso'],
    pendientesSinDueno: ['Definir quién del hotel recibirá la capacitación'],
    noDebe: [],
  },
  {
    id: 'r07',
    titulo: 'Pendientes de almacén',
    fecha: '2026-10-16',
    asistentesIds: [7, 8, 2],
    minutos: 18,
    formato: 'whisper',
    guion: `Junta de almacén (viernes). Mucha lista de cosas por hacer que nadie toma.
- Jorge hará el inventario físico de cámaras el sábado.
- Alejandra pagará al proveedor de cable el martes.
- Deciden que ningún equipo sale del almacén sin vale firmado.
- Lección: el robo de herramienta de septiembre pasó porque el almacén se quedó abierto a la hora de la comida.
- Se mencionan y nadie toma: etiquetar los equipos en garantía; tirar el material dañado del fondo; revisar las cotizaciones de racks; conseguir un no-break para el site de la oficina.
- Divagan sobre el estacionamiento y el clima.`,
    acuerdos: [
      { descripcion: 'Hacer el inventario físico de cámaras', responsableId: [7], fecha: ['2026-10-17'], tipo: 'ACUERDO', pistas: ['inventario', 'sábado'] },
      { descripcion: 'Pagar al proveedor de cable', responsableId: [8], fecha: ['2026-10-20'], tipo: 'ACUERDO', pistas: ['pagar', 'martes'] },
      { descripcion: 'El almacén no debe quedar abierto a la hora de la comida', responsableId: [null], fecha: [null], tipo: 'LECCION', pistas: ['robo', 'comida'] },
    ],
    decisiones: ['Ningún equipo sale del almacén sin vale firmado'],
    pendientesSinDueno: [
      'Etiquetar los equipos en garantía',
      'Tirar el material dañado del fondo',
      'Revisar las cotizaciones de racks',
      'Conseguir un no-break para el site de la oficina',
    ],
    noDebe: [],
  },
  {
    id: 'r08',
    titulo: 'Planeación de noviembre',
    fecha: '2026-10-23',
    asistentesIds: [12, 2, 11, 5, 4],
    minutos: 20,
    formato: 'whisper',
    guion: `Planeación del mes siguiente (viernes). Muchas fechas relativas.
- Carolina armará el calendario de preventivos de noviembre el lunes.
- Roberto capacitará a los técnicos en el firmware nuevo de los NVR en dos semanas.
- Ricardo entregará el cierre de la obra del CEDIS de Tox a fin de mes.
- María Fernanda visitará al Hospital San Rafael para renovar el contrato el jueves 29.
- Adriana aprobará el presupuesto de herramientas mañana.
- Deciden que el 2 de noviembre no se trabaja y que las visitas de ese día pasan al martes 3.
- Riesgo: en noviembre se juntan tres obras y no alcanzan los técnicos; nadie toma una acción concreta.`,
    acuerdos: [
      { descripcion: 'Armar el calendario de preventivos de noviembre', responsableId: [2], fecha: ['2026-10-26'], tipo: 'ACUERDO', pistas: ['calendario', 'lunes'] },
      { descripcion: 'Capacitar a los técnicos en el firmware nuevo de los NVR', responsableId: [11], fecha: ['2026-11-06'], tipo: 'ACUERDO', pistas: ['firmware', 'dos semanas'] },
      { descripcion: 'Entregar el cierre de la obra del CEDIS de Tox', responsableId: [5], fecha: ['2026-10-30', '2026-10-31'], tipo: 'ACUERDO', pistas: ['cierre', 'fin de mes'] },
      { descripcion: 'Visitar al Hospital San Rafael para renovar el contrato', responsableId: [4], fecha: ['2026-10-29'], tipo: 'ACUERDO', pistas: ['renovar', '29'] },
      { descripcion: 'Aprobar el presupuesto de herramientas', responsableId: [12], fecha: ['2026-10-24'], tipo: 'ACUERDO', pistas: ['presupuesto', 'mañana'] },
      { descripcion: 'En noviembre se juntan tres obras y no alcanzan los técnicos', responsableId: [null], fecha: [null], tipo: 'RIESGO', pistas: ['tres obras'] },
    ],
    decisiones: ['El 2 de noviembre no se trabaja; las visitas pasan al martes 3'],
    pendientesSinDueno: [],
    noDebe: [],
  },
  {
    id: 'r09',
    titulo: 'Junta de equipo',
    fecha: '2026-10-20',
    asistentesIds: [12, 3, 10, 7, 2],
    minutos: 22,
    formato: 'whisper',
    guion: `Junta (martes) donde casi todo es plática: comida, el partido, el cumpleaños de Jorge, el tráfico, una serie de televisión. Solo hay dos acuerdos de trabajo, dichos de pasada a la mitad.
- Luis llevará la camioneta 2 al servicio el jueves.
- Patricia actualizará la lista de contactos de emergencia de los clientes para el viernes.
- Hablan de ir a comer tacos el viernes por el cumpleaños de Jorge y de pedir pastel (plan social, no es trabajo).
- Nadie decide nada más.`,
    acuerdos: [
      { descripcion: 'Llevar la camioneta 2 al servicio', responsableId: [3], fecha: ['2026-10-22'], tipo: 'ACUERDO', pistas: ['camioneta', 'jueves'] },
      { descripcion: 'Actualizar la lista de contactos de emergencia de los clientes', responsableId: [10], fecha: ['2026-10-23'], tipo: 'ACUERDO', pistas: ['contactos', 'viernes'] },
    ],
    decisiones: [],
    pendientesSinDueno: [],
    noDebe: ['Ir a comer tacos / pastel por el cumpleaños (plan social)', 'Cualquier cosa del partido o la serie'],
  },
  {
    id: 'r10',
    titulo: 'Revisión mensual de servicio',
    fecha: '2026-10-05',
    asistentesIds: [12, 2, 11, 1, 3, 9, 7],
    minutos: 25,
    formato: 'whisper',
    guion: `Revisión mensual de servicio (lunes), con muchos acuerdos. A Antonio Vázquez le dicen «el Toño»; a José Antonio, «José Antonio».
- José Antonio cambiará las baterías de los paneles de alarma de Bodegas Luna Atlixco el miércoles.
- Luis revisará la cámara del estacionamiento del Hospital San Rafael mañana.
- El Toño actualizará el firmware de los lectores del Colegio Andes el jueves.
- Roberto hablará hoy con el fabricante sobre la garantía del NVR de Tox.
- Jorge pedirá 10 discos duros de 4 TB a más tardar el viernes.
- Carolina enviará el reporte mensual de servicio a cada cliente el día 10.
- Adriana autorizará hoy mismo las horas extra del equipo de Luis.
- Roberto dará de alta en NEXARA el checklist nuevo de preventivo en una semana.
- Decisión: los preventivos de cada mes se programan la última semana del mes anterior.
- Lección: cuando una cámara se cae dos veces, se cambia en lugar de repararla.
- Queda pendiente revisar por qué la app no sincroniza fotos en Atlixco; nadie lo toma.`,
    acuerdos: [
      { descripcion: 'Cambiar las baterías de los paneles de alarma de Bodegas Luna Atlixco', responsableId: [1], fecha: ['2026-10-07'], tipo: 'ACUERDO', pistas: ['baterías', 'miércoles'] },
      { descripcion: 'Revisar la cámara del estacionamiento del Hospital San Rafael', responsableId: [3], fecha: ['2026-10-06'], tipo: 'ACUERDO', pistas: ['estacionamiento', 'mañana'] },
      { descripcion: 'Actualizar el firmware de los lectores del Colegio Andes', responsableId: [9], fecha: ['2026-10-08'], tipo: 'ACUERDO', pistas: ['lectores', 'jueves'] },
      { descripcion: 'Hablar con el fabricante sobre la garantía del NVR de Tox', responsableId: [11], fecha: ['2026-10-05'], tipo: 'ACUERDO', pistas: ['garantía', 'fabricante'] },
      { descripcion: 'Pedir 10 discos duros de 4 TB', responsableId: [7], fecha: ['2026-10-09'], tipo: 'ACUERDO', pistas: ['discos', 'viernes'] },
      { descripcion: 'Enviar el reporte mensual de servicio a cada cliente', responsableId: [2], fecha: ['2026-10-10'], tipo: 'ACUERDO', pistas: ['reporte mensual', '10'] },
      { descripcion: 'Autorizar las horas extra del equipo de Luis', responsableId: [12], fecha: ['2026-10-05'], tipo: 'ACUERDO', pistas: ['horas extra'] },
      { descripcion: 'Dar de alta en NEXARA el checklist nuevo de preventivo', responsableId: [11], fecha: ['2026-10-12'], tipo: 'ACUERDO', pistas: ['checklist', 'semana'] },
      { descripcion: 'Una cámara que se cae dos veces se cambia en lugar de repararla', responsableId: [null], fecha: [null], tipo: 'LECCION', pistas: ['dos veces'] },
    ],
    decisiones: ['Los preventivos de cada mes se programan la última semana del mes anterior'],
    pendientesSinDueno: ['Revisar por qué la app no sincroniza fotos en Atlixco'],
    noDebe: [],
  },
  {
    id: 'r11',
    titulo: 'Junta mensual de dirección',
    fecha: '2026-10-02',
    asistentesIds: [12, 8, 4, 11, 5, 6],
    minutos: 30,
    formato: 'whisper',
    guion: `Junta mensual de dirección (viernes): finanzas, ventas, operación, obra y personal. Larga, con discusiones.
- Alejandra presentará el flujo de efectivo de noviembre el viernes 16.
- María Fernanda cerrará la ampliación de Grupo Tox antes del 31 de octubre.
- Diana documentará el estándar de instalación de racks en tres semanas.
- Ricardo contratará dos ayudantes de obra este mes.
- Roberto propondrá el esquema de guardias de fin de semana para la siguiente junta mensual, que será el 6 de noviembre.
- Decisiones: se congela la contratación de personal administrativo hasta enero; se aprueba comprar una segunda camioneta.
- Riesgo: Bodegas Luna debe 3 facturas; si no paga en octubre se suspende el servicio. Alejandra le da seguimiento.
- Lección: la obra del CEDIS se atrasó por no confirmar los permisos de acceso antes de arrancar.
- Queda pendiente buscar un seguro para la herramienta; nadie lo toma.
- Se discute y se descarta abrir una oficina en Querétaro este año.`,
    acuerdos: [
      { descripcion: 'Presentar el flujo de efectivo de noviembre', responsableId: [8], fecha: ['2026-10-16'], tipo: 'ACUERDO', pistas: ['flujo de efectivo', '16'] },
      { descripcion: 'Cerrar la ampliación de Grupo Tox', responsableId: [4], fecha: ['2026-10-30', '2026-10-31'], tipo: 'ACUERDO', pistas: ['ampliación', '31'] },
      { descripcion: 'Documentar el estándar de instalación de racks', responsableId: [6], fecha: ['2026-10-23'], tipo: 'ACUERDO', pistas: ['racks', 'tres semanas'] },
      { descripcion: 'Contratar dos ayudantes de obra', responsableId: [5], fecha: [null, '2026-10-30', '2026-10-31'], tipo: 'ACUERDO', pistas: ['ayudantes'] },
      { descripcion: 'Proponer el esquema de guardias de fin de semana', responsableId: [11], fecha: ['2026-11-06'], tipo: 'ACUERDO', pistas: ['guardias', '6 de noviembre'] },
      { descripcion: 'Bodegas Luna debe 3 facturas; si no paga en octubre se suspende el servicio', responsableId: [8], fecha: [null, '2026-10-31'], tipo: 'RIESGO', pistas: ['facturas', 'suspende'] },
      { descripcion: 'Confirmar los permisos de acceso antes de arrancar una obra', responsableId: [null], fecha: [null], tipo: 'LECCION', pistas: ['permisos'] },
    ],
    decisiones: [
      'Se congela la contratación de personal administrativo hasta enero',
      'Se aprueba comprar una segunda camioneta',
    ],
    pendientesSinDueno: ['Buscar un seguro para la herramienta'],
    noDebe: ['Abrir una oficina en Querétaro (se descartó)'],
  },
  {
    id: 'r12',
    titulo: 'Nota de voz de Adriana',
    fecha: '2026-10-21',
    asistentesIds: [12],
    minutos: 6,
    formato: 'whisper',
    guion: `No es una junta: es una nota de voz de Adriana pensando en voz alta, sola, en el coche. Ideas sueltas, sin repartir trabajo a nadie.
- «Tengo que acordarme de hablar con Carolina sobre el calendario de preventivos» (lo hará ella misma, sin fecha).
- «A lo mejor conviene cambiar de proveedor de cable, el actual siempre se atrasa» (idea, nadie la toma).
- «Estaría bien tener un tablero de KPIs para los clientes» (idea).
- Menciona a Luis y a Roberto solo para elogiar su trabajo de la semana, sin pedirles nada.`,
    acuerdos: [
      { descripcion: 'Hablar con Carolina sobre el calendario de preventivos', responsableId: [12, null], fecha: [null], tipo: 'ACUERDO', pistas: ['Carolina', 'preventivos'] },
    ],
    decisiones: [],
    pendientesSinDueno: ['Evaluar cambiar de proveedor de cable', 'Tablero de KPIs para los clientes'],
    noDebe: ['Cualquier tarea asignada a Luis o a Roberto', 'Cambiar de proveedor de cable como decisión tomada'],
  },
];
