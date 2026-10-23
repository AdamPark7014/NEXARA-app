import {
  aFechaISO,
  agendaDe,
  bloqueCoincidencias,
  buscar,
  catalogoRelevante,
  construirPropuesta,
  corregirHoraPasada,
  horaActualRedondeada,
  indicacionesSinEco,
  lugarDicho,
  mencionaDia,
  mensajeUsuario,
  peticionAsistente,
  planDeSalida,
  proximosDias,
  puntaje,
  sonido,
  type AccionPlan,
  type CatalogosNexara,
} from './asistente-actividades.js';

const catalogos: CatalogosNexara = {
  personas: [
    { id: 7, nombre: 'José Antonio Ramírez', puesto: 'Encargado de soporte' },
    { id: 8, nombre: 'Carolina Pérez' },
    { id: 9, nombre: 'Juan González' },
    { id: 10, nombre: 'Juan Sánchez' },
  ],
  clientes: [
    { id: 1, name: 'TOX Logística' },
    { id: 2, name: 'Banorte' },
  ],
  sucursales: [
    { id: 50, clientId: 2, name: 'Plaza Satélite', branchNumber: '014', city: 'Naucalpan', clientName: 'Banorte' },
  ],
  proyectos: [{ id: 300, title: 'CCTV nave 2', clientId: 1, clientName: 'TOX Logística' }],
};

const base: AccionPlan = {
  tipo: 'tarea',
  razonTipo: 'Junta con el cliente',
  subtipoTarea: 'Junta',
  tipoServicio: null,
  titulo: 'Ir a Tox con el cliente',
  indicaciones: null,
  responsable: 'Antonio',
  cliente: 'Tox',
  sitio: null,
  fecha: '2026-10-12',
  hora: '15:00',
  fechaLimite: null,
  horaLimite: null,
  duracionMin: 60,
  prioridad: 'Media',
  encargo: null,
};

// 12-10-2026 10:00 en CDMX
const ahora = new Date('2026-10-12T16:00:00Z');
const ctx = { creadoPorId: 1, ahora };

describe('asistente de actividades', () => {
  it('«que Antonio vaya a Tox a las 3 con el cliente» queda lista para crear', () => {
    const p = construirPropuesta(base, catalogos, ctx);
    expect(p.responsable).toEqual({ id: 7, nombre: 'José Antonio Ramírez' });
    expect(p.cliente).toEqual({ id: 1, nombre: 'TOX Logística' });
    expect(p.faltantes).toEqual([]);
    expect(p.payload).toMatchObject({
      responsableId: 7,
      creadoPorId: 1,
      coreKind: 'tarea',
      activityType: 'INTERNAL',
      ticketType: 'OTRO',
      ticketTypeCustom: 'Junta',
      clientId: 1,
      fechaInicio: '2026-10-12T21:00:00.000Z',
      fechaMaxima: '2026-10-12T21:00:00.000Z',
      tiempoEstimadoMin: 60,
      estatus: 'Pendiente',
    });
    expect(p.payload.periodoFin).toBeUndefined();
    expect(p.agenda).toEqual({ dia: '2026-10-12', hora: '15:00', hasta: null, horaDicha: true });
    expect(p.resumen).toBe('Tarea · Junta para José Antonio Ramírez en TOX Logística hoy 15:00');
  });

  it('con dos personas igual de probables no elige: deja candidatos', () => {
    const p = construirPropuesta({ ...base, responsable: 'Juan' }, catalogos, ctx);
    expect(p.responsable).toBeNull();
    expect(p.faltantes).toContain('responsable');
    expect(p.responsableCandidatos.map((c) => c.id).sort()).toEqual([10, 9].sort());
    expect(p.payload.responsableId).toBeUndefined();
  });

  it('un servicio sin cliente registrado pide el cliente', () => {
    const p = construirPropuesta(
      { ...base, tipo: 'servicio', tipoServicio: 'CORRECTIVO', cliente: 'Farmacias Patito' },
      catalogos,
      ctx,
    );
    expect(p.faltantes).toEqual(['cliente']);
    expect(p.payload).toMatchObject({ coreKind: 'servicio', ticketType: 'CORRECTIVO', branchName: 'Farmacias Patito' });
  });

  it('una sucursal conocida trae su cliente y sus datos', () => {
    const p = construirPropuesta(
      { ...base, tipo: 'servicio', tipoServicio: 'PREVENTIVO', cliente: null, sitio: 'plaza satelite' },
      catalogos,
      ctx,
    );
    expect(p.cliente).toEqual({ id: 2, nombre: 'Banorte' });
    expect(p.sucursal).toEqual({ id: 50, nombre: 'Plaza Satélite' });
    expect(p.payload).toMatchObject({ clientId: 2, branchNumber: '014', branchCity: 'Naucalpan' });
  });

  it('una obra toma el único proyecto activo del cliente', () => {
    const p = construirPropuesta({ ...base, tipo: 'obra', subtipoTarea: null }, catalogos, ctx);
    expect(p.proyecto).toEqual({ id: 300, nombre: 'CCTV nave 2' });
    expect(p.payload).toMatchObject({ projectId: 300, activityType: 'CLIENT', ticketType: 'INSTALACION' });
    expect(p.payload.ticketTypeCustom).toBeUndefined();
  });

  it('comercial y duración con tope de 12 horas', () => {
    const p = construirPropuesta({ ...base, tipo: 'comercial', duracionMin: 2000 }, catalogos, ctx);
    expect(p.payload).toMatchObject({ ticketType: 'OTRO', ticketTypeCustom: 'COMERCIAL', tiempoEstimadoMin: 720 });
  });

  it('avisa si la hora ya pasó', () => {
    const p = construirPropuesta({ ...base, hora: '08:00' }, catalogos, ctx);
    expect(p.avisos.join(' ')).toMatch(/pasado/);
  });

  it('coincidencias sin acentos ni mayúsculas', () => {
    expect(puntaje('jose antonio', 'José Antonio Ramírez')).toBe(2);
    expect(puntaje('Carolina Pérez', 'carolina perez')).toBe(3);
    expect(puntaje('xyz', 'Banorte')).toBe(0);
    expect(buscar('banor', catalogos.clientes, (c) => c.name).elegido?.id).toBe(2);
    // Coincidencia débil (solo el inicio de una palabra): propone, no elige.
    const debil = buscar('Caro Ruiz', catalogos.personas, (p) => p.nombre);
    expect(debil.elegido).toBeNull();
    expect(debil.candidatos[0].id).toBe(8);
  });

  it('el cliente y la sucursal se encuentran aunque vengan juntos o con el nombre del cliente', () => {
    // «Banorte Plaza Satélite» solo como sitio: cliente por el nombre completo dentro del texto.
    const juntos = construirPropuesta({ ...base, tipo: 'servicio', cliente: null, sitio: 'Banorte Plaza Satélite' }, catalogos, ctx);
    expect(juntos.cliente).toEqual({ id: 2, nombre: 'Banorte' });
    expect(juntos.sucursal).toEqual({ id: 50, nombre: 'Plaza Satélite' });
    // «la Plaza Satélite de Banorte»: se quitan el cliente y las palabras vacías.
    const conCliente = construirPropuesta({ ...base, cliente: 'Banorte', sitio: 'la Plaza Satélite de Banorte' }, catalogos, ctx);
    expect(conCliente.sucursal).toEqual({ id: 50, nombre: 'Plaza Satélite' });
  });

  it('si el nombre dicho es de dos personas, no se queda con la que eligió la IA', () => {
    const conDos = {
      ...catalogos,
      personas: [...catalogos.personas, { id: 11, nombre: 'Antonio Vázquez' }],
    };
    const ambiguo = construirPropuesta({ ...base, responsable: 'Antonio Vázquez' }, conDos, {
      ...ctx,
      instruccion: 'que Antonio vaya a Tox a las 3',
    });
    expect(ambiguo.responsable).toBeNull();
    expect(ambiguo.responsableCandidatos.map((p) => p.id).sort((a, b) => a - b)).toEqual([7, 11]);
    expect(ambiguo.payload.responsableId).toBeUndefined();
    // Con el nombre completo (o un apodo que no se puede revisar) se respeta la elección.
    const claro = construirPropuesta({ ...base, responsable: 'José Antonio Ramírez' }, conDos, {
      ...ctx,
      instruccion: 'que José Antonio vaya a Tox a las 3',
    });
    expect(claro.responsable).toEqual({ id: 7, nombre: 'José Antonio Ramírez' });
    const apodo = construirPropuesta({ ...base, responsable: 'Antonio Vázquez' }, conDos, { ...ctx, instruccion: 'que Toño vaya' });
    expect(apodo.responsable).toEqual({ id: 11, nombre: 'Antonio Vázquez' });
  });

  it('fechas en hora de CDMX', () => {
    expect(aFechaISO('2026-10-13', '9:30')).toBe('2026-10-13T15:30:00.000Z');
    expect(aFechaISO('2026-10-13', null)).toBe('2026-10-13T15:00:00.000Z');
    expect(aFechaISO(null, '15:00')).toBeNull();
    expect(mensajeUsuario('  hola ', ahora, 'Christian')).toContain('(2026-10-12), 10:00 hora de Ciudad de México.');
  });

  describe('agenda: inicio contra plazo', () => {
    it('«para el viernes» empieza hoy y vence el viernes (periodo, como «Al» del formulario)', () => {
      const p = construirPropuesta({ ...base, fecha: null, hora: null, fechaLimite: '2026-10-16' }, catalogos, ctx);
      expect(p.agenda).toEqual({ dia: '2026-10-12', hora: '10:00', hasta: '2026-10-16', horaDicha: false });
      expect(p.payload).toMatchObject({
        periodoInicio: '2026-10-12',
        periodoFin: '2026-10-16',
        fechaInicio: '2026-10-12T16:00:00.000Z',
      });
      expect(p.resumen).toContain('vence vie 16 oct');
      expect(p.avisos).toEqual([]);
    });

    it('«para hoy» es un solo momento: ahora, y vence al terminar el día', () => {
      const p = construirPropuesta({ ...base, fecha: null, hora: null, fechaLimite: '2026-10-12' }, catalogos, ctx);
      expect(p.payload.periodoFin).toBeUndefined();
      expect(p.payload.fechaInicio).toBe('2026-10-12T16:00:00.000Z');
      expect(p.payload.fechaMaxima).toBe(p.payload.fechaInicio);
    });

    it('una cita sin hora va a las 9 (la del formulario) y se marca como no dicha', () => {
      expect(agendaDe({ fecha: '2026-10-13', hora: null, fechaLimite: null }, ahora)).toEqual({
        dia: '2026-10-13',
        hora: '09:00',
        hasta: null,
        horaDicha: false,
      });
      // Inicio después del plazo: se hace el día del plazo.
      expect(agendaDe({ fecha: '2026-10-20', hora: '11:00', fechaLimite: '2026-10-16' }, ahora).dia).toBe('2026-10-16');
    });

    it('la hora límite queda escrita en las indicaciones', () => {
      const p = construirPropuesta(
        { ...base, fecha: null, hora: null, fechaLimite: '2026-10-12', horaLimite: '18:00', indicaciones: 'Mandarlo por correo al gerente.' },
        catalogos,
        ctx,
      );
      expect(p.payload.indicaciones).toBe('Mandarlo por correo al gerente. Entregar a más tardar el lunes 12 de octubre a las 18:00.');
    });

    it('sin fecha ni duración: quedan vacías y como faltantes', () => {
      const p = construirPropuesta({ ...base, fecha: null, hora: null, duracionMin: null }, catalogos, ctx);
      expect(p.faltantes).toEqual(['fecha', 'duración']);
      expect(p.payload.fechaInicio).toBeUndefined();
      expect(p.payload.tiempoEstimadoMin).toBeUndefined();
      expect(p.resumen).toContain('sin fecha');
    });

    it('hora redondeada a 5 minutos, sin pasar de las 23:55', () => {
      expect(horaActualRedondeada(new Date('2026-10-12T16:02:00Z'))).toBe('10:05');
      expect(horaActualRedondeada(new Date('2026-10-13T05:58:00Z'))).toBe('23:55');
    });
  });

  describe('indicaciones y lugar', () => {
    it('quita las indicaciones que solo repiten el título y deja las que traen algo nuevo', () => {
      const titulo = 'Comprar 20 conectores RJ45 y una bobina de cable UTP';
      expect(indicacionesSinEco('Adquirir 20 conectores RJ45 y una bobina de cable UTP.', titulo)).toBeNull();
      expect(indicacionesSinEco('Instalar dos cámaras nuevas en el estacionamiento.', 'Instalar dos cámaras nuevas en estacionamiento de Torre Médica')).toBeNull();
      // El síntoma y las cantidades que el título no tiene se quedan.
      expect(indicacionesSinEco('La puerta principal no abre.', 'Revisar control de acceso de la puerta principal')).toBe('La puerta principal no abre.');
      expect(indicacionesSinEco('Son 3 equipos.', 'Entregar NVR en Atlixco')).toBe('Son 3 equipos.');
      expect(indicacionesSinEco('  ', titulo)).toBeNull();
    });

    it('la sucursal que no se dijo no se usa, aunque la IA la ponga', () => {
      const p = construirPropuesta({ ...base, tipo: 'servicio', cliente: 'Banorte', sitio: 'Plaza Satélite' }, catalogos, {
        ...ctx,
        instruccion: 'que Carolina revise las cámaras de Banorte',
      });
      expect(p.cliente).toEqual({ id: 2, nombre: 'Banorte' });
      expect(p.sucursal).toBeNull();
      expect(p.payload.branchName).toBeUndefined();
      expect(lugarDicho('Sucursal 14 Angelópolis', 'que vaya a la 14')).toBe(true);
      expect(lugarDicho('Campus Zavaleta', 'al Colegio Andes')).toBe(false);
    });

    it('«Tox nave 2» encuentra a «Grupo Tox» por su palabra propia', () => {
      expect(buscar('Tox nave 2', [{ id: 1, name: 'Grupo Tox' }, { id: 2, name: 'Grupo Andes' }], (c) => c.name).elegido?.id).toBe(1);
    });

    it('a la IA solo le llega lo del catálogo que se mencionó (resuelto en código)', () => {
      const rel = catalogoRelevante('que Caro vaya a la plaza satelite de banorte', catalogos);
      expect(rel.personas.map((p) => p.id)).toEqual([8]);
      expect(rel.clientes.map((c) => c.id)).toEqual([2]);
      expect(rel.sucursales.map((s) => s.id)).toEqual([50]);
      expect(rel.proyectos).toEqual([]);
      // Como suena: «Toks» es «TOX»; «Beto» no es nadie de este catálogo.
      expect(catalogoRelevante('Toño mañana en toks', catalogos).clientes.map((c) => c.id)).toEqual([1]);
      expect(catalogoRelevante('Toño mañana en toks', catalogos).personas.map((p) => p.id)).toEqual([7]);
      expect(sonido('christian')).toBe(sonido('cristian'));
      const bloque = bloqueCoincidencias(rel);
      expect(bloque).toContain('Personas: Carolina Pérez');
      expect(bloque).toContain('Clientes: Banorte (sucursales: Plaza Satélite)');
      expect(bloque).toContain('Proyectos: ninguno');
      // Solo el prompt fijo va en el sistema (caché); lo variable va en el mensaje.
      const pet = peticionAsistente('que Caro vaya a la plaza satelite de banorte', catalogos, ahora, null);
      expect(pet.sistema).toHaveLength(1);
      expect(pet.usuario).toContain(bloque);
      expect(pet.usuario).not.toContain('Juan González');
      expect(pet).toMatchObject({ timeoutMs: 10_000, reintentos: 1 });
    });

    it('los próximos días van calculados para que «el viernes» nunca sea hoy', () => {
      // 12-10-2026 es lunes.
      expect(proximosDias(ahora, 5)).toBe('mar 2026-10-13, mié 2026-10-14, jue 2026-10-15, vie 2026-10-16, sáb 2026-10-17');
      expect(mensajeUsuario('x', ahora, null)).toContain('Próximos días: mar 2026-10-13');
    });

    it('la salida corta de la IA se pasa al plan (día y hora en un solo campo)', () => {
      const plan = planDeSalida({
        acciones: [
          {
            tipo: 'servicio',
            sub: 'CORRECTIVO',
            titulo: 'Revisar DVR',
            detalle: 'No graba.',
            quien: 'Carolina Pérez',
            cliente: 'Banorte',
            lugar: null,
            inicio: '2026-10-13 09:30',
            limite: '2026-10-16',
            min: 90,
            prio: 'Alta',
            encargo: null,
          },
        ],
        aclaracion: null,
      });
      expect(plan.acciones[0]).toMatchObject({
        subtipo: 'CORRECTIVO',
        indicaciones: 'No graba.',
        responsable: 'Carolina Pérez',
        fecha: '2026-10-13',
        hora: '09:30',
        fechaLimite: '2026-10-16',
        horaLimite: null,
        duracionMin: 90,
        prioridad: 'Alta',
      });
      const p = construirPropuesta(plan.acciones[0], catalogos, ctx);
      expect(p.payload).toMatchObject({ ticketType: 'CORRECTIVO', periodoInicio: '2026-10-13', periodoFin: '2026-10-16' });
      expect(planDeSalida(null)).toEqual({ acciones: [], aclaracion: null });
    });

    it('«a las 8» ya pasada y sin día es mañana, aunque la IA ponga hoy', () => {
      const accion = { ...base, fecha: '2026-10-12', hora: '08:00' };
      expect(corregirHoraPasada(accion, ahora, 'que Juan vaya a las 8').fecha).toBe('2026-10-13');
      // Si dijeron el día, se respeta (y la tarjeta avisa que quedó en el pasado).
      expect(corregirHoraPasada(accion, ahora, 'que Juan vaya hoy a las 8').fecha).toBe('2026-10-12');
      expect(corregirHoraPasada({ ...accion, hora: '15:00' }, ahora, 'que Juan vaya a las 3').fecha).toBe('2026-10-12');
      expect(mencionaDia('el lunes 2 de noviembre')).toBe(true);
      expect(mencionaDia('que vaya a las 8')).toBe(false);
    });
  });
});
