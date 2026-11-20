import { carpetaDeActividad, fechaCarpeta, nombreDeEvidencia, nombreSeguro, normalizarFuenteRef } from './proyecto-nas.js';

describe('proyecto-nas', () => {
  it('limpia lo que la NAS no acepta', () => {
    expect(nombreSeguro('Cámara 3: "pasillo"/norte?.')).toBe('Cámara 3 pasillo norte');
    expect(nombreSeguro('   ')).toBe('Sin nombre');
  });

  it('fecha en hora de México', () => {
    // 2026-11-20 02:00 UTC = 19 nov 20:00 en México
    expect(fechaCarpeta('2026-11-20T02:00:00Z')).toBe('2026-11-19');
    expect(fechaCarpeta(null)).toBe('sin-fecha');
  });

  it('carpeta de actividad: fecha, folio y título', () => {
    expect(carpetaDeActividad({ fecha: '2026-11-18T17:00:00Z', folio: 'AN-0123', titulo: 'Instalación cámaras / acceso' })).toBe(
      '2026-11-18 AN-0123 Instalación cámaras acceso',
    );
  });

  it('nombre de evidencia ordenado y legible', () => {
    expect(nombreDeEvidencia(0, 'Antes', 'https://x/uploads/ev/cam%201.jpg?sig=1')).toBe('01 Antes cam 1.jpg');
  });

  it('fuenteRef normalizada', () => {
    expect(normalizarFuenteRef('\\INFRAESTRUCTURA\\Proyecto IPADE\\ Migracion Centro de monitoreo /')).toBe(
      'INFRAESTRUCTURA/Proyecto IPADE/Migracion Centro de monitoreo',
    );
  });
});
