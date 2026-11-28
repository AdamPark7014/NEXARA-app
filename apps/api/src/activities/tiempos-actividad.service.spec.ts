import { Logger } from '@nestjs/common';
import { TiemposActividadService } from './tiempos-actividad.service.js';

const ACTIVIDAD = { coreKind: 'tarea', ticketTypeCustom: 'Instalación', titulo: 'Instalar 4 cámaras en recepción' };

const SUGERENCIA = { complejidad: 'COMPLEJA', motivo: 'Cuatro cámaras', cantidad: 4, destino: 'Recepción' };

function armar() {
  const complejidad = { sugerir: jest.fn() };
  const svc = new TiemposActividadService(complejidad as never);
  return { svc, complejidad };
}

describe('TiemposActividadService.lectura', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('con la IA caída la lectura vacía NO se guarda: al volver la IA el mismo título se vuelve a leer', async () => {
    const { svc, complejidad } = armar();
    complejidad.sugerir.mockResolvedValue({ sugerencia: null, disponible: false, motivo: 'ia_no_disponible', mensaje: 'x' });
    const vacia = await svc.lectura(1, ACTIVIDAD);
    expect(vacia).toEqual({ complejidad: null, cantidad: 4, destino: null });
    await svc.lectura(1, ACTIVIDAD);
    // Sin caché: la segunda lectura volvió a preguntar.
    expect(complejidad.sugerir).toHaveBeenCalledTimes(2);

    // La IA vuelve: el mismo título se lee bien y esa sí se guarda.
    complejidad.sugerir.mockResolvedValue({ sugerencia: SUGERENCIA, disponible: true });
    const buena = await svc.lectura(1, ACTIVIDAD);
    expect(buena).toEqual({ complejidad: 'COMPLEJA', cantidad: 4, destino: 'Recepción' });
    expect(complejidad.sugerir).toHaveBeenCalledTimes(3);
    await svc.lectura(1, ACTIVIDAD);
    expect(complejidad.sugerir).toHaveBeenCalledTimes(3);
  });

  it('una lectura sin respuesta de la IA tampoco se guarda', async () => {
    const { svc, complejidad } = armar();
    complejidad.sugerir.mockResolvedValue({ sugerencia: null, disponible: true, motivo: 'sin_respuesta', mensaje: 'x' });
    await svc.lectura(1, ACTIVIDAD);
    await svc.lectura(1, ACTIVIDAD);
    expect(complejidad.sugerir).toHaveBeenCalledTimes(2);
  });

  it('un error al sugerir tampoco se guarda y la lectura sigue con lo que dice el título', async () => {
    const { svc, complejidad } = armar();
    complejidad.sugerir.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ sugerencia: SUGERENCIA, disponible: true });
    expect(await svc.lectura(1, ACTIVIDAD)).toEqual({ complejidad: null, cantidad: 4, destino: null });
    expect(await svc.lectura(1, ACTIVIDAD)).toEqual({ complejidad: 'COMPLEJA', cantidad: 4, destino: 'Recepción' });
    expect(complejidad.sugerir).toHaveBeenCalledTimes(2);
  });

  it('con éxito la segunda lectura del mismo título sale de la caché y no llama a sugerir', async () => {
    const { svc, complejidad } = armar();
    complejidad.sugerir.mockResolvedValue({ sugerencia: SUGERENCIA, disponible: true });
    const primera = await svc.lectura(1, ACTIVIDAD);
    const segunda = await svc.lectura(1, ACTIVIDAD);
    expect(segunda).toEqual(primera);
    expect(complejidad.sugerir).toHaveBeenCalledTimes(1);
  });

  it('un título corto SÍ se guarda: la IA no tenía nada que leer, no falló', async () => {
    const { svc, complejidad } = armar();
    complejidad.sugerir.mockResolvedValue({ sugerencia: null, disponible: true, motivo: 'titulo_corto' });
    await svc.lectura(1, { ...ACTIVIDAD, titulo: 'Cable' });
    await svc.lectura(1, { ...ACTIVIDAD, titulo: 'Cable' });
    expect(complejidad.sugerir).toHaveBeenCalledTimes(1);
  });

  it('la caché es por empresa y por título: otro título o la respuesta vieja de una cuenta sin los campos nuevos se comportan como siempre', async () => {
    const { svc, complejidad } = armar();
    // Respuesta de antes de este cambio (solo `sugerencia`): se guarda como siempre.
    complejidad.sugerir.mockResolvedValue({ sugerencia: SUGERENCIA });
    await svc.lectura(1, ACTIVIDAD);
    await svc.lectura(1, ACTIVIDAD);
    await svc.lectura(2, ACTIVIDAD);
    await svc.lectura(1, { ...ACTIVIDAD, titulo: 'Instalar 8 cámaras en bodega' });
    expect(complejidad.sugerir).toHaveBeenCalledTimes(3);
  });
});
