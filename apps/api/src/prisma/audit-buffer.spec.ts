import { AuditBuffer } from './audit-buffer.js';

describe('AuditBuffer', () => {
  const build = (overrides: Partial<Parameters<typeof makeOptions>[0]> = {}) => {
    const flushed: number[][] = [];
    const errors: Array<{ error: unknown; size: number }> = [];
    const drops: number[] = [];
    const options = makeOptions({ flushed, errors, drops, ...overrides });
    return { buffer: new AuditBuffer<number>(options), flushed, errors, drops };
  };

  function makeOptions(cfg: {
    flushed: number[][];
    errors: Array<{ error: unknown; size: number }>;
    drops: number[];
    maxBuffer?: number;
    intervalMs?: number;
    hardLimit?: number;
    flushImpl?: (batch: number[]) => Promise<void>;
  }) {
    return {
      maxBuffer: cfg.maxBuffer ?? 3,
      intervalMs: cfg.intervalMs ?? 1000,
      hardLimit: cfg.hardLimit ?? 10,
      flush:
        cfg.flushImpl ??
        (async (batch: number[]) => {
          cfg.flushed.push([...batch]);
        }),
      onError: (error: unknown, size: number) => cfg.errors.push({ error, size }),
      onDrop: (total: number) => cfg.drops.push(total),
    };
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not flush before reaching the size threshold', () => {
    const { buffer, flushed } = build();
    buffer.add(1);
    buffer.add(2);
    expect(flushed).toHaveLength(0);
    expect(buffer.size).toBe(2);
  });

  it('flushes as soon as the buffer is full', async () => {
    const { buffer, flushed } = build({ maxBuffer: 3 });
    buffer.add(1);
    buffer.add(2);
    buffer.add(3);
    await Promise.resolve();

    expect(flushed).toEqual([[1, 2, 3]]);
    expect(buffer.size).toBe(0);
  });

  it('flushes a partial buffer once the interval elapses', async () => {
    const { buffer, flushed } = build({ intervalMs: 1000 });
    buffer.add(7);
    expect(flushed).toHaveLength(0);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(flushed).toEqual([[7]]);
  });

  it('is a no-op when there is nothing pending', async () => {
    const { buffer, flushed } = build();
    await buffer.flush();
    expect(flushed).toHaveLength(0);
  });

  it('drops the oldest entry past the hard limit', () => {
    // maxBuffer alto para que no vuelque y podamos observar el descarte.
    const { buffer, drops } = build({ maxBuffer: 100, hardLimit: 3 });
    buffer.add(1);
    buffer.add(2);
    buffer.add(3);
    buffer.add(4);

    expect(buffer.size).toBe(3);
    expect(buffer.droppedCount).toBe(1);
    expect(drops).toEqual([1]);
  });

  it('reports flush failures without throwing', async () => {
    const boom = new Error('db down');
    const { buffer, errors } = build({
      maxBuffer: 1,
      flushImpl: async () => {
        throw boom;
      },
    });

    expect(() => buffer.add(1)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(errors).toEqual([{ error: boom, size: 1 }]);
  });

  it('does not lose entries added while a flush is in flight', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const flushed: number[][] = [];

    const buffer = new AuditBuffer<number>({
      maxBuffer: 1,
      intervalMs: 1000,
      hardLimit: 10,
      flush: async (batch) => {
        flushed.push([...batch]);
        await gate;
      },
    });

    buffer.add(1); // dispara el volcado, que queda esperando
    buffer.add(2); // llega durante el await

    release();
    await buffer.flush();

    expect(flushed).toEqual([[1], [2]]);
  });
});
