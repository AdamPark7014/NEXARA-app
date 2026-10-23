/**
 * Eval de la minuta automática de reuniones (`src/meetings/minuta-ia.ts`).
 *
 * Empresa y juntas ficticias (el repo es público: ningún dato real). Cada junta trae el guion
 * con el que se generó su transcripción (`transcripciones/<id>.txt`, ver `generar.ts`) y lo que
 * la minuta debe traer: acuerdos (responsable y fecha), decisiones, temas, cifras y, en la
 * junta que tiene reunión anterior, el seguimiento de cada acuerdo previo.
 */
import type { AcuerdoPrevio, EstadoPrevio } from '../../src/meetings/minuta-ia.js';

export const PERSONAS = [
  { id: 1, nombre: 'José Antonio Ramírez Ortega', puesto: 'Técnico de campo' },
  { id: 2, nombre: 'Carolina Pérez Lima', puesto: 'Coordinadora de servicio' },
  { id: 3, nombre: 'Luis Fernando Gómez Reyes', puesto: 'Técnico de campo' },
  { id: 4, nombre: 'María Fernanda Ruiz Cano', puesto: 'Ejecutiva comercial' },
  { id: 5, nombre: 'Ricardo Hernández Salas', puesto: 'Supervisor de obra' },
  { id: 6, nombre: 'Diana Sánchez Mora', puesto: 'Ingeniera de proyectos' },
  { id: 7, nombre: 'Jorge Méndez Aguilar', puesto: 'Almacén y compras' },
  { id: 8, nombre: 'Alejandra Torres Vega', puesto: 'Administración' },
  { id: 9, nombre: 'Antonio Vázquez Luna', puesto: 'Técnico de campo' },
  { id: 10, nombre: 'Patricia Lozano Ibarra', puesto: 'Recepción' },
  { id: 11, nombre: 'Roberto Castillo Núñez', puesto: 'Jefe de soporte' },
  { id: 12, nombre: 'Adriana Morales Paz', puesto: 'Directora de operaciones' },
];

export type AcuerdoEsperado = {
  descripcion: string;
  /** Ids aceptables; [null] = nadie de la empresa (externo o sin dueño). */
  responsableId: Array<number | null>;
  /** Fechas aceptables (AAAA-MM-DD) o null = sin fecha. */
  fecha: Array<string | null>;
  prioridad?: Array<'alta' | 'media' | 'baja'>;
  /** Palabras que la transcripción debe traer (revisión del generador). */
  pistas: string[];
};

export type Junta = {
  id: string;
  titulo: string;
  tipo: 'DIARIA' | 'PLANEACION_SEMANAL' | 'REVISION_AVANCES' | 'CIERRE_SEMANAL' | 'EXTRAORDINARIA';
  fecha: string;
  minutos: number;
  asistentesIds: number[];
  agenda?: string;
  /** Guion para el generador; `---` separa las mitades de una junta larga. */
  guion: string;
  acuerdos: AcuerdoEsperado[];
  decisiones: string[];
  /** Cada tema: expresiones regulares (cualquiera) que deben aparecer en la minuta. */
  temas: Array<{ nombre: string; patrones: string[] }>;
  /** Cifras que la minuta debe conservar: expresiones regulares (cualquiera). */
  cifras: Array<{ nombre: string; patrones: string[] }>;
  /** Lo que NO debe aparecer como acuerdo o decisión. */
  noDebe: string[];
  /** Junta con reunión anterior: sus acuerdos y el estado que se dijo de cada uno. */
  previa?: { id: string; titulo: string; fecha: string; acuerdos: AcuerdoPrevio[] };
  /** Estados aceptables de cada acuerdo previo. */
  seguimiento?: Record<string, Array<EstadoPrevio | 'sin_mencion'>>;
};

export const JUNTAS: Junta[] = [
  {
    id: 'm1',
    titulo: 'Junta mensual de dirección',
    tipo: 'EXTRAORDINARIA',
    fecha: '2026-10-16',
    minutos: 45,
    asistentesIds: [12, 11, 4, 8, 6],
    guion: `Junta mensual de dirección (viernes). Conduce Adriana. Tono serio pero con confianza.
- Arranque con plática de futbol (el América perdió) y del tráfico en la Recta a Cholula.
- Ventas de septiembre: Alejandra informa que se facturaron un millón doscientos cuarenta mil pesos contra una meta de un millón cuatrocientos mil (88 por ciento); el margen bruto quedó en 31 por ciento. Discuten por qué: dos proyectos se movieron a octubre.
- Cobranza: Hospital San Rafael debe ciento ochenta y seis mil quinientos pesos con 62 días de atraso. Alejandra se compromete a llamar al hospital el lunes y mandarles el estado de cuenta.
- Proyecto CEDIS Tox: Diana dice que va en 70 por ciento y la entrega es el 13 de noviembre. El switch de 48 puertos viene retrasado: el proveedor dice tres semanas más. Diana entrega el plan de pruebas el miércoles. Se habla del riesgo de no llegar al 13 si el switch no llega; Diana propone pedir uno prestado a Syscom como plan B, Adriana dice que lo vean si para el 30 no ha llegado.
---
- Personal: Roberto dice que soporte ya no se da abasto (40 tickets abiertos). Adriana decide contratar un técnico más para soporte a partir de noviembre. Roberto publica la vacante a más tardar el miércoles.
- Mafer (María Fernanda) cuenta que Colegio Andes pidió propuesta de control de acceso para sus tres accesos, por unos trescientos veinte mil pesos; es urgente porque su consejo se reúne el lunes 26. Mafer la manda antes del viernes 23.
- Alguien sugiere abrir sucursal en Tlaxcala; Adriana dice que no es momento y la idea se descarta por ahora.
- Lección que Adriana pide recordar: cotizar siempre con el tiempo de entrega del proveedor por escrito (por lo del switch).
- Alejandra menciona que el seguro de la camioneta Hilux vence en noviembre y hay que revisarlo, pero nadie lo toma y se cambia de tema.
- Cierre con bromas sobre la comida de fin de año.`,
    acuerdos: [
      { descripcion: 'Llamar al Hospital San Rafael y enviar el estado de cuenta', responsableId: [8], fecha: ['2026-10-19'], pistas: ['San Rafael', 'estado de cuenta'] },
      { descripcion: 'Entregar el plan de pruebas del CEDIS Tox', responsableId: [6], fecha: ['2026-10-21'], pistas: ['plan de pruebas'] },
      { descripcion: 'Publicar la vacante de técnico de soporte', responsableId: [11], fecha: ['2026-10-21'], pistas: ['vacante'] },
      { descripcion: 'Enviar la propuesta de control de acceso a Colegio Andes', responsableId: [4], fecha: ['2026-10-23', '2026-10-22'], prioridad: ['alta'], pistas: ['Colegio Andes', 'control de acceso'] },
    ],
    decisiones: ['Contratar un técnico más para soporte a partir de noviembre'],
    temas: [
      { nombre: 'ventas de septiembre', patrones: ['ventas|factur'] },
      { nombre: 'cobranza San Rafael', patrones: ['San Rafael'] },
      { nombre: 'CEDIS Tox', patrones: ['Tox'] },
      { nombre: 'personal de soporte', patrones: ['vacante|contrat'] },
      { nombre: 'Colegio Andes', patrones: ['Colegio Andes|Andes'] },
    ],
    cifras: [
      { nombre: 'facturación', patrones: ['1[,. ]?240[,. ]?000', '1[.,]24 ?(millones|mdp|m\\b)', 'millón doscientos cuarenta'] },
      { nombre: 'adeudo hospital', patrones: ['186[,. ]?500', '186\\.5'] },
      { nombre: 'margen', patrones: ['31 ?%|31 por ciento'] },
      { nombre: 'propuesta Andes', patrones: ['320[,. ]?000|320 mil|trescientos veinte'] },
    ],
    noDebe: ['Abrir sucursal en Tlaxcala', 'Revisar el seguro de la camioneta como acuerdo con responsable'],
  },
  {
    id: 'm2',
    titulo: 'Planeación semanal',
    tipo: 'PLANEACION_SEMANAL',
    fecha: '2026-10-19',
    minutos: 30,
    asistentesIds: [11, 2, 3, 9, 1, 7],
    guion: `Planeación del lunes. Conduce Roberto (le dicen Beto). Varios técnicos hablan a la vez.
- Repaso de la semana pasada: se cerraron 23 tickets, quedaron 9 abiertos.
- Roberto asigna: Luis va mañana a Bodegas Luna sucursal 14 Angelópolis a cambiar el disco del DVR. Toño (Antonio Vázquez) hace el miércoles el mantenimiento preventivo de las 16 cámaras del Hotel Real de Cholula. Pepe (José Antonio Ramírez) apoya a Ricardo en la obra del CEDIS Tox toda la semana.
- Jorge (almacén) dice que solo quedan 3 discos duros de 4 teras; se compromete a pedir 10 más hoy mismo a Syscom.
- Carolina confirma con el Hospital San Rafael la visita del jueves (la confirma hoy).
---
- Discusión larga sobre la camioneta 2 que tiene falla en los frenos; deciden que no sale a carretera hasta que la revisen; Jorge la lleva al taller el martes.
- Carolina pide que todos cierren sus folios en el sistema el mismo día; Roberto lo hace regla a partir de hoy (decisión).
- Alguien dice que habría que actualizar el inventario de herramienta, nadie lo toma.
- Plática de relleno sobre el partido y los tacos de la esquina.`,
    acuerdos: [
      { descripcion: 'Cambiar el disco del DVR en Bodegas Luna Angelópolis', responsableId: [3], fecha: ['2026-10-20'], pistas: ['Bodegas Luna', 'disco'] },
      { descripcion: 'Mantenimiento preventivo de 16 cámaras en Hotel Real de Cholula', responsableId: [9], fecha: ['2026-10-21'], pistas: ['Hotel Real', 'preventivo'] },
      { descripcion: 'Apoyar en la obra del CEDIS Tox', responsableId: [1], fecha: [null, '2026-10-23', '2026-10-19'], pistas: ['CEDIS'] },
      { descripcion: 'Pedir 10 discos duros a Syscom', responsableId: [7], fecha: ['2026-10-19'], pistas: ['Syscom', 'discos'] },
      { descripcion: 'Confirmar con Hospital San Rafael la visita del jueves', responsableId: [2], fecha: ['2026-10-19'], pistas: ['San Rafael'] },
      { descripcion: 'Llevar la camioneta 2 al taller', responsableId: [7], fecha: ['2026-10-20'], pistas: ['camioneta', 'taller'] },
    ],
    decisiones: ['La camioneta 2 no sale a carretera hasta revisarla', 'Cerrar los folios en el sistema el mismo día'],
    temas: [
      { nombre: 'resultados de la semana', patrones: ['23 tickets|tickets'] },
      { nombre: 'asignaciones', patrones: ['Bodegas Luna'] },
      { nombre: 'material', patrones: ['disco'] },
      { nombre: 'camioneta', patrones: ['camioneta'] },
    ],
    cifras: [
      { nombre: 'tickets cerrados', patrones: ['23'] },
      { nombre: 'discos', patrones: ['10 discos|diez discos|10 (más|unidades)'] },
      { nombre: 'cámaras', patrones: ['16 cámaras|dieciséis'] },
    ],
    noDebe: ['Actualizar el inventario de herramienta con responsable'],
  },
  {
    id: 'm3',
    titulo: 'Seguimiento obra CEDIS Tox con el cliente',
    tipo: 'EXTRAORDINARIA',
    fecha: '2026-10-21',
    minutos: 25,
    asistentesIds: [6, 5, 12],
    guion: `Junta en sitio con el cliente Grupo Tox; del lado del cliente está el ingeniero Salvador Ochoa, gerente de mantenimiento (no es de NEXARA). Diana y Ricardo por NEXARA; Adriana por teléfono al inicio.
- Ochoa reclama que las cámaras del andén 3 tienen punto ciego en la rampa. Ricardo propone reubicar 2 cámaras; se acuerda que Ricardo las reubica el viernes.
- Ochoa se compromete a mandar el plano actualizado de la nave 2 el lunes.
- Diana explica la fibra entre naves: faltan 180 metros de canalización; el cliente la hace con su contratista (Ochoa lo coordina, sin fecha).
- Se decide que las pruebas de aceptación sean el 10 de noviembre con el personal de seguridad del cliente.
- Diana manda la minuta técnica con fotos al cliente mañana.
- Riesgo: si la canalización no está antes del 5 de noviembre, no se llega a la prueba del 10.
- Ochoa pregunta si se puede integrar el control de acceso de comedor; queda como pregunta abierta para cotizar después.
- Plática sobre el clima y el estacionamiento lleno de lodo.`,
    acuerdos: [
      { descripcion: 'Reubicar 2 cámaras del andén 3', responsableId: [5], fecha: ['2026-10-23'], pistas: ['andén', 'reubica'] },
      { descripcion: 'Enviar el plano actualizado de la nave 2', responsableId: [null], fecha: ['2026-10-26'], pistas: ['plano', 'nave 2'] },
      { descripcion: 'Enviar la minuta técnica con fotos al cliente', responsableId: [6], fecha: ['2026-10-22'], pistas: ['minuta técnica', 'fotos'] },
    ],
    decisiones: ['Pruebas de aceptación el 10 de noviembre'],
    temas: [
      { nombre: 'punto ciego andén 3', patrones: ['andén|punto ciego'] },
      { nombre: 'fibra y canalización', patrones: ['canalizaci|fibra'] },
      { nombre: 'pruebas de aceptación', patrones: ['aceptaci|10 de noviembre'] },
    ],
    cifras: [
      { nombre: 'canalización', patrones: ['180 ?m|180 metros|ciento ochenta'] },
      { nombre: 'fecha pruebas', patrones: ['10 de noviembre|2026-11-10|10/11'] },
    ],
    noDebe: ['Integrar control de acceso del comedor como acuerdo'],
  },
  {
    id: 'm4',
    titulo: 'Junta comercial semanal',
    tipo: 'EXTRAORDINARIA',
    fecha: '2026-10-22',
    minutos: 40,
    asistentesIds: [4, 12, 6, 8],
    guion: `Junta comercial (jueves). Conduce Mafer (María Fernanda). Mucha discusión de números.
- Embudo: hay 14 oportunidades abiertas por 2.3 millones de pesos; 5 en negociación.
- Grupo Tox pide 15 por ciento de descuento en la ampliación de 40 cámaras; Adriana dice que no, que máximo 8 por ciento y con pago anticipado del 50 por ciento (decisión). La propuesta del 15 queda rechazada.
- Mafer manda la contrapropuesta a Tox mañana.
- Hotel Real de Cholula: quiere renovar el contrato de mantenimiento anual por 96 mil pesos; Alejandra prepara el contrato para el lunes.
- Diana estima que el proyecto de la Universidad del Valle (videovigilancia en 2 edificios) lleva 120 horas de ingeniería; Diana entrega la propuesta técnica el 29.
- Meta de noviembre: cerrar 1.1 millones (lo dice Adriana).
---
- Larga discusión de precios de Hikvision que subieron 6 por ciento; deciden actualizar la lista de precios a partir del 1 de noviembre; Mafer actualiza la lista en el sistema antes de esa fecha (el 30).
- Riesgo: el tipo de cambio puede subir y comer el margen de cotizaciones en dólares.
- Alguien propone hacer un evento para clientes en diciembre; queda en el aire, sin decisión ni dueño.
- Lección: no mandar cotizaciones sin validar existencias con almacén (pasó con Bodegas Luna).
- Plática sobre la comida de la cámara de comercio y anécdota de un cliente de Atlixco.`,
    acuerdos: [
      { descripcion: 'Enviar contrapropuesta a Grupo Tox', responsableId: [4], fecha: ['2026-10-23'], pistas: ['contrapropuesta'] },
      { descripcion: 'Preparar el contrato de mantenimiento del Hotel Real', responsableId: [8], fecha: ['2026-10-26'], pistas: ['contrato', 'Hotel Real'] },
      { descripcion: 'Entregar la propuesta técnica de la Universidad del Valle', responsableId: [6], fecha: ['2026-10-29'], pistas: ['Universidad del Valle'] },
      { descripcion: 'Actualizar la lista de precios en el sistema', responsableId: [4], fecha: ['2026-10-30', '2026-10-31'], pistas: ['lista de precios'] },
    ],
    decisiones: ['Descuento máximo de 8% a Grupo Tox con anticipo del 50%', 'Actualizar la lista de precios a partir del 1 de noviembre'],
    temas: [
      { nombre: 'embudo', patrones: ['oportunidades|embudo'] },
      { nombre: 'Grupo Tox', patrones: ['Tox'] },
      { nombre: 'Hotel Real', patrones: ['Hotel Real'] },
      { nombre: 'Universidad del Valle', patrones: ['Universidad del Valle'] },
      { nombre: 'precios Hikvision', patrones: ['Hikvision|lista de precios'] },
    ],
    cifras: [
      { nombre: 'embudo', patrones: ['2[.,]3 ?(millones|mdp|m\\b)|2[,. ]?300[,. ]?000'] },
      { nombre: 'descuento 8%', patrones: ['8 ?%|8 por ciento|ocho por ciento'] },
      { nombre: 'contrato hotel', patrones: ['96[,. ]?000|96 mil|noventa y seis'] },
      { nombre: 'horas de ingeniería', patrones: ['120 horas|ciento veinte horas'] },
      { nombre: 'meta noviembre', patrones: ['1[.,]1 ?(millones|mdp|m\\b)|1[,. ]?100[,. ]?000'] },
      { nombre: 'alza Hikvision', patrones: ['6 ?%|6 por ciento|seis por ciento'] },
    ],
    noDebe: ['Dar 15% de descuento a Grupo Tox', 'Organizar evento para clientes en diciembre como acuerdo o decisión'],
  },
  {
    id: 'm5a',
    titulo: 'Revisión de avances',
    tipo: 'REVISION_AVANCES',
    fecha: '2026-10-14',
    minutos: 20,
    asistentesIds: [12, 11, 6, 7, 4],
    guion: `Revisión de avances del miércoles. Conduce Adriana.
- Roberto: entrega el reporte de SLA de septiembre el viernes.
- Diana: termina el levantamiento del Colegio Andes el lunes.
- Jorge: compra 6 cámaras domo para el Hotel Real esta semana (para el viernes).
- Mafer: llama a Bodegas Luna para cobrar la factura vencida mañana.
- Roberto: capacita a los técnicos nuevos en el NVR Hikvision el martes 20.
- Comentan avances de la obra de Tox sin compromisos nuevos.
- Plática sobre el puente del 2 de noviembre.`,
    acuerdos: [
      { descripcion: 'Entregar el reporte de SLA de septiembre', responsableId: [11], fecha: ['2026-10-16'], pistas: ['reporte de SLA'] },
      { descripcion: 'Terminar el levantamiento del Colegio Andes', responsableId: [6], fecha: ['2026-10-19'], pistas: ['levantamiento'] },
      { descripcion: 'Comprar 6 cámaras domo para el Hotel Real', responsableId: [7], fecha: ['2026-10-16'], pistas: ['cámaras domo'] },
      { descripcion: 'Llamar a Bodegas Luna para cobrar la factura vencida', responsableId: [4], fecha: ['2026-10-15'], pistas: ['factura vencida'] },
      { descripcion: 'Capacitar a los técnicos nuevos en el NVR Hikvision', responsableId: [11], fecha: ['2026-10-20'], pistas: ['capacita', 'NVR'] },
    ],
    decisiones: [],
    temas: [{ nombre: 'avances', patrones: ['SLA'] }],
    cifras: [{ nombre: 'cámaras domo', patrones: ['6 cámaras|seis cámaras'] }],
    noDebe: [],
  },
  {
    id: 'm5b',
    titulo: 'Revisión de avances',
    tipo: 'REVISION_AVANCES',
    fecha: '2026-10-21',
    minutos: 35,
    asistentesIds: [12, 11, 6, 7, 4, 8],
    guion: `Revisión de avances del miércoles siguiente. Conduce Adriana y va revisando los acuerdos de la semana pasada uno por uno (no por número: por lo que eran).
- Reporte de SLA de septiembre: Roberto dice que ya lo entregó el viernes; salió en 94 por ciento de cumplimiento. (cumplido)
- Levantamiento del Colegio Andes: Diana lleva dos de tres edificios, termina el viernes; se retrasó porque el colegio no dio acceso el lunes. (en proceso)
- Cámaras domo del Hotel Real: Jorge dice que el proveedor no tiene existencia, están detenidas hasta que llegue el pedido; está bloqueado. (bloqueado)
- Cobro a Bodegas Luna: Mafer dice que ya no hace falta porque Bodegas Luna pagó por transferencia antes de la llamada; se cancela. (cancelado)
- De la capacitación del NVR nadie dice nada.
---
- Temas nuevos: Alejandra informa que el SAT mandó requerimiento por la declaración de agosto; ella lo contesta con el contador antes del 28.
- Diana propone usar fibra en vez de cobre en el Colegio Andes por la distancia de 140 metros; Adriana aprueba (decisión).
- Jorge propone cambiar de proveedor de discos duros; queda pendiente sin dueño revisar opciones.
- Adriana pide a Roberto el plan de vacaciones de diciembre del equipo de soporte para el 30.
- Riesgo: si las domo no llegan antes del 4 de noviembre, el Hotel Real se queda sin cobertura en el estacionamiento.
- Plática sobre Día de Muertos y la ofrenda de la oficina.`,
    acuerdos: [
      { descripcion: 'Terminar el levantamiento del Colegio Andes', responsableId: [6], fecha: ['2026-10-23'], pistas: ['levantamiento'] },
      { descripcion: 'Contestar el requerimiento del SAT', responsableId: [8], fecha: ['2026-10-28', '2026-10-27'], pistas: ['SAT', 'requerimiento'] },
      { descripcion: 'Entregar el plan de vacaciones de diciembre de soporte', responsableId: [11], fecha: ['2026-10-30'], pistas: ['vacaciones'] },
    ],
    decisiones: ['Usar fibra en vez de cobre en el Colegio Andes'],
    temas: [
      { nombre: 'seguimiento', patrones: ['SLA'] },
      { nombre: 'SAT', patrones: ['SAT'] },
      { nombre: 'fibra Colegio Andes', patrones: ['fibra'] },
    ],
    cifras: [
      { nombre: 'SLA', patrones: ['94 ?%|94 por ciento|noventa y cuatro'] },
      { nombre: 'distancia', patrones: ['140 ?m|140 metros|ciento cuarenta'] },
    ],
    noDebe: ['Cambiar de proveedor de discos duros como decisión'],
    previa: {
      id: 'm5a',
      titulo: 'Revisión de avances',
      fecha: '2026-10-14',
      acuerdos: [
        { ref: 'A1', agreementId: 501, descripcion: 'Entregar el reporte de SLA de septiembre', responsable: 'Roberto Castillo Núñez', fechaCompromiso: '2026-10-16', estado: 'PENDIENTE' },
        { ref: 'A2', agreementId: 502, descripcion: 'Terminar el levantamiento del Colegio Andes', responsable: 'Diana Sánchez Mora', fechaCompromiso: '2026-10-19', estado: 'PENDIENTE' },
        { ref: 'A3', agreementId: 503, descripcion: 'Comprar 6 cámaras domo para el Hotel Real', responsable: 'Jorge Méndez Aguilar', fechaCompromiso: '2026-10-16', estado: 'PENDIENTE' },
        { ref: 'A4', agreementId: 504, descripcion: 'Llamar a Bodegas Luna para cobrar la factura vencida', responsable: 'María Fernanda Ruiz Cano', fechaCompromiso: '2026-10-15', estado: 'PENDIENTE' },
        { ref: 'A5', agreementId: 505, descripcion: 'Capacitar a los técnicos nuevos en el NVR Hikvision', responsable: 'Roberto Castillo Núñez', fechaCompromiso: '2026-10-20', estado: 'PENDIENTE' },
      ],
    },
    // A5: el guion dice que nadie habla de él, pero el generador lo deja apenas mencionado.
    seguimiento: { A1: ['cumplido'], A2: ['en_proceso'], A3: ['bloqueado'], A4: ['cancelado'], A5: ['sin_mencion', 'sin_avance'] },
  },
  {
    id: 'm6',
    titulo: 'Arranque de proyecto Universidad del Valle',
    tipo: 'EXTRAORDINARIA',
    fecha: '2026-10-22',
    minutos: 60,
    asistentesIds: [12, 6, 5, 11, 7, 4, 2],
    agenda: '• Alcance\n• Cronograma\n• Equipo y materiales\n• Riesgos',
    guion: `Junta de arranque (kickoff) del proyecto de videovigilancia y control de acceso de la Universidad del Valle, campus Angelópolis. Conduce Diana (ingeniera de proyectos). Junta larga con muchos temas técnicos y digresiones.
- Alcance: 2 edificios (A y B), 64 cámaras IP de 4 megapíxeles, 2 NVR de 32 canales, control de acceso en 6 puertas con lectoras de tarjeta y biométrico en la dirección. Monto del contrato: 1.85 millones de pesos más IVA.
- Cronograma: arranque de obra el lunes 2 de noviembre, canalización 2 semanas, cableado 2 semanas, instalación y configuración 1 semana, entrega el 11 de diciembre.
- Ricardo es supervisor de obra; pide 4 técnicos; Roberto le asigna a Luis, Toño, Pepe y uno nuevo.
- Jorge: material — pide las 64 cámaras y los NVR a Syscom esta semana (para el viernes 23); las lectoras tardan 4 semanas de importación, hay que pedirlas hoy mismo (Jorge).
---
- Diana manda el cronograma detallado en Project al cliente el lunes 26.
- Discusión: la universidad pide que las cámaras de estacionamiento graben 30 días; con 64 cámaras eso requiere discos de 8 teras en cada NVR (calculan 96 teras en total). Deciden usar grabación por movimiento en estacionamiento para no exceder el presupuesto.
- Mafer: el cliente paga 40 por ciento de anticipo, 30 a mitad de obra y 30 a la entrega; ella confirma con el cliente la fecha del anticipo esta semana (el viernes).
- Carolina coordina los permisos de acceso al campus y el gafete de cada técnico; los tramita el jueves 29.
- Riesgos: temporada de exámenes en diciembre (no se puede hacer ruido en el edificio A del 7 al 18 de diciembre); posible retraso de las lectoras importadas.
- Pregunta abierta: si el cableado del edificio B puede ir por la azotea (la universidad tiene que responder).
- Lección del proyecto anterior: hacer pruebas de cada tramo de fibra con OTDR antes de cerrar canalización.
- Roberto da la capacitación al personal de seguridad de la universidad en la última semana (9 de diciembre).
- Mucha plática de relleno: anécdotas de la obra del hospital, el clima, el futbol, el café de la universidad.`,
    acuerdos: [
      { descripcion: 'Pedir las 64 cámaras y los NVR a Syscom', responsableId: [7], fecha: ['2026-10-23'], pistas: ['64 cámaras'] },
      { descripcion: 'Pedir las lectoras de control de acceso', responsableId: [7], fecha: ['2026-10-22'], prioridad: ['alta'], pistas: ['lectoras'] },
      { descripcion: 'Enviar el cronograma detallado al cliente', responsableId: [6], fecha: ['2026-10-26'], pistas: ['cronograma'] },
      { descripcion: 'Confirmar con el cliente la fecha del anticipo', responsableId: [4], fecha: ['2026-10-23'], pistas: ['anticipo'] },
      { descripcion: 'Tramitar los permisos de acceso y gafetes', responsableId: [2], fecha: ['2026-10-29'], pistas: ['gafete'] },
      { descripcion: 'Capacitar al personal de seguridad de la universidad', responsableId: [11], fecha: ['2026-12-09'], pistas: ['capacitación'] },
    ],
    decisiones: ['Grabación por movimiento en estacionamiento'],
    temas: [
      { nombre: 'alcance', patrones: ['64 cámaras|alcance'] },
      { nombre: 'cronograma', patrones: ['cronograma|11 de diciembre'] },
      { nombre: 'materiales', patrones: ['Syscom|lectoras'] },
      { nombre: 'almacenamiento', patrones: ['30 días|movimiento'] },
      { nombre: 'pagos', patrones: ['anticipo'] },
      { nombre: 'permisos', patrones: ['permisos|gafete'] },
      { nombre: 'riesgos exámenes', patrones: ['exámenes'] },
    ],
    cifras: [
      { nombre: 'contrato', patrones: ['1[.,]85 ?(millones|mdp|m\\b)|1[,. ]?850[,. ]?000'] },
      { nombre: 'cámaras', patrones: ['64'] },
      { nombre: 'puertas', patrones: ['6 puertas|seis puertas'] },
      { nombre: 'entrega', patrones: ['11 de diciembre|2026-12-11'] },
      { nombre: 'almacenamiento', patrones: ['96 ?(teras|TB)'] },
      { nombre: 'esquema de pago', patrones: ['40 ?%|40 por ciento|cuarenta por ciento'] },
    ],
    noDebe: [],
  },
  {
    id: 'm7',
    titulo: 'Junta de cierre semanal',
    tipo: 'CIERRE_SEMANAL',
    fecha: '2026-10-23',
    minutos: 30,
    asistentesIds: [11, 2, 3, 9, 1, 12],
    guion: `Junta de cierre del viernes. Conduce Roberto. Audio con ruido (se oye un taladro de fondo) y gente cansada.
- Resultados: 27 servicios atendidos en la semana, 3 se reprogramaron por lluvia; tiempo promedio de respuesta 3.5 horas.
- Problema: en Bodegas Luna Atlixco el técnico llegó sin el eliminador de corriente correcto y tuvo que regresar. Lección: revisar el kit de herramienta antes de salir con la lista de chequeo.
- Lección 2: avisar al cliente por WhatsApp media hora antes de llegar (Carolina dice que bajó las quejas).
---
- Luis comenta que el NVR del Colegio Andes se reinicia solo; Roberto le pide que abra garantía con Hikvision el lunes.
- Toño pide una escalera de 8 metros; Adriana autoriza la compra (decisión); la compra Jorge, que no está en la junta (se lo avisan).
- Carolina manda el reporte semanal a los clientes con contrato el lunes.
- Riesgo: la temporada de lluvias sigue y hay 4 servicios exteriores la próxima semana.
- Plática sobre la quiniela y quién trae los tamales el lunes.`,
    acuerdos: [
      { descripcion: 'Abrir garantía con Hikvision del NVR del Colegio Andes', responsableId: [3], fecha: ['2026-10-26'], pistas: ['garantía'] },
      { descripcion: 'Comprar una escalera de 8 metros', responsableId: [7], fecha: [null], pistas: ['escalera'] },
      { descripcion: 'Enviar el reporte semanal a los clientes con contrato', responsableId: [2], fecha: ['2026-10-26'], pistas: ['reporte semanal'] },
    ],
    decisiones: ['Autorizar la compra de una escalera de 8 metros'],
    temas: [
      { nombre: 'resultados', patrones: ['27 servicios|servicios'] },
      { nombre: 'problema Atlixco', patrones: ['Atlixco|eliminador'] },
      { nombre: 'NVR Colegio Andes', patrones: ['garant'] },
    ],
    cifras: [
      { nombre: 'servicios', patrones: ['27'] },
      { nombre: 'tiempo de respuesta', patrones: ['3[.,]5 horas|tres horas y media|3 horas y media'] },
    ],
    noDebe: [],
  },
];
