import {
  ConsultaUpc,
  LimiteUpcError,
  UPC_LOOKUP_URL_DEFECTO,
  crearProveedorUpcItemDb,
  mapearUpcItemDb,
  proveedorDesdeEntorno,
  urlDeConsulta,
  type FetchLike,
  type ProveedorUpc,
} from './upc-lookup';

/**
 * Consulta internacional de UPC. Ninguna prueba sale a la red: `fetch` es de mentira.
 *
 * Lo que se cuida: que el alta nunca se caiga por culpa de un servicio ajeno, que la
 * cuota gratuita no se gaste preguntando dos veces lo mismo y que hacia afuera solo
 * viaje el código.
 */

const UPC = '036000291452';

const RESPUESTA_OK = {
  code: 'OK',
  total: 1,
  items: [
    {
      ean: '0036000291452',
      title: '  Hikvision  DS-2CD1023G0E-I 2MP Bullet  ',
      description: 'Cámara IP tipo bala 2 MP, lente 2.8 mm, IR 30 m.',
      brand: 'Hikvision',
      model: 'DS-2CD1023G0E-I',
      category: 'Electronics > Cameras & Optics > Surveillance Cameras',
      images: ['http://inseguro.example/a.jpg', 'https://cdn.example/camara.jpg'],
      offers: [{ merchant: 'Tienda', price: 99 }],
    },
  ],
};

function fetchFalso(status: number, cuerpo: unknown) {
  return jest.fn<ReturnType<FetchLike>, Parameters<FetchLike>>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  }));
}

describe('mapearUpcItemDb', () => {
  it('toma nombre, marca, modelo, descripción, imagen https y la hoja de la categoría', () => {
    expect(mapearUpcItemDb(RESPUESTA_OK, UPC)).toEqual({
      codigo: UPC,
      nombre: 'Hikvision DS-2CD1023G0E-I 2MP Bullet',
      marca: 'Hikvision',
      modelo: 'DS-2CD1023G0E-I',
      descripcion: 'Cámara IP tipo bala 2 MP, lente 2.8 mm, IR 30 m.',
      imagenUrl: 'https://cdn.example/camara.jpg',
      categoria: 'Surveillance Cameras',
    });
  });

  it('sin artículos, o con un artículo vacío, no hay nada que prellenar', () => {
    expect(mapearUpcItemDb({ code: 'OK', total: 0, items: [] }, UPC)).toBeNull();
    expect(mapearUpcItemDb({ items: [{ title: '  ', brand: '' }] }, UPC)).toBeNull();
    expect(mapearUpcItemDb(null, UPC)).toBeNull();
    expect(mapearUpcItemDb('<html>', UPC)).toBeNull();
  });

  it('campos que faltan quedan en null, no en "undefined"', () => {
    expect(mapearUpcItemDb({ items: [{ title: 'Cable UTP Cat6' }] }, UPC)).toEqual({
      codigo: UPC,
      nombre: 'Cable UTP Cat6',
      marca: null,
      modelo: null,
      descripcion: null,
      imagenUrl: null,
      categoria: null,
    });
  });
});

describe('urlDeConsulta', () => {
  it('por defecto manda el código como ?upc=', () => {
    expect(urlDeConsulta(UPC_LOOKUP_URL_DEFECTO, UPC)).toBe(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${UPC}`,
    );
  });

  it('respeta {code} y una query que ya existe', () => {
    expect(urlDeConsulta('https://x.test/p/{code}.json', UPC)).toBe(`https://x.test/p/${UPC}.json`);
    expect(urlDeConsulta('https://x.test/l?fmt=json', UPC)).toBe(`https://x.test/l?fmt=json&upc=${UPC}`);
  });
});

describe('proveedor UPCitemdb', () => {
  const signal = new AbortController().signal;

  it('hacia afuera solo viaja el código', async () => {
    const fetch = fetchFalso(200, RESPUESTA_OK);
    const proveedor = crearProveedorUpcItemDb({ fetch });
    await proveedor.buscar(UPC, signal);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://api.upcitemdb.com/prod/trial/lookup?upc=${UPC}`);
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it('con llave la manda en los encabezados de UPCitemdb', async () => {
    const fetch = fetchFalso(200, RESPUESTA_OK);
    const proveedor = crearProveedorUpcItemDb({ url: 'https://api.upcitemdb.com/prod/v1/lookup', key: 'k-123', fetch });
    await proveedor.buscar(UPC, signal);
    expect(fetch.mock.calls[0][1].headers).toEqual({
      Accept: 'application/json',
      user_key: 'k-123',
      key_type: '3scale',
    });
  });

  it('429 o EXCEED_LIMIT es límite, no «no existe»', async () => {
    await expect(
      crearProveedorUpcItemDb({ fetch: fetchFalso(429, { code: 'EXCEED_LIMIT' }) }).buscar(UPC, signal),
    ).rejects.toBeInstanceOf(LimiteUpcError);
    await expect(
      crearProveedorUpcItemDb({ fetch: fetchFalso(200, { code: 'TOO_FAST' }) }).buscar(UPC, signal),
    ).rejects.toBeInstanceOf(LimiteUpcError);
  });

  it('INVALID_UPC y 404 son «no lo conoce»', async () => {
    expect(
      await crearProveedorUpcItemDb({ fetch: fetchFalso(400, { code: 'INVALID_UPC' }) }).buscar(UPC, signal),
    ).toBeNull();
    expect(await crearProveedorUpcItemDb({ fetch: fetchFalso(404, null) }).buscar(UPC, signal)).toBeNull();
  });

  it('un 500 se reporta como caída', async () => {
    await expect(
      crearProveedorUpcItemDb({ fetch: fetchFalso(500, { code: 'SERVER_ERR' }) }).buscar(UPC, signal),
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe('ConsultaUpc', () => {
  const producto = mapearUpcItemDb(RESPUESTA_OK, UPC)!;

  function proveedorFalso(impl: ProveedorUpc['buscar']): ProveedorUpc & { buscar: jest.Mock } {
    return { nombre: 'falso', buscar: jest.fn(impl) };
  }

  it('un acierto se guarda: la segunda consulta no sale a la red', async () => {
    const proveedor = proveedorFalso(async () => producto);
    const consulta = new ConsultaUpc({ proveedor });

    const primera = await consulta.buscar(` ${UPC}\n`);
    const segunda = await consulta.buscar(UPC);

    expect(primera).toEqual({ encontrado: true, codigo: UPC, fuente: 'falso', producto });
    expect(segunda).toEqual(primera);
    expect(proveedor.buscar).toHaveBeenCalledTimes(1);
    expect(proveedor.buscar.mock.calls[0][0]).toBe(UPC);
  });

  it('el acierto caduca', async () => {
    let reloj = 1_000;
    const proveedor = proveedorFalso(async () => producto);
    const consulta = new ConsultaUpc({ proveedor, ttlAciertoMs: 500, ahora: () => reloj });
    await consulta.buscar(UPC);
    reloj += 501;
    await consulta.buscar(UPC);
    expect(proveedor.buscar).toHaveBeenCalledTimes(2);
  });

  it('lo que no es UPC/EAN no sale del servidor', async () => {
    const proveedor = proveedorFalso(async () => producto);
    const consulta = new ConsultaUpc({ proveedor });

    for (const codigo of ['MUL-12345', '036000291453', '12345', '']) {
      const r = await consulta.buscar(codigo);
      expect(r).toMatchObject({ encontrado: false, motivo: 'CODIGO_NO_CONSULTABLE' });
    }
    expect(proveedor.buscar).not.toHaveBeenCalled();
  });

  it('«no existe» también se recuerda un rato, para no gastar cuota', async () => {
    const proveedor = proveedorFalso(async () => null);
    const consulta = new ConsultaUpc({ proveedor });
    expect(await consulta.buscar(UPC)).toMatchObject({ encontrado: false, motivo: 'NO_ENCONTRADO' });
    await consulta.buscar(UPC);
    expect(proveedor.buscar).toHaveBeenCalledTimes(1);
  });

  it('límite de cuota: falla suave y se vuelve a intentar la próxima vez', async () => {
    const proveedor = proveedorFalso(async () => {
      throw new LimiteUpcError();
    });
    const consulta = new ConsultaUpc({ proveedor });
    const r = await consulta.buscar(UPC);
    expect(r).toMatchObject({ encontrado: false, motivo: 'LIMITE' });
    expect((r as { mensaje: string }).mensaje).toMatch(/a mano/);
    await consulta.buscar(UPC);
    expect(proveedor.buscar).toHaveBeenCalledTimes(2);
  });

  it('servicio caído: nunca lanza', async () => {
    const proveedor = proveedorFalso(async () => {
      throw new Error('ECONNRESET');
    });
    await expect(new ConsultaUpc({ proveedor }).buscar(UPC)).resolves.toMatchObject({
      encontrado: false,
      motivo: 'SIN_SERVICIO',
    });
  });

  it('a los 4 s deja de esperar', async () => {
    jest.useFakeTimers();
    try {
      let abortada = false;
      const proveedor = proveedorFalso(
        (_codigo, signal) =>
          new Promise(() => {
            signal.addEventListener('abort', () => {
              abortada = true;
            });
          }),
      );
      const pendiente = new ConsultaUpc({ proveedor }).buscar(UPC);
      await jest.advanceTimersByTimeAsync(3999);
      expect(abortada).toBe(false);
      await jest.advanceTimersByTimeAsync(2);
      await expect(pendiente).resolves.toMatchObject({ encontrado: false, motivo: 'SIN_SERVICIO' });
      expect(abortada).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sin proveedor contesta «apagada»', async () => {
    await expect(new ConsultaUpc({ proveedor: null }).buscar(UPC)).resolves.toMatchObject({
      encontrado: false,
      motivo: 'DESACTIVADO',
    });
  });

  it('la caché no crece sin tope', async () => {
    const proveedor = proveedorFalso(async (codigo) => ({ ...producto, codigo }));
    const consulta = new ConsultaUpc({ proveedor, maxEntradas: 2 });
    // Tres UPC-A válidos distintos.
    await consulta.buscar('036000291452');
    await consulta.buscar('012345678905');
    await consulta.buscar('042100005264');
    // El primero ya salió de la caché: vuelve a preguntar.
    await consulta.buscar('036000291452');
    expect(proveedor.buscar).toHaveBeenCalledTimes(4);
  });
});

describe('proveedorDesdeEntorno', () => {
  it('sin variables usa el punto de prueba de UPCitemdb', async () => {
    const fetch = fetchFalso(200, RESPUESTA_OK);
    const proveedor = proveedorDesdeEntorno({}, fetch)!;
    await proveedor.buscar(UPC, new AbortController().signal);
    expect(fetch.mock.calls[0][0]).toBe(`${UPC_LOOKUP_URL_DEFECTO}?upc=${UPC}`);
  });

  it('UPC_LOOKUP_URL y UPC_LOOKUP_KEY mandan', async () => {
    const fetch = fetchFalso(200, RESPUESTA_OK);
    const proveedor = proveedorDesdeEntorno(
      { UPC_LOOKUP_URL: 'https://catalogo.test/lookup', UPC_LOOKUP_KEY: 'secreta' },
      fetch,
    )!;
    await proveedor.buscar(UPC, new AbortController().signal);
    expect(fetch.mock.calls[0][0]).toBe(`https://catalogo.test/lookup?upc=${UPC}`);
    expect(fetch.mock.calls[0][1].headers.user_key).toBe('secreta');
  });

  it('UPC_LOOKUP_URL=off la apaga', () => {
    expect(proveedorDesdeEntorno({ UPC_LOOKUP_URL: 'off' })).toBeNull();
  });
});
