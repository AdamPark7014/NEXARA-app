import { generarActaPdf, nombreArchivoActa } from './acta-pdf.js';

const base = {
  id: 7,
  tipo: 'CIERRE_SEMANAL',
  titulo: 'Junta de cierre',
  fecha: new Date('2026-10-09T00:00:00Z'),
  horaInicio: '16:00',
  estado: 'REALIZADA',
  agenda: 'Resultados de la semana\nLecciones aprendidas',
  notas: 'Se revisó el avance de Banorte Satélite.',
  realizadaAt: new Date('2026-10-09T23:10:00Z'),
  facilitador: { nombre: 'Christian' },
  asistentes: [
    { asistio: true, user: { nombre: 'Carolina' } },
    { asistio: false, user: { nombre: 'David' } },
  ],
  acuerdos: [
    {
      tipo: 'ACUERDO',
      descripcion: 'Entregar modelos de cámaras IPADE',
      estado: 'PENDIENTE',
      fechaCompromiso: new Date('2026-10-14T00:00:00Z'),
      responsable: { nombre: 'Carolina' },
      activity: { anNumber: 'AN-0127' },
    },
  ],
};

describe('acta de reunión en PDF', () => {
  it('nombra el archivo con la fecha y el título sin acentos', () => {
    expect(nombreArchivoActa({ id: 7, fecha: base.fecha, titulo: 'Revisión de avances' })).toBe(
      'acta-2026-10-09-revision-de-avances.pdf',
    );
  });

  it('genera un PDF con acuerdos y sin transcripción', async () => {
    const pdf = await generarActaPdf(base);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('agrega la transcripción en páginas aparte', async () => {
    const sin = await generarActaPdf(base);
    const con = await generarActaPdf({ ...base, transcripcion: 'Buenas tardes a todos.\n'.repeat(400) });
    expect(con.length).toBeGreaterThan(sin.length);
  });
});
