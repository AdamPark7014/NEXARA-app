import { checkUrlAccess } from '../common/rbac/url-matrix';
import { ROLES } from '../common/rbac/roles.v2';
import { completarTiempos } from '../activities/tiempo-entrega';
import {
  areaDeTrabajo,
  armarSugerencias,
  limpiarPendiente,
  LISTA_FIJA,
  MAX_SUGERENCIAS,
  normalizarTitulo,
  planDeSugerencia,
  sugerenciaParaAviso,
  type DatosQueSigue,
} from './que-sigue';

const AHORA = new Date('2026-11-04T16:00:00.000Z');

function datos(cambios: Partial<DatosQueSigue> = {}): DatosQueSigue {
  return {
    area: 'comercial',
    abiertas: [],
    pendientes: [],
    cotizaciones: [],
    contactos: [],
    porRevisar: 0,
    obraSinLigar: 0,
    bancoSinConciliar: 0,
    ultima: null,
    hechasHoy: new Set(),
    hechasSemana: new Set(),
    ahora: AHORA,
    ...cambios,
  };
}

const cotizacion = (id: number, validUntil: string, total = 1000) => ({
  id,
  folio: `NEX-${id}`,
  cliente: `Cliente ${id}`,
  proyecto: null,
  validUntil: new Date(`${validUntil}T00:00:00.000Z`),
  total,
});

const contacto = { id: 3, nombre: 'Eduardo', email: 'e@x.mx', phone: '222', notas: 'Quiere cámaras', createdAt: new Date('2026-11-03T18:00:00.000Z') };

describe('a qué área le toca qué', () => {
  it.each([
    [{ roleKey: 'administrativo', puesto: 'Encargada comercial' }, 'comercial'],
    [{ roleKey: 'administrativo', puesto: 'Administrativo' }, 'comercial'],
    [{ roleKey: 'administrativo', puesto: 'Contador(a) General' }, 'contabilidad'],
    [{ roleKey: 'administrativo', puesto: 'Auxiliar Administrativa' }, 'oficina'],
    [{ roleKey: 'ing_soporte', puesto: 'Ingeniero de Campo / Técnico de Campo' }, 'soporte'],
    [{ roleKey: 'ing_campo', puesto: 'Técnico Instalador' }, 'instalacion'],
    [{ roleKey: 'coord_operaciones' }, 'encargado'],
    [{ roleKey: 'enc_soporte' }, 'encargado'],
    [{ roleKey: 'arquitecto' }, 'encargado'],
  ])('%j → %s', (p, area) => {
    expect(areaDeTrabajo(p)).toBe(area);
  });

  it('a dirección no le aplica', () => {
    expect(areaDeTrabajo({ roleKey: 'ceo' })).toBeNull();
    expect(areaDeTrabajo({ roleKey: 'cliente' })).toBeNull();
    expect(areaDeTrabajo({})).toBeNull();
  });
});

describe('el orden de las sugerencias', () => {
  it('primero lo abierto, luego sus pendientes, lo que sabe el sistema y la lista fija', () => {
    const { sugerencias } = armarSugerencias(
      datos({
        abiertas: [{ id: 9, anNumber: 'AN-0412', titulo: 'Cableado' }],
        pendientes: [{ id: 1, texto: 'Pedir la fianza' }],
        cotizaciones: [cotizacion(70, '2026-11-05', 27685)],
        contactos: [contacto],
      }),
    );
    expect(sugerencias.map((s) => s.tipo)).toEqual(['abierta', 'pendiente', 'cotizacion', 'contacto', 'fija']);
    expect(sugerencias).toHaveLength(MAX_SUGERENCIAS);
    expect(sugerencias[0]).toMatchObject({ accion: 'abrir', href: '/erp/actividades/9' });
    expect(sugerencias[2].detalle).toContain('vence el 05-11');
    expect(sugerencias[2].aviso.title).toBe('Cliente 70 vence el 05-11');
  });

  it('sin nada suyo, sale la lista fija de su área', () => {
    const { sugerencias } = armarSugerencias(datos({ area: 'instalacion' }));
    expect(sugerencias.map((s) => s.titulo)).toEqual(LISTA_FIJA.instalacion.map((f) => f.titulo));
  });

  it('a los encargados les dice lo que espera de su gente, y a Josué la obra sin ligar', () => {
    const { sugerencias } = armarSugerencias(datos({ area: 'encargado', porRevisar: 14, obraSinLigar: 76 }));
    expect(sugerencias[0]).toMatchObject({ tipo: 'revisar', titulo: '14 evidencias de tu equipo esperan', href: '/erp/pizarra?vista=revision' });
    expect(sugerencias[1]).toMatchObject({ tipo: 'obra', href: '/erp/proyectos/obra' });
  });

  it('no repite lo que ya creó: la lista fija por día, la cotización y el contacto por semana', () => {
    const hechas = datos({
      cotizaciones: [cotizacion(70, '2026-11-05'), cotizacion(71, '2026-11-06')],
      contactos: [contacto],
      hechasHoy: new Set([normalizarTitulo(LISTA_FIJA.comercial[0].titulo)]),
      hechasSemana: new Set([normalizarTitulo('Seguir cotización de Cliente 70'), normalizarTitulo('Llamar a Eduardo')]),
    });
    const titulos = armarSugerencias(hechas).sugerencias.map((s) => s.titulo);
    expect(titulos).toContain('Seguir cotización de Cliente 71');
    expect(titulos).not.toContain('Seguir cotización de Cliente 70');
    expect(titulos).not.toContain('Llamar a Eduardo');
    expect(titulos).not.toContain(LISTA_FIJA.comercial[0].titulo);
  });

  it('sigue con su última actividad solo si fue de obra o de un trabajo largo', () => {
    const obra = armarSugerencias(datos({ area: 'instalacion', ultima: { id: 5, titulo: 'Cableado biblioteca Tlaxcala', coreKind: 'tarea' } }));
    expect(obra.sugerencias[0]).toMatchObject({ tipo: 'seguir', clave: 'seguir:5', titulo: 'Seguir con Cableado biblioteca Tlaxcala' });
    const larga = armarSugerencias(datos({ area: 'soporte', ultima: { id: 6, titulo: 'CURSO PANDUIT', tiempoEstandarMin: 410 } }));
    expect(larga.sugerencias[0].tipo).toBe('seguir');
    const corta = armarSugerencias(datos({ area: 'soporte', ultima: { id: 7, titulo: 'Reiniciar un módem', tiempoEstandarMin: 30 } }));
    expect(corta.sugerencias[0].tipo).toBe('fija');
    const yaHoy = armarSugerencias(
      datos({ area: 'instalacion', ultima: { id: 5, titulo: 'Cableado biblioteca', coreKind: 'tarea' }, hechasHoy: new Set(['cableado biblioteca']) }),
    );
    expect(yaHoy.sugerencias[0].tipo).toBe('fija');
  });

  it('el resumen cuenta lo que vence en 7 días, con el dinero', () => {
    const r = armarSugerencias(datos({ cotizaciones: [cotizacion(1, '2026-11-05', 100000), cotizacion(2, '2026-11-08', 134080), cotizacion(3, '2026-12-01', 5)] }));
    expect(r.resumen).toBe('También tienes 2 cotizaciones que vencen esta semana, por $234,080.');
    expect(armarSugerencias(datos({ cotizaciones: [cotizacion(1, '2026-11-05')] })).resumen).toBeNull();
  });
});

describe('lo que crea «Empezar»', () => {
  const d = datos({
    area: 'comercial',
    pendientes: [{ id: 1, texto: 'Pedir la fianza' }],
    cotizaciones: [cotizacion(70, '2026-11-05')],
    contactos: [contacto],
    ultima: { id: 5, titulo: 'Cableado biblioteca', coreKind: 'tarea' },
  });

  it('sale de los datos del servidor, con su tiempo', () => {
    expect(planDeSugerencia('pendiente:1', d)).toEqual({ titulo: 'Pedir la fianza', pendienteId: 1 });
    expect(planDeSugerencia('cotizacion:70', d)).toMatchObject({ titulo: 'Seguir cotización de Cliente 70', minutos: 30 });
    expect(planDeSugerencia('fija:prospectos', d)).toEqual({ titulo: 'Buscar 5 prospectos nuevos', minutos: 60 });
    expect(planDeSugerencia('seguir:5', d)).toEqual({ titulo: 'Cableado biblioteca', copiaDe: 5 });
  });

  it('un contacto a tu nombre dice que es tuyo, y sin teléfono toca escribirle', () => {
    const tuyo = { ...contacto, id: 4, phone: null, esTuyo: true };
    const { sugerencias } = armarSugerencias({ ...d, contactos: [tuyo] });
    const s = sugerencias.find((x) => x.tipo === 'contacto');
    expect(s).toMatchObject({ titulo: 'Escribirle a Eduardo', detalle: 'Está a tu nombre y nadie le ha hablado' });
    expect(s?.aviso?.message).toBe('Está a tu nombre y nadie le ha hablado.');
  });

  it('el contacto lleva sus datos para poder llamarle, porque Core no tiene pantalla de prospectos', () => {
    const plan = planDeSugerencia('contacto:3', d);
    expect(plan).toMatchObject({ titulo: 'Llamar a Eduardo', contactoId: 3, minutos: 20 });
    expect(plan?.indicaciones).toContain('222');
    expect(plan?.indicaciones).toContain('e@x.mx');
    expect(plan?.indicaciones).toContain('Quiere cámaras');
  });

  it('una clave que no es suya o que ya no está no crea nada', () => {
    expect(planDeSugerencia('cotizacion:999', d)).toBeNull();
    expect(planDeSugerencia('pendiente:999', d)).toBeNull();
    expect(planDeSugerencia('seguir:6', d)).toBeNull();
    expect(planDeSugerencia('fija:no-existe', d)).toBeNull();
    expect(planDeSugerencia('abierta:9', d)).toBeNull();
    expect(planDeSugerencia('', d)).toBeNull();
  });
});

describe('el aviso', () => {
  const { sugerencias } = armarSugerencias(datos({ area: 'oficina' }));

  it('cada aviso del día sugiere algo distinto, y da la vuelta', () => {
    expect(sugerenciaParaAviso(sugerencias, 0)).toBe(sugerencias[0]);
    expect(sugerenciaParaAviso(sugerencias, 1)).toBe(sugerencias[1]);
    expect(sugerenciaParaAviso(sugerencias, sugerencias.length)).toBe(sugerencias[0]);
    expect(sugerenciaParaAviso([], 3)).toBeNull();
  });
});

describe('pendientes', () => {
  it('limpia espacios, y rechaza vacío o demasiado largo', () => {
    expect(limpiarPendiente('  Pedir   la fianza ')).toBe('Pedir la fianza');
    expect(limpiarPendiente('   ')).toBeNull();
    expect(limpiarPendiente(null)).toBeNull();
    expect(limpiarPendiente('x'.repeat(201))).toBeNull();
  });
});

describe('tiempo de lo que sale de una lista', () => {
  const base = { titulo: 'Limpiar y ordenar el escritorio', creadoPorId: 8, responsableId: 8 };

  it('manda el de la lista, sin leer el título', () => {
    const { cambios } = completarTiempos(base as never, { lectura: {} as never, ahora: AHORA, tiempoFijoMin: 15 });
    expect(cambios).toMatchObject({ tiempoEstimadoMin: 15, tiempoEstandarMin: 15 });
    expect(cambios.fechaEntregaEsperada).toBeTruthy();
  });

  it('sin él, sigue calculándose como siempre', () => {
    const { cambios } = completarTiempos(base as never, { lectura: {} as never, ahora: AHORA });
    expect(cambios.tiempoEstandarMin).toBeGreaterThan(0);
    expect(cambios.estandarDesglose?.[0]?.concepto).not.toBe('Tiempo de la lista de sugerencias');
  });
});

describe('permisos', () => {
  const PERSONAL = [ROLES.ING_CAMPO, ROLES.ING_SOPORTE, ROLES.ENC_SOPORTE, ROLES.COORD_OPERACIONES, ROLES.ADMINISTRATIVO, ROLES.ARQUITECTO, ROLES.RH];

  it.each(PERSONAL)('%s llega a lo suyo', (rol) => {
    expect(checkUrlAccess(rol, '/api/me/que-sigue', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/me/que-sigue/empezar', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/me/pendientes', 'GET').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/me/pendientes', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/me/pendientes/5/hecho', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/me/pendientes/5/empezar', 'POST').allowed).toBe(true);
    expect(checkUrlAccess(rol, '/api/me/pendientes/5', 'DELETE').allowed).toBe(true);
  });

  it('un cliente no escribe aquí', () => {
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/me/que-sigue/empezar', 'POST').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/me/pendientes', 'POST').allowed).toBe(false);
    expect(checkUrlAccess(ROLES.CLIENTE, '/api/me/pendientes/5', 'DELETE').allowed).toBe(false);
  });
});
