/**
 * Lo que dirección y cada encargado ven de un vistazo (Velocidad Core, Ola 5). Adam: «que el CEO vea
 * todo y no mueva un dedo, y cada encargado lo suyo».
 *
 * Nada recalcula KPIs: toma las filas de `kpis-equipo` y solo las junta y ordena. Puro, con pruebas.
 */
import { mediana, normalizar } from '../ai/complejidad/tiempos-tipicos.js';

export type GenteKpi = {
  persona: { id: number; nombre: string; puesto?: string | null; avatarUrl?: string | null };
  totales: {
    entregas?: { medidas?: number; aTiempo?: number } | null;
    asistenciaPuntual?: { esperados?: number; puntuales?: number } | null;
    diasSinChecada?: number | null;
  };
  motivos?: string[] | null;
};

export type ResumenGente = {
  personas: number;
  medidas: number;
  aTiempo: number;
  pctATiempo: number | null;
  esperados: number;
  puntuales: number;
  pctPuntual: number | null;
  diasSinChecada: number;
  porRevisar: number;
};

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : null);

export function resumenDeGente(gente: GenteKpi[], porRevisar = 0): ResumenGente {
  let medidas = 0;
  let aTiempo = 0;
  let esperados = 0;
  let puntuales = 0;
  let diasSinChecada = 0;
  for (const g of gente) {
    medidas += g.totales.entregas?.medidas ?? 0;
    aTiempo += g.totales.entregas?.aTiempo ?? 0;
    esperados += g.totales.asistenciaPuntual?.esperados ?? 0;
    puntuales += g.totales.asistenciaPuntual?.puntuales ?? 0;
    diasSinChecada += g.totales.diasSinChecada ?? 0;
  }
  return {
    personas: gente.length,
    medidas,
    aTiempo,
    pctATiempo: pct(aTiempo, medidas),
    esperados,
    puntuales,
    pctPuntual: pct(puntuales, esperados),
    diasSinChecada,
    porRevisar,
  };
}

/** «16 retardos (2421 min tarde)» → «16 retardos (40 h tarde)». Hasta 90 min se deja en minutos. */
export function motivoLegible(motivo: string | null | undefined): string | null {
  if (!motivo) return null;
  return motivo.replace(/\((\d+) min tarde\)/, (todo, min: string) => {
    const n = Number(min);
    return n > 90 ? `(${Math.round(n / 60)} h tarde)` : todo;
  });
}

export type FilaArea = {
  id: number;
  nombre: string;
  puesto: string | null;
  avatarUrl: string | null;
  entregas: number;
  pctATiempo: number | null;
  pctPuntual: number | null;
  diasSinChecada: number;
  porRevisar: number;
  queLePasa: string | null;
};

/**
 * Hoy el semáforo sale rojo a casi todos, y un color igual para todos no ordena nada. Primero quien no
 * ha checado ni entregado nada; luego por lo que falta de puntualidad y de entregas a tiempo.
 */
function atencion(f: FilaArea): number {
  const sinNada = f.entregas === 0 && f.diasSinChecada > 0 ? 1000 : 0;
  return sinNada + f.diasSinChecada * 3 + (100 - (f.pctPuntual ?? 100)) + (100 - (f.pctATiempo ?? 100));
}

export function filasDeArea(gente: GenteKpi[], porRevisarDe: ReadonlyMap<number, number> = new Map()): FilaArea[] {
  return gente
    .map((g) => {
      const r = resumenDeGente([g]);
      return {
        id: g.persona.id,
        nombre: g.persona.nombre,
        puesto: g.persona.puesto ?? null,
        avatarUrl: g.persona.avatarUrl ?? null,
        entregas: r.medidas,
        pctATiempo: r.pctATiempo,
        pctPuntual: r.pctPuntual,
        diasSinChecada: r.diasSinChecada,
        porRevisar: porRevisarDe.get(g.persona.id) ?? 0,
        queLePasa: motivoLegible(g.motivos?.[0]),
      };
    })
    .sort((a, b) => atencion(b) - atencion(a) || a.nombre.localeCompare(b.nombre));
}

export type PersonaOrg = { id: number; nombre: string; puesto?: string | null; managerId: number | null; roleKey?: string | null };
export type Revisor = { userId: number; revisorId: number };

export type FilaEncargado = {
  tipo: 'equipo' | 'revisor' | 'directos';
  id: number;
  nombre: string;
  area: string | null;
  aCargo: number;
  pctATiempo: number | null;
  pctPuntual: number | null;
  porRevisar: number;
  pesa: string | null;
};

/** Dos palabras alcanzan para reconocer a alguien en una tabla. */
export function nombreCorto(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).join(' ');
}

function loQueMasPesa(gente: GenteKpi[]): string | null {
  const ausentes = gente.filter((g) => !(g.totales.entregas?.medidas ?? 0) && (g.totales.diasSinChecada ?? 0) > 0);
  if (ausentes.length) {
    return `${ausentes.length} ${ausentes.length === 1 ? 'persona' : 'personas'} sin checar ni actividad`;
  }
  const peor = [...gente]
    .filter((g) => (g.totales.entregas?.medidas ?? 0) >= 5)
    .sort((a, b) => (resumenDeGente([a]).pctATiempo ?? 100) - (resumenDeGente([b]).pctATiempo ?? 100))[0];
  if (!peor) return null;
  const r = resumenDeGente([peor]);
  return (r.pctATiempo ?? 100) < 85 ? `${peor.persona.nombre.split(/\s+/)[0]}: ${r.aTiempo} de ${r.medidas} a tiempo` : null;
}

/**
 * Por encargado: quien tiene equipo, quien revisa a otros por encargo, y la gente directa de la
 * cabeza del organigrama. `raizId`: quien tiene más gente directa sin jefe arriba. Cada evidencia
 * se cuenta una sola vez, con quien la revisa.
 */
export function armarEncargados(p: {
  org: PersonaOrg[];
  gente: GenteKpi[];
  revisores: Revisor[];
  pendientesDe: ReadonlyMap<number, number>;
  raizId: number;
  viewerId: number;
}): FilaEncargado[] {
  const { org, gente, revisores, pendientesDe, raizId, viewerId } = p;
  const kpiDe = new Map(gente.map((g) => [g.persona.id, g]));
  const delegadoA = new Map(revisores.map((r) => [r.userId, r.revisorId]));
  const hijosDe = (id: number) => org.filter((u) => u.managerId === id);
  const debajoDe = (id: number): PersonaOrg[] => hijosDe(id).flatMap((h) => [h, ...debajoDe(h.id)]);
  const kpis = (l: PersonaOrg[]) => l.flatMap((u) => kpiDe.get(u.id) ?? []);
  const pendientes = (l: PersonaOrg[]) => l.reduce((s, u) => s + (pendientesDe.get(u.id) ?? 0), 0);
  const directos = hijosDe(raizId);

  const filas: FilaEncargado[] = [];
  for (const d of directos.filter((x) => hijosDe(x.id).length > 0)) {
    const abajo = debajoDe(d.id).filter((u) => !delegadoA.has(u.id));
    const r = resumenDeGente(kpis(abajo));
    filas.push({
      tipo: 'equipo',
      id: d.id,
      nombre: nombreCorto(d.nombre),
      area: d.puesto ?? null,
      aCargo: abajo.length,
      pctATiempo: r.pctATiempo,
      pctPuntual: r.pctPuntual,
      porRevisar: pendientes(abajo),
      pesa: loQueMasPesa(kpis(abajo)),
    });
  }
  for (const revisorId of new Set(revisores.map((r) => r.revisorId))) {
    const persona = org.find((u) => u.id === revisorId);
    if (!persona) continue;
    const suyos = org.filter((u) => delegadoA.get(u.id) === revisorId);
    if (!suyos.length) continue;
    const r = resumenDeGente(kpis(suyos));
    filas.push({
      tipo: 'revisor',
      id: revisorId,
      nombre: nombreCorto(persona.nombre),
      area: persona.puesto ?? null,
      aCargo: suyos.length,
      pctATiempo: r.pctATiempo,
      pctPuntual: r.pctPuntual,
      porRevisar: pendientes(suyos),
      pesa: `Revisa a ${suyos.map((u) => u.nombre.split(/\s+/)[0]).join(', ')}`,
    });
  }
  const siguenAqui = directos.filter((u) => !delegadoA.has(u.id));
  if (siguenAqui.length) {
    const r = resumenDeGente(kpis(siguenAqui));
    const raiz = org.find((u) => u.id === raizId);
    const porRevisar = pendientes(siguenAqui);
    filas.push({
      tipo: 'directos',
      id: raizId,
      nombre: viewerId === raizId ? 'Tu gente directa' : `Gente directa de ${raiz ? raiz.nombre.split(/\s+/)[0] : 'dirección'}`,
      area: 'Sin encargado intermedio',
      aCargo: siguenAqui.length,
      pctATiempo: r.pctATiempo,
      pctPuntual: r.pctPuntual,
      porRevisar,
      pesa: porRevisar ? `Sus evidencias le llegan a ${viewerId === raizId ? 'ti' : raiz ? raiz.nombre.split(/\s+/)[0] : 'dirección'}` : null,
    });
  }
  return filas;
}

/** La cabeza del organigrama: sin jefe y con más gente directa. */
export function raizDelOrganigrama(org: PersonaOrg[]): number | null {
  const sinJefe = org.filter((u) => u.managerId == null);
  const directos = (id: number) => org.filter((u) => u.managerId === id).length;
  const [cabeza] = [...sinJefe].sort((a, b) => directos(b.id) - directos(a.id));
  return cabeza && directos(cabeza.id) > 0 ? cabeza.id : null;
}

// ---------- Obra ----------

export type FilaObra = {
  id: number;
  titulo: string;
  coreKind: string | null;
  ticketTypeCustom: string | null;
  projectId: number | null;
  minutos: number;
  calculadoMin: number | null;
};

const FAMILIAS: Array<[RegExp, string]> = [
  [/\bpeinado\b/, 'Peinado de rack'],
  [/\bcableado\b|\bcable\b/, 'Cableado'],
  [/\btuberia\b/, 'Tubería'],
  [/\bcanalizacion\b|\bcharola\b/, 'Canalización'],
  [/\bcamaras?\b|\bcctv\b|\bnvr\b/, 'Cámaras'],
  [/\bbiometricos?\b|\blectoras?\b/, 'Biométricos'],
  [/\binstalaci?on\b|\binstalar\b/, 'Instalación'],
];

/** Qué trabajo es, por lo que dice el título. */
export function familiaDeObra(titulo: string | null | undefined): string {
  const t = normalizar(titulo);
  return FAMILIAS.find(([re]) => re.test(t))?.[1] ?? 'Otra obra';
}

/** Es de obra: lo marcaron así, su tipo es de obra, o el título nombra trabajo en sitio. */
export function esDeObra(a: { coreKind?: string | null; ticketTypeCustom?: string | null; titulo?: string | null }): boolean {
  if (normalizar(a.coreKind) === 'comercial') return false;
  if (normalizar(a.coreKind) === 'obra') return true;
  const tipo = normalizar(a.ticketTypeCustom);
  if (tipo.includes('cableado') || tipo.includes('instalacion')) return true;
  // «Cotizar tubería» o «comprar cable» no son obra: el verbo manda.
  const t = normalizar(a.titulo);
  if (/^(cotiza|compra|comprar|recoleccion|recoger|entrega|llevar|buscar|investigar)/.test(t)) return false;
  return familiaDeObra(t) !== 'Otra obra';
}

/** No dicen dónde fue. */
const PALABRAS_DE_TRABAJO = new Set(
  (
    'cableado cable cables tuberia tubo canalizacion charola peinado rack instalacion instalar instalaciones camaras camara cctv nvr ' +
    'biometrico biometricos lectora lectoras traslado continuacion apoyo obra sitio trabajo trabajos voz datos red nodos nodo acoplamiento ' +
    'contactos mueble pasillo planta piso nivel area de del la el los las en y a al para por con sin un una se su sus que ' +
    'montado montaje montar site registro registros exterior exteriores interior interiores baja alta principal tendido tendida ' +
    'colocacion acomodo matado ahogado volado concreto prefabricado pulgada pulgadas numeracion trayectorias analisis tuberias racks ' +
    'cableados antena amplificador amplificadora revision avances soporte telefonia configuracion documentacion'
  ).split(' '),
);

function palabrasDeLugar(titulo: string): string[] {
  return [...new Set(normalizar(titulo).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3 && !PALABRAS_DE_TRABAJO.has(w) && !/^\d+$/.test(w)))];
}

export type ObraPorTipo = { tipo: string; veces: number; realMin: number; calculadoMin: number | null };
export type ObraPorSitio = { sitio: string; actividades: number; minutos: number; sinProyecto: number[] };

export function armarObra(filas: FilaObra[]) {
  const porFamilia = new Map<string, FilaObra[]>();
  for (const f of filas) {
    const k = familiaDeObra(f.titulo);
    porFamilia.set(k, [...(porFamilia.get(k) ?? []), f]);
  }
  const porTipo: ObraPorTipo[] = [...porFamilia.entries()]
    .map(([tipo, l]) => ({
      tipo,
      veces: l.length,
      realMin: Math.round(mediana(l.map((x) => x.minutos)) ?? 0),
      calculadoMin: mediana(l.flatMap((x) => (x.calculadoMin ? [x.calculadoMin] : []))),
    }))
    .sort((a, b) => b.veces - a.veces);

  // El lugar sale del título mientras no estén ligadas: la palabra que más se repite entre ellas.
  const cuantas = new Map<string, number>();
  for (const f of filas) for (const w of palabrasDeLugar(f.titulo)) cuantas.set(w, (cuantas.get(w) ?? 0) + 1);
  const grupos = new Map<string, FilaObra[]>();
  for (const f of filas) {
    const [sitio] = palabrasDeLugar(f.titulo)
      .filter((w) => (cuantas.get(w) ?? 0) >= 2)
      .sort((a, b) => (cuantas.get(b) ?? 0) - (cuantas.get(a) ?? 0));
    if (sitio) grupos.set(sitio, [...(grupos.get(sitio) ?? []), f]);
  }
  const porSitio: ObraPorSitio[] = [...grupos.entries()]
    .map(([sitio, l]) => ({
      sitio: sitio[0].toUpperCase() + sitio.slice(1),
      actividades: l.length,
      minutos: Math.round(l.reduce((s, x) => s + x.minutos, 0)),
      sinProyecto: l.filter((x) => x.projectId == null).map((x) => x.id),
    }))
    .sort((a, b) => b.minutos - a.minutos)
    .slice(0, 8);

  return {
    actividades: filas.length,
    minutos: Math.round(filas.reduce((s, x) => s + x.minutos, 0)),
    ligadas: filas.filter((x) => x.projectId != null).length,
    porTipo,
    porSitio,
  };
}

/** Quién abre Obra: dirección, quien coordina operaciones y el arquitecto. */
export function puedeVerObra(roleKey: string | null | undefined, deTodaLaEmpresa: boolean): boolean {
  return deTodaLaEmpresa || ['arquitecto', 'coord_operaciones', 'dir_operaciones'].includes(String(roleKey ?? ''));
}
