import {
  avisoCantidadPorConfirmar,
  camposDeElementos,
  equiposSinCantidad,
  lineaAlcanceEvidencia,
} from './elementos.js';

describe('camposDeElementos', () => {
  it('expande 4 cámaras del plan IA con notas, Grabador y Pruebas y entrega', () => {
    const c = camposDeElementos({ titulo: 'x', elementos: [{ nombre: 'Cámara', cantidad: 4 }] }, 'proyecto', null);
    expect(c.map((x) => x.nombre)).toEqual([
      'Cámara 1',
      'Cámara 2',
      'Cámara 3',
      'Cámara 4',
      'Grabador (NVR)',
      'Pruebas y entrega',
    ]);
    expect(c[0]).toMatchObject({
      nombre: 'Cámara 1',
      momentos: ['ANTES', 'EN_PROGRESO', 'DESPUES'],
    });
    expect(c[0]!.notas).toMatch(/montaje/i);
    expect(c[0]!.notas).toMatch(/Durante/i);
    expect(c[4]).toMatchObject({ nombre: 'Grabador (NVR)', momentos: ['ANTES', 'DESPUES'] });
    expect(c[4]!.notas).toMatch(/configurado/i);
    expect(c[5]).toMatchObject({ nombre: 'Pruebas y entrega', momentos: ['DESPUES'] });
    expect(c[5]!.notas).toMatch(/entregados/i);
  });

  it('respaldo por título sin elem', () => {
    const c = camposDeElementos({ titulo: 'Instalar 4 cámaras en IPADE' }, 'proyecto', null);
    expect(c.map((x) => x.nombre)).toEqual([
      'Cámara 1',
      'Cámara 2',
      'Cámara 3',
      'Cámara 4',
      'Grabador (NVR)',
      'Pruebas y entrega',
    ]);
  });

  it('con NVR mencionado no duplica Grabador', () => {
    const c = camposDeElementos(
      { elementos: [{ nombre: 'Cámara', cantidad: 4 }, { nombre: 'NVR', cantidad: 1 }] },
      'proyecto',
      null,
    );
    expect(c.map((x) => x.nombre)).toEqual([
      'Cámara 1',
      'Cámara 2',
      'Cámara 3',
      'Cámara 4',
      'NVR',
      'Pruebas y entrega',
    ]);
  });

  it('tope 40: 45 cámaras un solo campo y cierre si cabe', () => {
    const c = camposDeElementos({ elementos: [{ nombre: 'Cámara', cantidad: 45 }] }, 'obra', null);
    expect(c[0]).toMatchObject({
      nombre: 'Cámaras (45)',
      momentos: ['ANTES', 'EN_PROGRESO', 'DESPUES'],
    });
    expect(c.map((x) => x.nombre)).toEqual(['Cámaras (45)', 'Grabador (NVR)', 'Pruebas y entrega']);
    expect(c.length).toBeLessThanOrEqual(40);
  });

  it('mantenimiento preventivo: ANTES y DESPUES con notas de mantenimiento', () => {
    const c = camposDeElementos({ elementos: [{ nombre: 'NVR', cantidad: 1 }] }, 'tarea', 'Mantenimiento preventivo');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ nombre: 'NVR', momentos: ['ANTES', 'DESPUES'] });
    expect(c[0]!.notas).toMatch(/estado/i);
    expect(c[0]!.notas).toMatch(/limpio/i);
    expect(c.some((x) => x.nombre === 'Pruebas y entrega')).toBe(false);
  });

  it('junta con campo Junta', () => {
    const c = camposDeElementos(
      { titulo: 'Junta con cliente', elementos: [{ nombre: 'Cámara', cantidad: 2 }] },
      'tarea',
      'Junta',
    );
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ nombre: 'Junta', momentos: ['EN_PROGRESO', 'DESPUES'] });
    expect(c[0]!.notas).toMatch(/minuta/i);
    expect(lineaAlcanceEvidencia(c)).toMatch(/junta/i);
  });

  it('facturación: Capturas de pantalla + Archivo entregable', () => {
    const c = camposDeElementos({ titulo: 'Timbrar factura' }, 'tarea', 'Facturación y contabilidad');
    expect(c.map((x) => x.nombre)).toEqual(['Capturas de pantalla', 'Archivo entregable']);
    expect(c[0]).toMatchObject({ momentos: ['ANTES', 'EN_PROGRESO', 'DESPUES'] });
    expect(c[0]!.notas).toMatch(/celular/i);
    expect(c[1]).toMatchObject({ momentos: ['DESPUES'] });
    expect(c[1]!.notas).toMatch(/Adjunta/i);
    expect(lineaAlcanceEvidencia(c)).toMatch(/capturas de pantalla/i);
  });

  it('comercial: mismas capturas y archivo', () => {
    const c = camposDeElementos({ titulo: 'Cotizar CCTV' }, 'comercial', null);
    expect(c.map((x) => x.nombre)).toEqual(['Capturas de pantalla', 'Archivo entregable']);
  });

  it('entrega: Trabajo realizado con texto de entrega', () => {
    const c = camposDeElementos({ titulo: 'Entregar material' }, 'tarea', 'Entrega');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ nombre: 'Trabajo realizado', momentos: ['ANTES', 'EN_PROGRESO', 'DESPUES'] });
    expect(c[0]!.notas).toMatch(/recibido y firmado/i);
  });

  it('servicio correctivo sin equipos: Trabajo realizado antes/después', () => {
    const c = camposDeElementos({ titulo: 'Revisar falla en sitio' }, 'servicio', 'CORRECTIVO');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ nombre: 'Trabajo realizado', momentos: ['ANTES', 'DESPUES'] });
    expect(c[0]!.notas).toMatch(/cómo se encontró/i);
    expect(lineaAlcanceEvidencia(c)).toMatch(/antes y después/i);
  });

  it('proyecto sin equipos: Trabajo realizado, nunca vacío', () => {
    const c = camposDeElementos({ titulo: 'Obra general' }, 'proyecto', null);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ nombre: 'Trabajo realizado', momentos: ['ANTES', 'EN_PROGRESO', 'DESPUES'] });
  });

  it('ningún tipo queda con camposEvidencia vacío', () => {
    const casos: Array<[string, string | null]> = [
      ['tarea', 'Facturación y contabilidad'],
      ['tarea', 'Junta'],
      ['tarea', 'Entrega'],
      ['tarea', 'Otro'],
      ['comercial', null],
      ['proyecto', null],
      ['servicio', 'CORRECTIVO'],
      ['servicio', 'INSTALACION'],
    ];
    for (const [tipo, sub] of casos) {
      expect(camposDeElementos({ titulo: 'x' }, tipo, sub).length).toBeGreaterThan(0);
    }
  });

  it('vago sin cantidad: Cámaras (cantidad por confirmar) + aviso', () => {
    expect(equiposSinCantidad('poner cámaras en IPADE')).toEqual([{ nombre: 'Cámara', plural: true }]);
    expect(equiposSinCantidad('revisar el DVR de la entrada')).toEqual([{ nombre: 'DVR', plural: false }]);
    // Singular sin número es uno, no «por confirmar».
    expect(camposDeElementos({ titulo: 'Revisar DVR' }, 'servicio', 'CORRECTIVO').map((c) => c.nombre)).toEqual(['DVR']);
    const c = camposDeElementos({ titulo: 'poner cámaras en IPADE' }, 'proyecto', null);
    expect(c[0]!.nombre).toBe('Cámaras (cantidad por confirmar)');
    expect(c[0]!.momentos).toEqual(['ANTES', 'EN_PROGRESO', 'DESPUES']);
    expect(c.map((x) => x.nombre)).toContain('Grabador (NVR)');
    expect(c.map((x) => x.nombre)).toContain('Pruebas y entrega');
    expect(avisoCantidadPorConfirmar(c)).toBe('No dijiste cuántas cámaras: ajusta los campos de evidencia.');
  });

  it('linea de alcance para 4 cámaras', () => {
    const c = camposDeElementos({ elementos: [{ nombre: 'Cámara', cantidad: 4 }] }, 'proyecto', null);
    const linea = lineaAlcanceEvidencia(c);
    expect(linea).toMatch(/Alcance: 4 cámaras \(Cámara 1–4\)/);
    expect(linea).toMatch(/pruebas y entrega/i);
  });
});

describe('elementosDelTexto', () => {
  it('lee varios equipos, en número o palabra, y suma repetidos', () => {
    expect(camposDeElementos({ titulo: 'Instalar dos lectoras y un torniquete' }, 'proyecto', null).map((c) => c.nombre)).toEqual([
      'Lector 1',
      'Lector 2',
      'Torniquete',
      'Pruebas y entrega',
    ]);
  });
  it('servicio correctivo: antes y después sin cierre de instalación', () => {
    expect(camposDeElementos({ titulo: 'Revisar 1 NVR' }, 'servicio', 'CORRECTIVO')).toEqual([
      expect.objectContaining({ nombre: 'NVR', momentos: ['ANTES', 'DESPUES'] }),
    ]);
  });
});
