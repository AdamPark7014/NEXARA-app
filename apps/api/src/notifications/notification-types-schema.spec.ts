import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Todo aviso que la API emite tiene que existir como valor del enum en la base.
 *
 * `INotificationPayload.type` está declarado como `NotificationType | string`. Ese
 * `| string` es una puerta abierta a propósito (permite emitir un valor nuevo antes de
 * que `prisma generate` corra en CI/Windows), pero significa que **TypeScript nunca
 * comprueba el nombre**. Once tipos se emitían con un nombre que no existía en el enum:
 * Postgres rechazaba el INSERT en "notifications", el emisor se comía el error en su
 * `catch` y no salía ni la campana ni el push. Ninguna aprobación de flujo ni descuento
 * de cotización avisaba a nadie.
 *
 * Esta prueba cierra esa puerta por fuera: lee el enum del esquema y lo compara con lo
 * que el código emite de verdad.
 */

const SRC = join(__dirname, '..');
const SCHEMA = join(__dirname, '..', '..', 'prisma', 'schema.prisma');

/**
 * Los doce que se emitían sin existir en el enum. Los once primeros venía señalados por
 * la auditoría; `SALES_PROJECT_MARGIN_ALERT` lo encontró esta misma prueba: lo emite la
 * tarea programada de márgenes, así que fallaba en cada corrida sin que nadie lo viera.
 */
const RESCATADOS = [
  'WORKFLOW_APPROVED',
  'WORKFLOW_REJECTED',
  'WORKFLOW_PENDING',
  'WORKFLOW_ESCALATION',
  'QUOTE_DISCOUNT_APPROVED',
  'QUOTE_DISCOUNT_REJECTED',
  'VEHICLE_USAGE_EXPIRING',
  'SALES_PROJECT_APPROVED',
  'SALES_PROJECT_REJECTED',
  'SALES_PROJECT_MARGIN_ALERT',
  'CT_ORDER_DRAFT',
  'ACTIVITY_VALIDATION_REJECTED',
];

/** Valores declarados en `enum NotificationType` de schema.prisma. */
function valoresDelEnum(): string[] {
  const esquema = readFileSync(SCHEMA, 'utf8');
  const bloque = esquema.match(/enum NotificationType \{([\s\S]*?)\n\}/);
  if (!bloque) throw new Error('No encontré `enum NotificationType` en schema.prisma');
  return bloque[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[A-Z][A-Z0-9_]*$/.test(l));
}

function listarTs(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      listarTs(ruta, acc);
    } else if (entrada.endsWith('.ts') && !entrada.endsWith('.spec.ts')) {
      acc.push(ruta);
    }
  }
  return acc;
}

/**
 * Tipos que el código emite. Se reconoce un payload de notificación por llevar `type:`
 * y, cerca, el `category:` que `INotificationPayload` exige. Es lo bastante estrecho
 * para no confundirlo con otros campos `type` del repositorio.
 */
function tiposEmitidos(): Map<string, string[]> {
  const encontrados = new Map<string, string[]>();
  const EMISION = /type:\s*'([A-Z][A-Z0-9_]{3,})'/g;

  for (const ruta of listarTs(SRC)) {
    const contenido = readFileSync(ruta, 'utf8');
    const relativo = ruta.slice(SRC.length + 1).split('\\').join('/');
    let m: RegExpExecArray | null;
    EMISION.lastIndex = 0;
    while ((m = EMISION.exec(contenido)) !== null) {
      const contexto = contenido.slice(m.index, m.index + 400);
      if (!/\bcategory:\s*'/.test(contexto)) continue;
      const previos = encontrados.get(m[1]) ?? [];
      if (!previos.includes(relativo)) previos.push(relativo);
      encontrados.set(m[1], previos);
    }
  }
  return encontrados;
}

describe('los tipos de aviso que emite la API existen en la base', () => {
  const declarados = valoresDelEnum();
  const emitidos = tiposEmitidos();

  it('leyó el enum del esquema', () => {
    expect(declarados.length).toBeGreaterThan(50);
    expect(declarados).toContain('ACTIVITY_ASSIGNED');
  });

  it('encontró emisiones de verdad (si no, la prueba no vigila nada)', () => {
    expect(emitidos.size).toBeGreaterThan(30);
  });

  it('ningún emisor apunta a un valor que no existe en el enum', () => {
    const huerfanos = [...emitidos.entries()]
      .filter(([tipo]) => !declarados.includes(tipo))
      .map(([tipo, ficheros]) => `${tipo} (emitido en ${ficheros.join(', ')})`);

    expect(huerfanos).toEqual([]);
  });

  it('los doce avisos que morían en silencio ya están declarados', () => {
    for (const tipo of RESCATADOS) {
      expect(declarados).toContain(tipo);
      expect(emitidos.has(tipo)).toBe(true);
    }
  });

  it('cada tipo nuevo del enum llegó con su migración', () => {
    const migraciones = join(__dirname, '..', '..', 'prisma', 'migrations');
    const sql = readdirSync(migraciones)
      .filter((d) => statSync(join(migraciones, d)).isDirectory())
      .map((d) => {
        try {
          return readFileSync(join(migraciones, d, 'migration.sql'), 'utf8');
        } catch {
          return '';
        }
      })
      .join('\n');

    // El enum en Postgres conserva su nombre: el modelo Prisma mapea a "notifications",
    // pero el enum no lleva @@map. Un ALTER TYPE con el nombre del modelo no existe.
    expect(sql).toContain('ALTER TYPE "NotificationType"');

    for (const tipo of RESCATADOS) {
      expect(sql).toContain(`ADD VALUE IF NOT EXISTS '${tipo}'`);
    }
  });
});

/**
 * Avisos declarados en el enum que nadie emite nunca. No son un bug de código: que a
 * alguien le paguen un viático y no se entere es una decisión de producto. Quedan
 * anotados aquí para que se vean; si alguien los implementa, esta prueba se lo dice.
 */
describe('avisos declarados que nadie emite (decisión de producto pendiente)', () => {
  const HUECOS = [
    'VIATICO_PAID',
    'TOOL_RETURNED',
    'TOOL_DELIVERED',
    'FINE_PAID',
    'PROJECT_COMPLETED',
    'PROFILE_DOCUMENT_APPROVED',
  ];

  const declarados = valoresDelEnum();
  const emitidos = tiposEmitidos();

  it('siguen declarados en el enum', () => {
    for (const tipo of HUECOS) expect(declarados).toContain(tipo);
  });

  it('siguen sin emisor (si alguien lo implementa, quítalo de esta lista)', () => {
    const yaEmitidos = HUECOS.filter((t) => emitidos.has(t));
    expect(yaEmitidos).toEqual([]);
  });
});
