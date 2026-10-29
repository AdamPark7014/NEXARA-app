/**
 * Casos del eval del asistente del chat (#general).
 *
 * Dos clases de caso:
 *  - `codigo`: frases comunes que deben resolverse por reglas, sin llamar a la IA (costo cero). Si una
 *    cae en `ia`, el eval lo marca: es una regla que falta.
 *  - `ia`: lo que las reglas no cubren y sí va a Claude. Se revisa en código (fuera de tema, tema de
 *    la guía, largo) y, si se pide, con un juez que vigila que no invente pantallas ni políticas.
 */
import type { Intencion } from '../asistente-chat/intenciones.js';

export type CasoAsistenteChat =
  | { id: string; tipo: 'codigo'; pregunta: string; intencion: Intencion['tipo'] }
  | {
      id: string;
      tipo: 'ia';
      pregunta: string;
      rol?: string;
      fueraDeTema: boolean;
      /** Temas de la guía aceptables (`null` = la guía no lo cubre y debe decirlo). */
      temas?: Array<string | null>;
      /** Palabras que la respuesta debe traer (sin acentos ni mayúsculas). */
      debeDecir?: string[];
      /** Lo que sería inventar: no debe aparecer. */
      noDebeDecir?: string[];
    };

export const CASOS_ASISTENTE_CHAT: CasoAsistenteChat[] = [
  // ── Lo resuelve el código (0 tokens) ──
  { id: 'c01', tipo: 'codigo', pregunta: 'mis pendientes de hoy', intencion: 'pendientes' },
  { id: 'c02', tipo: 'codigo', pregunta: '¿quién no ha checado?', intencion: 'jornada' },
  { id: 'c03', tipo: 'codigo', pregunta: '¿cómo va la AN-0351?', intencion: 'folios' },
  { id: 'c04', tipo: 'codigo', pregunta: '¿Cómo subo evidencias?', intencion: 'ayuda' },
  { id: 'c05', tipo: 'codigo', pregunta: '¿dónde pido viáticos?', intencion: 'ayuda' },
  { id: 'c06', tipo: 'codigo', pregunta: 'cuéntame un chiste', intencion: 'fuera-de-tema' },
  { id: 'c07', tipo: 'codigo', pregunta: 'asígnale a Raúl revisar las cámaras de Tox mañana', intencion: 'asignar' },
  { id: 'c08', tipo: 'codigo', pregunta: '¿a qué hora checé hoy?', intencion: 'mi-asistencia' },
  { id: 'c09', tipo: 'codigo', pregunta: '¿qué puedes hacer?', intencion: 'capacidades' },
  { id: 'c10', tipo: 'codigo', pregunta: '¿qué tengo para mañana?', intencion: 'pendientes' },

  // ── Va a la IA ──
  {
    id: 'i01',
    tipo: 'ia',
    pregunta: '¿puedo cambiar de jefe directo si me cambio de área?',
    fueraDeTema: false,
    temas: ['organigrama', null],
    noDebeDecir: ['tu mismo', 'desde tu perfil puedes cambiar'],
  },
  {
    id: 'i02',
    tipo: 'ia',
    pregunta: 'si estoy en una obra sin señal, ¿cómo registro mi llegada?',
    fueraDeTema: false,
    temas: ['checar'],
    debeDecir: ['sin ubicacion'],
  },
  {
    id: 'i03',
    tipo: 'ia',
    pregunta: 'me equivoqué de foto en lo que mandé de la AN, ¿qué hago?',
    fueraDeTema: false,
    temas: ['evidencias', 'revisar', null],
    noDebeDecir: ['boton borrar', 'eliminar foto'],
  },
  {
    id: 'i04',
    tipo: 'ia',
    pregunta: '¿qué significa que alguien salga en rojo en la pizarra?',
    fueraDeTema: false,
    temas: ['equipo', 'no-cumplida'],
  },
  {
    id: 'i05',
    tipo: 'ia',
    pregunta: '¿la hora de la comida cuenta como trabajada?',
    fueraDeTema: false,
    temas: ['comida', 'horario', 'retardos', null],
  },
  { id: 'i06', tipo: 'ia', pregunta: '¿quién me autoriza un gasto de casetas?', fueraDeTema: false, temas: ['viaticos'] },
  {
    id: 'i07',
    tipo: 'ia',
    pregunta: '¿por qué me salió como no cumplida si sí la terminé?',
    fueraDeTema: false,
    temas: ['no-cumplida'],
    debeDecir: ['revision'],
  },
  { id: 'i08', tipo: 'ia', pregunta: 'necesito un taladro para mañana', fueraDeTema: false, temas: ['herramientas'] },
  {
    id: 'i09',
    tipo: 'ia',
    pregunta: '¿cómo le hago para que el cliente firme lo que le mandé?',
    fueraDeTema: false,
    temas: ['cotizaciones'],
    debeDecir: ['enlace'],
  },
  {
    id: 'i10',
    tipo: 'ia',
    pregunta: '¿dónde veo cuánto me van a pagar esta semana?',
    fueraDeTema: false,
    temas: [null, 'retardos', 'perfil'],
    noDebeDecir: ['recibo de nomina en tu perfil', 'mis pagos'],
  },
  {
    id: 'i11',
    tipo: 'ia',
    pregunta: '¿puedo trabajar desde mi casa el viernes?',
    rol: 'tecnico',
    fueraDeTema: false,
    temas: [null, 'horario', 'checar'],
    noDebeDecir: ['si puedes trabajar desde casa', 'home office esta permitido'],
  },
  { id: 'i12', tipo: 'ia', pregunta: 'hazme un resumen de la independencia de México', fueraDeTema: true },
  { id: 'i13', tipo: 'ia', pregunta: '¿quién ganó el último mundial?', fueraDeTema: true },
  { id: 'i14', tipo: 'ia', pregunta: 'ayúdame a programar un script en Python que lea un Excel', fueraDeTema: true },
  {
    id: 'i15',
    tipo: 'ia',
    pregunta: 'no me deja subir la foto de salida, ¿qué reviso?',
    fueraDeTema: false,
    temas: ['evidencias', 'iniciar-actividad', null],
  },
  { id: 'i16', tipo: 'ia', pregunta: '¿quién revisa lo que entrego?', fueraDeTema: false, temas: ['revisar'] },
  {
    id: 'i17',
    tipo: 'ia',
    pregunta: 'se me olvidó marcar la salida ayer, ¿qué pasa?',
    fueraDeTema: false,
    temas: ['horario', 'checar'],
    debeDecir: ['23:30'],
  },
  {
    id: 'i18',
    tipo: 'ia',
    pregunta: '¿en qué parte veo lo que quedamos en la junta del lunes?',
    fueraDeTema: false,
    temas: ['reuniones'],
    debeDecir: ['acuerdos'],
  },
  {
    id: 'i19',
    tipo: 'ia',
    pregunta: 'necesito transporte para ir a Tlaxcala mañana',
    fueraDeTema: false,
    temas: ['herramientas'],
    debeDecir: ['vehiculo'],
  },
  {
    id: 'i20',
    tipo: 'ia',
    pregunta: 'dame tu opinión de la reforma laboral',
    fueraDeTema: true,
  },
];
