import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { familiaDeTipo, hojaDelDibujo, hojasParaImagen, limpiarFicha, numeroDe, textoParaIa } from './ficha-ia';
import { esPdf } from './ficha-pdf';
import { LecturaFichaService } from './lectura-ficha.service';
import { limpiarSitio, peticionDescripcion, peticionSitio } from './sitio-ia';

/** Lo que se le enseña a la IA y cómo se limpia lo que contesta: aquí no se llama a nadie. */

const relleno = (n: number) => Array.from({ length: n }, (_, i) => `renglón ${i}`).join('\n');

describe('Qué hojas se mandan como imagen', () => {
  it('si el título queda al final de una hoja, el dibujo está en la siguiente', () => {
    const paginas = ['portada', relleno(40), `${relleno(30)}\nDimension`, 'Accessory\nOptional', 'contra'];
    expect(hojaDelDibujo(paginas)).toBe(4);
    expect(hojasParaImagen(paginas)).toEqual([1, 4]);
  });

  it('si el título lleva contenido abajo, el dibujo está en esa hoja', () => {
    expect(hojaDelDibujo(['portada', relleno(40), 'Dimension\nUnit: mm\nDS-100\nDS-200\nAvailable Model', 'contra'])).toBe(3);
  });

  it('reconoce el título como lo escribe cada marca', () => {
    for (const titulo of ['Dimensions (mm[inch])', 'Dimensiones (mm)', 'Product Dimensions', 'Medidas']) {
      expect(hojaDelDibujo(['portada', `${relleno(5)}\n${titulo}\nuno\ndos\ntres`, 'contra'])).toBe(2);
    }
  });

  it('no confunde el renglón de la tabla con el título', () => {
    expect(hojaDelDibujo(['portada', 'Dimension 121 mm × 97 mm\nWeight 550 g'])).toBeNull();
  });

  it('sin título, manda la última hoja con contenido, no la contraportada', () => {
    expect(hojasParaImagen(['portada'.repeat(50), relleno(30), relleno(30), ' '])).toEqual([1, 3]);
  });

  it('un PDF sin texto se lee por imágenes, hasta cuatro hojas', () => {
    expect(hojasParaImagen(['', '', '', '', '', ''])).toEqual([1, 2, 3, 4]);
    expect(hojasParaImagen([])).toEqual([]);
  });
});

describe('El texto para la IA', () => {
  it('numera cada hoja y salta las vacías, para que diga de dónde salió cada dato', () => {
    expect(textoParaIa(['uno', '  ', 'tres'])).toBe('[Hoja 1]\nuno\n\n[Hoja 3]\ntres');
  });

  it('no se pasa del tope', () => {
    expect(textoParaIa(['x'.repeat(90_000)]).length).toBeLessThanOrEqual(60_000);
  });
});

describe('Limpiar lo que contesta la IA', () => {
  const base = { tipo: 'domo', marca: ' HIKVISION ', modelo: 'DS-1', descripcion: 'Domo', color: 'negro', cajaTrasera: false, lucesVisibles: 6, caracteristicas: [] };

  it('deja números limpios y la hoja de cada dato', () => {
    const f = limpiarFicha({ ...base, datos: [{ campo: 'irM', valor: '30 m', hoja: 2 }, { campo: 'pesoG', valor: '1,200 g', hoja: 3 }, { campo: 'ip', valor: 'IP67', hoja: 3 }] }, 5);
    expect(f.datos).toEqual([
      { campo: 'irM', valor: '30', hoja: 2 },
      { campo: 'pesoG', valor: '1200', hoja: 3 },
      { campo: 'ip', valor: 'IP67', hoja: 3 },
    ]);
    expect(f.marca).toBe('HIKVISION');
    expect(f.familia).toBe('camaras');
  });

  it('quita lo que no es un número, los campos desconocidos y los repetidos', () => {
    const f = limpiarFicha({ ...base, datos: [{ campo: 'irM', valor: 'no aplica', hoja: 2 }, { campo: 'inventado', valor: '3', hoja: 1 }, { campo: 'poeW', valor: '7', hoja: 1 }, { campo: 'poeW', valor: '9', hoja: 1 }] }, 5);
    expect(f.datos).toEqual([{ campo: 'poeW', valor: '7', hoja: 1 }]);
  });

  it('una hoja que no existe se queda sin hoja, no con una falsa', () => {
    expect(limpiarFicha({ ...base, datos: [{ campo: 'poeW', valor: '7', hoja: 99 }] }, 5).datos[0].hoja).toBeNull();
  });

  it('un tipo desconocido es un equipo genérico, nunca se fuerza', () => {
    const f = limpiarFicha({ ...base, tipo: 'dron', datos: [] }, 1);
    expect(f.tipo).toBe('generico');
    expect(f.familia).toBe('otros');
  });

  it('descarta cotas imposibles: la carcasa no es más alta que el equipo ni la cúpula más ancha', () => {
    const f = limpiarFicha(
      { ...base, datos: [{ campo: 'altoMm', valor: '97.7', hoja: 1 }, { campo: 'diametroMm', valor: '121.4', hoja: 1 }, { campo: 'altoCarcasaMm', valor: '121.4', hoja: 5 }, { campo: 'radioCupulaMm', valor: '97', hoja: 5 }] },
      5,
    );
    expect(f.datos.map((d) => d.campo)).toEqual(['altoMm', 'diametroMm']);
  });

  it('en un switch cuentan los puertos que dan PoE, no los de subida', () => {
    const f = limpiarFicha({ ...base, tipo: 'switch', datos: [{ campo: 'puertos', valor: '25', hoja: 2 }, { campo: 'puertosPoe', valor: '24', hoja: 2 }] }, 3);
    expect(f.datos.find((d) => d.campo === 'puertos')?.valor).toBe('24');
  });

  it('ordena las medidas por la forma del equipo, sin importar cómo las escriba cada marca', () => {
    const medidas = (a: string, h: string, f: string) => [{ campo: 'anchoMm', valor: a, hoja: 1 }, { campo: 'altoMm', valor: h, hoja: 1 }, { campo: 'fondoMm', valor: f, hoja: 1 }];
    const valores = (ficha: ReturnType<typeof limpiarFicha>) => Object.fromEntries(ficha.datos.map((d) => [d.campo, d.valor]));
    // «202.93 × 91.93 × 21.5 (L × A × H)»: una terminal es alta y delgada.
    expect(valores(limpiarFicha({ ...base, tipo: 'terminal', datos: medidas('91.93', '21.5', '202.93') }, 1))).toEqual({ anchoMm: '91.93', altoMm: '202.93', fondoMm: '21.5' });
    // Un switch es plano.
    expect(valores(limpiarFicha({ ...base, tipo: 'switch', datos: medidas('180', '440', '44') }, 1))).toEqual({ anchoMm: '440', altoMm: '44', fondoMm: '180' });
    // Una bala no se toca: su largo es el fondo.
    expect(valores(limpiarFicha({ ...base, tipo: 'bala', datos: medidas('70.5', '66.4', '192.7') }, 1))).toEqual({ anchoMm: '70.5', altoMm: '66.4', fondoMm: '192.7' });
  });

  it('el color que no conoce queda blanco y las luces sin sentido en cero', () => {
    const f = limpiarFicha({ ...base, color: 'otro', lucesVisibles: 500, datos: [] }, 1);
    expect(f.color).toBe('blanco');
    expect(f.lucesVisibles).toBe(0);
  });

  it('no truena con una respuesta vacía', () => {
    expect(limpiarFicha({}, 1)).toMatchObject({ tipo: 'generico', modelo: '', datos: [], caracteristicas: [] });
  });

  it('entiende los números como vienen en una ficha', () => {
    expect(numeroDe('2.8 mm')).toBe(2.8);
    expect(numeroDe('1,200')).toBe(1200);
    expect(numeroDe('7,5')).toBe(7.5);
    expect(numeroDe('n/a')).toBeNull();
  });

  it('cada tipo cae en su familia', () => {
    expect(familiaDeTipo('nvr')).toBe('grabacion');
    expect(familiaDeTipo('sismica')).toBe('alarmas');
  });
});

describe('Subir la memoria técnica', () => {
  const claude = (disponible = true) => ({ disponible: () => disponible, json: jest.fn() }) as any;

  it('reconoce un PDF por su contenido, no por su nombre', () => {
    expect(esPdf(Buffer.from('%PDF-1.7 hola'))).toBe(true);
    expect(esPdf(Buffer.from('<html>no soy un pdf'))).toBe(false);
    expect(esPdf(undefined)).toBe(false);
  });

  it('rechaza lo que no es PDF sin llamar a la IA', async () => {
    const ia = claude();
    await expect(new LecturaFichaService(ia).leer(1, { buffer: Buffer.from('MZ esto es un programa'), originalname: 'ficha.pdf' })).rejects.toBeInstanceOf(BadRequestException);
    expect(ia.json).not.toHaveBeenCalled();
  });

  it('sin archivo o demasiado grande, avisa', async () => {
    await expect(new LecturaFichaService(claude()).leer(1, undefined)).rejects.toThrow(/Falta el PDF/);
    await expect(new LecturaFichaService(claude()).leer(1, { buffer: Buffer.alloc(31 * 1024 * 1024) })).rejects.toThrow(/30 MB/);
  });

  it('sin IA disponible, pide capturarlo a mano', async () => {
    await expect(new LecturaFichaService(claude(false)).leer(1, { buffer: Buffer.from('%PDF-1.7 hola') })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('La IA que convierte una frase en datos', () => {
  const claude = () => ({ disponible: () => true, json: jest.fn().mockResolvedValue({ datos: { tipo: 'domo', modelo: 'X', datos: [], areas: [{ nombre: 'Bodega', tipo: 'bodega', m2: 400, piso: 0, camaras: 0 }], camaras: 4 } }) }) as any;

  it('solo viaja la frase, poco y con el modelo barato', () => {
    const p = peticionSitio('  bodega   de 40 por 25 ');
    expect(p.usuario).toBe('bodega de 40 por 25');
    expect(p.modelo).toBe('claude-haiku-5-5');
    expect(p.esfuerzo).toBe('low');
    expect(p.pensar).toBe(false);
    expect(p.maxTokens).toBeLessThanOrEqual(700);
    expect(peticionDescripcion('x'.repeat(9000)).usuario.length).toBeLessThanOrEqual(1500);
  });

  it('una cifra disparatada no arma un edificio de un kilómetro', () => {
    const s = limpiarSitio({ anchoM: 90000, fondoM: -3, alturaM: 6, camaras: 12.4, barrera: 'si', areas: [{ nombre: ' Bodega ', tipo: 'bodega', m2: 400, piso: 0, camaras: 0 }, { nombre: '', tipo: 'bodega' }, { nombre: 'Rara', tipo: 'nave' }] });
    expect(s).toMatchObject({ anchoM: 0, fondoM: 0, alturaM: 6, camaras: 12, barrera: false });
    expect(s.areas.map((a) => [a.nombre, a.tipo])).toEqual([['Bodega', 'bodega'], ['Rara', 'otro']]);
  });

  it('no truena con una respuesta vacía', () => {
    expect(limpiarSitio(null)).toMatchObject({ camaras: 0, areas: [], marca: '' });
  });

  it('una frase muy corta no gasta una llamada', async () => {
    const ia = claude();
    await expect(new LecturaFichaService(ia).sitioDesdeFrase(1, 'x')).rejects.toBeInstanceOf(BadRequestException);
    await expect(new LecturaFichaService(ia).equipoDesdeFrase(1, undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(ia.json).not.toHaveBeenCalled();
  });

  it('lleva su proceso, para medirla por separado', async () => {
    const ia = claude();
    await new LecturaFichaService(ia).sitioDesdeFrase(1, 'una bodega');
    expect(ia.json.mock.calls[0][0]).toMatchObject({ proceso: 'cctv-sitio', companyId: 1 });
    const e = await new LecturaFichaService(ia).equipoDesdeFrase(1, 'un domo');
    expect(ia.json.mock.calls[1][0]).toMatchObject({ proceso: 'cctv-equipo' });
    expect(e).toMatchObject({ archivo: '', hojas: 0, tipo: 'domo' });
  });
});
