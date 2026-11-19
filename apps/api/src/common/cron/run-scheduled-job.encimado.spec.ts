import { Logger } from '@nestjs/common';
import { runScheduledJob, tareaEnCurso } from './run-scheduled-job';

/** C6: una tarea que sigue corriendo no se vuelve a lanzar encima. */
describe('runScheduledJob sin encimarse', () => {
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;

  it('la segunda vuelta se salta mientras la primera no termina', async () => {
    let soltar!: () => void;
    const lenta = jest.fn(() => new Promise<void>((r) => (soltar = r)));
    const primera = runScheduledJob('prueba:lenta', logger, lenta);
    expect(tareaEnCurso('prueba:lenta')).toBe(true);
    await runScheduledJob('prueba:lenta', logger, lenta);
    expect(lenta).toHaveBeenCalledTimes(1);
    soltar();
    await primera;
    expect(tareaEnCurso('prueba:lenta')).toBe(false);
    await runScheduledJob('prueba:lenta', logger, async () => undefined);
  });

  it('si falla, se libera para la siguiente vuelta', async () => {
    await runScheduledJob('prueba:falla', logger, async () => {
      throw new Error('x');
    });
    expect(tareaEnCurso('prueba:falla')).toBe(false);
  });
});
