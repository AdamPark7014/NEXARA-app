import { construirPropuesta, type AccionPlan, type CatalogosNexara } from './asistente-actividades.js';

const catalogos: CatalogosNexara = {
  personas: [{ id: 7, nombre: 'José Antonio Ramírez' }],
  clientes: [
    { id: 1, name: 'TOX Logística' },
    { id: 26, name: 'IPADE' },
  ],
  sucursales: [],
  proyectos: [{ id: 300, title: 'CCTV nave 2', clientId: 1, clientName: 'TOX Logística' }],
};

const base: AccionPlan = {
  tipo: 'proyecto',
  titulo: 'Instalar 4 cámaras en IPADE',
  indicaciones: null,
  responsable: 'Antonio',
  cliente: 'IPADE',
  sitio: null,
  fecha: '2026-10-12',
  hora: '15:00',
  fechaLimite: null,
  horaLimite: null,
  duracionMin: 60,
  prioridad: 'Media',
  encargo: null,
};

const ctx = { creadoPorId: 1, ahora: new Date('2026-10-12T16:00:00Z') };

describe('asignar con IA: IPADE y campos de evidencia', () => {
  it('proyecto sin activo: proyectoNuevo, 4 cámaras, Grabador, Pruebas y alcance', () => {
    const p = construirPropuesta(
      { ...base, elementos: [{ nombre: 'Cámara', cantidad: 4 }] },
      catalogos,
      ctx,
    );
    expect(p.tipo).toBe('proyecto');
    expect(p.cliente).toEqual({ id: 26, nombre: 'IPADE' });
    expect(p.proyecto).toBeNull();
    expect(p.proyectoNuevo).toMatch(/IPADE/);
    expect(p.faltantes).not.toContain('proyecto');
    expect(p.camposEvidencia.map((c) => c.nombre)).toEqual([
      'Cámara 1',
      'Cámara 2',
      'Cámara 3',
      'Cámara 4',
      'Grabador (NVR)',
      'Pruebas y entrega',
    ]);
    expect(p.camposEvidencia[0]).toEqual({
      nombre: 'Cámara 1',
      momentos: ['ANTES', 'EN_PROGRESO', 'DESPUES'],
      notas: expect.stringMatching(/montaje/i),
    });
    expect(p.indicaciones).toMatch(/Alcance: 4 cámaras \(Cámara 1–4\)/);
    expect(p.indicaciones).toMatch(/pruebas y entrega/i);
    expect(p.payload.indicaciones).toMatch(/Alcance: 4 cámaras/);
    expect(p.avisos.join(' ')).toMatch(/se crea al confirmar/);
  });

  it('sin elem usa el título; junta con campo Junta y alcance', () => {
    const p = construirPropuesta({ ...base, elementos: null }, catalogos, ctx);
    expect(p.camposEvidencia.map((c) => c.nombre)).toEqual([
      'Cámara 1',
      'Cámara 2',
      'Cámara 3',
      'Cámara 4',
      'Grabador (NVR)',
      'Pruebas y entrega',
    ]);
    const junta = construirPropuesta(
      { ...base, tipo: 'tarea', subtipo: 'Junta', titulo: 'Junta con IPADE' },
      catalogos,
      ctx,
    );
    expect(junta.camposEvidencia).toEqual([
      expect.objectContaining({ nombre: 'Junta', momentos: ['EN_PROGRESO', 'DESPUES'] }),
    ]);
    expect(junta.indicaciones).toMatch(/Alcance: junta/i);
  });

  it('vago sin cantidad agrega aviso y campo por confirmar', () => {
    const p = construirPropuesta(
      { ...base, titulo: 'poner cámaras en IPADE', elementos: null },
      catalogos,
      ctx,
    );
    expect(p.camposEvidencia[0]!.nombre).toBe('Cámaras (cantidad por confirmar)');
    expect(p.avisos.join(' ')).toMatch(/No dijiste cuántas cámaras/);
    expect(p.indicaciones).toMatch(/cantidad por confirmar/);
  });
});
