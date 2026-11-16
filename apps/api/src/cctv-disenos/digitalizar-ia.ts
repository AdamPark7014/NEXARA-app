/**
 * Digitalizar un plano o croquis con IA (Ola 5, Adam 15-11-2026: «que pueda subir imágenes y la
 * documentación y la IA las interprete y digitalice las cámaras»).
 *
 * Claude ve la imagen ya subida como croquis y devuelve lo que reconoce, con coordenadas normalizadas
 * de 0 a 1000 sobre la imagen (no dependen del tamaño con el que se le mandó). El código las pasa a
 * píxeles del croquis, que son las unidades del `Plano`, recorta lo que se sale y descarta lo dudoso.
 * Nada se guarda: la web lo muestra para revisarlo y, al confirmar, lo agrega al diseño.
 */

export const TIPOS_CAMARA_LEIDA = ['domo', 'bala', 'ptz', 'fisheye', 'otra'] as const;
export type TipoCamaraLeida = (typeof TIPOS_CAMARA_LEIDA)[number];

export type MuroLeido = { a: { x: number; y: number }; b: { x: number; y: number } };
export type AreaLeida = { nombre: string; x: number; y: number; ancho: number; alto: number };
export type CamaraLeida = {
  numero: number;
  pos: { x: number; y: number };
  /** Hacia dónde mira, en grados: 0 = derecha de la imagen, 90 = abajo (sentido del `Plano`). null si no se ve. */
  rumboDeg: number | null;
  tipo: TipoCamaraLeida;
  ubicacion: string;
  alturaM: number | null;
  /** La IA lo vio claro; si no, la web lo marca en naranja. */
  segura: boolean;
};

export type LecturaPlano = {
  /** Qué es la imagen. */
  clase: 'plano' | 'croquis' | 'foto' | 'otro';
  /** Ancho real del dibujo en metros si una cota o la escala lo dicen; null si no. */
  anchoM: number | null;
  escalaTexto: string | null;
  muros: MuroLeido[];
  areas: AreaLeida[];
  camaras: CamaraLeida[];
  /** Lo que la IA no pudo decidir, en frases cortas. */
  dudas: string[];
};

const punto = { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: { type: 'number' }, y: { type: 'number' } } };

export const ESQUEMA_DIGITALIZAR: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['clase', 'anchoM', 'escala', 'muros', 'areas', 'camaras', 'dudas'],
  properties: {
    clase: { type: 'string', enum: ['plano', 'croquis', 'foto', 'otro'] },
    anchoM: { type: 'number' },
    escala: { type: 'string' },
    muros: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['a', 'b'], properties: { a: punto, b: punto } },
    },
    areas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'x', 'y', 'ancho', 'alto'],
        properties: { nombre: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, ancho: { type: 'number' }, alto: { type: 'number' } },
      },
    },
    camaras: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['x', 'y', 'rumbo', 'tipo', 'ubicacion', 'altura', 'segura'],
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          rumbo: { type: 'number' },
          tipo: { type: 'string', enum: [...TIPOS_CAMARA_LEIDA] },
          ubicacion: { type: 'string' },
          altura: { type: 'number' },
          segura: { type: 'boolean' },
        },
      },
    },
    dudas: { type: 'array', items: { type: 'string' } },
  },
};

export const PROMPT_DIGITALIZAR = `Digitalizas planos y croquis para el diseñador de videovigilancia de NEXARA (México). Recibes UNA imagen: un plano arquitectónico, un croquis a mano, una foto de un plano o una foto del sitio.

Coordenadas: todas normalizadas de 0 a 1000 sobre la imagen; x de izquierda a derecha, y de arriba abajo.

Devuelve:
- clase: plano (dibujo técnico), croquis (a mano), foto (fotografía del sitio, no de un plano) u otro.
- anchoM: ancho real que cubre la imagen completa, en metros, solo si una cota o la escala gráfica lo permite calcular; 0 si no.
- escala: la escala escrita («1:100») o la cota que usaste; "" si no hay.
- muros: los tramos rectos de muro (inicio a y fin b), los perimetrales y los divisorios; sin puertas ni muebles; une los que continúan en línea; máximo 80.
- areas: cada cuarto o zona con su nombre escrito en el plano (o uno descriptivo si no tiene: «Pasillo»), como rectángulo x, y, ancho, alto; máximo 30.
- camaras: cada símbolo o marca de cámara (círculo con cono, «CCTV», «C1», triángulo de visión). x, y = el punto de la cámara; rumbo = hacia dónde mira en grados (0 derecha, 90 abajo, 180 izquierda, 270 arriba), -1 si no se ve; tipo domo, bala, ptz, fisheye u otra si no se distingue; ubicacion = el área y referencia corta («Recepción, esquina»); altura en metros si está escrita, 0 si no; segura = false si dudas de que sea cámara o de su posición. En una foto del sitio, solo las cámaras instaladas que se ven, al centro, y en dudas lo que se reconoce (marca, tipo). Máximo 60.
- dudas: lo que no se pudo decidir y la persona debe confirmar, en frases cortas en español; [] si nada.
No inventes muros ni cámaras que no estén en la imagen.`;

export const CONFIG_DIGITALIZAR = {
  /** Haiku por omisión (regla de costos); se puede subir con `CCTV_DIGITALIZAR_MODELO` sin desplegar. */
  modelo: 'claude-haiku-5-5',
  esfuerzo: 'low' as const,
  pensar: false,
  maxTokens: 6_000,
  timeoutMs: 45_000,
  reintentos: 1,
  /** Lado largo con el que se le manda la imagen: suficiente para leer cotas y nombres. */
  ladoMaximoPx: 1568,
};

export function peticionDigitalizar(imagen: { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string }, nota?: string | null) {
  return {
    sistema: [PROMPT_DIGITALIZAR],
    usuario: nota?.trim() ? `Nota de quien lo sube: ${nota.trim().slice(0, 300)}` : 'Digitaliza la imagen.',
    imagenes: [imagen],
    esquema: ESQUEMA_DIGITALIZAR,
    modelo: (process.env.CCTV_DIGITALIZAR_MODELO || '').trim() || CONFIG_DIGITALIZAR.modelo,
    esfuerzo: CONFIG_DIGITALIZAR.esfuerzo,
    pensar: CONFIG_DIGITALIZAR.pensar,
    maxTokens: CONFIG_DIGITALIZAR.maxTokens,
    timeoutMs: CONFIG_DIGITALIZAR.timeoutMs,
    reintentos: CONFIG_DIGITALIZAR.reintentos,
  };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * Lo que devolvió la IA → píxeles del croquis, recortado y saneado. Descarta muros de menos de 1 % del
 * lado mayor, áreas diminutas y cámaras fuera de la imagen; numera las cámaras en el orden de lectura.
 */
export function limpiarLectura(datos: unknown, anchoPx: number, altoPx: number): LecturaPlano {
  const d = (datos ?? {}) as Record<string, unknown>;
  const px = (v: unknown, lado: number) => {
    const n = num(v);
    return n == null ? null : Math.round((Math.min(1000, Math.max(0, n)) / 1000) * lado);
  };
  const lista = (v: unknown) => (Array.isArray(v) ? v : []) as Array<Record<string, unknown>>;
  const minimo = Math.max(anchoPx, altoPx) * 0.01;

  const muros: MuroLeido[] = [];
  for (const m of lista(d.muros).slice(0, 80)) {
    const a = (m.a ?? {}) as Record<string, unknown>;
    const b = (m.b ?? {}) as Record<string, unknown>;
    const ax = px(a.x, anchoPx), ay = px(a.y, altoPx), bx = px(b.x, anchoPx), by = px(b.y, altoPx);
    if (ax == null || ay == null || bx == null || by == null) continue;
    if (Math.hypot(bx - ax, by - ay) < minimo) continue;
    muros.push({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
  }

  const areas: AreaLeida[] = [];
  for (const ar of lista(d.areas).slice(0, 30)) {
    const x = px(ar.x, anchoPx), y = px(ar.y, altoPx), ancho = px(ar.ancho, anchoPx), alto = px(ar.alto, altoPx);
    if (x == null || y == null || ancho == null || alto == null || ancho < minimo || alto < minimo) continue;
    areas.push({ nombre: texto(ar.nombre, 60) || 'Área', x, y, ancho: Math.min(ancho, anchoPx - x), alto: Math.min(alto, altoPx - y) });
  }

  const camaras: CamaraLeida[] = [];
  for (const c of lista(d.camaras).slice(0, 60)) {
    const x = px(c.x, anchoPx), y = px(c.y, altoPx);
    if (x == null || y == null) continue;
    const rumbo = num(c.rumbo);
    const altura = num(c.altura);
    const tipo = (TIPOS_CAMARA_LEIDA as readonly string[]).includes(String(c.tipo)) ? (c.tipo as TipoCamaraLeida) : 'otra';
    camaras.push({
      numero: camaras.length + 1,
      pos: { x, y },
      rumboDeg: rumbo == null || rumbo < 0 ? null : Math.round(((rumbo % 360) + 360) % 360),
      tipo,
      ubicacion: texto(c.ubicacion, 80),
      alturaM: altura && altura > 0.5 && altura < 30 ? Math.round(altura * 10) / 10 : null,
      segura: c.segura !== false,
    });
  }

  const anchoM = num(d.anchoM);
  const clase = ['plano', 'croquis', 'foto', 'otro'].includes(String(d.clase)) ? (d.clase as LecturaPlano['clase']) : 'otro';
  return {
    clase,
    anchoM: anchoM && anchoM >= 1 && anchoM <= 5_000 ? Math.round(anchoM * 100) / 100 : null,
    escalaTexto: texto(d.escala, 40) || null,
    muros,
    areas,
    camaras,
    dudas: lista(d.dudas as never)
      .map((x) => texto(x, 200))
      .filter(Boolean)
      .slice(0, 8),
  };
}
