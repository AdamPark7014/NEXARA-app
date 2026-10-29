import { agruparTiempos, claveDeTipo, mediana, subtipoDeTarea, type FilaTiempo } from './tiempos-tipicos.js';
import { limpiarComplejidad, peticionComplejidad } from './complejidad-ia.js';
import { tipoLegible } from './complejidad.service.js';

const tarea = (ticketTypeCustom: string, minutos: number, complejidad: string | null = null): FilaTiempo => ({
  coreKind: 'tarea',
  ticketType: 'OTRO',
  ticketTypeCustom,
  complejidad,
  minutos,
});

describe('tipo de trabajo', () => {
  it('lee la etiqueta del catálogo y los textos libres de antes', () => {
    expect(subtipoDeTarea('Instalación')).toBe('Instalación');
    expect(subtipoDeTarea(' instalacion. ')).toBe('Instalación');
    expect(subtipoDeTarea('Instalación de tubería y cableado')).toBe('Cableado y canalización');
    expect(subtipoDeTarea('Dibujo en CAD')).toBe('Diseño, CAD y memoria técnica');
    expect(subtipoDeTarea('curso')).toBe('Capacitación');
    expect(subtipoDeTarea('pago de tarjetas')).toBeNull();
  });

  it('arma la clave por tipo Core', () => {
    expect(claveDeTipo({ coreKind: 'tarea', ticketTypeCustom: 'Entrega' })).toBe('tarea:Entrega');
    expect(claveDeTipo({ coreKind: 'tarea', ticketTypeCustom: 'algo raro' })).toBeNull();
    expect(claveDeTipo({ coreKind: 'servicio', ticketType: 'correctivo' })).toBe('servicio:CORRECTIVO');
    expect(claveDeTipo({ coreKind: 'comercial', ticketType: 'OTRO' })).toBe('comercial');
    expect(claveDeTipo({ coreKind: null })).toBeNull();
  });
});

describe('agruparTiempos', () => {
  it('mediana por tipo, redondeada a 5 min, desde 3 anteriores', () => {
    const g = agruparTiempos([tarea('Instalación', 100), tarea('instalacion', 230), tarea('Instalación', 181), tarea('Entrega', 40)]);
    expect(g.get('tarea:Instalación')?.total).toEqual({ muestras: 3, medianaMin: 180 });
    expect(g.get('tarea:Entrega')?.total).toEqual({ muestras: 1, medianaMin: null });
  });

  it('separa por complejidad y la vieja sin complejidad solo cuenta en el total', () => {
    const g = agruparTiempos([
      tarea('Instalación', 60, 'BASICA'),
      tarea('Instalación', 70, 'BASICA'),
      tarea('Instalación', 65, 'BASICA'),
      tarea('Instalación', 400, 'COMPLEJA'),
      tarea('Instalación', 300),
    ]);
    const t = g.get('tarea:Instalación')!;
    expect(t.total.muestras).toBe(5);
    expect(t.porComplejidad.BASICA).toEqual({ muestras: 3, medianaMin: 65 });
    expect(t.porComplejidad.COMPLEJA).toEqual({ muestras: 1, medianaMin: null });
  });

  it('mediana de una cantidad par', () => {
    expect(mediana([10, 40, 20, 30])).toBe(25);
    expect(mediana([])).toBeNull();
  });
});

describe('sugerencia de complejidad', () => {
  it('manda tipo, título e indicaciones', () => {
    const p = peticionComplejidad({ tipo: 'Tarea · Instalación', titulo: 'Instalar 8 cámaras', indicaciones: 'Con tubería' });
    expect(p.usuario).toBe('Tipo de trabajo: Tarea · Instalación\nTítulo: Instalar 8 cámaras\nIndicaciones: Con tubería');
    expect(p).toMatchObject({ modelo: 'claude-haiku-5-5', esfuerzo: 'low', pensar: false, reintentos: 0 });
  });

  it('solo acepta niveles válidos', () => {
    expect(limpiarComplejidad({ complejidad: 'COMPLEJA', motivo: '  varios  puntos ' })).toEqual({ complejidad: 'COMPLEJA', motivo: 'varios puntos' });
    expect(limpiarComplejidad({ complejidad: 'ALTA' as never, motivo: 'x' })).toBeNull();
    expect(limpiarComplejidad(null)).toBeNull();
  });

  it('nombra el tipo como lo lee la IA', () => {
    expect(tipoLegible('tarea', 'instalacion')).toBe('Tarea · Instalación');
    expect(tipoLegible('servicio', 'CORRECTIVO')).toBe('Servicio · CORRECTIVO');
    expect(tipoLegible('obra', null)).toBe('Obra');
    expect(tipoLegible(null, null)).toBe('Actividad');
  });
});
