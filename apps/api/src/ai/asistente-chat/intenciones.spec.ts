import { detectarIntencion, foliosEnTexto } from './intenciones.js';
import { buscarAyuda, temaSeguro, TEMAS_AYUDA } from './ayuda-core.js';
import { MENCION_ASISTENTE, preguntaLimpia } from './texto.js';
import { limpiarSalida, peticionAsistenteChat } from './asistente-chat-ia.js';

/** Frases reales del equipo → lo que decide el código. Lo que cae en `ia` es lo único que cuesta. */
const CASOS: Array<[string, string, Record<string, unknown>]> = [
  ['hola', 'saludo', {}],
  ['Buenos días', 'saludo', {}],
  ['gracias!', 'gracias', {}],
  ['¿qué puedes hacer?', 'capacidades', {}],
  ['ayuda', 'capacidades', {}],
  ['mis pendientes de hoy', 'pendientes', { cuando: 'hoy' }],
  ['¿Qué tengo para mañana?', 'pendientes', { cuando: 'manana' }],
  ['tengo actividades vencidas?', 'pendientes', { cuando: 'vencidas' }],
  ['mis actividades', 'pendientes', { cuando: 'todas' }],
  ['¿quién está en jornada?', 'jornada', { ver: 'en-jornada' }],
  ['quienes ya checaron hoy', 'jornada', { ver: 'en-jornada' }],
  ['¿Cuántos están trabajando?', 'jornada', { ver: 'en-jornada' }],
  ['quién no ha checado', 'jornada', { ver: 'sin-entrada' }],
  ['quienes faltan hoy', 'jornada', { ver: 'sin-entrada' }],
  ['¿a qué hora checé?', 'mi-asistencia', {}],
  ['mi asistencia', 'mi-asistencia', {}],
  ['cuántas horas llevo', 'mi-asistencia', {}],
  ['¿cómo va la AN-0351?', 'folios', { folios: ['AN-0351'] }],
  ['estado de NEX-LJ75100126-0007', 'folios', { folios: ['NEX-LJ75100126-0007'] }],
  ['¿Cómo subo evidencias?', 'ayuda', { temaId: 'evidencias' }],
  ['¿Dónde pido viáticos?', 'ayuda', { temaId: 'viaticos' }],
  ['como checo mi entrada', 'ayuda', { temaId: 'checar' }],
  ['¿cómo registro la comida?', 'ayuda', { temaId: 'comida' }],
  ['¿Cómo creo una cotización?', 'ayuda', { temaId: 'cotizaciones' }],
  ['¿a qué hora es la hora de entrada?', 'ayuda', { temaId: 'horario' }],
  ['¿cómo cambio mi contraseña?', 'ayuda', { temaId: 'perfil' }],
  ['qué pasa si se me pasa una actividad, queda no cumplida?', 'ayuda', { temaId: 'no-cumplida' }],
  ['asígnale a Raúl revisar las cámaras de Tox mañana a las 10', 'asignar', {}],
  ['crea una actividad para Laura: cablear piso 2', 'asignar', {}],
  ['cuéntame un chiste', 'fuera-de-tema', {}],
  ['¿qué clima hará mañana?', 'fuera-de-tema', {}],
  ['¿puedo cambiar de jefe directo si me cambio de área?', 'ia', {}],
];

describe('asistente del chat: reglas sin IA', () => {
  it.each(CASOS)('«%s» → %s', (frase, tipo, extra) => {
    const r = detectarIntencion(frase);
    expect(r.tipo).toBe(tipo);
    expect(r).toMatchObject(extra);
  });

  it('la mayoría de las preguntas comunes no tocan la IA', () => {
    const ia = CASOS.filter(([f]) => detectarIntencion(f).tipo === 'ia').length;
    expect(ia / CASOS.length).toBeLessThan(0.1);
  });

  it('«cómo veo mis actividades» es pregunta de uso, no consulta de datos', () => {
    expect(detectarIntencion('¿cómo veo mis actividades?')).toMatchObject({ tipo: 'ayuda', temaId: 'mis-actividades' });
  });

  it('folios: actividad y cotización, sin repetir y en orden', () => {
    expect(foliosEnTexto('AN-0002 y nex-lj75100126-0007-r2, otra vez AN-0002')).toEqual([
      'AN-0002',
      'NEX-LJ75100126-0007-R2',
    ]);
  });
});

describe('mención y pregunta limpia', () => {
  it('reconoce la pastilla y el @asistente escrito', () => {
    expect(MENCION_ASISTENTE.test('[@Asistente](user:0) hola')).toBe(true);
    expect(MENCION_ASISTENTE.test('oye @asistente ¿qué tengo hoy?')).toBe(true);
    expect(MENCION_ASISTENTE.test('le dije a @asistentes')).toBe(false);
  });

  it('quita la mención y deja las ligas como texto', () => {
    expect(preguntaLimpia('[@Asistente](user:0) ¿cómo va [AN-0351 · Apoyo](/erp/actividades/351)?')).toBe(
      '¿cómo va AN-0351 · Apoyo?',
    );
    expect(preguntaLimpia('@asistente: mis pendientes')).toBe('mis pendientes');
  });
});

describe('guía de ayuda', () => {
  it('ids únicos y rutas dentro de Core', () => {
    const ids = TEMAS_AYUDA.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TEMAS_AYUDA) expect(t.ruta.startsWith('/erp/')).toBe(true);
  });

  it('empate o poca señal no decide: lo manda a la IA', () => {
    expect(temaSeguro('¿qué onda con eso?')).toBeNull();
    expect(buscarAyuda('cotizacion de un cliente')[0]?.tema.id).toBeDefined();
  });
});

describe('parte de IA', () => {
  it('la petición lleva la guía fija en el sistema y solo rol + pregunta en el mensaje', () => {
    const p = peticionAsistenteChat('¿puedo trabajar desde casa?', 'tecnico');
    expect(p.sistema).toHaveLength(1);
    expect(p.sistema[0]).toContain('[viaticos]');
    expect(p.usuario).toBe('Rol de quien pregunta: tecnico\nPregunta: ¿puedo trabajar desde casa?');
    expect(p.maxTokens).toBeLessThanOrEqual(400);
    expect(p.pensar).toBe(false);
    expect(p.modelo).toBe('claude-haiku-5-5');
  });

  it('limpia lo que regresa: tema válido, sin enlaces ni markdown, y fuera de tema sin texto', () => {
    expect(limpiarSalida({ fueraDeTema: false, tema: 'inventado', respuesta: '**Hola** [aquí](https://x.y) ok' })).toEqual({
      fueraDeTema: false,
      tema: null,
      respuesta: 'Hola aquí ok',
    });
    expect(limpiarSalida({ fueraDeTema: true, tema: 'chat', respuesta: 'un chiste' })).toEqual({
      fueraDeTema: true,
      tema: null,
      respuesta: '',
    });
  });
});
