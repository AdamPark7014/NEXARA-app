import { CtFtpConnector } from './ct-ftp.connector';

const xml = `<Articulo version="2.0">
  <Producto><clave>SOLOXML</clave><nombre>Monitor</nombre><marca>ACME</marca><modelo>M1</modelo><status>Activo</status><precio>10</precio><moneda>USD</moneda><existencia><PUE>0</PUE></existencia></Producto>
  <Producto><clave>ENLOSDOS</clave><nombre>Disco</nombre><marca>ACME</marca><modelo>D1</modelo><status>Activo</status><precio>20</precio><moneda>USD</moneda><existencia><PUE>3</PUE></existencia></Producto>
</Articulo>`;

const json = JSON.stringify([
  { idProducto: 7, clave: 'ENLOSDOS', nombre: 'Disco ACME D1', marca: 'ACME', modelo: 'D1', activo: 1, precio: 20.25, moneda: 'USD', existencia: { PUE: 3 }, promociones: [{ nombre: 'Promo' }] },
]);

function conector(archivos: Record<string, string | Error>) {
  const c = new CtFtpConnector();
  jest.spyOn(c as never, 'bajar').mockImplementation((async (archivo: string) => {
    const contenido = archivos[archivo];
    if (contenido instanceof Error) throw contenido;
    return { raw: contenido, fileModifiedAt: `fecha-${archivo}`, checksum: `suma-${archivo}` };
  }) as never);
  return c;
}

describe('CtFtpConnector.pullFull', () => {
  it('trae todo el XML, y el JSON manda en lo que trae', async () => {
    const r = await conector({ 'productos.xml': xml, 'productos.json': json }).pullFull();

    expect(r.source).toBe('XML');
    expect(r.checksum).toBe('suma-productos.xml');
    const porClave = Object.fromEntries(r.products.map((p) => [p.sku, p]));
    expect(Object.keys(porClave).sort()).toEqual(['ENLOSDOS', 'SOLOXML']);
    expect(porClave.SOLOXML).toMatchObject({ name: 'Monitor ACME M1', price: 10, existencia: {}, externalId: null, active: true });
    expect(porClave.ENLOSDOS).toMatchObject({ name: 'Disco ACME D1', price: 20.25, externalId: 7, promotions: [{ nombre: 'Promo' }] });
  });

  it('si el JSON falla, queda el XML', async () => {
    const r = await conector({ 'productos.xml': xml, 'productos.json': new Error('Timeout (data socket)') }).pullFull();

    expect(r.source).toBe('XML');
    expect(r.products).toHaveLength(2);
  });

  it('si el XML falla o viene cortado, queda el JSON y dice que es el JSON', async () => {
    const cortado = await conector({ 'productos.xml': '<Articulo><Producto><clave>X</clave>', 'productos.json': json }).pullFull();
    const fallo = await conector({ 'productos.xml': new Error('Timeout (data socket)'), 'productos.json': json }).pullFull();

    for (const r of [cortado, fallo]) {
      expect(r.source).toBe('JSON');
      expect(r.products.map((p) => p.sku)).toEqual(['ENLOSDOS']);
    }
  });
});
