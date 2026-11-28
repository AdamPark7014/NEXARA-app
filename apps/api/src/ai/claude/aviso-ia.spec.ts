import type { EventoCompuerta, MotivoCorte } from './compuerta-ia';
import { duracionLegible, textoAvisoIa } from './aviso-ia';

const MIN = 60_000;
const HORA = 60 * MIN;
/** 28-11-2026 15:00 UTC = 09:00 en México (sin horario de verano desde 2022). */
const T0 = Date.UTC(2026, 10, 28, 15, 0, 0);

type Caida = Extract<EventoCompuerta, { tipo: 'CAIDA' }>;
const caida = (motivo: MotivoCorte, extra: Partial<Caida> = {}): Caida => ({
  tipo: 'CAIDA',
  motivo,
  desde: T0,
  detalle: '401 authentication_error',
  origen: 'llamada',
  fallos: 3,
  ...extra,
});
const volvio = (desde: number, hasta: number): EventoCompuerta => ({ tipo: 'VOLVIO', desde, hasta });

/** Nombres de variables de entorno: MAYÚSCULAS con guion bajo. */
const VARIABLE_DE_ENTORNO = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;
const NOMBRES_DE_PERSONAS = /\b(Adam|Christian|Getzemani|Claudia|Tere|Liz|Luis|Antonio)\b/i;
const MOTIVOS: MotivoCorte[] = ['llave_puerta_invalida', 'token_nexara_invalido', 'proyecto_desactivado', 'presupuesto_agotado'];

describe('textoAvisoIa: la caída', () => {
  it('la llave de la puerta: dice desde cuándo, qué se afecta, cómo arreglarlo y que la IA se prueba sola', () => {
    const t = textoAvisoIa(caida('llave_puerta_invalida'));
    expect(t.title).toBe('La IA de NEXARA dejó de responder');
    expect(t.priority).toBe('high');
    expect(t.message).toBe(
      'Desde las 09:00 la puerta de IA rechaza la llave de Anthropic (3 intentos seguidos). ' +
        'Mientras tanto no hay sugerencia de complejidad, «Asignar con IA», actas ni lectura de fotos; lo demás sigue igual y nada se pierde. ' +
        'Para arreglarlo hay que poner una llave nueva con subir-llave-ia.ps1. ' +
        'La IA se prueba sola cada 5 a 30 minutos y te aviso cuando regrese.',
    );
  });

  it('el token de NEXARA: manda a revisar la variable en el archivo del servidor', () => {
    const t = textoAvisoIa(caida('token_nexara_invalido'));
    expect(t.message).toContain('Desde las 09:00 la puerta de IA no reconoce el token de NEXARA (3 intentos seguidos).');
    expect(t.message).toContain('revisa ANTHROPIC_API_KEY en /etc/ai/nexara-claude.env del servidor');
  });

  it('el proyecto desactivado: dice dónde está el interruptor de la puerta', () => {
    const t = textoAvisoIa(caida('proyecto_desactivado'));
    expect(t.message).toContain('Desde las 09:00 la puerta tiene desactivado el proyecto nexara (activo: false en config/proyectos.json');
    expect(t.message).toContain('volver a activarlo en la puerta de IA');
  });

  it('el presupuesto agotado: vuelve solo el día 1 y dice cómo subir el tope antes', () => {
    const t = textoAvisoIa(caida('presupuesto_agotado'));
    expect(t.message).toContain('Desde las 09:00 se acabó el presupuesto mensual de IA de NEXARA en la puerta (3 intentos seguidos).');
    expect(t.message).toContain('Vuelve solo el día 1; para antes, subir el tope en config/proyectos.json y correr subir-config.');
  });

  it('en cada motivo: lo mismo se afecta, se prueba sola y no hay variables ni nombres de personas fuera de las rutas técnicas', () => {
    for (const motivo of MOTIVOS) {
      const { message } = textoAvisoIa(caida(motivo));
      expect(message).toContain('«Asignar con IA»');
      expect(message).toContain('nada se pierde');
      expect(message).toContain('La IA se prueba sola cada 5 a 30 minutos y te aviso cuando regrese.');
      expect(message).not.toMatch(NOMBRES_DE_PERSONAS);
      // Solo el motivo del token cita una variable (la que hay que revisar en el servidor).
      if (motivo === 'token_nexara_invalido') {
        expect(message.match(new RegExp(VARIABLE_DE_ENTORNO, 'g'))).toEqual(['ANTHROPIC_API_KEY']);
      } else {
        expect(message).not.toMatch(VARIABLE_DE_ENTORNO);
      }
    }
  });

  it('no repite el detalle técnico del evento (estado y tipo de error)', () => {
    for (const motivo of MOTIVOS) {
      const { message } = textoAvisoIa(caida(motivo, { detalle: '401 authentication_error sk-ant-no-debe-salir' }));
      expect(message).not.toContain('401');
      expect(message).not.toContain('authentication_error');
      expect(message).not.toContain('sk-ant');
    }
  });

  it('la hora es la de México, también cerca de la medianoche (00:05, no 24:05)', () => {
    expect(textoAvisoIa(caida('llave_puerta_invalida', { desde: Date.UTC(2026, 10, 28, 6, 5) })).message).toContain('Desde las 00:05 ');
    expect(textoAvisoIa(caida('llave_puerta_invalida', { desde: Date.UTC(2026, 10, 28, 5, 59) })).message).toContain('Desde las 23:59 ');
  });

  it('cuenta los intentos: uno, varios o lo que confirmó la prueba automática', () => {
    expect(textoAvisoIa(caida('llave_puerta_invalida', { fallos: 1 })).message).toContain('(1 intento)');
    expect(textoAvisoIa(caida('llave_puerta_invalida', { fallos: 5 })).message).toContain('(5 intentos seguidos)');
    expect(textoAvisoIa(caida('llave_puerta_invalida', { fallos: 1, origen: 'sonda' })).message).toContain(
      '(lo confirmó la prueba automática)',
    );
    expect(textoAvisoIa(caida('llave_puerta_invalida', { fallos: 4, origen: 'sonda' })).message).toContain('(4 intentos seguidos)');
  });

  it('a la dirección: sin nombres de archivos ni de scripts, y dice que ya se avisó a desarrollo', () => {
    for (const motivo of MOTIVOS) {
      const t = textoAvisoIa(caida(motivo), 'direccion');
      expect(t.title).toBe('La IA de NEXARA dejó de responder');
      expect(t.priority).toBe('high');
      expect(t.message).toContain('Desde las 09:00 ');
      expect(t.message).toContain('«Asignar con IA»');
      expect(t.message).toContain('Ya se avisó a desarrollo.');
      expect(t.message).not.toMatch(VARIABLE_DE_ENTORNO);
      expect(t.message).not.toMatch(/subir-|config\/|\/etc\/|\.ps1|\.json|\.env|puerta|token|llave|GET /i);
      expect(t.message).not.toMatch(NOMBRES_DE_PERSONAS);
    }
    expect(textoAvisoIa(caida('presupuesto_agotado'), 'direccion').message).toContain('se renueva solo el día 1');
  });
});

describe('textoAvisoIa: el regreso', () => {
  it('dice cuánto estuvo caída (X h Y min), desde cuándo y dónde ver el detalle', () => {
    const t = textoAvisoIa(volvio(T0, T0 + 2 * HORA + 5 * MIN));
    expect(t.title).toBe('La IA de NEXARA ya responde otra vez');
    expect(t.priority).toBe('normal');
    expect(t.message).toBe(
      'Estuvo sin responder 2 h 5 min (desde las 09:00). Ya pasó la prueba. ' +
        'Lo que se creó mientras tanto quedó sin sugerencia de complejidad; el detalle está en GET /ai/salud.',
    );
  });

  it('menos de una hora: solo minutos', () => {
    expect(textoAvisoIa(volvio(T0, T0 + 45 * MIN)).message).toContain('Estuvo sin responder 45 min (desde las 09:00).');
    expect(textoAvisoIa(volvio(T0, T0 + 20_000)).message).toContain('Estuvo sin responder menos de 1 min ');
  });

  it('una caída de varios días no se corta: las horas siguen y se agrega el día en que empezó (hora de México)', () => {
    // 21-11 22:25 UTC = 16:25 en México; vuelve el 28-11 a las 06:23 UTC = 00:23 en México.
    const desde = Date.UTC(2026, 10, 21, 22, 25);
    const hasta = Date.UTC(2026, 10, 28, 6, 23);
    expect(textoAvisoIa(volvio(desde, hasta)).message).toContain(
      'Estuvo sin responder 151 h 58 min (desde las 16:25 del 21 de noviembre).',
    );
  });

  it('una caída que cruza la medianoche de México también dice el día', () => {
    // 05-12 23:30 en México (06-12 05:30 UTC) hasta 06-12 00:10 en México (06:10 UTC).
    const t = textoAvisoIa(volvio(Date.UTC(2026, 11, 6, 5, 30), Date.UTC(2026, 11, 6, 6, 10)));
    expect(t.message).toContain('Estuvo sin responder 40 min (desde las 23:30 del 5 de diciembre).');
  });

  it('a la dirección: sin la ruta técnica del detalle', () => {
    const t = textoAvisoIa(volvio(T0, T0 + HORA), 'direccion');
    expect(t.message).toContain('Estuvo sin responder 1 h 0 min (desde las 09:00).');
    expect(t.message).toContain('La IA ya responde.');
    expect(t.message).not.toContain('/ai/salud');
    expect(t.message).not.toMatch(NOMBRES_DE_PERSONAS);
  });

  it('un reloj al revés (hasta antes de desde) no da una duración negativa', () => {
    expect(textoAvisoIa(volvio(T0, T0 - HORA)).message).toContain('Estuvo sin responder menos de 1 min ');
  });
});

describe('duracionLegible', () => {
  it('redondea al minuto más cercano', () => {
    expect(duracionLegible(29_000)).toBe('menos de 1 min');
    expect(duracionLegible(31_000)).toBe('1 min');
    expect(duracionLegible(59 * MIN)).toBe('59 min');
    expect(duracionLegible(60 * MIN)).toBe('1 h 0 min');
    expect(duracionLegible(25 * HORA + 30 * MIN)).toBe('25 h 30 min');
  });
});
