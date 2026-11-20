import {
  avisoActividadNoProgramada,
  avisoEvidenciaPorRevisar,
  avisoIncidencia,
  avisoNoCumplida,
  avisoRevision,
  ligaActividad,
} from './avisos-chat.js';

const a = { id: 20, anNumber: 'AN-0020', titulo: 'Instalar 4 cámaras [Hotel Aurora]' };

describe('avisos por chat', () => {
  it('la liga es el token del chat y no rompe con corchetes en el título', () => {
    expect(ligaActividad(a)).toBe('[AN-0020 · Instalar 4 cámaras Hotel Aurora](/erp/actividades/20)');
  });

  it('aprobada con calificación; devuelta lleva a evidencias y las observaciones', () => {
    expect(avisoRevision(a, 'APROBADA', 'Sin observaciones', 5)).toBe(
      'Aprobada: Aprobé tu evidencia de [AN-0020 · Instalar 4 cámaras Hotel Aurora](/erp/actividades/20) con 5 de 5.',
    );
    const devuelta = avisoRevision(a, 'DEVUELTA_PASOS', 'Falta la foto de después de la cámara 2', null);
    expect(devuelta.startsWith('Devuelta:')).toBe(true);
    expect(devuelta).toContain('(/erp/actividades/20/evidencias)');
    expect(devuelta).toContain('para corregir algunos pasos');
    expect(devuelta).toContain('Observaciones: Falta la foto de después de la cámara 2');
  });

  it('incidencia y no cumplida', () => {
    expect(avisoIncidencia(a, 'FALTA_MATERIAL', 'ALTA', ' No llegó el cable ')).toBe(
      'Incidencia: Reporté una incidencia alta (falta material) en [AN-0020 · Instalar 4 cámaras Hotel Aurora](/erp/actividades/20): No llegó el cable',
    );
    const noCumplida = avisoNoCumplida(a, 'venció sin entrega', null);
    expect(noCumplida.startsWith('No cumplida:')).toBe(true);
    expect(noCumplida).toContain('quedó como «No cumplida»: venció sin entrega.');
  });

  it('actividad no programada y evidencia por revisar llevan liga', () => {
    const auto = avisoActividadNoProgramada(a, 'Joan', 'autoasignada');
    expect(auto).toContain('se autoasignó');
    expect(auto).toContain('(/erp/actividades/20)');
    const hoy = avisoActividadNoProgramada(a, 'Joan', 'mismo_dia');
    expect(hoy).toContain('para ejecutar hoy');
    const rev = avisoEvidenciaPorRevisar(a, 'Joan');
    expect(rev).toContain('(/erp/actividades/20/evidencias)');
    expect(rev).toContain('Joan');
  });
});