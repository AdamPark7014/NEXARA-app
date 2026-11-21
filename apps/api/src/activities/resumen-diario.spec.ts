import { hayAlgoQueResumir, resumenDiarioEncendido, textoResumenDiario, type DatosResumenDiario } from './resumen-diario.js';

const vacio: DatosResumenDiario = { noCumplidas: [], jornadasCerradasSolas: [], trabajandoSinEntrada: [], porValidarAtrasadas: 0 };

describe('resumen diario para dirección', () => {
  it('si no pasó nada no hay mensaje', () => {
    expect(hayAlgoQueResumir(vacio)).toBe(false);
    expect(textoResumenDiario(vacio)).toBe('');
  });

  it('lista las no cumplidas con su liga y quién no entregó', () => {
    const t = textoResumenDiario({
      ...vacio,
      noCumplidas: [
        { id: 500, anNumber: 'AN-0500', titulo: 'Instalación de cámaras', personas: ['Ana Ejemplo', 'Luis Ejemplo'] },
        { id: 501, anNumber: null, titulo: 'Levantamiento', personas: [] },
      ],
    });
    expect(t).toContain('2 actividades quedaron como «No cumplida»');
    expect(t).toContain('[AN-0500](/erp/actividades/500) Instalación de cámaras · Ana Ejemplo, Luis Ejemplo');
    expect(t).toContain('[#501](/erp/actividades/501) Levantamiento');
  });

  it('singular y plural, y jornadas cerradas solas sin repetir nombres', () => {
    const t = textoResumenDiario({
      ...vacio,
      noCumplidas: [{ id: 1, anNumber: 'AN-0001', titulo: 'Una', personas: [] }],
      jornadasCerradasSolas: ['Ana Ejemplo', 'Ana Ejemplo'],
      porValidarAtrasadas: 1,
    });
    expect(t).toContain('1 actividad quedó como «No cumplida»');
    expect(t).toContain('2 jornadas se cerraron solas porque no checaron salida: Ana Ejemplo.');
    expect(t).toContain('1 evidencia lleva más de un día sin revisar.');
  });

  it('más de doce no cumplidas se resumen con liga al listado', () => {
    const muchas = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, anNumber: `AN-${i + 1}`, titulo: 'x', personas: [] }));
    const t = textoResumenDiario({ ...vacio, noCumplidas: muchas });
    expect(t.split('\n').filter((l) => l.startsWith('- [AN-'))).toHaveLength(12);
    expect(t).toContain('y 3 más en [Actividades](/erp/actividades)');
  });

  it('quien trabaja sin entrada se dice por nombre', () => {
    expect(textoResumenDiario({ ...vacio, trabajandoSinEntrada: ['Luis Ejemplo'] })).toContain('Trabajando sin entrada ahora mismo: Luis Ejemplo.');
  });

  it('se apaga con RESUMEN_DIARIO=0', () => {
    expect(resumenDiarioEncendido({})).toBe(true);
    expect(resumenDiarioEncendido({ RESUMEN_DIARIO: '0' })).toBe(false);
  });
});
