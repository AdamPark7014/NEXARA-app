/**
 * «¿Qué sigue?» (Velocidad Core, Ola 6). Adam: «que si no están haciendo nada, los freguen, les den
 * sugerencias de actividades dependiendo su estatus». Sin IA: primero lo que ya es suyo, luego lo que el
 * sistema sabe de su área, y al final una lista fija.
 *
 * Puro, con pruebas. Las consultas están en `que-sigue.service.ts`.
 */
import { esDeObra } from './direccion.js';

/** Con `false`, el aviso de «sin actividad» sigue diciendo lo de siempre. */
export const QUE_SIGUE_EN_AVISOS = false;

export const MAX_SUGERENCIAS = 5;
/** Minutos con los que nacen las actividades que salen de un dato del sistema. */
export const MINUTOS_SEGUIR_COTIZACION = 30;
export const MINUTOS_LLAMAR_CONTACTO = 20;
/** Cuántos días atrás cuenta «tu última actividad» para sugerir seguir con ella. */
export const DIAS_PARA_SEGUIR = 5;
/** Desde cuántos minutos una actividad es un trabajo largo que se puede seguir otro día. */
export const MINUTOS_TRABAJO_LARGO = 120;

export type AreaDeTrabajo = 'comercial' | 'contabilidad' | 'soporte' | 'instalacion' | 'encargado' | 'oficina';

/** A qué área le toca qué. Dirección no: no le llega el aviso ni le aplica esta lista. */
export function areaDeTrabajo(p: { roleKey?: string | null; puesto?: string | null }): AreaDeTrabajo | null {
  const puesto = String(p.puesto ?? '');
  switch (p.roleKey) {
    case 'administrativo':
      if (/contad/i.test(puesto)) return 'contabilidad';
      if (/auxiliar/i.test(puesto)) return 'oficina';
      return 'comercial';
    case 'vendedor':
    case 'coord_ventas':
      return 'comercial';
    case 'contabilidad':
      return 'contabilidad';
    case 'ing_soporte':
      return 'soporte';
    case 'ing_campo':
      return 'instalacion';
    case 'coord_operaciones':
    case 'enc_soporte':
    case 'arquitecto':
      return 'encargado';
    case 'coord_admin':
    case 'rh':
    case 'disenador':
    case 'lider_diseno':
      return 'oficina';
    default:
      return null;
  }
}

export const NOMBRE_DE_AREA: Record<AreaDeTrabajo, string> = {
  comercial: 'Comercial',
  contabilidad: 'Contabilidad',
  soporte: 'Soporte',
  instalacion: 'Instalación',
  encargado: 'Encargado',
  oficina: 'Oficina',
};

type Fija = { clave: string; titulo: string; minutos: number };

const ESCRITORIO: Fija = { clave: 'escritorio', titulo: 'Limpiar y ordenar el escritorio', minutos: 15 };
const CURSO: Fija = { clave: 'curso', titulo: 'Avanzar mi curso', minutos: 60 };

/** La lista que Adam corrige: lo que se puede hacer cuando no hay nada más. */
export const LISTA_FIJA: Record<AreaDeTrabajo, Fija[]> = {
  comercial: [
    { clave: 'prospectos', titulo: 'Buscar 5 prospectos nuevos', minutos: 60 },
    { clave: 'clientes', titulo: 'Llamar a clientes sin contacto en 60 días', minutos: 60 },
    ESCRITORIO,
  ],
  contabilidad: [
    { clave: 'comprobantes', titulo: 'Archivar comprobantes del mes', minutos: 60 },
    { clave: 'gastos', titulo: 'Revisar gastos sin comprobante', minutos: 45 },
    ESCRITORIO,
  ],
  soporte: [
    CURSO,
    { clave: 'documentar', titulo: 'Documentar el último servicio', minutos: 30 },
    { clave: 'equipo', titulo: 'Ordenar el equipo de soporte', minutos: 20 },
  ],
  instalacion: [
    { clave: 'camioneta', titulo: 'Limpiar y ordenar la camioneta', minutos: 30 },
    { clave: 'material', titulo: 'Inventariar el material que traigo', minutos: 30 },
    { clave: 'herramienta', titulo: 'Preparar la herramienta de mañana', minutos: 20 },
  ],
  encargado: [{ clave: 'tiempos', titulo: 'Revisar los tiempos de la semana de mi equipo', minutos: 30 }, CURSO],
  oficina: [{ clave: 'archivo', titulo: 'Ordenar y archivar papeles', minutos: 30 }, ESCRITORIO],
};

export type TipoSugerencia = 'abierta' | 'pendiente' | 'cotizacion' | 'contacto' | 'revisar' | 'obra' | 'banco' | 'seguir' | 'fija';

export type Sugerencia = {
  /** Con ella «Empezar» vuelve a buscar la sugerencia: el navegador no decide qué se crea. */
  clave: string;
  tipo: TipoSugerencia;
  titulo: string;
  detalle: string | null;
  accion: 'abrir' | 'empezar';
  href: string | null;
  aviso: { title: string; message: string };
};

/** Lo que crea «Empezar». Sin `minutos`, el tiempo sale del título, como en cualquier actividad propia. */
export type PlanDeActividad = {
  titulo: string;
  indicaciones?: string;
  minutos?: number;
  copiaDe?: number;
  pendienteId?: number;
  contactoId?: number;
};

export type DatosQueSigue = {
  area: AreaDeTrabajo;
  abiertas: Array<{ id: number; anNumber: string | null; titulo: string | null }>;
  pendientes: Array<{ id: number; texto: string }>;
  cotizaciones: Array<{ id: number; folio: string; cliente: string | null; proyecto: string | null; validUntil: Date; total: number }>;
  contactos: Array<{ id: number; nombre: string; email: string | null; phone: string | null; notas: string | null; createdAt: Date }>;
  porRevisar: number;
  obraSinLigar: number;
  bancoSinConciliar: number;
  ultima: { id: number; titulo: string | null; coreKind?: string | null; ticketTypeCustom?: string | null; tiempoEstandarMin?: number | null } | null;
  /** Títulos normalizados de lo que ya creó hoy y en los últimos 7 días, para no repetirle lo mismo. */
  hechasHoy: Set<string>;
  hechasSemana: Set<string>;
  ahora: Date;
};

export function normalizarTitulo(titulo: string | null | undefined): string {
  return String(titulo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** `validUntil` es un día guardado a medianoche UTC: no se pasa por la zona de México. */
function diaMes(fecha: Date): string {
  const [, m, d] = fecha.toISOString().slice(0, 10).split('-');
  return `${d}-${m}`;
}

export function dinero(n: number): string {
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

function duracion(minutos: number): string {
  if (minutos < 60) return `${minutos} minutos`;
  return minutos === 60 ? '1 hora' : `${Math.round((minutos / 60) * 10) / 10} horas`;
}

const nombreDeCotizacion = (c: DatosQueSigue['cotizaciones'][number]) => c.cliente?.trim() || c.proyecto?.trim() || c.folio;
const tituloDeCotizacion = (c: DatosQueSigue['cotizaciones'][number]) => `Seguir cotización de ${nombreDeCotizacion(c)}`;
const tituloDeContacto = (c: DatosQueSigue['contactos'][number]) => `Llamar a ${c.nombre}`;
const tituloDeUltima = (u: NonNullable<DatosQueSigue['ultima']>) => String(u.titulo ?? '').trim();

function cotizacionesVigentes(d: DatosQueSigue) {
  return d.cotizaciones.filter((c) => !d.hechasSemana.has(normalizarTitulo(tituloDeCotizacion(c))));
}

function contactosLibres(d: DatosQueSigue) {
  return d.contactos.filter((c) => !d.hechasSemana.has(normalizarTitulo(tituloDeContacto(c))));
}

function ultimaParaSeguir(d: DatosQueSigue) {
  const u = d.ultima;
  if (!u || !tituloDeUltima(u)) return null;
  if (d.hechasHoy.has(normalizarTitulo(u.titulo))) return null;
  return esDeObra({ coreKind: u.coreKind, ticketTypeCustom: u.ticketTypeCustom, titulo: u.titulo }) || (u.tiempoEstandarMin ?? 0) >= MINUTOS_TRABAJO_LARGO ? u : null;
}

/** En orden: lo abierto, sus pendientes, lo que sabe el sistema, seguir con lo último y la lista fija. */
export function armarSugerencias(d: DatosQueSigue): { sugerencias: Sugerencia[]; resumen: string | null } {
  const lista: Sugerencia[] = [];

  for (const a of d.abiertas.slice(0, 2)) {
    const nombre = a.anNumber ? `${a.anNumber}` : 'tu actividad';
    lista.push({
      clave: `abierta:${a.id}`,
      tipo: 'abierta',
      titulo: `Retomar ${nombre}`,
      detalle: a.titulo ?? null,
      accion: 'abrir',
      href: `/erp/actividades/${a.id}`,
      aviso: { title: `Retoma ${nombre}`, message: a.titulo ? `${a.titulo}. Sigue abierta.` : 'Sigue abierta.' },
    });
  }

  for (const p of d.pendientes.slice(0, 2)) {
    lista.push({
      clave: `pendiente:${p.id}`,
      tipo: 'pendiente',
      titulo: p.texto,
      detalle: 'De tu lista de pendientes',
      accion: 'empezar',
      href: null,
      aviso: { title: `Tu pendiente: ${p.texto}`, message: 'Toca para arrancarlo.' },
    });
  }

  const [cotizacion] = cotizacionesVigentes(d);
  if (cotizacion) {
    const vence = diaMes(cotizacion.validUntil);
    lista.push({
      clave: `cotizacion:${cotizacion.id}`,
      tipo: 'cotizacion',
      titulo: tituloDeCotizacion(cotizacion),
      detalle: `${dinero(cotizacion.total)} · vence el ${vence} · sin marcar como enviada`,
      accion: 'empezar',
      href: null,
      aviso: {
        title: `${nombreDeCotizacion(cotizacion)} vence el ${vence}`,
        message: `Cotización de ${dinero(cotizacion.total)} sin marcar como enviada. Toca para seguirla.`,
      },
    });
  }

  const [contacto] = contactosLibres(d);
  if (contacto) {
    const dia = diaMes(contacto.createdAt);
    lista.push({
      clave: `contacto:${contacto.id}`,
      tipo: 'contacto',
      titulo: tituloDeContacto(contacto),
      detalle: `Pidió contacto por la página el ${dia} y nadie le ha respondido`,
      accion: 'empezar',
      href: null,
      aviso: { title: tituloDeContacto(contacto), message: `Pidió contacto por la página el ${dia} y nadie le ha respondido.` },
    });
  }

  if (d.porRevisar > 0) {
    const titulo = d.porRevisar === 1 ? '1 evidencia de tu equipo espera' : `${d.porRevisar} evidencias de tu equipo esperan`;
    lista.push({
      clave: 'revisar',
      tipo: 'revisar',
      titulo,
      detalle: 'Apruébalas en lote. A las 24 horas le suben a tu jefe.',
      accion: 'abrir',
      href: '/erp/pizarra?vista=revision',
      aviso: { title: titulo, message: 'Apruébalas en lote. A las 24 horas le suben a tu jefe.' },
    });
  }

  if (d.obraSinLigar > 0) {
    const titulo = d.obraSinLigar === 1 ? 'Ligar 1 actividad de obra a su proyecto' : `Ligar ${d.obraSinLigar} actividades de obra a su proyecto`;
    lista.push({
      clave: 'obra',
      tipo: 'obra',
      titulo,
      detalle: 'Así se ve lo real contra lo calculado en cada proyecto.',
      accion: 'abrir',
      href: '/erp/proyectos/obra',
      aviso: { title: titulo, message: 'Así se ve lo real contra lo calculado en cada proyecto.' },
    });
  }

  if (d.bancoSinConciliar > 0) {
    const titulo = d.bancoSinConciliar === 1 ? '1 movimiento de banco sin conciliar' : `${d.bancoSinConciliar} movimientos de banco sin conciliar`;
    lista.push({
      clave: 'banco',
      tipo: 'banco',
      titulo,
      detalle: 'En la Mesa contable.',
      accion: 'abrir',
      href: '/erp/contabilidad',
      aviso: { title: titulo, message: 'Están en la Mesa contable.' },
    });
  }

  const ultima = ultimaParaSeguir(d);
  if (ultima) {
    const titulo = tituloDeUltima(ultima);
    lista.push({
      clave: `seguir:${ultima.id}`,
      tipo: 'seguir',
      titulo: `Seguir con ${titulo}`,
      detalle: 'Fue tu última actividad',
      accion: 'empezar',
      href: null,
      aviso: { title: `¿Sigues con ${titulo}?`, message: 'Fue tu última actividad. Toca para arrancarla hoy.' },
    });
  }

  for (const f of LISTA_FIJA[d.area]) {
    if (d.hechasHoy.has(normalizarTitulo(f.titulo))) continue;
    lista.push({
      clave: `fija:${f.clave}`,
      tipo: 'fija',
      titulo: f.titulo,
      detalle: `${NOMBRE_DE_AREA[d.area]} · ${duracion(f.minutos)}`,
      accion: 'empezar',
      href: null,
      aviso: { title: f.titulo, message: `${duracion(f.minutos)}. Toca para arrancarla.` },
    });
  }

  const hasta = new Date(d.ahora.getTime() + 7 * 86_400_000);
  const estaSemana = d.cotizaciones.filter((c) => c.validUntil.getTime() < hasta.getTime());
  const resumen =
    estaSemana.length > 1
      ? `También tienes ${estaSemana.length} cotizaciones que vencen esta semana, por ${dinero(estaSemana.reduce((s, c) => s + c.total, 0))}.`
      : null;

  return { sugerencias: lista.slice(0, MAX_SUGERENCIAS), resumen };
}

/** Lo que va a crear «Empezar» con esta clave. Sale de los datos del servidor, nunca del navegador. */
export function planDeSugerencia(clave: string, d: DatosQueSigue): PlanDeActividad | null {
  const [tipo, resto] = clave.split(':');
  const id = Number(resto);
  if (tipo === 'pendiente') {
    const p = d.pendientes.find((x) => x.id === id);
    return p ? { titulo: p.texto, pendienteId: p.id } : null;
  }
  if (tipo === 'cotizacion') {
    const c = cotizacionesVigentes(d).find((x) => x.id === id);
    if (!c) return null;
    return {
      titulo: tituloDeCotizacion(c),
      indicaciones: `Cotización ${c.folio}. Si ya salió al cliente, márcala como enviada; si no, dale seguimiento.`,
      minutos: MINUTOS_SEGUIR_COTIZACION,
    };
  }
  if (tipo === 'contacto') {
    const c = contactosLibres(d).find((x) => x.id === id);
    if (!c) return null;
    const datos = [c.phone && `Teléfono: ${c.phone}`, c.email && `Correo: ${c.email}`, c.notas?.trim()].filter(Boolean).join('\n');
    return { titulo: tituloDeContacto(c), indicaciones: datos || undefined, minutos: MINUTOS_LLAMAR_CONTACTO, contactoId: c.id };
  }
  if (tipo === 'seguir') {
    const u = ultimaParaSeguir(d);
    return u && u.id === id ? { titulo: tituloDeUltima(u), copiaDe: u.id } : null;
  }
  if (tipo === 'fija') {
    const f = LISTA_FIJA[d.area].find((x) => x.clave === resto);
    return f && !d.hechasHoy.has(normalizarTitulo(f.titulo)) ? { titulo: f.titulo, minutos: f.minutos } : null;
  }
  return null;
}

/** Cada aviso del día sugiere algo distinto; se da la vuelta si hay más avisos que sugerencias. */
export function sugerenciaParaAviso(sugerencias: Sugerencia[], enviadosHoy: number): Sugerencia | null {
  return sugerencias.length ? sugerencias[enviadosHoy % sugerencias.length] : null;
}

export const MAX_PENDIENTES_ABIERTOS = 50;
export const LARGO_PENDIENTE = 200;

/** Vacío o demasiado largo no se guarda: con este texto puede nacer una actividad. */
export function limpiarPendiente(texto: unknown): string | null {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return limpio && limpio.length <= LARGO_PENDIENTE ? limpio : null;
}
