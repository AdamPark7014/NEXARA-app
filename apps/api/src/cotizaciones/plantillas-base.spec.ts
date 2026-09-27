import { normalizarRequisitos } from '../activities/tools/herramientas-checklist.helpers.js';
import { normalizarBloques, plantillasDeAlcance } from './alcance-bloques.js';
import {
  CATALOGO_PARTIDAS_V2,
  CLAVES_FAMILIA_V2,
  FAMILIAS_PRODUCTO,
  FAMILIAS_V2,
  KITS_HERRAMIENTAS,
  SERVICIOS_BASE,
  buscarKit,
  requisitosDeKit,
} from './catalogo-partidas-base.js';
import { leerObjetivo } from './objetivo-plantilla.js';
import { PAQUETES } from './paquetes.js';
import { GRUPOS, incluyeInstalacion, grupoDePartida } from './partidas-grupos.js';
import { normalizarContenidoPlantilla } from './personalizacion.js';
import { PLANTILLAS_BASE, buscarPlantillaBase } from './plantillas-base.js';
import { SEGMENTOS, leerTerminosPersonalizados, terminosDeCotizacion } from './terminos-segmento.js';

/** Plantillas de cotización base y catálogos base (partidas Formato V2 y kits de herramientas). */

/** Todo el texto que puede llegar impreso al cliente (no incluye claves internas ni el nombre de la plantilla). */
function textosVisibles(p: (typeof PLANTILLAS_BASE)[number]): string[] {
  const c = p.contenido;
  const textos: string[] = [c.projectName, c.scope, c.objetivo, c.note];
  for (const b of c.alcanceBloques as Array<{ titulo: string; texto: string | null; vinetas: string[] }>) {
    textos.push(b.titulo, b.texto ?? '', ...b.vinetas);
  }
  for (const i of c.items) textos.push(i.name, i.description ?? '', i.unit ?? '', i.brand ?? '', i.model ?? '');
  const k = c.opciones.condiciones;
  textos.push(k.formaPago, k.tiempoEntrega, k.garantia, c.opciones.tipoCambioNota);
  return textos.filter(Boolean);
}

/** Nombres que salen de las cotizaciones de muestra: ninguno debe filtrarse a una plantilla. */
const NOMBRES_DE_MUESTRA = [
  'nayar',
  'cadi',
  'arta',
  'zacatl',
  'cancun',
  'cancún',
  'poder judicial',
  'tribunal',
  'ciudad judicial',
  'ayuntamiento',
  'acatzingo',
  'xicotepec',
  'huauchinango',
  'tecamachalco',
  'izucar',
  'walmart',
  'penales',
  'negocios regionales',
  'aislador',
  'karen',
  'elizalde',
  'sarmiento',
  'beatriz',
  'galindo',
  'christian',
  'del pozo',
  'decomobil',
  'naceb',
  'muren',
  'cyberpower',
  'new engineering',
  'nee240925',
];

/** Meta-texto interno que no debe verse en lo que recibe el cliente. */
const META = /\b(kit|kits|plantilla|plantillas|r[uú]brica|lorem|xxx|placeholder)\b/i;

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Aparece el nombre como palabra (o como inicio de palabra): «arta» no debe saltar en «carta». */
const nombra = (texto: string, nombre: string) => new RegExp(`\\b${sinAcentos(nombre)}`).test(sinAcentos(texto));

describe('detectores de las pruebas (que no sean vacíos)', () => {
  it('detectan nombres de clientes como palabra, sin saltar en «carta»', () => {
    expect(nombra('Cotización ARTA final', 'arta')).toBe(true);
    expect(nombra('Proyecto Cancún, Q. Roo', 'cancún')).toBe(true);
    expect(nombra('H. Ayuntamiento de Zacatlán', 'zacatl')).toBe(true);
    expect(nombra('{"carta":null}', 'arta')).toBe(false);
  });

  it('detectan el meta-texto interno', () => {
    expect(META.test('Kit de transceptores')).toBe(true);
    expect(META.test('Guardar como plantilla')).toBe(true);
    expect(META.test('Cumple la rúbrica')).toBe(true);
    expect(META.test('Equipo con la garantía del fabricante')).toBe(false);
  });

  it('detectan folios, correos y RFC', () => {
    expect('NXR-2026-351119').toMatch(/NXR-\d|NEX\d{6,}/i);
    expect('ventas@nexara.com.mx').toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect('NEE240925V73').toMatch(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/);
    expect('2226960350'.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')).toMatch(/\b\d{2}[\s-]?\d{4}[\s-]?\d{4}\b/);
  });
});

describe('plantillas base', () => {
  it('cubre los arquetipos del negocio (nueve plantillas)', () => {
    expect(PLANTILLAS_BASE.map((p) => p.clave)).toEqual([
      'suministro-equipo',
      'licenciamiento',
      'seguridad-perimetral-fortinet',
      'red-estructurada',
      'cctv',
      'control-acceso',
      'poliza-servicio',
      'proyecto-integral-v2',
      'licitacion-gobierno',
    ]);
  });

  it('nombres y claves únicos, y cada segmento es válido', () => {
    const nombres = PLANTILLAS_BASE.map((p) => sinAcentos(p.nombre));
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(new Set(PLANTILLAS_BASE.map((p) => p.clave)).size).toBe(PLANTILLAS_BASE.length);
    for (const p of PLANTILLAS_BASE) {
      expect((SEGMENTOS as readonly string[]).includes(p.segmento)).toBe(true);
      expect(p.contenido.segmento).toBe(p.segmento);
      expect(p.nombre.length).toBeGreaterThanOrEqual(2);
      expect(p.nombre.length).toBeLessThanOrEqual(120);
    }
  });

  it('reparte los segmentos como el esquema del negocio', () => {
    const porClave = Object.fromEntries(PLANTILLAS_BASE.map((p) => [p.clave, p.segmento]));
    expect(porClave).toEqual({
      'suministro-equipo': 'COMERCIAL',
      licenciamiento: 'COMERCIAL',
      'seguridad-perimetral-fortinet': 'COMERCIAL',
      'red-estructurada': 'OBRA',
      cctv: 'OBRA',
      'control-acceso': 'OBRA',
      'poliza-servicio': 'SERVICIO',
      'proyecto-integral-v2': 'OBRA',
      'licitacion-gobierno': 'LICITACION',
    });
  });

  describe.each(PLANTILLAS_BASE.map((p) => [p.nombre, p] as const))('%s', (_nombre, p) => {
    const c = p.contenido;

    it('pasa por normalizarContenidoPlantilla sin perder ni cambiar ningún campo', () => {
      expect(normalizarContenidoPlantilla(c)).toEqual(c);
      // Y sobrevive al viaje por JSON (así se guarda en la base de datos).
      expect(normalizarContenidoPlantilla(JSON.parse(JSON.stringify(c)))).toEqual(c);
    });

    it('no pierde partidas, bloques ni texto por los topes del normalizador', () => {
      expect(normalizarContenidoPlantilla(c).items).toHaveLength(c.items.length);
      expect(normalizarBloques(c.alcanceBloques)).toHaveLength(c.alcanceBloques.length);
      expect(c.items.length).toBeGreaterThan(0);
      expect(p.conPartidas).toBe(true);
    });

    it('trae todo lo que una plantilla completa debe traer', () => {
      expect(c.projectName).not.toBe('');
      expect(c.scope).not.toBe('');
      expect(c.objetivo).not.toBe('');
      expect(c.note).not.toBe('');
      expect(c.alcanceBloques.length).toBeGreaterThan(0);
      expect(c.currency).toBe('MXN');
      expect(c.depositPercent).toBeGreaterThanOrEqual(0);
      expect(c.depositPercent).toBeLessThanOrEqual(100);
      expect(c.opciones.condiciones.garantia).not.toBe('');
      expect(c.opciones.secciones.terminos).toBe(true);
      expect(c.opciones.secciones.firma).toBe(true);
      expect(c.opciones.columnas.precioUnitario).toBe(true);
    });

    it('el objetivo lleva introducción y cierre; los beneficios salen de las partidas o van escritos sin cifras', () => {
      const o = leerObjetivo(c.objetivo);
      expect(o.intro).not.toBe('');
      expect(o.cierre).not.toBe('');
      if (['red-estructurada', 'cctv', 'control-acceso', 'proyecto-integral-v2'].includes(p.clave)) {
        // Plantillas técnicas: los beneficios se derivan de las partidas reales al imprimir.
        expect(o.beneficios).toEqual([]);
      } else {
        // Donde los derivados no aplican van escritos, y una plantilla no puede llevar cifras del proyecto.
        expect(o.beneficios.length).toBeGreaterThanOrEqual(3);
        for (const b of o.beneficios) expect(b).not.toMatch(/\d/);
      }
    });

    it('los términos usan solo partes que el sistema reconoce', () => {
      const partes = leerTerminosPersonalizados(c.note);
      expect(Object.keys(partes).length).toBeGreaterThan(0);
      expect(Object.keys(partes).every((k) => ['pago', 'alcance', 'noIncluye', 'disponibilidad', 'otras'].includes(k))).toBe(true);
    });

    it('sin precios negativos, cantidades enteras >= 1 y grupos válidos', () => {
      for (const i of c.items) {
        expect(i.unitPrice).toBeGreaterThanOrEqual(0);
        expect(i.qty).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(i.qty)).toBe(true);
        expect(i.discount).toBe(0);
        expect(i.tax).toBe(16);
        expect((GRUPOS as readonly string[]).includes(String(i.grupo))).toBe(true);
        expect(i.name.length).toBeLessThanOrEqual(200);
      }
    });

    it('las partidas no traen precios inventados: solo 0 o los genéricos que ya existen en PAQUETES', () => {
      const permitidos = new Set(PAQUETES.flatMap((paquete) => paquete.partidas.map((x) => x.unitPrice)));
      for (const i of c.items) {
        if (i.unitPrice !== 0) {
          expect(permitidos.has(i.unitPrice)).toBe(true);
          const delPaquete = PAQUETES.flatMap((paquete) => paquete.partidas).find((x) => x.unitPrice === i.unitPrice);
          expect(delPaquete?.name).toBe(i.name);
        }
      }
    });

    it('ninguna cadena visible para el cliente nombra a un cliente de las muestras', () => {
      const todo = JSON.stringify(c);
      for (const nombre of NOMBRES_DE_MUESTRA) {
        expect({ nombre, aparece: nombra(todo, nombre) }).toEqual({ nombre, aparece: false });
      }
    });

    it('ninguna cadena visible para el cliente lleva meta-texto interno (kit, plantilla, rúbrica…)', () => {
      for (const texto of textosVisibles(p)) {
        expect(texto).not.toMatch(META);
      }
    });

    it('sin folios, correos, teléfonos ni RFC', () => {
      for (const texto of textosVisibles(p)) {
        expect(texto).not.toMatch(/NXR-\d|NEX\d{6,}/i);
        expect(texto).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
        expect(texto).not.toMatch(/\b\d{2}[\s-]?\d{4}[\s-]?\d{4}\b/);
        expect(texto).not.toMatch(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/);
      }
    });

    it('el texto no trae espacios dobles ni saltos de más', () => {
      for (const texto of textosVisibles(p)) {
        expect(texto).not.toMatch(/ {2,}/);
        expect(texto).toBe(texto.trim());
      }
    });

    it('los términos armados no se contradicen con las partidas (solo suministro vs. instalación)', () => {
      const terminos = terminosDeCotizacion({
        segmento: c.segmento,
        incluyeInstalacion: incluyeInstalacion(c.items),
        anticipoPct: c.depositPercent,
        personalizados: c.note,
        condiciones: c.opciones.condiciones,
        vigenciaDias: 15,
      });
      const alcance = terminos.partes.find((x) => x.clave === 'alcance')?.texto ?? '';
      if (c.segmento === 'COMERCIAL' && !incluyeInstalacion(c.items)) {
        // Solo suministro: la propuesta nunca puede decir que la instalación está incluida.
        expect(sinAcentos(alcance)).not.toMatch(/mano de obra de instalacion/);
      }
      if (incluyeInstalacion(c.items) && c.segmento !== 'LICITACION') {
        expect(sinAcentos(alcance)).not.toMatch(/cubre unicamente el suministro/);
      }
      // Cada parte de los términos tiene título y texto.
      for (const parte of terminos.partes) {
        expect(parte.titulo).not.toBe('');
        expect(parte.texto).not.toBe('');
      }
    });
  });

  it('la garantía de instalación es de 90 días en toda plantilla con mano de obra de instalación', () => {
    for (const p of PLANTILLAS_BASE) {
      const conObra = p.contenido.items.some((i) => i.grupo === 'MANO_DE_OBRA');
      if (conObra && ['OBRA', 'SERVICIO'].includes(p.segmento)) {
        expect(p.contenido.opciones.condiciones.garantia).toMatch(/90 días/);
      }
    }
    expect(buscarPlantillaBase('red-estructurada')?.contenido.opciones.condiciones.garantia).toMatch(/90 días en la mano de obra de instalación/);
    expect(buscarPlantillaBase('cctv')?.contenido.opciones.condiciones.garantia).toMatch(/90 días en la mano de obra de instalación/);
  });

  it('el anticipo sigue al negocio: 50 % en suministro y obra, contado en licencias, sin anticipo en licitación y póliza', () => {
    const anticipo = (clave: string) => buscarPlantillaBase(clave)!.contenido.depositPercent;
    expect(anticipo('suministro-equipo')).toBe(50);
    expect(anticipo('red-estructurada')).toBe(50);
    expect(anticipo('cctv')).toBe(50);
    expect(anticipo('licenciamiento')).toBe(100);
    expect(anticipo('licitacion-gobierno')).toBe(0);
    expect(anticipo('poliza-servicio')).toBe(0);
  });

  it('las secciones y columnas siguen el esquema de cada tipo de cotización', () => {
    const sec = (clave: string) => buscarPlantillaBase(clave)!.contenido.opciones.secciones;
    expect(sec('suministro-equipo')).toMatchObject({ objetivo: true, alcance: false, planos: false });
    expect(sec('licenciamiento')).toMatchObject({ objetivo: false, alcance: true, planos: false });
    expect(sec('red-estructurada')).toMatchObject({ objetivo: true, alcance: true, planos: true });
    expect(sec('cctv')).toMatchObject({ objetivo: true, alcance: true, planos: true });
    expect(sec('control-acceso')).toMatchObject({ objetivo: true, alcance: true, planos: false });
    expect(sec('licitacion-gobierno')).toMatchObject({ objetivo: true, alcance: true, planos: true });
    expect(buscarPlantillaBase('poliza-servicio')!.contenido.opciones.columnas.marcaModelo).toBe(false);
    expect(buscarPlantillaBase('cctv')!.contenido.opciones.columnas.marcaModelo).toBe(true);
  });

  it('las plantillas de obra reutilizan los bloques de exclusiones y entrega del editor (sin copiarlos)', () => {
    for (const [clave, segmento] of [
      ['red-estructurada', 'OBRA'],
      ['cctv', 'OBRA'],
      ['control-acceso', 'OBRA'],
      ['proyecto-integral-v2', 'OBRA'],
      ['poliza-servicio', 'SERVICIO'],
      ['licitacion-gobierno', 'LICITACION'],
    ] as const) {
      const bloques = buscarPlantillaBase(clave)!.contenido.alcanceBloques as Array<{ clave: string; titulo: string; vinetas: string[] }>;
      for (const del of plantillasDeAlcance(segmento).filter((b) => ['plantilla:exclusiones', 'plantilla:entrega'].includes(b.clave))) {
        expect(bloques.find((b) => b.clave === del.clave)).toMatchObject({ titulo: del.titulo, vinetas: del.vinetas });
      }
    }
  });

  it('las claves de los bloques de alcance no se repiten dentro de una plantilla', () => {
    for (const p of PLANTILLAS_BASE) {
      const claves = (p.contenido.alcanceBloques as Array<{ clave: string }>).map((b) => b.clave);
      expect(new Set(claves).size).toBe(claves.length);
    }
  });

  describe('marcas y modelos reales del catálogo del negocio', () => {
    const marcas = (clave: string) =>
      new Set(buscarPlantillaBase(clave)!.contenido.items.map((i) => i.brand).filter(Boolean) as string[]);

    it('cada arquetipo trae las marcas que realmente cotiza', () => {
      expect(marcas('cctv')).toEqual(new Set(['Hikvision', 'Western Digital']));
      expect(marcas('licenciamiento')).toEqual(new Set(['Microsoft', 'ESET']));
      expect(marcas('seguridad-perimetral-fortinet')).toEqual(new Set(['Fortinet']));
      expect(marcas('red-estructurada').has('Panduit')).toBe(true);
      expect(marcas('suministro-equipo')).toEqual(new Set(['Lenovo', 'Samsung', 'Brother', 'Cisco', 'APC']));
      const integral = marcas('proyecto-integral-v2');
      for (const m of ['Cisco', 'APC', 'Samsung', 'Yealink', 'Epson', 'Hanwha', 'Western Digital', 'Lenovo', 'Panduit', 'North System', 'Ubiquiti']) {
        expect(integral.has(m)).toBe(true);
      }
    });

    it('el firewall lleva los modelos de Fortinet del negocio', () => {
      const modelos = buscarPlantillaBase('seguridad-perimetral-fortinet')!.contenido.items.map((i) => i.model);
      expect(modelos).toContain('FG-90G-BDL-809-12');
      expect(modelos).toContain('FG-400F');
    });
  });

  describe('CCTV: el único precio es el genérico de PAQUETES', () => {
    it('la instalación de cámara sale de PAQUETES tal cual', () => {
      const cctv = buscarPlantillaBase('cctv')!.contenido.items;
      const conPrecio = cctv.filter((i) => i.unitPrice > 0);
      expect(conPrecio).toHaveLength(1);
      const mano = PAQUETES.find((x) => x.clave === 'camara-bala-instalada')!.partidas.find((x) => x.grupo === 'MANO_DE_OBRA')!;
      expect(conPrecio[0]).toMatchObject({ name: mano.name, unitPrice: mano.unitPrice, unit: mano.unit, grupo: 'MANO_DE_OBRA' });
    });

    it('el resto de las plantillas va con todos los precios en 0', () => {
      for (const p of PLANTILLAS_BASE.filter((x) => x.clave !== 'cctv')) {
        expect(p.contenido.items.every((i) => i.unitPrice === 0)).toBe(true);
      }
    });
  });
});

describe('catálogo maestro de partidas (Formato V2)', () => {
  it('trae las cuatro familias del formato en su orden', () => {
    expect(FAMILIAS_V2.map((f) => [f.numero, f.clave])).toEqual([
      [1, 'TELECOM'],
      [2, 'ENERGIA'],
      [3, 'CCTV_COMPUTO'],
      [4, 'INFRAESTRUCTURA'],
    ]);
    for (const clave of CLAVES_FAMILIA_V2) {
      expect(CATALOGO_PARTIDAS_V2.some((c) => c.familia === clave)).toBe(true);
    }
  });

  it('códigos únicos y coherentes con su familia (1.xx telecom, 2.xx energía, 3.xx CCTV, 4.xx infraestructura)', () => {
    const codigos = CATALOGO_PARTIDAS_V2.map((c) => c.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    const numero = Object.fromEntries(FAMILIAS_V2.map((f) => [f.clave, f.numero]));
    for (const c of CATALOGO_PARTIDAS_V2) {
      expect(c.codigo).toMatch(/^\d\.\d{2}$/);
      expect(Number(c.codigo.split('.')[0])).toBe(numero[c.familia]);
      expect(c.equipo.length).toBeGreaterThan(1);
      expect(c.unidad.length).toBeGreaterThan(1);
      expect((GRUPOS as readonly string[]).includes(c.grupo)).toBe(true);
    }
  });

  it('conserva los conceptos y las marcas del formato', () => {
    const por = (codigo: string) => CATALOGO_PARTIDAS_V2.find((c) => c.codigo === codigo)!;
    expect(por('1.01')).toMatchObject({ equipo: 'Router', marca: 'Cisco' });
    expect(por('2.01')).toMatchObject({ equipo: 'UPS de 3 kVA', marca: 'APC' });
    expect(por('3.12')).toMatchObject({ marca: 'Western Digital', modelo: 'WD8001PURP' });
    expect(por('4.08')).toMatchObject({ marca: 'Panduit', modelo: 'PanNet Cat6' });
    expect(por('4.13')).toMatchObject({ equipo: 'Rack abierto', marca: 'North System' });
    expect(por('4.21')).toMatchObject({ marca: 'Ubiquiti' });
    expect(CATALOGO_PARTIDAS_V2).toHaveLength(53);
  });

  it('los servicios del catálogo van en mano de obra y con unidad de servicio', () => {
    const servicios = CATALOGO_PARTIDAS_V2.filter((x) => x.grupo === 'MANO_DE_OBRA');
    expect(servicios.map((x) => x.codigo)).toEqual(['3.13', '3.14', '4.19', '4.20', '4.23']);
    for (const c of servicios) {
      expect(grupoDePartida({ grupo: c.grupo, name: c.equipo, unit: c.unidad })).toBe('MANO_DE_OBRA');
      expect(['Servicio', 'Día']).toContain(c.unidad);
    }
  });

  it('sin cantidades ni precios de proyectos anteriores, y sin nombres de clientes', () => {
    const json = JSON.stringify(CATALOGO_PARTIDAS_V2);
    expect(sinAcentos(json)).not.toMatch(/"(qty|cantidad|unitprice|precio|importe)"/);
    for (const nombre of NOMBRES_DE_MUESTRA) expect({ nombre, aparece: nombra(json, nombre) }).toEqual({ nombre, aparece: false });
  });

  it('la plantilla «Proyecto integral» lleva todo el catálogo, en su orden y sin inventar nada', () => {
    const items = buscarPlantillaBase('proyecto-integral-v2')!.contenido.items;
    expect(items.map((i) => i.name)).toEqual(CATALOGO_PARTIDAS_V2.map((c) => c.equipo));
    items.forEach((item, indice) => {
      const c = CATALOGO_PARTIDAS_V2[indice]!;
      expect(item).toMatchObject({ brand: c.marca, model: c.modelo, unit: c.unidad, grupo: c.grupo, unitPrice: 0, qty: 1 });
    });
  });
});

describe('familias, marcas y servicios reales (§5-bis del esquema)', () => {
  it('trae las familias de producto con sus marcas y frecuencias', () => {
    const familia = (clave: string) => FAMILIAS_PRODUCTO.find((f) => f.clave === clave)!;
    expect(FAMILIAS_PRODUCTO.map((f) => f.clave)).toEqual([
      'CCTV',
      'COMPUTO',
      'PANTALLAS',
      'REDES',
      'ENERGIA',
      'ALMACENAMIENTO',
      'LICENCIAS',
      'SEGURIDAD_PERIMETRAL',
      'TELEFONIA',
      'CONTROL_ACCESO',
      'DETECCION',
      'SATELITAL',
    ]);
    expect(familia('CCTV').marcas.map((m) => m.nombre)).toEqual(['Hikvision', 'Hilook', 'Hanwha', 'Dahua', 'Axis']);
    expect(familia('CCTV').marcas[0]).toEqual({ nombre: 'Hikvision', frecuencia: 170 });
    expect(familia('COMPUTO').marcas[0]).toEqual({ nombre: 'Lenovo', frecuencia: 399 });
    expect(familia('REDES').conceptos.find((c) => c.nombre === 'Fibra óptica')?.frecuencia).toBe(599);
    expect(familia('LICENCIAS').conceptos[0]).toEqual({ nombre: 'Licencia', frecuencia: 445 });
    expect(familia('SEGURIDAD_PERIMETRAL').marcas.map((m) => m.nombre)).toEqual(['Fortinet / FortiGate', 'SonicWall']);
    expect(familia('SATELITAL').marcas).toEqual([{ nombre: 'Starlink', frecuencia: 13 }]);
    expect(familia('DETECCION').conceptos.map((c) => c.frecuencia)).toEqual([168, 115]);
    expect(new Set(FAMILIAS_PRODUCTO.map((f) => f.clave)).size).toBe(FAMILIAS_PRODUCTO.length);
  });

  it('los servicios reales son todos mano de obra y traen su frecuencia', () => {
    expect(SERVICIOS_BASE.map((s) => s.nombre)).toEqual([
      'Mano de obra',
      'Instalación',
      'Soporte',
      'Mantenimiento',
      'Configuración',
      'Capacitación',
      'Póliza de servicio',
    ]);
    expect(SERVICIOS_BASE.every((s) => s.grupo === 'MANO_DE_OBRA')).toBe(true);
    expect(SERVICIOS_BASE.find((s) => s.clave === 'mano-de-obra')?.frecuencia).toBe(483);
    expect(SERVICIOS_BASE.find((s) => s.clave === 'instalacion')?.frecuencia).toBe(276);
  });
});

describe('catálogo de kits de herramientas', () => {
  const kit = buscarKit('idc-campo')!;

  it('el kit IDC de campo trae las 18 herramientas y materiales de la hoja original, con su cantidad', () => {
    expect(kit.nombre).toBe('Kit de herramientas y material IDC de campo');
    expect(kit.herramientas).toHaveLength(18);
    const cantidad = (texto: string) => kit.herramientas.find((h) => h.descripcion.toLowerCase().includes(texto.toLowerCase()))?.cantidad;
    expect(cantidad('Jack RJ45')).toBe(3);
    expect(cantidad('Plug RJ45')).toBe(10);
    expect(cantidad('Cinchos')).toBe(20);
    expect(cantidad('Laptop')).toBe(1);
    expect(cantidad('Multímetro')).toBe(1);
    expect(cantidad('Generador de tonos')).toBe(1);
    expect(kit.herramientas.every((h) => h.unidad === 'Pieza' && Number.isInteger(h.cantidad) && h.cantidad >= 1)).toBe(true);
  });

  it('distingue lo que se devuelve (herramienta) de lo que se consume o se deja en sitio (material)', () => {
    const materiales = kit.herramientas.filter((h) => h.tipo === 'MATERIAL').map((h) => h.descripcion);
    expect(materiales).toEqual(['Patch cord de 3 m', 'Jack RJ45 Cat6', 'Plug RJ45 Cat6', 'Cinchos']);
  });

  it('claves únicas y búsqueda por clave', () => {
    expect(new Set(KITS_HERRAMIENTAS.map((k) => k.clave)).size).toBe(KITS_HERRAMIENTAS.length);
    expect(buscarKit(' IDC-Campo ')).toBe(kit);
    expect(buscarKit('no-existe')).toBeNull();
  });

  it('se traduce a renglones del checklist de una OT sin perder ninguno (misma forma que ActivityToolRequirement)', () => {
    const requisitos = requisitosDeKit(kit);
    expect(requisitos).toHaveLength(18);
    const normalizados = normalizarRequisitos(requisitos);
    // `normalizarRequisitos` quita duplicados y recorta: aquí no debe quitar ni recortar nada.
    expect(normalizados).toHaveLength(18);
    expect(normalizados.map((r) => [r.descripcion, r.cantidad])).toEqual(requisitos.map((r) => [r.descripcion, r.cantidad]));
    expect(normalizados.every((r) => r.productId === null && r.toolId === null && r.toolSource === null)).toBe(true);
  });
});
