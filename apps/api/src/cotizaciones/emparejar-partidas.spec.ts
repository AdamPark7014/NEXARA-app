import {
  CANDIDATOS_FIJOS,
  candidatosDeUsadas,
  complementosDe,
  consultasDeCatalogo,
  emparejar,
  palabrasDePartida,
  type CandidatoPartida,
} from './emparejar-partidas';

const candidato = (name: string, datos: Partial<CandidatoPartida> = {}): CandidatoPartida => ({
  fuente: 'usada',
  name,
  description: null,
  brand: null,
  model: null,
  unit: 'Pieza',
  unitCost: null,
  unitPrice: 100,
  grupo: null,
  imagenUrl: null,
  veces: 1,
  ultimaVez: null,
  stock: null,
  productCtId: null,
  cotizaciones: [],
  ...datos,
});

describe('palabrasDePartida', () => {
  it('une plurales, acentos y sinónimos', () => {
    expect(palabrasDePartida('Cámaras Bullet')).toEqual(['camara', 'bala']);
    expect(palabrasDePartida('Switches de 48 puertos')).toEqual(['switch', '48', 'puerto']);
    expect(palabrasDePartida('Punto de acceso')).toEqual(['ap']);
    expect(palabrasDePartida('Discos duros de 6 teras')).toEqual(['disco', '6', 'tera']);
    expect(palabrasDePartida('6 TB')).toEqual(['6tb']);
    expect(palabrasDePartida('cable categoría 6')).toEqual(['cable', 'cat6']);
    expect(palabrasDePartida('NVR de 32 canales')).toEqual(['nvr', '32', 'canal']);
  });

  it('un modelo con guion es una palabra; «Licencia-20» son dos', () => {
    expect(palabrasDePartida('TL-SG1428PE')).toEqual(['tl-sg1428pe']);
    expect(palabrasDePartida('Licencia-20 checadores')).toEqual(['licencia', '20', 'asistencia']);
  });
});

describe('emparejar', () => {
  it('elige sola lo que coincide completo', () => {
    const r = emparejar('NVR 32 canales', [candidato('NVR 32 canales 4K', { model: 'DS-7632' }), candidato('NVR 64 canales', { model: 'DS-7664' })]);
    expect(r.seguridad).toBe('alta');
    expect(r.elegida?.model).toBe('DS-7632');
  });

  it('una cifra pedida no se ignora: si no está, solo se ofrece', () => {
    const r = emparejar('NVR 32 canales', [candidato('NVR 64 canales', { model: 'DS-7664' })]);
    expect(r.seguridad).not.toBe('alta');
  });

  it('una marca pedida no se ignora', () => {
    const r = emparejar('Memoria HPE 32 GB', [candidato('Memoria RAM 32 GB', { brand: 'Kingston' }), candidato('Disco', { brand: 'HPE' })]);
    expect(r.seguridad).not.toBe('alta');
  });

  it('«bocina» no es «bobina»', () => {
    expect(emparejar('Cable para bocina', [candidato('Bobina de cable Cat6')]).seguridad).not.toBe('alta');
  });

  it('un producto no es la instalación de ese producto, ni al revés', () => {
    expect(emparejar('Terminal facial', [candidato('Instalación de terminal facial')]).seguridad).not.toBe('alta');
    expect(emparejar('Instalación de cableado', [candidato('Bobina de cable para cableado con instalación')]).seguridad).not.toBe('alta');
    expect(emparejar('Instalación de terminal', [candidato('Instalación de terminal facial')]).seguridad).toBe('alta');
  });

  it('«mano de obra» a secas no es el servicio largo de otra cosa', () => {
    const r = emparejar('Mano de obra', [candidato('Instalación, configuración y puesta en operación de terminal biométrica de acceso')]);
    expect(r.seguridad).not.toBe('alta');
  });

  it('el mayorista vende cosas: una instalación no se busca ahí', () => {
    const r = emparejar('Montaje de cámaras', [candidato('Montaje de pared para cámaras', { fuente: 'catalogo', brand: 'Dahua' })]);
    expect(r.elegida).toBeNull();
  });

  it('del mayorista, sin nada específico o con empate, se elige de la lista', () => {
    const a = candidato('Inyector PoE A', { fuente: 'catalogo', model: 'A1', unitCost: 300, stock: 2 });
    const b = candidato('Inyector PoE B', { fuente: 'catalogo', model: 'B1', unitCost: 200, stock: 2 });
    const r = emparejar('Inyector PoE', [a, b]);
    expect(r.seguridad).toBe('media');
    expect(r.alternativas).toHaveLength(1);
  });

  it('del mayorista debe abrir el nombre: un adaptador «para laptop Dell XPS» no es una laptop', () => {
    const r = emparejar('Laptop Dell XPS', [candidato('Adaptador de corriente para laptop Dell XPS', { fuente: 'catalogo', brand: 'Ovaltech', model: 'O1' })]);
    expect(r.seguridad).not.toBe('alta');
  });

  it('lo que el mayorista no tiene hoy se ofrece, pero no se llena solo', () => {
    const disco = (stock: number) => candidato('Disco duro Seagate 6 TB', { fuente: 'catalogo', brand: 'Seagate', model: 'ST6', unitCost: 3000, stock });

    expect(emparejar('Disco duro Seagate 6 TB', [disco(3)]).seguridad).toBe('alta');
    const sinPiezas = emparejar('Disco duro Seagate 6 TB', [disco(0)]);
    expect(sinPiezas.seguridad).toBe('media');
    expect(sinPiezas.opciones.map((o) => o.model)).toEqual(['ST6']);
  });

  it('el modelo dicho solo se llena aunque hoy no haya piezas: ya se sabe qué se quiere', () => {
    const r = emparejar('ZD421D', [candidato('Impresora Zebra de etiquetas', { fuente: 'catalogo', model: 'ZD421D', unitCost: 8000, stock: 0 })]);
    expect(r).toMatchObject({ seguridad: 'alta', elegida: { model: 'ZD421D' } });
  });

  it('en un empate gana lo ya cotizado', () => {
    const r = emparejar('Gabinete 6U', [
      candidato('Gabinete 6U', { fuente: 'catalogo', model: 'CT1', stock: 2 }),
      candidato('Gabinete 6U', { fuente: 'usada', model: 'USADO', veces: 3 }),
    ]);
    expect(r.elegida?.model).toBe('USADO');
  });
});

describe('lo que no se ha cotizado', () => {
  it('un paquete se ofrece, pero su precio de referencia no entra solo', () => {
    const r = emparejar('Cámara domo', CANDIDATOS_FIJOS);
    expect(r.elegida?.fuente).toBe('paquete');
    expect(r.seguridad).toBe('media');
  });

  it('el formato de conceptos tampoco', () => {
    expect(emparejar('Router', CANDIDATOS_FIJOS).seguridad).not.toBe('alta');
  });

  it('los conceptos del formato no le quitan la seguridad a lo ya cotizado', () => {
    const r = emparejar('Access point', [candidato('Access point Wi-Fi 6 para techo interior', { model: 'EAP650' }), ...CANDIDATOS_FIJOS]);
    expect(r).toMatchObject({ seguridad: 'alta', elegida: { model: 'EAP650' } });
  });

  it('lo ya cotizado le gana al paquete', () => {
    const r = emparejar('Cámara domo', [candidato('Cámara domo Hikvision', { model: 'H1' }), ...CANDIDATOS_FIJOS]);
    expect(r).toMatchObject({ seguridad: 'alta', elegida: { model: 'H1' } });
  });
});

describe('las opciones que se ofrecen', () => {
  it('lo que es lo pedido va primero, aunque otra fuente sea más barata', () => {
    const { opciones } = emparejar('Cámara domo', [
      candidato('Caja de conexiones para cámara domo', { fuente: 'paquete', unitPrice: 100, model: 'CAJA' }),
      candidato('Cámara domo Dahua', { fuente: 'catalogo', unitCost: 500, stock: 3, model: 'A', brand: 'Dahua' }),
      candidato('Cámara domo Uniarch', { fuente: 'catalogo', unitCost: 450, stock: 3, model: 'B', brand: 'Uniarch' }),
    ]);
    expect(opciones.map((o) => o.model)).toEqual(['B', 'A', 'CAJA']);
  });

  it('«Canalización» también ofrece el trabajo, no solo el material', () => {
    const { opciones, seguridad } = emparejar('Canalización', [
      candidato('Instalación y trazo de canalización en interiores', { unitPrice: 3500 }),
      candidato('Canaleta blanca PVC 20x10', { unitPrice: 69 }),
      candidato('Sección L para canaleta', { unitPrice: 14 }),
    ]);
    expect(seguridad).not.toBe('alta');
    expect(opciones.map((o) => o.unitPrice)).toContain(3500);
  });
});

describe('nombres largos pegados de una ficha', () => {
  const ficha = 'Convertidor Fibra Óptica Monomodo o Multimodo / 1 Puerto SFP 1000 Mbps / 1 Puerto RJ45 10/100/1000 con conector LC';

  it('lo pedido debe abrir el nombre: un convertidor no es un conector', () => {
    expect(emparejar('Conector RJ45', [candidato(ficha)]).seguridad).not.toBe('alta');
  });

  it('o coincidir en varias cifras y marcas, como «Memoria HPE 32 GB»', () => {
    const r = emparejar('Memoria HPE 32 GB DDR5 4800', [candidato('HPE 32GB (1x32gb) Dual Rank x8 DDR5-4800 CAS-40-39-39 EC8 Registered Smart Memory Kit', { brand: 'HPE', model: 'P43328' })]);
    expect(r).toMatchObject({ seguridad: 'alta', elegida: { model: 'P43328' } });
  });
});

describe('lo específico que se pidió', () => {
  it('una marca pedida gana: «Disco HPE 4 TB» no empieza por un Seagate de 4 TB', () => {
    const { opciones } = emparejar('Disco HPE 4 TB', [
      candidato('Disco duro Seagate 4 TB', { fuente: 'catalogo', brand: 'Seagate', model: 'S4', unitCost: 1000, stock: 3 }),
      candidato('Disco duro HPE para servidor', { fuente: 'catalogo', brand: 'HPE', model: 'H1', unitCost: 5000, stock: 3 }),
    ]);
    expect(opciones[0]?.model).toBe('H1');
  });

  it('las cifras pedidas van antes que lo barato', () => {
    const { opciones } = emparejar('Switch PoE 24 puertos', [
      candidato('Switch PoE 5 puertos', { fuente: 'catalogo', model: 'A5', unitCost: 300, stock: 3, brand: 'Otra' }),
      candidato('Switch PoE 24 puertos gigabit', { fuente: 'catalogo', model: 'B24', unitCost: 3000, stock: 3, brand: 'Otra' }),
      candidato('Switch PoE 24 puertos administrable', { fuente: 'catalogo', model: 'C24', unitCost: 3500, stock: 3, brand: 'Otra' }),
    ]);
    expect(opciones.slice(0, 2).map((o) => o.model)).toEqual(['B24', 'C24']);
  });

  it('«HPE» y «Hewlett Packard Enterprise» son la misma marca', () => {
    const r = emparejar('Disco HPE 4 TB', [candidato('Disco duro 4 TB SATA', { brand: 'Hewlett Packard Enterprise', model: 'H4' })]);
    expect(r).toMatchObject({ seguridad: 'alta', elegida: { model: 'H4' } });
  });

  it('«1000 W» y «1000W» son lo mismo, y no es un modelo', () => {
    expect(palabrasDePartida('Fuente de poder 1000 W')).toContain('1000w');
    expect(emparejar('Fuente 1000 W', [candidato('Fuente de poder 1000W 80 Plus')]).seguridad).toBe('alta');
  });

  it('acertar la marca no vuelve seguro lo demás', () => {
    const r = emparejar('Lector enrolador UHF Rosslare', [candidato('Lector enrolador de escritorio para tarjetas de proximidad', { brand: 'Rosslare', model: 'DR6255' })]);
    expect(r.seguridad).not.toBe('alta');
    expect(r.opciones.map((o) => o.model)).toEqual(['DR6255']);
  });

  it('una marca distinta sigue sin llenarse sola', () => {
    expect(emparejar('Disco HPE 4 TB', [candidato('Disco duro Seagate 4 TB', { brand: 'Seagate' }), candidato('Cable', { brand: 'HPE' })]).seguridad).not.toBe('alta');
  });
});

describe('un modelo dicho tal cual', () => {
  it('solo el modelo: se llena con esa pieza, aunque su nombre no se parezca', () => {
    const r = emparejar('HDWT860UZSVA', [
      candidato('Disco duro para videovigilancia de 6 TB con garantía de fábrica y uso continuo', { model: 'HDWT860UZSVA', unitPrice: 5993 }),
      candidato('Disco duro de otra capacidad', { model: 'HDWT840UZSVA', unitPrice: 4000 }),
    ]);
    expect(r).toMatchObject({ seguridad: 'alta', elegida: { model: 'HDWT860UZSVA', unitPrice: 5993 } });
  });

  it('gana aunque otra partida se parezca más en las palabras', () => {
    const r = emparejar('NVR 32 canales 4K DS-7632NXI', [
      candidato('NVR 32 canales 4K', { model: 'OTRO-123' }),
      candidato('Grabador de video en red', { model: 'DS-7632NXI' }),
    ]);
    expect(r).toMatchObject({ seguridad: 'alta', elegida: { model: 'DS-7632NXI' } });
  });

  it('del mayorista se llena si se dijo solo el modelo y una sola pieza lo tiene', () => {
    const r = emparejar('ZD421D', [candidato('Impresora Zebra de etiquetas', { fuente: 'catalogo', model: 'ZD421D', unitCost: 8000, stock: 2 })]);
    expect(r).toMatchObject({ seguridad: 'alta', elegida: { fuente: 'catalogo' } });
  });

  it('del mayorista, con más palabras, va primero pero no se llena: su modelo puede ser de un accesorio', () => {
    const r = emparejar('Bundle Zebra ZC300', [candidato('Cinta 6 paneles de color Zebra', { fuente: 'catalogo', brand: 'Zebra', model: 'ZC300', unitCost: 1100, stock: 2 })]);
    expect(r.seguridad).not.toBe('alta');
    expect(r.opciones[0]?.model).toBe('ZC300');
  });

  it('dos piezas distintas con el mismo modelo se eligen de la lista', () => {
    const r = emparejar('ZC300', [
      candidato('Impresora de tarjetas Zebra', { fuente: 'catalogo', model: 'ZC300', unitCost: 20000, stock: 2 }),
      candidato('Cinta de color para impresora', { fuente: 'catalogo', model: 'ZC300', unitCost: 1100, stock: 2 }),
    ]);
    expect(r.seguridad).not.toBe('alta');
    expect(r.opciones).toHaveLength(2);
  });

  it('un modelo que solo empieza igual no cuenta como exacto', () => {
    expect(emparejar('HDWT860', [candidato('Disco con nombre muy largo para esta prueba de modelos parecidos', { model: 'HDWT860UZSVA' })]).seguridad).not.toBe('alta');
  });
});

describe('una sola palabra', () => {
  it('contra un nombre largo se ofrece; contra uno corto se elige', () => {
    expect(emparejar('Canalización', [candidato('Suministro y colocación de tubo conduit metálico galvanizado pared delgada')]).seguridad).not.toBe('alta');
    expect(emparejar('Envío', [candidato('Envío a domicilio')]).seguridad).toBe('alta');
    expect(emparejar('Access point', [candidato('Access point Wi-Fi 6 para techo interior')]).seguridad).toBe('alta');
    expect(
      emparejar('Access point', [candidato('Access point Wi-Fi 6 para techo interior'), candidato('Access point exterior de largo alcance')]).seguridad,
    ).not.toBe('alta');
  });

  it('junto a una elegida segura solo se ofrece lo que también es eso', () => {
    const r = emparejar('Kit de limpieza Zebra', [
      candidato('Kit de limpieza Zebra', { brand: 'Zebra', model: 'Z1' }),
      candidato('Kit extensor HDMI', { brand: 'Zebra', model: 'H1' }),
      candidato('Kit de limpieza Zebra para banda', { brand: 'Zebra', model: 'Z2' }),
    ]);
    expect(r.seguridad).toBe('alta');
    expect(r.alternativas.map((a) => a.model)).toEqual(['Z2']);
  });
});

describe('candidatosDeUsadas', () => {
  it('limpia lo pegado en el modelo y lo que no es dato', () => {
    const lista = candidatosDeUsadas([
      { id: 1, cotizacionId: 1, name: 'NVR 32', model: '4\tPza\tNVR 32 Canales\tDHI-NVR5432-EI2\t$64,077.46', brand: 'N/A', unitPrice: 1, createdAt: '2026-10-01' },
      { id: 2, cotizacionId: 1, name: 'Caja Condulet', model: 'Caja Condulet', unitPrice: 1, createdAt: '2026-10-01' },
      { id: 3, cotizacionId: 1, name: 'Servicio', model: 'N/A', unitPrice: 1, createdAt: '2026-10-01' },
    ]);
    expect(lista.map((c) => [c.model, c.brand])).toEqual([
      ['DHI-NVR5432-EI2', null],
      [null, null],
      [null, null],
    ]);
  });

  it('junta repetidas con los datos de la última vez y dice en qué cotizaciones salió', () => {
    const lista = candidatosDeUsadas([
      { id: 1, cotizacionId: 10, name: 'Cámara domo', model: 'A', unitCost: 100, unitPrice: 120, createdAt: '2026-09-01T00:00:00Z' },
      { id: 2, cotizacionId: 11, name: 'CAMARA  DOMO', model: 'a', unitCost: 150, unitPrice: 180, createdAt: '2026-10-01T00:00:00Z' },
    ]);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ unitCost: 150, unitPrice: 180, veces: 2, cotizaciones: [10, 11] });
  });
});

describe('complementosDe', () => {
  it('ofrece lo que suele ir con las cámaras y el grabador, con su cantidad', () => {
    const c = complementosDe([
      { concepto: 'Cámaras domo', cantidad: 14 },
      { concepto: 'NVR 32 canales', cantidad: 2 },
    ]);
    expect(c.find((x) => x.nombre === 'Instalación de cámara')?.cant).toBe(14);
    expect(c.find((x) => x.nombre === 'Disco duro para videovigilancia')?.cant).toBe(2);
    expect(c.length).toBeLessThanOrEqual(6);
  });

  it('lo pide el renglón que es eso, no el que lo menciona', () => {
    const c = complementosDe([
      { concepto: 'Terminal facial', cantidad: 12 },
      { concepto: 'Licencia de 20 checadores', cantidad: 1 },
    ]);
    expect(c.find((x) => x.nombre === 'Instalación de terminal')?.cant).toBe(12);
  });

  it('no ofrece lo que ya se pidió', () => {
    const c = complementosDe([
      { concepto: 'Cámaras domo', cantidad: 14 },
      { concepto: 'Instalación de cámaras', cantidad: 14 },
    ]);
    expect(c.some((x) => x.nombre === 'Instalación de cámara')).toBe(false);
  });

  it('una pieza suelta sin regla no ofrece nada', () => {
    expect(complementosDe([{ concepto: 'Windows 11 Pro', cantidad: 1 }])).toEqual([]);
  });

  it('una compu a medias ofrece lo que le falta', () => {
    const c = complementosDe([
      { concepto: 'Procesador i7', cantidad: 1 },
      { concepto: 'Tarjeta madre B760', cantidad: 1 },
    ]);
    expect(c.map((x) => x.nombre)).toEqual(expect.arrayContaining(['Gabinete', 'Ssd', 'Fuente de poder']));
  });
});

describe('consultasDeCatalogo', () => {
  it('va de más a menos palabras y sin sinónimos', () => {
    expect(consultasDeCatalogo('Canaletas de PVC blanca')).toEqual(['canaleta pvc blanca', 'canaleta pvc']);
  });

  it('lo específico va primero: el buscador devuelve pocos', () => {
    expect(consultasDeCatalogo('Switch PoE TP-Link 24 puertos')[0]).toBe('switch tp-link 24');
    expect(consultasDeCatalogo('Disco HPE 4 TB')[0]).toBe('disco hewlett');
  });

  it('un modelo dicho se busca solo y primero', () => {
    expect(consultasDeCatalogo('Escáner Zebra DS9308')[0]).toBe('ds9308');
  });

  it('una sola palabra solo si trae cifra', () => {
    expect(consultasDeCatalogo('Tornillo')).toEqual([]);
    expect(consultasDeCatalogo('ZD421')).toEqual(['zd421']);
  });
});
