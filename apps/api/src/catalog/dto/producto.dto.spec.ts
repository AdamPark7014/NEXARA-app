import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CrearProductoDto, EditarProductoDto } from './producto.dto.js';
import { MENSAJE_TIPO_INVALIDO } from '../tipo-articulo.js';

/** Igual que el `ValidationPipe` global de `main.ts`. */
function revisar<T extends object>(cls: new () => T, cuerpo: Record<string, unknown>) {
  const instancia = plainToInstance(cls, cuerpo, { enableImplicitConversion: true });
  const errores = validateSync(instancia as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
  });
  const mensajes = (e: (typeof errores)[number]): string[] => [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap(mensajes),
  ];
  return { instancia, mensajes: errores.flatMap(mensajes) };
}

describe('CrearProductoDto', () => {
  it('pasa el cuerpo que manda el alta de artículo (consumible con empaque)', () => {
    const { instancia, mensajes } = revisar(CrearProductoDto, {
      name: 'Cincho negro 20 cm',
      sku: 'CIN-20N',
      category: 'Fijación',
      tipoArticulo: 'CONSUMIBLE',
      unitName: 'pz',
      empaque: { nombre: 'Bote', capacidad: 100 },
    });
    expect(mensajes).toEqual([]);
    expect(instancia.empaque).toEqual({ nombre: 'Bote', capacidad: 100 });
  });

  it('sigue aceptando el cuerpo de siempre, sin tipo', () => {
    expect(
      revisar(CrearProductoDto, {
        sku: 'SKU-0007',
        name: 'Fuente 12 V',
        category: 'Energía',
        subcategory: 'Fuentes',
        price: 350.5,
        currency: 'MXN',
        unit: 'pz',
        imageUrl: 'https://ejemplo/fuente.jpg',
        description: 'Fuente regulada',
        satProductKey: '39121000',
        satUnitKey: 'H87',
        unitName: 'Pieza',
      }).mensajes,
    ).toEqual([]);
  });

  it('acepta el tipo en minúsculas y lo deja en mayúsculas; vacío es sin tipo', () => {
    expect(revisar(CrearProductoDto, { name: 'UTP', tipoArticulo: ' medida ' }).instancia.tipoArticulo).toBe('MEDIDA');
    const vacio = revisar(CrearProductoDto, { name: 'UTP', tipoArticulo: '' });
    expect(vacio.mensajes).toEqual([]);
    expect(vacio.instancia.tipoArticulo).toBeNull();
  });

  it('rechaza HERRAMIENTA y tipos inventados con un mensaje que dice a dónde ir', () => {
    expect(revisar(CrearProductoDto, { name: 'Taladro', tipoArticulo: 'HERRAMIENTA' }).mensajes).toEqual([
      MENSAJE_TIPO_INVALIDO,
    ]);
    expect(revisar(CrearProductoDto, { name: 'X', tipoArticulo: 'REFACCION' }).mensajes).toEqual([
      MENSAJE_TIPO_INVALIDO,
    ]);
  });

  it('el empaque necesita nombre y una capacidad mayor a cero', () => {
    expect(
      revisar(CrearProductoDto, { name: 'Cincho', tipoArticulo: 'CONSUMIBLE', empaque: { nombre: 'Bote', capacidad: 0 } })
        .mensajes,
    ).toEqual(['Lo que trae el empaque debe ser mayor a cero']);
    expect(
      revisar(CrearProductoDto, { name: 'Cincho', tipoArticulo: 'CONSUMIBLE', empaque: { nombre: '', capacidad: 100 } })
        .mensajes,
    ).toEqual(['Escribe el empaque (Bote, Bolsa, Caja…) o la presentación (Bobina, Rollo…)']);
    expect(
      revisar(CrearProductoDto, { name: 'Cincho', tipoArticulo: 'CONSUMIBLE', empaque: { nombre: 'Bote' } }).mensajes,
    ).toEqual(['Indica cuántas piezas o metros trae el empaque']);
    expect(
      revisar(CrearProductoDto, { name: 'Cincho', tipoArticulo: 'CONSUMIBLE', empaque: 'Bote de 100' }).mensajes,
    ).toEqual(['El empaque debe traer nombre y capacidad']);
  });

  it('la capacidad que llega como texto se convierte a número', () => {
    const { instancia, mensajes } = revisar(CrearProductoDto, {
      name: 'UTP',
      tipoArticulo: 'MEDIDA',
      empaque: { nombre: 'Bobina', capacidad: '305' },
    });
    expect(mensajes).toEqual([]);
    expect(instancia.empaque?.capacidad).toBe(305);
  });

  it('rechaza campos que el contrato no tiene, también dentro del empaque', () => {
    expect(revisar(CrearProductoDto, { name: 'X', stock: 5 }).mensajes).toEqual(['property stock should not exist']);
    expect(
      revisar(CrearProductoDto, {
        name: 'X',
        tipoArticulo: 'CONSUMIBLE',
        empaque: { nombre: 'Bote', capacidad: 100, piezas: 100 },
      }).mensajes,
    ).toEqual(['property piezas should not exist']);
  });

  it('el nombre es obligatorio en el alta', () => {
    expect(revisar(CrearProductoDto, { tipoArticulo: 'EQUIPO' }).mensajes).toEqual(['Escribe el nombre del artículo']);
  });

  it('un precio que no es número dice eso, no que es negativo', () => {
    expect(revisar(CrearProductoDto, { name: 'X', price: 'abc' }).mensajes).toEqual(['El precio debe ser un número']);
    expect(revisar(CrearProductoDto, { name: 'X', price: -1 }).mensajes).toEqual(['El precio no puede ser negativo']);
  });
});

describe('EditarProductoDto', () => {
  it('todo es opcional y acepta el SKU que manda el formulario al editar', () => {
    expect(revisar(EditarProductoDto, {}).mensajes).toEqual([]);
    expect(
      revisar(EditarProductoDto, {
        name: 'Cincho negro 20 cm',
        sku: 'CIN-20N',
        tipoArticulo: 'consumible',
        empaque: { nombre: 'Bolsa', capacidad: 50 },
      }).mensajes,
    ).toEqual([]);
  });

  it('null en el tipo deja el artículo sin tipo', () => {
    const { instancia, mensajes } = revisar(EditarProductoDto, { tipoArticulo: null });
    expect(mensajes).toEqual([]);
    expect(instancia.tipoArticulo).toBeNull();
  });

  it('un nombre vacío no pasa', () => {
    expect(revisar(EditarProductoDto, { name: '' }).mensajes).toEqual(['Escribe el nombre del artículo']);
  });
});
