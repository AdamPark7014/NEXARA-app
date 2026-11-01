import {
  aFechaISO,
  accionesPorPersona,
  agendaDe,
  bloqueCoincidencias,
  buscar,
  catalogoRelevante,
  clienteDeHistorial,
  construirPropuesta,
  construirPropuestas,
  corregirHoraPasada,
  diaPorOmision,
  dijeronDuracion,
  horaActualRedondeada,
  horaLimiteDe,
  indicacionesSinEco,
  inicioDeProximaSemana,
  lugarDicho,
  mencionaDia,
  mensajeUsuario,
  peticionAsistente,
  planDeSalida,
  proximosDias,
  puntaje,
  semanasDe,
  sinPalabrasInformales,
  sonido,
  tiposQueRecibe,
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
    expect(p.agenda).toEqual({ dia: '2026-10-12', hora: '15:00', hasta: null, horaDicha: true, diaDicho: true, compromiso: null });
    expect(p.responsableOrigen).toBe('dicho');
    expect(p.correcciones).toEqual([]);
    expect(p.resumen).toBe('Tarea · Junta para José Antonio Ramírez en TOX Logística hoy 15:00');
  });

  it('con dos personas que se llaman igual propone a la más probable, lo dice y deja a la otra a la mano', () => {
    const p = construirPropuesta({ ...base, responsable: 'Juan' }, catalogos, ctx);
    expect(p.responsable?.id).toBe(9);
    expect(p.responsableOrigen).toBe('probable');
    expect(p.faltantes).toEqual([]);
    expect(p.responsableCandidatos.map((c) => c.id)).toEqual([9, 10]);
    expect(p.payload.responsableId).toBe(9);
    expect(p.avisos.join(' ')).toMatch(/«Juan» puede ser Juan González o Juan Sánchez: propongo a Juan González/);
  });

  it('un servicio con un cliente que no está registrado lo propone como cliente nuevo; nada se crea aún', () => {
    const p = construirPropuesta(
      { ...base, tipo: 'servicio', tipoServicio: 'CORRECTIVO', cliente: 'Farmacias Patito' },
      catalogos,
      ctx,
    );
    expect(p.faltantes).toEqual([]);
    expect(p.clienteNuevo).toBe('Farmacias Patito');
    expect(p.cliente).toBeNull();
    expect(p.payload.clientId).toBeUndefined();
    // El nombre ya es el cliente: no se repite como lugar.
    expect(p.payload.branchName).toBeUndefined();
    expect(p.payload).toMatchObject({ coreKind: 'servicio', ticketType: 'CORRECTIVO' });
    expect(p.avisos.join(' ')).toMatch(/«Farmacias Patito» no está registrado: se da de alta como cliente nuevo al confirmar/);
  });

  it('una tarea no da de alta clientes: el nombre queda como lugar', () => {
    const p = construirPropuesta({ ...base, tipo: 'tarea', subtipo: 'Entrega', cliente: 'Maja', sitio: null }, catalogos, ctx);
    expect(p.clienteNuevo).toBeNull();
    expect(p.payload.branchName).toBe('Maja');
  });

  it('un servicio sin cliente ni nombre de cliente, o en un sitio propio, es una tarea', () => {
    const sinNadie = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'CORRECTIVO', cliente: null, sitio: null, titulo: 'Reparar compu de recepción' }, catalogos, ctx);
    expect(sinNadie.tipo).toBe('tarea');
    expect(sinNadie.payload.ticketTypeCustom).toBe('Correctivo y diagnóstico');
    expect(sinNadie.faltantes).toEqual([]);
    const oficina = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'INSTALACION', cliente: 'Oficina', sitio: null }, catalogos, ctx);
    expect(oficina.tipo).toBe('tarea');
    expect(oficina.payload.ticketTypeCustom).toBe('Instalación');
    expect(oficina.clienteNuevo).toBeNull();
  });

  it('«la bodega» no es el cliente mal capturado «Bodega de» ni Bodegas Luna', () => {
    const conBodegas = { ...catalogos, clientes: [{ id: 42, name: 'Bodega de' }, { id: 43, name: 'Bodegas Luna' }] };
    const p = construirPropuesta({ ...base, cliente: 'Bodega', sitio: 'Bodega' }, conBodegas, { ...ctx, instruccion: 'que Carolina recoja las escaleras en la bodega' });
    expect(p.cliente).toBeNull();
    expect(p.payload.branchName).toBe('Bodega');
    expect(catalogoRelevante('recoge en la bodega', conBodegas).clientes).toEqual([]);
    // Dicho completo sí es Bodegas Luna.
    const luna = construirPropuesta({ ...base, cliente: 'Bodegas Luna' }, conBodegas, ctx);
    expect(luna.cliente?.id).toBe(43);
  });

  it('un nombre sin registrar cuyas actividades van con otro cliente propone ese cliente («Sephora» con Tekserve)', () => {
    const conHistorial: CatalogosNexara = {
      ...catalogos,
      clientes: [...catalogos.clientes, { id: 16, name: 'TEKSERVE MEXICO' }, { id: 40, name: 'A QUIEN CORRESPONDA' }],
      actividades: [
        { responsableId: 7, coreKind: 'servicio', ticketType: 'PREVENTIVO', ticketTypeCustom: null, clientId: 16, titulo: 'Mantenimientos Preventivos Sephora 2026' },
        { responsableId: 7, coreKind: 'servicio', ticketType: 'PREVENTIVO', ticketTypeCustom: null, clientId: 16, titulo: 'Preventivo Sephora Serdán' },
        { responsableId: 8, coreKind: 'comercial', ticketType: 'OTRO', ticketTypeCustom: 'COMERCIAL', clientId: 40, titulo: 'Factura Sephora' },
      ],
    };
    const p = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'CORRECTIVO', cliente: 'Sephora' }, conHistorial, ctx);
    expect(p.cliente?.id).toBe(16);
    expect(p.clienteNuevo).toBeNull();
    expect(p.payload.branchName).toBe('Sephora');
    expect(p.avisos.join(' ')).toContain('sus actividades anteriores van con TEKSERVE MEXICO');
    // El genérico no cuenta, y lo que nunca se ha trabajado no se adivina.
    expect(clienteDeHistorial('Factura', conHistorial.actividades ?? [], [{ id: 40, name: 'A QUIEN CORRESPONDA' }])).toBeNull();
    expect(clienteDeHistorial('Toks', conHistorial.actividades ?? [], conHistorial.clientes)).toBeNull();
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

  describe('el caso de la captura: dos Antonio', () => {
    // Los mismos datos de producción (01-11-2026), con nombres ficticios: el repo es público.
    const dosAntonio: CatalogosNexara = {
      ...catalogos,
      personas: [
        { id: 39, nombre: 'José Antonio Ramírez', puesto: 'Encargado de soporte', recibe: ['tarea', 'proyecto', 'servicio', 'comercial'] },
        { id: 61, nombre: 'Antonio Vázquez', puesto: 'Técnico Instalador', recibe: ['tarea'] },
        { id: 8, nombre: 'Carolina Pérez', puesto: 'Ingeniera de soporte', recibe: ['tarea', 'proyecto', 'servicio'] },
      ],
      actividades: Array.from({ length: 17 }, () => ({ responsableId: 39, coreKind: 'tarea', ticketType: 'OTRO', ticketTypeCustom: 'Reporte / documentación', clientId: null })),
    };
    const instruccion = 'que Antonio vaya a Gigante a arreglar una comandera';

    it('un servicio va con quien sí puede recibirlo, aunque la IA haya escogido al otro', () => {
      const p = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'CORRECTIVO', responsable: 'Antonio Vázquez', cliente: 'Restaurantes Gigante' }, dosAntonio, { ...ctx, instruccion });
      expect(p.responsable?.id).toBe(39);
      expect(p.responsableOrigen).toBe('probable');
      expect(p.responsableCandidatos.map((c) => c.id)).toEqual([39, 61]);
      expect(p.avisos.join(' ')).toMatch(/«Antonio» puede ser José Antonio Ramírez o Antonio Vázquez: propongo a José Antonio Ramírez porque puede recibir servicios/);
      expect(p.tipo).toBe('servicio');
      expect(p.clienteNuevo).toBe('Restaurantes Gigante');
    });

    it('instalar va con el técnico instalador por su puesto; un reporte, con quien más ha hecho', () => {
      const instalar = construirPropuesta({ ...base, tipo: 'tarea', subtipo: 'Instalación', responsable: 'Antonio', cliente: null }, dosAntonio, { ...ctx, instruccion: 'que Antonio instale 4 cámaras' });
      expect(instalar.responsable?.id).toBe(61);
      expect(instalar.avisos.join(' ')).toContain('por su puesto (Técnico Instalador)');
      const reporte = construirPropuesta({ ...base, tipo: 'tarea', subtipo: 'Reporte / documentación', responsable: 'Antonio', cliente: null }, dosAntonio, { ...ctx, instruccion: 'que Antonio haga el reporte' });
      expect(reporte.responsable?.id).toBe(39);
      expect(reporte.avisos.join(' ')).toContain('ha hecho 17 actividades parecidas');
    });

    it('con el nombre completo no hay nada que elegir; y un apodo es tan ambiguo como el nombre', () => {
      const claro = construirPropuesta({ ...base, responsable: 'José Antonio Ramírez' }, dosAntonio, { ...ctx, instruccion: 'que José Antonio vaya a Tox a las 3' });
      expect(claro.responsable?.id).toBe(39);
      expect(claro.responsableOrigen).toBe('dicho');
      const apodo = construirPropuesta({ ...base, tipo: 'tarea', subtipo: 'Instalación', responsable: 'Antonio Vázquez' }, dosAntonio, { ...ctx, instruccion: 'que Toño instale' });
      expect(apodo.responsableOrigen).toBe('probable');
      expect(apodo.responsable?.id).toBe(61);
    });

    it('en una misma instrucción el mismo nombre es la misma persona', () => {
      const dos = construirPropuestas(
        [
          { ...base, tipo: 'tarea', subtipo: 'Reporte / documentación', responsable: 'Antonio', cliente: null },
          { ...base, tipo: 'tarea', subtipo: 'Instalación', responsable: 'Antonio', cliente: null },
        ],
        dosAntonio,
        { ...ctx, instruccion: 'que Antonio haga el reporte y que instale la cámara' },
      );
      expect(dos.map((p) => p.responsable?.id)).toEqual([39, 39]);
    });

    it('a quien no puede recibir ese tipo se le deja la tarea equivalente, sin bloquear la tarjeta', () => {
      const p = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'EMERGENCIA', responsable: 'Antonio Vázquez', cliente: 'Tox' }, dosAntonio, { ...ctx, instruccion: 'que Antonio Vázquez vaya ya a Tox' });
      expect(p.responsable?.id).toBe(61);
      expect(p.tipo).toBe('tarea');
      expect(p.payload).toMatchObject({ coreKind: 'tarea', ticketType: 'OTRO', ticketTypeCustom: 'Correctivo y diagnóstico', clientId: 1 });
      expect(p.avisos.join(' ')).toContain('no se le puede asignar servicio: quedó como tarea');
      // El verbo del título manda sobre el tipo que llegó: «Capacitar» no es un correctivo.
      const capacitar = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'CORRECTIVO', responsable: 'Antonio Vázquez', cliente: 'Tox', titulo: 'Capacitar al personal de Tox' }, dosAntonio, { ...ctx, instruccion: 'que Antonio Vázquez capacite al personal de Tox' });
      expect(capacitar.payload.ticketTypeCustom).toBe('Capacitación');
      // «Terminar el cableado» no es un correctivo.
      const cable = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'CORRECTIVO', responsable: 'Antonio Vázquez', cliente: 'Tox', titulo: 'Terminar el cableado en Tox' }, dosAntonio, { ...ctx, instruccion: 'que Antonio Vázquez termine el cableado de Tox' });
      expect(cable.payload.ticketTypeCustom).toBe('Cableado y canalización');
    });

    it('sin decir quién se propone a la más probable y se dice; si nombran a alguien que no existe, no se le da a otra', () => {
      const nadie = construirPropuesta({ ...base, tipo: 'tarea', subtipo: 'Reporte / documentación', responsable: null, cliente: null }, dosAntonio, { ...ctx, instruccion: 'hay que hacer el reporte' });
      expect(nadie.responsable?.id).toBe(39);
      expect(nadie.responsableOrigen).toBe('sugerido');
      expect(nadie.avisos.join(' ')).toMatch(/No dijiste quién: propongo a José Antonio Ramírez/);
      const pedro = construirPropuesta({ ...base, responsable: 'Pedro' }, dosAntonio, { ...ctx, instruccion: 'que Pedro vaya a Tox' });
      expect(pedro.responsable).toBeNull();
      expect(pedro.responsableOrigen).toBeNull();
      expect(pedro.faltantes).toEqual(['responsable']);
      expect(pedro.avisos.join(' ')).toContain('No encontré a «Pedro»');
    });

    it('sin historial ni puesto que la respalde no se sugiere a nadie', () => {
      const sinNada = construirPropuesta({ ...base, tipo: 'tarea', subtipo: 'Junta', responsable: null, cliente: null }, { ...catalogos, personas: [{ id: 8, nombre: 'Carolina Pérez' }] }, ctx);
      expect(sinNada.responsable).toBeNull();
      expect(sinNada.faltantes).toEqual(['responsable']);
    });
  });

  it('lo que quien escribe no puede asignar pasa a la tarea equivalente y se dice (David no reparte servicios)', () => {
    const p = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'CORRECTIVO' }, catalogos, { ...ctx, tiposPermitidos: ['tarea', 'proyecto', 'obra', 'comercial'] });
    expect(p.tipo).toBe('tarea');
    expect(p.payload.ticketTypeCustom).toBe('Correctivo y diagnóstico');
    expect(p.avisos.join(' ')).toContain('No puedes asignar servicio: quedó como tarea.');
  });

  it('las indicaciones de relleno no llegan a quien la hace: lo nuevo tiene que salir de lo que dijeron', () => {
    const dicho = 'que Carolina revise el NVR de Tox, no prende desde ayer';
    expect(indicacionesSinEco('Atender la falla reportada del equipo.', 'Revisar NVR de Tox', [], dicho)).toBeNull();
    expect(indicacionesSinEco('No prende desde ayer.', 'Revisar NVR de Tox', [], dicho)).toBe('No prende desde ayer.');
    // Sin instrucción a la mano, como antes.
    expect(indicacionesSinEco('Atender la falla reportada del equipo.', 'Revisar NVR de Tox')).toBe('Atender la falla reportada del equipo.');
    // Una cantidad siempre se queda.
    expect(indicacionesSinEco('Son 6 nodos.', 'Tirar nodos', [], 'que tire nodos, son 6')).toBe('Son 6 nodos.');
  });

  it('qué recibe cada quien: el mapa de la web; quien no está, solo tarea', () => {
    expect(tiposQueRecibe('jose.ramirez@nexara.com.mx')).toContain('servicio');
    expect(tiposQueRecibe('JOSE.RAMIREZ@nexara.com.mx ')).toContain('servicio');
    expect(tiposQueRecibe('alguien.nuevo@nexara.com.mx')).toEqual(['tarea']);
    expect(tiposQueRecibe(null)).toEqual(['tarea']);
  });

  it('«Salvador y Erick» en una sola acción son dos actividades; un nombre con «y» que no son dos personas no se parte', () => {
    const personas = [{ id: 1, nombre: 'Salvador Hernández' }, { id: 2, nombre: 'Erick Juárez' }];
    const dos = accionesPorPersona([{ ...base, responsable: 'Salvador y Erick' }], personas);
    expect(dos.map((a) => a.responsable)).toEqual(['Salvador', 'Erick']);
    expect(accionesPorPersona([{ ...base, responsable: 'Salvador Hernández, Erick Juárez' }], personas)).toHaveLength(2);
    expect(accionesPorPersona([{ ...base, responsable: 'Salvador y Pedro' }], personas)).toHaveLength(1);
    expect(accionesPorPersona([{ ...base, responsable: null }], personas)).toHaveLength(1);
  });

  it('lenguaje informal: nunca llega tal cual a la tarjeta', () => {
    expect(sinPalabrasInformales('Revisar la compu de recepción')).toBe('Revisar la computadora de recepción');
    expect(sinPalabrasInformales('Compu y lap de Ana, impre y coti')).toBe('Computadora y laptop de Ana, impresora y cotización');
    // Solo la palabra completa: «cotización» o «compuerta» no se tocan.
    expect(sinPalabrasInformales('Revisar compuerta y cotización')).toBe('Revisar compuerta y cotización');
    const p = construirPropuesta({ ...base, titulo: 'Revisar compu', indicaciones: 'La compu de la gerente no prende' }, catalogos, ctx);
    expect(p.titulo).toBe('Revisar computadora');
    expect(p.payload.indicaciones).toBe('La computadora de la gerente no prende');
  });

  it('fechas en hora de CDMX', () => {
    expect(aFechaISO('2026-10-13', '9:30')).toBe('2026-10-13T15:30:00.000Z');
    // Sin hora, la entrada de la oficina (10:00).
    expect(aFechaISO('2026-10-13', null)).toBe('2026-10-13T16:00:00.000Z');
    expect(aFechaISO(null, '15:00')).toBeNull();
    expect(mensajeUsuario('  hola ', ahora, 'Christian')).toContain('(2026-10-12), 10:00 hora de Ciudad de México.');
  });

  describe('agenda: inicio contra plazo', () => {
    it('«para el viernes» empieza hoy y vence el viernes (periodo, como «Al» del formulario)', () => {
      const p = construirPropuesta({ ...base, fecha: null, hora: null, fechaLimite: '2026-10-16' }, catalogos, ctx);
      expect(p.agenda).toEqual({ dia: '2026-10-12', hora: '10:00', hasta: '2026-10-16', horaDicha: false, diaDicho: true, compromiso: null });
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

    it('una cita sin hora va a la entrada de quien ejecuta (la del formulario) y se marca como no dicha', () => {
      expect(agendaDe({ fecha: '2026-10-13', hora: null, fechaLimite: null }, ahora)).toEqual({
        dia: '2026-10-13',
        hora: '10:00',
        hasta: null,
        horaDicha: false,
        horaPorEntrada: true,
        compromiso: null,
      });
      // La cuadrilla entra a las 8.
      expect(agendaDe({ fecha: '2026-10-13', hora: null, fechaLimite: null }, ahora, '08:00').hora).toBe('08:00');
      // Lo dicho manda sobre su entrada.
      expect(agendaDe({ fecha: '2026-10-13', hora: '11:00', fechaLimite: null }, ahora, '08:00').hora).toBe('11:00');
      // Inicio después del plazo: se hace el día del plazo.
      expect(agendaDe({ fecha: '2026-10-20', hora: '11:00', fechaLimite: '2026-10-16' }, ahora).dia).toBe('2026-10-16');
    });

    it('«a más tardar a las 6» el mismo día es la hora compromiso (fecha máxima a esa hora)', () => {
      const p = construirPropuesta(
        { ...base, fecha: null, hora: null, fechaLimite: '2026-10-12', horaLimite: '18:00', indicaciones: 'Mandarlo por correo al gerente.' },
        catalogos,
        ctx,
      );
      expect(p.agenda.compromiso).toBe('18:00');
      expect(p.payload.fechaInicio).toBe('2026-10-12T16:00:00.000Z');
      expect(p.payload.fechaMaxima).toBe('2026-10-13T00:00:00.000Z');
      expect(p.payload.fechaEntregaEsperada).toBe('2026-10-13T00:00:00.000Z');
      expect(p.payload.indicaciones).toBe('Mandarlo por correo al gerente.');
      expect(p.resumen).toContain('a más tardar 18:00');
    });

    it('con varios días la hora límite no tiene columna: queda escrita en las indicaciones', () => {
      const p = construirPropuesta(
        { ...base, fecha: null, hora: null, fechaLimite: '2026-10-14', horaLimite: '18:00', indicaciones: 'Mandarlo por correo al gerente.' },
        catalogos,
        ctx,
      );
      expect(p.agenda.compromiso).toBeNull();
      expect(p.payload.indicaciones).toBe('Mandarlo por correo al gerente. Entregar a más tardar el miércoles 14 de octubre a las 18:00.');
    });

    it('una hora límite antes del inicio no es compromiso', () => {
      expect(agendaDe({ fecha: '2026-10-13', hora: '11:00', fechaLimite: null, horaLimite: '10:00' }, ahora).compromiso).toBeNull();
    });

    it('sin fecha ni duración: hoy, a la hora actual, y el tiempo de la tabla; se marca lo supuesto', () => {
      const p = construirPropuesta({ ...base, fecha: null, hora: null, duracionMin: null }, catalogos, ctx);
      expect(p.faltantes).toEqual([]);
      expect(p.agenda).toMatchObject({ dia: '2026-10-12', hora: '10:00', horaDicha: false, diaDicho: false });
      expect(p.payload.fechaInicio).toBe('2026-10-12T16:00:00.000Z');
      expect(p.payload.tiempoEstimadoMin).toBe(60);
      expect(p.duracionOrigen).toBe('estimada');
      expect(p.resumen).toContain('hoy 10:00');
    });

    it('la duración sale de la tabla: el servicio correctivo con su traslado, o las piezas que dijeron', () => {
      const correctivo = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'CORRECTIVO', duracionMin: null }, catalogos, ctx);
      expect(correctivo.payload.tiempoEstimadoMin).toBe(180);
      expect(correctivo.duracionDetalle).toContain('Ida 30 min');
      const critico = construirPropuesta({ ...base, tipo: 'servicio', subtipo: 'EMERGENCIA', duracionMin: null, complejidad: 'CRITICA' }, catalogos, ctx);
      expect(critico.payload.tiempoEstimadoMin).toBe(360);
      const piezas = construirPropuesta({ ...base, tipo: 'tarea', subtipo: 'Instalación', duracionMin: null, cantidad: 2, titulo: 'Instalar dos cámaras' }, catalogos, ctx);
      expect(piezas.payload.tiempoEstimadoMin).toBe(120);
      // La mediana real del tipo manda en lo que no se cuenta.
      const medianas = new Map([['comercial', 90]]);
      const coti = construirPropuesta({ ...base, tipo: 'comercial', subtipo: null, duracionMin: null }, catalogos, { ...ctx, medianas });
      expect(coti.payload.tiempoEstimadoMin).toBe(90);
    });

    it('una duración que nadie dijo no se cree: «6 nodos» no son 240 minutos', () => {
      const sinDecir = construirPropuesta({ ...base, tipo: 'tarea', subtipo: 'Cableado y canalización', duracionMin: 240, cantidad: 6, titulo: 'Tirar 6 nodos' }, catalogos, { ...ctx, instruccion: 'que Carolina tire 6 nodos' });
      expect(sinDecir.duracionOrigen).toBe('estimada');
      expect(sinDecir.payload.tiempoEstimadoMin).toBe(270);
      const dicha = construirPropuesta({ ...base, duracionMin: 90 }, catalogos, { ...ctx, instruccion: 'le toma hora y media' });
      expect(dicha.duracionOrigen).toBe('dicha');
      expect(dicha.payload.tiempoEstimadoMin).toBe(90);
      expect(dijeronDuracion('todo el día')).toBe(true);
      expect(dijeronDuracion('15 minutos')).toBe(true);
      expect(dijeronDuracion('son 6 nodos')).toBe(false);
    });

    it('«al final del día» es la salida de quien lo hace; un 18:00 que nadie dijo no es compromiso', () => {
      expect(horaLimiteDe({ horaLimite: '18:00' }, '17:00', 'que lo acabe para el final del dia')).toBe('17:00');
      expect(horaLimiteDe({ horaLimite: '18:00' }, null, 'antes de que se vaya')).toBe('18:00');
      expect(horaLimiteDe({ horaLimite: '23:59' }, '17:00', 'hoy')).toBe('17:00');
      expect(horaLimiteDe({ horaLimite: '18:00' }, '17:00', 'que termine esta semana')).toBeNull();
      expect(horaLimiteDe({ horaLimite: '18:00' }, '17:00', 'a más tardar a las 6')).toBe('18:00');
      expect(horaLimiteDe({ horaLimite: '17:00' }, '17:00', 'antes de las 5')).toBe('17:00');
      expect(horaLimiteDe({ horaLimite: null }, '17:00', 'hoy')).toBeNull();
    });

    it('si no dicen cuándo es hoy; con la jornada ya terminada, el siguiente día, sin caer en domingo', () => {
      // Lunes 12-10 a las 10:00.
      expect(diaPorOmision(ahora)).toBe('2026-10-12');
      // Lunes a las 19:30: la oficina ya salió.
      expect(diaPorOmision(new Date('2026-10-13T01:30:00Z'))).toBe('2026-10-13');
      // Lunes a las 17:30: la cuadrilla ya salió, la oficina no.
      expect(diaPorOmision(new Date('2026-10-12T23:30:00Z'), '17:00')).toBe('2026-10-13');
      expect(diaPorOmision(new Date('2026-10-12T23:30:00Z'))).toBe('2026-10-12');
      // Sábado a las 19:00 → lunes. El domingo por la mañana sigue siendo hoy.
      expect(diaPorOmision(new Date('2026-10-18T01:00:00Z'))).toBe('2026-10-19');
      expect(diaPorOmision(new Date('2026-10-18T15:00:00Z'))).toBe('2026-10-18');
      const noche = construirPropuesta({ ...base, fecha: null, hora: null }, catalogos, { ...ctx, ahora: new Date('2026-10-13T01:30:00Z') });
      expect(noche.agenda).toMatchObject({ dia: '2026-10-13', hora: '10:00', diaDicho: false });
    });

    it('esta semana, la próxima y el fin de mes ya van calculados; en fin de semana, «esta semana» es la que empieza', () => {
      // Lunes 12-10.
      expect(semanasDe(ahora)).toBe('Mañana: 2026-10-13. Pasado mañana: 2026-10-14. Esta semana: hasta el vie 2026-10-16. Próxima semana: del lun 2026-10-19 al vie 2026-10-23. Fin de mes: 2026-10-31.');
      // Domingo 18-10.
      expect(semanasDe(new Date('2026-10-18T15:00:00Z'))).toBe('Mañana: 2026-10-19. Pasado mañana: 2026-10-20. Esta semana: hasta el vie 2026-10-23. Próxima semana: del lun 2026-10-26 al vie 2026-10-30. Fin de mes: 2026-10-31.');
      // «La próxima semana» con solo el plazo empieza el lunes de esa semana.
      expect(inicioDeProximaSemana({ fecha: null, fechaLimite: '2026-10-23' }, ahora, 'la proxima semana').fecha).toBe('2026-10-19');
      expect(inicioDeProximaSemana({ fecha: null, fechaLimite: '2026-10-16' }, ahora, 'para el viernes').fecha).toBeNull();
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

describe('nombres mal oídos: el código los empata con el catálogo y lo dice', () => {
  const conTox: CatalogosNexara = {
    ...catalogos,
    personas: [...catalogos.personas, { id: 20, nombre: 'Yahir Benítez Rosas' }],
    // Sin «TOX Logística»: aquí «talks» solo puede ser Grupo Tox.
    clientes: [{ id: 2, name: 'Banorte' }, { id: 3, name: 'Grupo Tox' }],
    sucursales: [
      ...catalogos.sucursales,
      { id: 60, clientId: 3, name: 'Nave 2 Cuautlancingo', branchNumber: null, city: 'Cuautlancingo', clientName: 'Grupo Tox' },
    ],
    proyectos: [],
  };
  const sinTox = { ...conTox, clientes: [{ id: 2, name: 'Banorte' }], sucursales: catalogos.sucursales };

  it('«talks» es Grupo Tox: cliente, sucursal y título corregidos, y se dice de qué', () => {
    const instruccion = 'que yahir vaya mañana a las 11 a talks nave 2 no prende el nvr';
    const p = construirPropuesta(
      { ...base, tipo: 'servicio', responsable: 'Yahir', cliente: 'Talks', sitio: 'Talks nave 2', titulo: 'Revisar NVR que no prende en Talk', fecha: '2026-10-13', hora: '11:00' },
      conTox,
      { ...ctx, instruccion },
    );
    expect(p.cliente).toEqual({ id: 3, nombre: 'Grupo Tox' });
    expect(p.sucursal).toEqual({ id: 60, nombre: 'Nave 2 Cuautlancingo' });
    expect(p.titulo).toBe('Revisar NVR que no prende en Tox');
    expect(p.correcciones).toContainEqual({ campo: 'cliente', de: 'talks', a: 'Grupo Tox', como: 'parecido' });
    expect(p.avisos).toEqual([]);
    // A la IA le llegó Grupo Tox con cómo se oyó.
    expect(bloqueCoincidencias(catalogoRelevante(instruccion, conTox))).toContain('Grupo Tox («talks»)');
  });

  it('si la IA copió lo mal oído en singular («Talk»), la instrucción lo corrobora', () => {
    const p = construirPropuesta({ ...base, cliente: 'Talk', titulo: 'Junta en Talk' }, conTox, {
      ...ctx,
      instruccion: 'junta con talks a las 3',
    });
    expect(p.cliente).toEqual({ id: 3, nombre: 'Grupo Tox' });
    expect(p.titulo).toBe('Junta en Tox');
  });

  it('«Jair» es Yahir (la única parecida) y se marca como corregido', () => {
    const p = construirPropuesta({ ...base, responsable: 'Jair' }, conTox, { ...ctx, instruccion: 'que jair vaya a tox a las 3' });
    expect(p.responsable).toEqual({ id: 20, nombre: 'Yahir Benítez Rosas' });
    expect(p.correcciones).toContainEqual({ campo: 'responsable', de: 'jair', a: 'Yahir Benítez Rosas', como: 'parecido' });
  });

  it('sin ningún cliente parecido queda sin cliente, con aviso; nunca se inventa', () => {
    const p = construirPropuesta({ ...base, cliente: 'Talks', titulo: 'Junta en Talks' }, sinTox, {
      ...ctx,
      instruccion: 'junta con talks a las 3',
    });
    expect(p.cliente).toBeNull();
    expect(p.payload.clientId).toBeUndefined();
    expect(p.payload.branchName).toBe('Talks');
    expect(p.avisos.join(' ')).toContain('«Talks» no es un cliente registrado: queda sin cliente');
  });

  it('un nombre ya usado en actividades («Toks») corrige el lugar y el título aunque no sea cliente', () => {
    const p = construirPropuesta(
      { ...base, cliente: null, sitio: 'Talk', titulo: 'Inventario de Talks' },
      { ...sinTox, nombresUsados: ['Toks', 'Sephora'] },
      { ...ctx, instruccion: 'que haga el inventario de talks' },
    );
    expect(p.cliente).toBeNull();
    expect(p.payload.branchName).toBe('Toks');
    expect(p.titulo).toBe('Inventario de Toks');
    expect(p.correcciones).toContainEqual({ campo: 'lugar', de: 'talks', a: 'Toks', como: 'parecido' });
    // Si la IA ya escribió «Toks», no cambia nada, pero se dice que se dijo «talks».
    const yaBien = construirPropuesta(
      { ...base, cliente: null, sitio: 'Toks', titulo: 'Revisar cámaras en Toks' },
      { ...sinTox, nombresUsados: ['Toks'] },
      { ...ctx, instruccion: 'que revise las cámaras en talks' },
    );
    expect(yaBien.payload.branchName).toBe('Toks');
    expect(yaBien.correcciones).toContainEqual({ campo: 'lugar', de: 'talks', a: 'Toks', como: 'parecido' });
    // Y a la IA le llega como nombre ya usado (no como cliente).
    const bloque = bloqueCoincidencias(catalogoRelevante('que haga el inventario de talks', { ...sinTox, nombresUsados: ['Toks', 'Sephora'] }));
    expect(bloque).toContain('Otros nombres ya usados (no son clientes): Toks («talks»)');
    expect(bloque).not.toContain('Sephora');
  });

  it('con dos clientes parecidos propone el que más se ha trabajado, lo dice y deja el otro a la mano', () => {
    const dos = { ...sinTox, clientes: [{ id: 2, name: 'Banorte' }, { id: 4, name: 'Tocs Logística' }, { id: 5, name: 'Toks Restaurantes' }] };
    const p = construirPropuesta({ ...base, cliente: 'Talks' }, dos, { ...ctx, instruccion: 'junta en talks a las 3' });
    expect(p.cliente?.id).toBe(4);
    expect(p.clienteCandidatos.map((c) => c.id).sort()).toEqual([4, 5]);
    expect(p.avisos.join(' ')).toMatch(/puede ser .*: propongo Tocs Logística/);
    const conHistorial = {
      ...dos,
      actividades: [{ responsableId: 8, coreKind: 'tarea', ticketType: 'OTRO', ticketTypeCustom: 'Junta', clientId: 5 }],
    };
    expect(construirPropuesta({ ...base, cliente: 'Talks' }, conHistorial, { ...ctx, instruccion: 'junta en talks a las 3' }).cliente?.id).toBe(5);
  });
});
