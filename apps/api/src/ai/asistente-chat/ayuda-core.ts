/**
 * Guía de uso de NEXARA Core para el asistente del chat: lo que contesta el código sin IA cuando
 * alguien pregunta «¿cómo hago…?» o «¿dónde está…?», y el único conocimiento que recibe la IA
 * cuando la pregunta no cae en ninguna regla.
 *
 * Cada respuesta salió del código (web, apps y API) el 29-10-2026; si cambia una pantalla, cambia
 * aquí. Nada de rutas internas del API ni nombres técnicos: esto lo lee el equipo.
 */
import { normalizarTexto } from './texto.js';

export type TemaAyuda = {
  id: string;
  titulo: string;
  respuesta: string;
  /** Pantalla donde se hace (la web). */
  ruta: string;
  /** Frases o palabras que lo identifican, ya sin acentos ni mayúsculas. Una frase pesa doble. */
  claves: string[];
};

export const TEMAS_AYUDA: TemaAyuda[] = [
  {
    id: 'checar',
    titulo: 'Checar entrada y salida',
    respuesta:
      'Se checa desde la app NEXARA con foto obligatoria; la app pide tu ubicación y, si no la obtiene, registra igual marcada «Sin ubicación» (una ubicación simulada se rechaza). Desde la web solo si dirección abre un permiso temporal; sin teléfono, tu jefe puede registrar tu checada con motivo.',
    ruta: '/erp/asistencias',
    claves: ['checar', 'checo', 'checada', 'checador', 'marcar entrada', 'registrar entrada', 'entrada', 'salida', 'checar salida', 'checar entrada', 'mi jornada'],
  },
  {
    id: 'comida',
    titulo: 'Registrar la comida',
    respuesta:
      'En Asistencias › Comidas toca «Salir a comer» y al volver «Ya regresé», las dos con foto. El horario es de 3:00 a 4:00 p.m.; fuera de ese horario escribes el motivo y tu jefe lo aprueba o rechaza.',
    ruta: '/erp/asistencias?tab=comidas',
    claves: ['comida', 'comer', 'salir a comer', 'ya regrese', 'descanso', 'lunch'],
  },
  {
    id: 'mis-actividades',
    titulo: 'Mis actividades del día',
    respuesta:
      'En Actividades › «Mis actividades» está tu cola en orden: empieza por la #1. Abajo ves las que tienes en seguimiento, las hechas hoy y las no cumplidas de los últimos 7 días.',
    ruta: '/erp/pizarra?vista=mias',
    claves: ['mis actividades', 'mi cola', 'que me toca', 'que tengo que hacer', 'mis tareas', 'mis pendientes'],
  },
  {
    id: 'iniciar-actividad',
    titulo: 'Iniciar, pausar y terminar una actividad',
    respuesta:
      'Toca «Iniciar actividad» (no se acepta ni se rechaza; si no puedes hacerla, habla con tu jefe). Con el reloj corriendo usas «Pausar» y «Reanudar». Terminas con la foto de salida en Evidencias y la actividad queda en revisión.',
    ruta: '/erp/pizarra?vista=mias',
    claves: ['iniciar', 'empezar actividad', 'pausar', 'reanudar', 'terminar', 'cerrar actividad', 'finalizar', 'reloj', 'entregar', 'mandar a revision', 'en revision'],
  },
  {
    id: 'evidencias',
    titulo: 'Subir evidencias',
    respuesta:
      'Abre la actividad › Evidencias y sigue los pasos: foto de entrada, fotos en sitio, hoja de servicio y foto de salida (en las comerciales: inicio, evidencias, cotización y conclusión). Las sube quien ejecuta; quien solo reparte no.',
    ruta: '/erp/pizarra?vista=mias',
    claves: ['evidencia', 'evidencias', 'subir foto', 'subir fotos', 'fotos de la actividad', 'hoja de servicio', 'foto de salida', 'foto de entrada'],
  },
  {
    id: 'asignar',
    titulo: 'Asignar una actividad a alguien',
    respuesta:
      'En Actividades › «Mi equipo» cada tarjeta tiene «＋ Asignar». Lo pueden hacer dirección, coordinadores, arquitecto y encargado de soporte. El botón «Nueva actividad» de arriba es para ti mismo. «Asignar con IA» solo lo ve el CEO (también desde aquí: «@asistente asígnale a …»).',
    ruta: '/erp/pizarra?vista=equipo',
    claves: ['asignar', 'asignarle', 'asignar actividad', 'crear actividad', 'nueva actividad', 'dar una tarea', 'mandar una tarea', 'asignar con ia'],
  },
  {
    id: 'auto-asignar',
    titulo: 'Auto-asignarme una actividad',
    respuesta:
      'En Mis actividades toca «Auto-asignarme» (o «Nueva actividad» arriba), elige el tipo y pon título, lugar, día, hora y tiempo: queda solo a tu nombre. Los encargados además reordenan su cola con «Subir/Bajar», y cada cambio pide motivo.',
    ruta: '/erp/mis-actividades/nueva',
    claves: ['auto asignar', 'autoasignar', 'auto asignarme', 'asignarme', 'actividad para mi', 'reordenar', 'subir bajar', 'cambiar orden'],
  },
  {
    id: 'revisar',
    titulo: 'Revisar evidencias del equipo',
    respuesta:
      'En «En espera de revisión» toca «Revisar», elige «Aprobar» o «Devolver», califica la eficiencia de 1 a 5 (obligatorio) y deja observaciones. La persona recibe tu decisión. Lo ven el CEO, los jefes con equipo y quien responde por el trabajo de otro.',
    ruta: '/erp/pizarra?vista=revision',
    claves: ['revisar', 'revision', 'aprobar evidencia', 'devolver', 'en espera de revision', 'validar', 'calificar'],
  },
  {
    id: 'equipo',
    titulo: 'Ver a mi equipo y quién está en jornada',
    respuesta:
      'Actividades › «Mi equipo» muestra foto, semáforo y la actividad abierta de cada persona; Asistencias › «Equipo del día» muestra quién está en jornada, quién ya salió y quién no ha checado. Lo ven el CEO y los jefes con equipo (también: «@asistente quién está en jornada»).',
    ruta: '/erp/pizarra?vista=equipo',
    claves: ['mi equipo', 'pizarra', 'semaforo', 'equipo del dia', 'quien esta', 'quien trabaja'],
  },
  {
    id: 'retardos',
    titulo: 'Retardos, horas y desempeño',
    respuesta:
      'Tu día está en Asistencias («Mi jornada») y en Mi perfil. Hay retardo después de las 10:00 más 15 minutos de tolerancia, salvo que tengas horario propio. Los indicadores del equipo (entregas en tiempo y forma, retardos, uniforme, horas) están en «Desempeño».',
    ruta: '/erp/asistencias/indicadores',
    claves: ['retardo', 'retardos', 'tolerancia', 'horas trabajadas', 'mis horas', 'desempeno', 'indicadores', 'kpi', 'kpis', 'prenomina', 'pre nomina', 'tiempo extra'],
  },
  {
    id: 'horario',
    titulo: 'Horario de la jornada',
    respuesta:
      'La jornada es de 10:00 a 18:00 con 15 minutos de tolerancia (o tu horario propio si lo tienes guardado) y la comida de 3:00 a 4:00 p.m., con regreso a más tardar 4:05. Si no checas salida, a las 23:30 se pone una automática y queda a revisión.',
    ruta: '/erp/asistencias',
    claves: ['horario', 'a que hora entro', 'hora de entrada', 'hora de salida', 'a que hora salgo', 'jornada laboral', 'hora de comida', 'salida automatica'],
  },
  {
    id: 'no-cumplida',
    titulo: 'Actividad vencida o «No cumplida»',
    respuesta:
      'Pasarse de la hora no la cierra: el semáforo la marca atrasada. Al checar tu salida, lo que vencía ese día o antes y no entregaste pasa a «No cumplida»; lo que ya enviaste a revisión no se cierra. Un superior puede reprogramarla o marcarla con causa, pero el incumplimiento cuenta en los indicadores.',
    ruta: '/erp/pizarra?vista=mias',
    claves: ['vencida', 'vencidas', 'no cumplida', 'no cumplidas', 'incumplida', 'atrasada', 'se me paso', 'reprogramar'],
  },
  {
    id: 'cotizaciones',
    titulo: 'Cotizaciones',
    respuesta:
      'En Cotizaciones toca «Nueva cotización», llénala y usa «Enviar por correo»: le llega al cliente el PDF y un enlace para firmar o rechazar. El estado (Borrador, Enviada, Aprobada, Rechazada, Vencida) se ve en la lista. Cotizan dirección, coordinadores, administrativo y arquitecto.',
    ruta: '/erp/cotizaciones',
    claves: [
      'cotizacion',
      'cotizaciones',
      'cotizar',
      'nueva cotizacion',
      'enviar cotizacion',
      'presupuesto al cliente',
      'estado de la cotizacion',
      // «Que el cliente firme» es de cotizaciones, no del padrón de clientes.
      'firme',
      'firmar',
      'cliente firme',
    ],
  },
  {
    id: 'clientes',
    titulo: 'Clientes',
    respuesta:
      'En Clientes toca «Nuevo cliente»; el padrón se divide en proyecto, corporativo y comercial. Dan de alta dirección, coordinadores, arquitecto, encargado de soporte y administrativo; solo Dirección General desactiva o elimina.',
    ruta: '/erp/clientes',
    claves: ['cliente', 'clientes', 'nuevo cliente', 'alta de cliente', 'padron', 'dar de alta un cliente'],
  },
  {
    id: 'proyectos',
    titulo: 'Proyectos',
    respuesta:
      'En Proyectos ves fechas, cronograma, alcance, equipo, presupuesto y documentos de cada proyecto; «Nuevo proyecto» crea uno.',
    ruta: '/erp/proyectos',
    claves: ['proyecto', 'proyectos', 'nuevo proyecto', 'cronograma', 'obra', 'alcance'],
  },
  {
    id: 'viaticos',
    titulo: 'Viáticos',
    respuesta:
      'En Viáticos, quien puede toca «Solicitar viático»; la comprobación (monto con tickets) la captura quien lo revisa. Solicitan administrativo y coordinación/dirección administrativa; aprueban dirección, administración, contabilidad, RH y operaciones.',
    ruta: '/erp/finance/viatics',
    claves: ['viatico', 'viaticos', 'gastos de viaje', 'solicitar viatico', 'comprobar', 'comprobacion', 'tickets', 'gasolina', 'casetas'],
  },
  {
    id: 'facturas',
    titulo: 'Facturas',
    respuesta:
      'En Contabilidad › Facturas ves lo emitido y lo recibido, con saldo y vencimiento. Lo ven CEO, dirección y coordinación administrativa, administrativo y contabilidad.',
    ruta: '/erp/contabilidad/facturas',
    claves: ['factura', 'facturas', 'facturacion', 'cfdi', 'timbrar', 'por cobrar', 'cobranza'],
  },
  {
    id: 'reuniones',
    titulo: 'Reuniones y actas',
    respuesta:
      'En Reuniones, quien conduce toca «Comenzar a grabar reunión»: la IA toma notas y al «Concluir reunión» escribe el acta en PDF; los acuerdos pasan como actividades de sus responsables. También está «Convocar reunión»; los demás ven «Mis acuerdos».',
    ruta: '/erp/reuniones',
    claves: ['reunion', 'reuniones', 'junta', 'acta', 'minuta', 'acuerdos', 'convocar', 'grabar reunion'],
  },
  {
    id: 'chat',
    titulo: 'Chat: canales, mensajes y ligas',
    respuesta:
      'En Chat, «Crear canal» está en Canales y «Escribir a alguien» en Mensajes directos. Al escribir usa @ para mencionar a alguien y «Ligar» para pegar una actividad, cotización, asistencia, cliente, proyecto, viático o factura como tarjeta. Cada mensaje tiene «Fijar mensaje».',
    ruta: '/erp/chat',
    claves: ['chat', 'canal', 'crear canal', 'mensaje directo', 'mencionar', 'ligar', 'fijar mensaje', 'arrobar'],
  },
  {
    id: 'herramientas',
    titulo: 'Herramientas, vehículos y almacén',
    respuesta:
      'Herramientas: «Pedir prestado», tu kit y tus préstamos. Vehículos: «Solicitar vehículo»; la entrega y la recepción van con fotos. Almacén: el inventario (lo operan almacén, compras, administrativo y dirección).',
    ruta: '/erp/almacen/herramientas',
    claves: ['herramienta', 'herramientas', 'prestamo', 'pedir prestado', 'vehiculo', 'vehiculos', 'camioneta', 'solicitar vehiculo', 'almacen', 'inventario', 'material'],
  },
  {
    id: 'perfil',
    titulo: 'Mi perfil y contraseña',
    respuesta:
      'Mi perfil muestra tus datos, la asistencia de hoy y tu contacto de emergencia. Para cambiar tu contraseña pídeselo a un administrador (CEO o dirección/coordinación administrativa), que la cambia desde Usuarios.',
    ruta: '/erp/my-profile',
    claves: ['perfil', 'mi perfil', 'contrasena', 'password', 'cambiar contrasena', 'foto de perfil', 'contacto de emergencia', 'mis datos'],
  },
  {
    id: 'notificaciones',
    titulo: 'Notificaciones',
    respuesta:
      'La campana de arriba muestra las recientes y al abrirla las marca como leídas; la lista completa está en Notificaciones. En el teléfono, acepta el permiso de avisos que pide la app al iniciar sesión para recibirlos.',
    ruta: '/erp/notifications-center',
    claves: ['notificacion', 'notificaciones', 'avisos', 'campana', 'push', 'no me llegan avisos'],
  },
  {
    id: 'organigrama',
    titulo: 'Organigrama',
    respuesta: 'El Organigrama muestra quién reporta a quién, en solo lectura; los cambios de jefe los hacen RH y dirección.',
    ruta: '/erp/organigrama',
    claves: ['organigrama', 'quien es mi jefe', 'mi jefe', 'a quien reporto', 'jerarquia'],
  },
];

/** Palabras de pregunta que no distinguen un tema de otro. */
const VACIAS = new Set([
  'como', 'donde', 'que', 'cual', 'cuando', 'quien', 'puedo', 'hago', 'hacer', 'esta', 'estan', 'veo', 'ver', 'el', 'la',
  'los', 'las', 'un', 'una', 'de', 'del', 'en', 'mi', 'mis', 'me', 'se', 'a', 'al', 'y', 'o', 'para', 'por', 'con', 'es',
  'hay', 'lo', 'le', 'su', 'sus', 'tengo', 'quiero', 'necesito',
]);

export type CoincidenciaAyuda = { tema: TemaAyuda; puntaje: number };

/**
 * Temas que mejor coinciden con la pregunta. Una frase completa vale 2; una palabra suelta, 1, y
 * solo si es la clave entera (no un pedazo): «cotizacion» no cuenta para «cotizaciones» de otro tema.
 */
export function buscarAyuda(pregunta: string): CoincidenciaAyuda[] {
  const texto = ` ${normalizarTexto(pregunta)} `;
  const palabras = new Set(texto.trim().split(' ').filter((p) => p && !VACIAS.has(p)));
  const out: CoincidenciaAyuda[] = [];
  for (const tema of TEMAS_AYUDA) {
    let puntaje = 0;
    for (const clave of tema.claves) {
      if (clave.includes(' ')) {
        if (texto.includes(` ${clave} `)) puntaje += 2;
      } else if (palabras.has(clave)) {
        puntaje += 1;
      }
    }
    if (puntaje > 0) out.push({ tema, puntaje });
  }
  return out.sort((a, b) => b.puntaje - a.puntaje);
}

/**
 * El tema solo cuenta si gana claro: por delante del segundo y con 2 puntos, o con 1 si ya es una
 * pregunta de uso («¿cómo subo evidencias?»: una palabra clave basta).
 */
export function temaSeguro(pregunta: string, deUso = false): TemaAyuda | null {
  const [primero, segundo] = buscarAyuda(pregunta);
  if (!primero || primero.puntaje < (deUso ? 1 : 2)) return null;
  if (segundo && segundo.puntaje >= primero.puntaje) return null;
  return primero.tema;
}

/** La guía en una línea por tema: es el bloque estable (con caché) que recibe la IA. */
export function guiaParaIA(): string {
  return TEMAS_AYUDA.map((t) => `[${t.id}] ${t.titulo}: ${t.respuesta}`).join('\n');
}
