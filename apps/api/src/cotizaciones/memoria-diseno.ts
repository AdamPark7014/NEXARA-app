/**
 * Lo que una cotización trae de su diseño de cámaras: la ingeniería con la que el PDF escribe el
 * alcance, la especificación de cada línea, el centro de monitoreo y el levantamiento por zona. Se
 * guarda como foto al pasar el diseño a cotización (`opciones.memoria`), para que lo prometido no
 * cambie solo si después alguien mueve el plano.
 *
 * Regla de siempre: nunca se inventa un dato. Lo que falte aquí simplemente no se imprime.
 *
 * Módulo puro (sin Nest ni Prisma) para poder probarlo con jest.
 */

export type LineaDeCamaras = {
  /** domo, turret, bala, ptz: decide el modelo 3D propio que acompaña al texto. */
  tipo: string;
  /** «Domo IP 4 MP» */
  titulo: string;
  marca: string;
  modelo: string;
  cantidad: number;
  /** Nombre de cada cámara en el plano. */
  ubicaciones: string[];
  /** Datos de su ficha, ya como frases cortas. */
  datos: string[];
  /** Su modelo 3D armado con la ficha, en PNG; sin él va el del tipo. */
  foto?: string | null;
};

export type EquipoDelCentro = {
  /** nvr, switch, ups, gabinete, servidor… */
  tipo: string;
  titulo: string;
  modelo: string;
  cantidad: number;
  detalle: string;
};

export type ColumnaLevantamiento = { clave: string; titulo: string; modelo: string };
export type FilaLevantamiento = { nivel: string; zona: string; piezas: Record<string, number> };

export type MemoriaDiseno = {
  /** La escala salió de una cota medida en el sitio. */
  calibrado: boolean;
  camaras: number;
  cobertura: { cubierto: number; identificacion: number; reconocimiento: number; observacion: number; deteccion: number } | null;
  mbps: number;
  tb: number;
  retencionDias: number;
  codec: string;
  zonas: string[];
  canales: number | null;
  poeW: number | null;
  poeDisponibleW: number | null;
  cableM: number;
  bobinas: number;
  lineas: LineaDeCamaras[];
  centro: EquipoDelCentro[];
  /** Otros sistemas colocados: control de acceso, alarmas, barreras. */
  otros: Array<{ titulo: string; modelo: string; cantidad: number }>;
  levantamiento: { columnas: ColumnaLevantamiento[]; filas: FilaLevantamiento[] };
};

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texto = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const numeroONulo = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const textos = (v: unknown, max = 200) => lista(v).map((t) => texto(t, max)).filter(Boolean);

/** Lo guardado pasa por aquí: una cotización nunca truena por una memoria incompleta. Sin cámaras no hay memoria. */
export function normalizarMemoria(crudo: unknown): MemoriaDiseno | null {
  const o = objeto(crudo);
  const lineas = lista(o['lineas'])
    .map((l) => {
      const d = objeto(l);
      return {
        tipo: texto(d['tipo'], 30),
        titulo: texto(d['titulo'], 120),
        marca: texto(d['marca'], 80),
        modelo: texto(d['modelo'], 120),
        cantidad: numero(d['cantidad']),
        ubicaciones: textos(d['ubicaciones'], 80),
        datos: textos(d['datos'], 160),
        foto: typeof d['foto'] === 'string' && d['foto'].startsWith('data:image/png;base64,') && d['foto'].length < 160_000 ? d['foto'] : null,
      };
    })
    .filter((l) => l.cantidad > 0 && (l.titulo || l.modelo));
  if (!lineas.length) return null;
  const c = objeto(o['cobertura']);
  const lev = objeto(o['levantamiento']);
  return {
    calibrado: o['calibrado'] === true,
    camaras: numero(o['camaras']),
    cobertura: o['cobertura']
      ? { cubierto: numero(c['cubierto']), identificacion: numero(c['identificacion']), reconocimiento: numero(c['reconocimiento']), observacion: numero(c['observacion']), deteccion: numero(c['deteccion']) }
      : null,
    mbps: numero(o['mbps']),
    tb: numero(o['tb']),
    retencionDias: numero(o['retencionDias']),
    codec: texto(o['codec'], 20),
    zonas: textos(o['zonas'], 80),
    canales: numeroONulo(o['canales']),
    poeW: numeroONulo(o['poeW']),
    poeDisponibleW: numeroONulo(o['poeDisponibleW']),
    cableM: numero(o['cableM']),
    bobinas: numero(o['bobinas']),
    lineas,
    centro: lista(o['centro']).map((e) => {
      const d = objeto(e);
      return { tipo: texto(d['tipo'], 30), titulo: texto(d['titulo'], 80), modelo: texto(d['modelo'], 120), cantidad: numero(d['cantidad']), detalle: texto(d['detalle'], 200) };
    }),
    otros: lista(o['otros']).map((e) => {
      const d = objeto(e);
      return { titulo: texto(d['titulo'], 80), modelo: texto(d['modelo'], 120), cantidad: numero(d['cantidad']) };
    }),
    levantamiento: {
      columnas: lista(lev['columnas']).map((e) => {
        const d = objeto(e);
        return { clave: texto(d['clave'], 80), titulo: texto(d['titulo'], 40), modelo: texto(d['modelo'], 120) };
      }),
      filas: lista(lev['filas']).map((e) => {
        const d = objeto(e);
        const piezas: Record<string, number> = {};
        for (const [k, v] of Object.entries(objeto(d['piezas']))) if (numero(v) > 0) piezas[k] = numero(v);
        return { nivel: texto(d['nivel'], 60), zona: texto(d['zona'], 80), piezas };
      }),
    },
  };
}

const pct = (n: number) => `${Math.round(n)} %`;
const unir = (l: string[]) => (l.length < 2 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}`);
const camarasTexto = (n: number) => `${n} ${n === 1 ? 'cámara' : 'cámaras'}`;

/** Los párrafos del alcance ejecutivo: solo con lo que el diseño respalda. */
export function alcanceDeMemoria(m: MemoriaDiseno): { parrafos: string[]; resultado: string } {
  const zonas = m.zonas.length ? ` en ${unir(m.zonas.slice(0, 8))}` : '';
  const base = m.calibrado ? 'sobre un plano calibrado con medidas del sitio' : 'sobre el plano del sitio';
  const parrafos = [
    `La ingeniería de cobertura de ${m.camaras === 1 ? 'la cámara proyectada' : `las ${m.camaras} cámaras proyectadas`} se diseñó ${base} y con simulación tridimensional, bajo el estándar DORI (IEC 62676-4), que define la densidad de píxeles necesaria para los niveles de Detección, Observación, Reconocimiento e Identificación${zonas}.`,
  ];
  const c = m.cobertura;
  const resultado = c
    ? `El ${pct(c.cubierto)} del interior queda bajo la vista de al menos una cámara. Cada nivel de arriba indica qué tanto detalle da la imagen en esa parte del sitio.`
    : '';
  return { parrafos, resultado };
}

/** La justificación tecnológica, con las cifras de este sistema. */
export function justificacionDeMemoria(m: MemoriaDiseno): { texto: string; vinetas: string[] } {
  const vinetas: string[] = [];
  if (m.canales != null && m.canales > 0) {
    const libres = Math.max(0, m.canales - m.camaras);
    vinetas.push(
      libres > 0
        ? `Capacidad de crecimiento: la grabación contempla ${m.canales} canales para ${camarasTexto(m.camaras)}, así que el sistema nace con ${libres} ${libres === 1 ? 'canal libre' : 'canales libres'} para futuras ampliaciones sin adquirir otro grabador.`
        : `Capacidad a la medida: la grabación contempla ${m.canales} canales para ${camarasTexto(m.camaras)}.`,
    );
  }
  if (m.poeW != null && m.poeW > 0) {
    vinetas.push(
      m.poeDisponibleW != null && m.poeDisponibleW > 0
        ? `Energía y datos en un solo cable (PoE): las cámaras consumen ${Math.round(m.poeW)} W de los ${Math.round(m.poeDisponibleW)} W disponibles, sin alimentación eléctrica aparte en cada punto.`
        : `Energía y datos en un solo cable (PoE): ${Math.round(m.poeW)} W en total, sin alimentación eléctrica aparte en cada punto.`,
    );
  }
  if (m.cableM > 0) {
    vinetas.push(`Cableado estructurado: ${Math.round(m.cableM).toLocaleString('en-US')} m de ruta calculados sobre el plano, una base universal para actualizar cámaras o integrar la red sin volver a cablear.`);
  }
  return {
    texto: 'Se propone una arquitectura digital IP, con los equipos dimensionados a partir del diseño de este sitio y no de una lista genérica.',
    vinetas,
  };
}

/** Los renglones de cálculo del centro de monitoreo. */
export function calculoDelCentro(m: MemoriaDiseno): Array<[string, string]> {
  const filas: Array<[string, string]> = [];
  if (m.tb > 0) {
    const dias = m.retencionDias ? ` para ${m.retencionDias} días` : '';
    filas.push(['Almacenamiento requerido', `${m.tb.toFixed(1)} TB${dias}${m.codec ? ` en ${m.codec}` : ''}`]);
  }
  if (m.mbps > 0) filas.push(['Ancho de banda de video', `${Math.round(m.mbps)} Mbps continuos`]);
  if (m.canales != null && m.canales > 0) filas.push(['Canales de grabación', `${m.camaras} en uso de ${m.canales} disponibles`]);
  if (m.poeW != null && m.poeW > 0) filas.push(['Consumo PoE', m.poeDisponibleW ? `${Math.round(m.poeW)} W de ${Math.round(m.poeDisponibleW)} W disponibles` : `${Math.round(m.poeW)} W`]);
  if (m.cableM > 0) filas.push(['Cableado UTP Cat 6', `${Math.round(m.cableM).toLocaleString('en-US')} m de ruta${m.bobinas ? ` (${m.bobinas} ${m.bobinas === 1 ? 'bobina' : 'bobinas'} de 305 m)` : ''}`]);
  return filas;
}
