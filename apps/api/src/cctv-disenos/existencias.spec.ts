import { BadRequestException } from '@nestjs/common';
import {
  SIN_PRECIO,
  elegirCandidato,
  fichaDeProducto,
  normalizarModelo,
  partidaDeLinea,
  textoDeProducto,
  tipoDesdeCt,
  validarLineas,
  validarModelos,
  variantesDeModelo,
  type LineaPedida,
} from './existencias';

describe('variantesDeModelo', () => {
  it('ignora guiones, espacios y mayúsculas', () => {
    expect(normalizarModelo('ds-2cd1143g2 liuf')).toBe('DS2CD1143G2LIUF');
  });

  it('prueba sin la versión de hardware', () => {
    expect(variantesDeModelo('TL-SL1218MP V6.0')).toEqual(['TLSL1218MPV60', 'TLSL1218MP']);
  });

  it('prueba sin lo que sigue a la diagonal', () => {
    expect(variantesDeModelo('DS-2CD1T47G3-LIUF/LSRB')).toContain('DS2CD1T47G3LIUF');
  });

  it('un modelo muy corto no se busca: coincidiría con cualquier cosa', () => {
    expect(variantesDeModelo('A-1')).toEqual([]);
  });

  it('no le quita una V que es parte del modelo', () => {
    expect(variantesDeModelo('NVR5216V')).toEqual(['NVR5216V']);
  });
});

describe('elegirCandidato', () => {
  const fila = (clave: string, marca: string | null, hay = false) => ({ clave, marca, hay });

  it('prefiere la misma marca y, entre esas, la que tiene piezas', () => {
    const r = elegirCandidato([fila('A', 'Dahua Technology'), fila('B', 'Dahua Technology', true)], 'Dahua');
    expect(r?.clave).toBe('B');
  });

  it('el mismo modelo de otra marca es casualidad, no el mismo equipo', () => {
    expect(elegirCandidato([fila('A', 'Hikvision', true)], 'Dahua')).toBeNull();
  });

  it('«TP-Link» y «TP-LINK» son la misma marca', () => {
    expect(elegirCandidato([fila('A', 'TP-LINK')], 'TP-Link')?.clave).toBe('A');
  });

  it('sin marca toma la que tenga piezas', () => {
    expect(elegirCandidato([fila('A', 'X'), fila('B', 'Y', true)], '')?.clave).toBe('B');
  });

  it('sin filas no hay nada', () => {
    expect(elegirCandidato([], 'Dahua')).toBeNull();
  });
});

describe('tipoDesdeCt', () => {
  const de = (categoria: string, subcategoria: string) => tipoDesdeCt({ categoria, subcategoria });

  it.each([
    ['Video Vigilancia', 'Cámara Bala IP', 'camaras', 'bala'],
    ['Video Vigilancia', 'Cámara domo análoga', 'camaras', 'domo'],
    ['Video Vigilancia', 'Cámara PTZ IP', 'camaras', 'ptz'],
    ['Video Vigilancia', 'Cámara Turret IP', 'camaras', 'turret'],
    ['Video Vigilancia', 'Grabadores Digitales NVR', 'grabacion', 'nvr'],
    ['Video Vigilancia', 'Grabadores Pentahíbridos XVR', 'grabacion', 'nvr'],
    ['Video Vigilancia', 'Videoportero', 'acceso', 'terminal'],
    ['Red Activa', 'Switches', 'red', 'switch'],
    ['Respaldo y Regulación', 'No Breaks y UPS', 'infraestructura', 'ups'],
    ['Red Pasiva', 'Gabinetes de Piso', 'infraestructura', 'gabinete'],
    ['Red Pasiva', 'Racks Modulo', 'infraestructura', 'gabinete'],
    ['Solucion para servidores', 'Servidores', 'servidores', 'servidor'],
    ['Seguridad Inteligente', 'Control de Acceso', 'acceso', 'terminal'],
    ['Seguridad Inteligente', 'Sirena', 'alarmas', 'sirena'],
    ['Seguridad Inteligente', 'Paneles para Alarma', 'alarmas', 'panel'],
  ])('%s / %s es %s %s', (cat, sub, familia, tipo) => {
    expect(de(cat, sub)).toEqual({ familia, tipo });
  });

  it('lo que no dice qué es lo decide la lectura', () => {
    expect(de('Video Vigilancia', 'Cámara WiFi')).toBeNull();
  });

  it('un gabinete de computadora no es un gabinete de rack', () => {
    expect(de('Ensamble', 'Gabinetes para Computadoras')).toBeNull();
    expect(de('Accesorios Gaming', 'Gabinetes Gaming')).toBeNull();
  });
});

describe('ficha desde CT', () => {
  const producto = {
    clave: 'CAMHKV4190',
    numParte: 'DS-2CD1143G2-LIUF',
    modelo: 'DS-2CD1143G2-LIUF',
    nombre: 'Cámara IP Domo',
    marca: 'Dahua Technology',
    categoria: 'Video Vigilancia',
    subcategoria: 'Cámara domo IP',
    descripcion: 'Domo 4 MP lente 2.8 mm',
    especificaciones: [{ tipo: 'Megapixeles', valor: '4 MP' }, { tipo: '', valor: 'x' }],
  };

  it('el texto para leer lleva lo que dice CT', () => {
    const t = textoDeProducto(producto, 500);
    expect(t).toContain('modelo DS-2CD1143G2-LIUF');
    expect(t).toContain('Megapixeles: 4 MP');
    expect(textoDeProducto(producto, 20)).toHaveLength(20);
  });

  it('sin IA queda con lo que hay, y con su clave de CT', () => {
    const f = fichaDeProducto(producto, null);
    expect(f).toMatchObject({ familia: 'camaras', tipo: 'domo', marca: 'Dahua', modelo: 'DS-2CD1143G2-LIUF', ct: 'CAMHKV4190', datos: [] });
    expect(f.caracteristicas).toEqual(['Megapixeles: 4 MP']);
  });

  it('marca y modelo son los de CT aunque la lectura diga otra cosa, y el tipo el de su subcategoría', () => {
    const leida = { familia: 'camaras', tipo: 'bala', marca: 'Otra', modelo: 'XX', descripcion: 'Una cámara', color: 'negro' as const, cajaTrasera: false, lucesVisibles: 2, datos: [{ campo: 'pxHoriz', valor: '2560', hoja: null }] as never, caracteristicas: [] };
    const f = fichaDeProducto(producto, leida);
    expect(f).toMatchObject({ tipo: 'domo', marca: 'Dahua', modelo: 'DS-2CD1143G2-LIUF', descripcion: 'Una cámara', color: 'negro', lucesVisibles: 2 });
    expect(f.datos).toHaveLength(1);
  });

  it('si la subcategoría no dice, manda la lectura', () => {
    const leida = { familia: 'camaras', tipo: 'bala', marca: '', modelo: '', descripcion: '', color: 'blanco' as const, cajaTrasera: false, lucesVisibles: 0, datos: [], caracteristicas: [] };
    expect(fichaDeProducto({ ...producto, subcategoria: 'Cámara WiFi' }, leida).tipo).toBe('bala');
  });
});

describe('validar lo que manda la pantalla', () => {
  it('rechaza lo que no es una lista', () => {
    expect(() => validarModelos(null)).toThrow(BadRequestException);
    expect(() => validarLineas([])).toThrow('no tiene equipos');
  });

  it('un precio que venga de la pantalla no pasa', () => {
    const [l] = validarLineas([{ clave: 'a', nombre: 'Domo', cantidad: 3, modelo: 'X', unitPrice: 1, unitCost: 1 }]);
    expect(l).not.toHaveProperty('unitPrice');
    expect(l).not.toHaveProperty('unitCost');
  });

  it('la cantidad es entera y mayor que cero', () => {
    for (const cantidad of [0, -1, 1.5, 'x']) {
      expect(() => validarLineas([{ clave: 'a', nombre: 'Domo', cantidad }])).toThrow('Cantidad');
    }
  });

  it('un producto que no es un id no pasa', () => {
    expect(() => validarModelos([{ clave: 'a', productId: 'abc' }])).toThrow('Producto');
  });
});

describe('partidaDeLinea', () => {
  const linea: LineaPedida = { clave: 'a', marca: 'Hikvision', modelo: 'DS-1', productId: null, ct: null, grupo: 'EQUIPOS', nombre: 'Domo DS-1', descripcion: '', cantidad: 4, unidad: 'pieza' };
  const mayorista = { productCtId: 9, unitPrice: 1000, unitCost: 700, supplierCode: 'CT', supplierSku: 'CAM1', marginPercent: 30, stockSnapshot: 5, leadTimeDays: 1, sku: 'CAM1', description: 'De CT', brand: 'B', model: 'M' };

  it('con mayorista lleva su precio, su costo y su clave, y el nombre del diseño', () => {
    const p = partidaDeLinea(linea, { paqueteClave: 'cctv:3', almacen: null, mayorista });
    expect(p).toMatchObject({ name: 'Domo DS-1', qty: 4, unitPrice: 1000, unitCost: 700, productCtId: 9, supplierCode: 'CT', paqueteClave: 'cctv:3', grupo: 'EQUIPOS', brand: 'Hikvision', model: 'DS-1', description: 'De CT' });
  });

  it('sin precio de nadie queda en cero y avisado, nunca inventado', () => {
    const p = partidaDeLinea(linea, { paqueteClave: 'cctv:3', almacen: null, mayorista: null });
    expect(p.unitPrice).toBe(0);
    expect(p.notes).toBe(SIN_PRECIO);
    expect(p.unitCost).toBeUndefined();
  });

  it('el precio de Almacén gana sobre el del mayorista', () => {
    const p = partidaDeLinea(linea, { paqueteClave: 'x', almacen: { productId: 2, sku: 'S', piezas: 3, precio: 1500, costo: 900 }, mayorista });
    expect(p).toMatchObject({ productId: 2, sku: 'S', unitPrice: 1500, unitCost: 900 });
  });

  it('en Almacén sin precio usa el del mayorista, pero queda ligado al producto', () => {
    const p = partidaDeLinea(linea, { paqueteClave: 'x', almacen: { productId: 2, sku: 'S', piezas: 3, precio: null, costo: null }, mayorista });
    expect(p).toMatchObject({ productId: 2, unitPrice: 1000, unitCost: 700 });
  });

  it('en Almacén sin precio ni mayorista también avisa', () => {
    const p = partidaDeLinea(linea, { paqueteClave: 'x', almacen: { productId: 2, sku: 'S', piezas: 3, precio: null, costo: 500 }, mayorista: null });
    expect(p).toMatchObject({ productId: 2, unitPrice: 0, unitCost: 500, notes: SIN_PRECIO });
  });
});
