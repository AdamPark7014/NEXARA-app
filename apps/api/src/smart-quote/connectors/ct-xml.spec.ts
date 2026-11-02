import { leerCatalogoXml } from './ct-xml';

const producto = (extra = '') => `
  <Producto>
    <clave>ACCAPC060</clave>
    <no_parte>RBC35</no_parte>
    <nombre>Batería</nombre>
    <modelo>RBC35</modelo>
    <idMarca>15</idMarca>
    <marca>APC</marca>
    <idCategoria>7</idCategoria>
    <categoria>Energía</categoria>
    <idSubCategoria>37</idSubCategoria>
    <subcategoria>Baterías</subcategoria>
    <imagen>https://static.ejemplo.mx/ACCAPC060.jpg</imagen>
    <descripcion_corta>Batería APC - Sealed Lead Acid - </descripcion_corta>
    <especificacion>
      <caracteristica1><tipo>Tecnología</tipo><valor>Sealed Lead Acid</valor></caracteristica1>
      <caracteristica2>
        <tipo>Voltaje</tipo>
        <valor>12 V</valor>
      </caracteristica2>
    </especificacion>
    <upc>731304206828</upc>
    <ean></ean>
    <status>Activo</status>
    <sustituto>ACCAPC060</sustituto>
    <precio>33.96</precio>
    <moneda>USD</moneda>
    <tipo_cambio>18.92</tipo_cambio>
    <existencia>
      <HMO>0</HMO>
      <LEO>1</LEO>
      <PUE>0</PUE>
      <D2A>43</D2A>
    </existencia>
    ${extra}
  </Producto>`;

const catalogo = (...productos: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<Articulo version="2.0" fecha="2026-11-02 02:01:16" lp="5">${productos.join('')}
</Articulo>
`;

describe('leerCatalogoXml', () => {
  it('deja cada producto con la misma forma que el JSON', () => {
    const [p] = leerCatalogoXml(catalogo(producto()));

    expect(p).toEqual({
      clave: 'ACCAPC060',
      numParte: 'RBC35',
      nombre: 'Batería APC RBC35',
      modelo: 'RBC35',
      idMarca: 15,
      marca: 'APC',
      idSubCategoria: 37,
      subcategoria: 'Baterías',
      idCategoria: 7,
      categoria: 'Energía',
      descripcion_corta: 'Batería APC - Sealed Lead Acid',
      ean: undefined,
      upc: '731304206828',
      sustituto: 'ACCAPC060',
      activo: 1,
      protegido: 0,
      existencia: { LEO: 1, D2A: 43 },
      precio: 33.96,
      moneda: 'USD',
      tipoCambio: 18.92,
      especificaciones: [
        { tipo: 'Tecnología', valor: 'Sealed Lead Acid' },
        { tipo: 'Voltaje', valor: '12 V' },
      ],
      promociones: [],
      imagen: 'https://static.ejemplo.mx/ACCAPC060.jpg',
    });
  });

  it('sin piezas en ningún almacén la existencia queda vacía', () => {
    const sinPiezas = producto().replace(/<LEO>1<\/LEO>/, '<LEO>0</LEO>').replace(/<D2A>43<\/D2A>/, '<D2A>0</D2A>');

    expect(leerCatalogoXml(catalogo(sinPiezas))[0]!.existencia).toEqual({});
  });

  it('un producto descontinuado queda apagado', () => {
    const descontinuado = producto().replace('<status>Activo</status>', '<status>Descontinuado</status>');

    expect(leerCatalogoXml(catalogo(descontinuado))[0]!.activo).toBe(0);
  });

  it('un & suelto no tira el catálogo y las entidades se traducen', () => {
    const conAmpersand = producto().replace('<nombre>Batería</nombre>', '<nombre>Audio & Video &amp; Más &#191;</nombre>');

    expect(leerCatalogoXml(catalogo(conAmpersand))[0]!.nombre).toBe('Audio & Video & Más ¿ APC RBC35');
  });

  it('lee CDATA', () => {
    const conCdata = producto().replace('<marca>APC</marca>', '<marca><![CDATA[A&PC]]></marca>');

    expect(leerCatalogoXml(catalogo(conCdata))[0]!.marca).toBe('A&PC');
  });

  it('salta lo que no trae clave y lee varios productos', () => {
    const otro = producto().replace('<clave>ACCAPC060</clave>', '<clave>OTRO001</clave>');
    const sinClave = producto().replace('<clave>ACCAPC060</clave>', '');

    expect(leerCatalogoXml(catalogo(producto(), sinClave, otro)).map((p) => p.clave)).toEqual(['ACCAPC060', 'OTRO001']);
  });

  it('un archivo cortado truena: lo que falte se apagaría del catálogo', () => {
    const cortado = catalogo(producto()).replace('</Articulo>', '');

    expect(() => leerCatalogoXml(cortado)).toThrow('incompleto');
  });
});
