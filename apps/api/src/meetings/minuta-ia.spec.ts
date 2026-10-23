import {
  CONFIG_MINUTA,
  CONFIG_NOTAS,
  ESQUEMA_MINUTA,
  ESQUEMA_NOTAS,
  UMBRAL_TRANSCRIPCION_COMPLETA,
  construirMinuta,
  entradaMinuta,
  fechaLarga,
  marcaTiempo,
  minutaTexto,
  notasEnTexto,
  partesNuevas,
  peticionMinuta,
  peticionNotas,
  siguienteTramo,
  tramoAlConcluir,
  transcripcionConMarcas,
  type ContextoReunion,
  type MinutaPlan,
  type NotasGuardadas,
  type ParteTexto,
} from './minuta-ia';

const palabras = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`).join(' ');

/** Partes de un minuto con `n` palabras cada una. */
const partes = (cuantas: number, n = 130, estado: ParteTexto['estado'] = 'LISTA'): ParteTexto[] =>
  Array.from({ length: cuantas }, (_, i) => ({
    parte: i + 1,
    estado,
    texto: estado === 'LISTA' ? palabras(n) : null,
    inicioMs: i * 60_000,
    duracionMs: 60_000,
  }));

const PERSONAS = [
  { id: 2, nombre: 'Carolina Pérez Lima', puesto: 'Coordinadora' },
  { id: 9, nombre: 'Antonio Vázquez Luna', puesto: 'Técnico' },
  { id: 11, nombre: 'Roberto Castillo Núñez', puesto: 'Jefe de soporte' },
];

const ctx: ContextoReunion = {
  titulo: 'Revisión de avances',
  fecha: '2026-10-21',
  horaInicio: '10:00',
  duracionMs: 30 * 60_000,
  asistentes: ['Carolina Pérez Lima'],
  agenda: null,
  personas: PERSONAS,
  anterior: { id: 5, titulo: 'Revisión de avances', fecha: '2026-10-14' },
  previos: [
    { ref: 'A1', agreementId: 501, descripcion: 'Entregar el reporte de SLA', responsable: 'Roberto Castillo Núñez', fechaCompromiso: '2026-10-16', estado: 'PENDIENTE' },
    { ref: 'A2', agreementId: 502, descripcion: 'Comprar 6 domos', responsable: null, fechaCompromiso: null, estado: 'PENDIENTE' },
  ],
};

describe('tramos de notas en vivo', () => {
  it('toma las partes listas en orden y se detiene en la primera pendiente', () => {
    const p = partes(5);
    p[2] = { ...p[2], estado: 'PENDIENTE', texto: null };
    expect(partesNuevas(p, 0).map((x) => x.parte)).toEqual([1, 2]);
    expect(partesNuevas(p, 2)).toEqual([]);
    expect(partesNuevas(p.filter((x) => x.parte > 3), 3).map((x) => x.parte)).toEqual([4, 5]);
    // Un hueco (parte que no llegó) también detiene.
    expect(partesNuevas([p[0], p[3]], 0).map((x) => x.parte)).toEqual([1]);
  });

  it('anota cada ~4 minutos con al menos 250 palabras', () => {
    expect(siguienteTramo(partes(3))).toBeNull();
    expect(siguienteTramo(partes(4))?.length).toBe(4);
    expect(siguienteTramo(partes(4, 40))).toBeNull(); // poca plática: espera
    expect(siguienteTramo(partes(2), { final: true })?.length).toBe(2);
    expect(siguienteTramo(partes(4, 0))).toBeNull(); // silencio
  });

  it('no deja pasar un tramo de más de 1,500 palabras', () => {
    const tramo = siguienteTramo(partes(20, 200))!;
    expect(tramo.length).toBe(7);
    // Una sola parte enorme sí entra (no se puede partir).
    expect(siguienteTramo(partes(1, 3000))?.length).toBe(1);
  });

  it('el texto pegado (sin tiempos) se anota solo por palabras', () => {
    const pegado = partes(2, 400).map((p) => ({ ...p, inicioMs: null, duracionMs: null }));
    expect(siguienteTramo(pegado)?.length).toBe(2);
  });

  it('al concluir, una junta corta no necesita notas y la cola larga sí', () => {
    expect(tramoAlConcluir(partes(40, 130), 0)).toBeNull(); // 40 min: la minuta lee todo
    const larga = partes(40, 130);
    expect(tramoAlConcluir(larga, 35, 3_000)).toBeNull(); // cola de 5 min: va cruda
    expect(tramoAlConcluir(larga, 20, 3_000)?.[0].parte).toBe(21);
    // Un texto enorme (más de ~3.5 h) sí se resume por notas con el umbral de producción.
    expect(tramoAlConcluir(partes(300, 130), 0)?.[0].parte).toBe(1);
  });
});

describe('entrada de la minuta', () => {
  const notas = (desde: number, hasta: number): NotasGuardadas => ({
    desde,
    hasta,
    inicioMs: (desde - 1) * 60_000,
    finMs: hasta * 60_000,
    palabras: 100,
    notas: {
      temas: [{ titulo: 'Grupo Tox', puntos: ['Piden 15 % de descuento', 'Se ofrece 8 %'] }],
      decisiones: ['Máximo 8 %'],
      acuerdos: [{ que: 'Enviar contrapropuesta', responsable: 'Mafer', fecha: '2026-10-23', prioridad: 'alta' }],
      pendientes: [],
      preguntas: [],
      riesgos: [],
      cifras: ['2.3 millones en el embudo'],
      lecciones: [],
      avancesPrevios: [{ ref: 'A1', estado: 'cumplido', detalle: 'Se entregó el viernes' }],
    },
  });

  it('una junta corta va con la transcripción completa y sus marcas', () => {
    const e = entradaMinuta(partes(3, 50), [notas(1, 3)]);
    expect(e.fuente).toBe('transcripcion');
    expect(e.texto.split('\n')[1].startsWith('[01:00] p0')).toBe(true);
  });

  it('una larga va con las notas y la cola sin anotar', () => {
    const p = partes(40, 130);
    expect(entradaMinuta(p, [notas(1, 18)]).fuente).toBe('transcripcion'); // 40 min: completa
    expect(300 * 130).toBeGreaterThan(UMBRAL_TRANSCRIPCION_COMPLETA);
    const e = entradaMinuta(p, [notas(1, 18), notas(19, 36)], 3_000);
    expect(e.fuente).toBe('notas');
    expect(e.texto).toContain('NOTAS POR TRAMO');
    expect(e.texto).toContain('[00:00–18:00]');
    expect(e.texto).toContain('• Grupo Tox');
    expect(e.texto).toContain('Acuerdos: Enviar contrapropuesta (Mafer; 2026-10-23; alta)');
    expect(e.texto).toContain('Avances de acuerdos anteriores: A1 cumplido: Se entregó el viernes');
    expect(e.texto).toContain('TRANSCRIPCIÓN DEL ÚLTIMO TRAMO 36:00–40:00');
    // Sin notas, aunque sea larga, va completa.
    expect(entradaMinuta(p, [], 3_000).fuente).toBe('transcripcion');
  });

  it('las notas en texto omiten las secciones vacías', () => {
    const texto = notasEnTexto([notas(1, 4)]);
    expect(texto).not.toContain('Pendientes');
    expect(texto).not.toContain('Riesgos');
  });

  it('la transcripción del anexo salta partes con error y lleva minuto', () => {
    const p = partes(3, 2);
    p[1] = { ...p[1], estado: 'ERROR', texto: null };
    expect(transcripcionConMarcas(p)).toBe('[00:00] p0 p1\n[02:00] p0 p1');
    expect(marcaTiempo(3_723_000)).toBe('1:02:03');
  });
});

describe('peticiones a Claude', () => {
  it('el prompt fijo va primero (caché) y lo variable en el mensaje', () => {
    const n = peticionNotas(ctx, partes(4), ['Grupo Tox']);
    expect(n.sistema[1]).toContain('Carolina Pérez Lima (Coordinadora)');
    expect(n.sistema[2]).toContain('A2. Comprar 6 domos — sin responsable — pendiente');
    expect(n.usuario).toContain('Temas anteriores: Grupo Tox');
    expect(n.usuario).toContain('Tramo 00:00–04:00:');
    expect(n.modelo).toBe(CONFIG_NOTAS.modelo);
    expect(n.esquema).toBe(ESQUEMA_NOTAS);
    // Mismo sistema en todos los tramos de la reunión: acierta en caché.
    expect(peticionNotas(ctx, partes(8).slice(4), []).sistema).toEqual(n.sistema);

    const m = peticionMinuta(ctx, { fuente: 'transcripcion', texto: 'hola', palabras: 1 });
    expect(m.usuario).toContain('Fecha: miércoles 21 de octubre de 2026 (2026-10-21) · inicio 10:00 · duración 30 min');
    expect(m.usuario).toContain('TRANSCRIPCIÓN COMPLETA\nhola');
    expect(m.esquema).toBe(ESQUEMA_MINUTA);
    expect(m.maxTokens).toBe(CONFIG_MINUTA.maxTokens);
  });

  it('sin reunión anterior no manda el bloque de acuerdos previos', () => {
    expect(peticionNotas({ ...ctx, anterior: null, previos: [] }, partes(4), []).sistema[2]).toBe('');
  });

  it('el esquema exige todos los campos y no admite otros', () => {
    const revisar = (e: Record<string, unknown>) => {
      if (e.type === 'object') {
        expect(e.additionalProperties).toBe(false);
        expect(e.required).toEqual(Object.keys(e.properties as object));
        Object.values(e.properties as Record<string, Record<string, unknown>>).forEach(revisar);
      }
      if (e.type === 'array') revisar(e.items as Record<string, unknown>);
    };
    revisar(ESQUEMA_NOTAS);
    revisar(ESQUEMA_MINUTA);
  });

  it('fecha larga con el día de la semana', () => {
    expect(fechaLarga('2026-10-23')).toBe('viernes 23 de octubre de 2026 (2026-10-23)');
    expect(fechaLarga('nada')).toBe('nada');
  });
});

describe('minuta final', () => {
  const plan: MinutaPlan = {
    tituloSugerido: '  Revisión: Colegio Andes y SAT ',
    resumenEjecutivo: 'Se revisaron los acuerdos.',
    loMasImportante: ['a', 'b', 'c', 'd', 'e', 'f'],
    temas: [{ titulo: 'Colegio Andes', resumen: 'Levantamiento', puntos: ['Dos de tres edificios', ' '], conclusion: '' }],
    decisiones: ['Usar fibra'],
    acuerdos: [
      { descripcion: 'Contestar el requerimiento del SAT', responsable: 'Antonio Vázquez', fechaCompromiso: '2026-10-28', prioridad: 'alta' },
      { descripcion: 'Mandar el plano', responsable: 'Ing. Ochoa', fechaCompromiso: 'el lunes', prioridad: 'media' },
      { descripcion: ' ', responsable: null, fechaCompromiso: null, prioridad: 'baja' },
    ],
    pendientes: ['Revisar proveedores de discos'],
    preguntasAbiertas: [],
    riesgos: [{ riesgo: 'Domos sin existencia', mitigacion: '' }],
    cifras: [{ dato: '94 %', contexto: 'cumplimiento de SLA' }],
    proximosPasos: [],
    lecciones: [],
    seguimiento: [{ ref: 'a1', estado: 'cumplido', detalle: 'Se entregó el viernes' }, { ref: 'A9', estado: 'bloqueado', detalle: 'x' }],
  };

  it('busca responsables en la empresa, limpia fechas y completa el seguimiento', () => {
    const m = construirMinuta(plan, PERSONAS, ctx.previos, { anterior: ctx.anterior!, fuente: 'notas' });
    expect(m.tituloSugerido).toBe('Revisión: Colegio Andes y SAT');
    expect(m.loMasImportante).toHaveLength(5);
    expect(m.temas[0]).toEqual({ titulo: 'Colegio Andes', resumen: 'Levantamiento', puntos: ['Dos de tres edificios'], conclusion: null });
    expect(m.acuerdos).toHaveLength(2);
    expect(m.acuerdos[0].responsable).toEqual({ id: 9, nombre: 'Antonio Vázquez Luna' });
    expect(m.acuerdos[0].prioridad).toBe('alta');
    expect(m.acuerdos[1]).toMatchObject({ responsable: null, textoResponsable: 'Ing. Ochoa', fechaCompromiso: null });
    expect(m.riesgos).toEqual([{ riesgo: 'Domos sin existencia', mitigacion: null }]);
    expect(m.seguimiento).toEqual([
      { ref: 'A1', agreementId: 501, acuerdo: 'Entregar el reporte de SLA', responsable: 'Roberto Castillo Núñez', estado: 'cumplido', detalle: 'Se entregó el viernes' },
      { ref: 'A2', agreementId: 502, acuerdo: 'Comprar 6 domos', responsable: null, estado: 'sin_mencion', detalle: null },
    ]);
  });

  it('la minuta en texto lleva los apartados con contenido', () => {
    const texto = minutaTexto(construirMinuta(plan, PERSONAS, ctx.previos, { anterior: null, fuente: 'notas' }));
    expect(texto.startsWith('RESUMEN EJECUTIVO\nSe revisaron los acuerdos.')).toBe(true);
    expect(texto).toContain('- Contestar el requerimiento del SAT · Antonio Vázquez Luna · 2026-10-28 · prioridad alta');
    expect(texto).toContain('SEGUIMIENTO DE LA REUNIÓN ANTERIOR\n- Entregar el reporte de SLA: Cumplido — Se entregó el viernes');
    expect(texto).not.toContain('PREGUNTAS ABIERTAS');
  });

  it('una respuesta incompleta no rompe nada', () => {
    const m = construirMinuta({} as MinutaPlan, PERSONAS, [], { anterior: null, fuente: 'transcripcion' });
    expect(m).toMatchObject({ resumenEjecutivo: '', temas: [], acuerdos: [], seguimiento: [] });
  });
});
