/**
 * Buffer de escritura diferida para la auditoría.
 *
 * El middleware de Prisma emitía un INSERT por cada escritura del ERP, lo que
 * duplicaba el volumen de escritura. Aquí se agrupan las entradas y se vuelcan
 * por intervalo o por tamaño.
 *
 * La auditoría siempre fue best-effort (los fallos se tragaban), así que el
 * buffer mantiene esa semántica: nunca propaga errores al llamador. Lo que sí
 * hace es acotar la memoria y avisar cuando descarta.
 */
export type AuditBufferOptions<T> = {
  /** Vuelca un lote. No debe lanzar; si lanza, se notifica por `onError`. */
  flush: (batch: T[]) => Promise<void>;
  /** Tamaño a partir del cual se vuelca de inmediato. */
  maxBuffer: number;
  /** Espera máxima antes de volcar un buffer parcial. */
  intervalMs: number;
  /** Tope duro; al superarlo se descarta la entrada más antigua. */
  hardLimit: number;
  onDrop?: (droppedTotal: number) => void;
  onError?: (error: unknown, batchSize: number) => void;
};

export class AuditBuffer<T> {
  private entries: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private dropped = 0;

  constructor(private readonly options: AuditBufferOptions<T>) {}

  /** Número de entradas pendientes de volcar. */
  get size(): number {
    return this.entries.length;
  }

  /** Total de entradas descartadas por saturación. */
  get droppedCount(): number {
    return this.dropped;
  }

  add(entry: T): void {
    if (this.entries.length >= this.options.hardLimit) {
      this.entries.shift();
      this.dropped += 1;
      this.options.onDrop?.(this.dropped);
    }

    this.entries.push(entry);

    if (this.entries.length >= this.options.maxBuffer) {
      void this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(), this.options.intervalMs);
      // No debe mantener vivo el proceso si es lo único pendiente.
      this.timer.unref?.();
    }
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.entries.length === 0) return;

    // Se vacía antes de volcar para que las entradas que lleguen durante el
    // await no se pierdan ni se dupliquen en el siguiente lote.
    const batch = this.entries;
    this.entries = [];

    try {
      await this.options.flush(batch);
    } catch (error) {
      this.options.onError?.(error, batch.length);
    }
  }
}
