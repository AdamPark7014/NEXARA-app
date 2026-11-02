import { CATALOGO_CONUEE_2023 } from './conuee-2023';
import {
  ESQUEMA_CONUEE,
  ESQUEMA_MANUAL,
  ESQUEMA_TABLERO,
  ESQUEMA_TICKET,
  MINIMO_TEXTO_MANUAL,
  filasConuee,
  limpiarConuee,
  limpiarManual,
  limpiarTablero,
  limpiarTicket,
  paginasUtiles,
  peticionManual,
} from './lectura-ia';

describe('páginas útiles de un manual', () => {
  const relleno = 'Abroche su cinturón antes de arrancar. Mantenga las puertas cerradas.';
  const capacidades = 'Capacidades. Tanque de combustible 80 L. Aceite de motor SAE 5W-30.';
  const programa = 'Programa de mantenimiento: cada 10,000 km cambie aceite. Cada 20,000 km filtro de aire.';
  const llantas = 'Presión de llantas 35 psi. Medida 255/70 R16.';

  it('se queda con capacidades, llantas y programa, con su número real de página', () => {
    const r = paginasUtiles([relleno, capacidades, relleno, programa, llantas, relleno]);
    expect(r.map((p) => p.numero)).toEqual([2, 4, 5]);
    expect(r[0].texto).toContain('80 L');
  });

  it('respeta el tope de páginas, prefiriendo las que más coinciden', () => {
    const r = paginasUtiles([programa, capacidades + programa + llantas, llantas], 1);
    expect(r.map((p) => p.numero)).toEqual([2]);
  });

  it('respeta el tope de caracteres', () => {
    const r = paginasUtiles([capacidades.repeat(100), programa], 45, 500);
    expect(r.map((p) => p.numero)).toEqual([2]);
  });

  it('un PDF escaneado no da páginas', () => {
    expect(paginasUtiles(['', '', ''])).toEqual([]);
    expect(MINIMO_TEXTO_MANUAL).toBeGreaterThan(0);
  });

  it('cada página viaja marcada y la pista va aparte', () => {
    const p = peticionManual([{ numero: 418, texto: 'Tanque 80 L' }], 'Nissan Frontier 2026');
    expect(p.usuario).toContain('[página 418]\nTanque 80 L');
    expect(p.usuario).toContain('Pista de quien lo da de alta: Nissan Frontier 2026');
    expect(p.esquema).toBe(ESQUEMA_MANUAL);
    expect(p.modelo).toBe('claude-haiku-5-5');
  });
});

describe('los esquemas caben en la API', () => {
  const conUnion = (nodo: unknown): number => {
    if (Array.isArray(nodo)) return nodo.reduce((n: number, x) => n + conUnion(x), 0);
    if (!nodo || typeof nodo !== 'object') return 0;
    return Object.entries(nodo).reduce((n, [clave, valor]) => n + (clave === 'anyOf' ? 1 : 0) + conUnion(valor), 0);
  };

  it('ninguno pasa de 16 campos que admitan null, que es lo que acepta', () => {
    for (const esquema of [ESQUEMA_MANUAL, ESQUEMA_CONUEE, ESQUEMA_TABLERO, ESQUEMA_TICKET]) {
      expect(conUnion(esquema)).toBeLessThanOrEqual(16);
    }
  });
});

describe('limpiar lo leído del manual', () => {
  const enviadas = [{ numero: 418 }, { numero: 431 }];
  const dato = (campo: string, valor: unknown, pagina: unknown = 418) => ({ campo, valor, pagina });

  it('conserva el dato con su página', () => {
    const r = limpiarManual({ datos: [dato('tanqueLitros', '80'), dato('aceiteTipo', ' 5W-30 ')] }, enviadas);
    expect(r.campos.tanqueLitros).toEqual({ valor: 80, fuente: { tipo: 'MANUAL', pagina: 418 } });
    expect(r.campos.aceiteTipo.valor).toBe('5W-30');
  });

  it('combustible y transmisión van como se escriben', () => {
    const r = limpiarManual({ datos: [dato('combustible', 'gasolina'), dato('transmision', 'manual')] }, enviadas);
    expect(r.campos.combustible.valor).toBe('Gasolina');
    expect(r.campos.transmision.valor).toBe('Manual');
  });

  it('entiende la cifra aunque venga con unidad, miles o coma decimal', () => {
    const r = limpiarManual(
      { datos: [dato('tanqueLitros', '80 L'), dato('cargaKg', '1,010 kg'), dato('aceiteLitros', '5,4')] },
      enviadas,
    );
    expect(r.campos.tanqueLitros.valor).toBe(80);
    expect(r.campos.cargaKg.valor).toBe(1010);
    expect(r.campos.aceiteLitros.valor).toBe(5.4);
  });

  it('un dato que cita una página que no se le mandó lo inventó: se descarta', () => {
    const r = limpiarManual({ datos: [dato('tanqueLitros', '80', 999), dato('motor', '2.5 L', null)] }, enviadas);
    expect(r.campos).toEqual({});
  });

  it('descarta lo que no cabe en un vehículo, lo que no es cifra y los campos que no existen', () => {
    const r = limpiarManual(
      {
        datos: [
          dato('tanqueLitros', '8000'),
          dato('llantaPsi', '2'),
          dato('rendimientoOficial', '200'),
          dato('anio', '1900'),
          dato('potenciaHp', 'no dice'),
          dato('color', 'rojo'),
        ],
      },
      enviadas,
    );
    expect(r.campos).toEqual({});
  });

  it('si repite un campo, se queda con el primero', () => {
    const r = limpiarManual({ datos: [dato('tanqueLitros', '80'), dato('tanqueLitros', '76', 431)] }, enviadas);
    expect(r.campos.tanqueLitros).toEqual({ valor: 80, fuente: { tipo: 'MANUAL', pagina: 418 } });
  });

  it('los servicios: con intervalo, sin repetir y sin cantidades absurdas', () => {
    const r = limpiarManual(
      {
        servicios: [
          { concepto: 'Aceite y filtro', cadaKm: 10000, cadaMeses: 6, pagina: 431 },
          { concepto: 'aceite y filtro', cadaKm: 5000, cadaMeses: null, pagina: 431 },
          { concepto: 'Revisar luces', cadaKm: null, cadaMeses: null, pagina: 431 },
          { concepto: 'Bujías', cadaKm: 5, cadaMeses: null, pagina: 431 },
          { concepto: 'Filtro de aire', cadaKm: 20000, cadaMeses: null, pagina: 999 },
        ],
      },
      enviadas,
    );
    expect(r.servicios).toEqual([{ concepto: 'Aceite y filtro', cadaKm: 10000, cadaMeses: 6, paginaManual: 431 }]);
  });

  it('una respuesta vacía no truena', () => {
    expect(limpiarManual(null, enviadas)).toEqual({ campos: {}, servicios: [] });
  });
});

describe('catálogo de CONUEE', () => {
  it('las cifras de la Frontier son las del PDF, leídas a ojo en su página', () => {
    const filas = filasConuee('Nissan', 'Frontier', CATALOGO_CONUEE_2023);
    const cifras = (modelo: string) => filas.filter((f) => f.modelo === modelo).map((f) => [f.ciudad, f.carretera, f.combinado]);
    expect(cifras('FRONTIER DOBLE CABINA 4X2 MT')).toEqual([
      [10.22, 14.93, 11.91],
      [9.79, 14.24, 11.39],
    ]);
    expect(cifras('FRONTIER DOBLE CABINA 4X2 AT')).toEqual([[10.3, 14.47, 11.83]]);
    expect(cifras('FRONTIER DOBLE CABINA (DIESEL 4X4 MT)')).toEqual([[11.96, 14.25, 12.89]]);
    expect(filas.every((f) => f.pagina === 24 && f.marca === 'NISSAN')).toBe(true);
  });

  it('también en otra página, con otra fuente', () => {
    const [hilux] = filasConuee('Toyota', 'Hilux Diesel MT', CATALOGO_CONUEE_2023);
    expect(hilux).toMatchObject({ modelo: 'HILUX DIESEL MT', ciudad: 12.22, carretera: 16, combinado: 13.67, combustible: 'DIESEL', pagina: 28 });
  });

  it('un modelo que no existe no da nada', () => {
    expect(filasConuee('Nissan', 'Zzzmóvil', CATALOGO_CONUEE_2023)).toEqual([]);
    expect(filasConuee('Nissan', '', CATALOGO_CONUEE_2023)).toEqual([]);
  });

  it('una marca distinta no se cuela por un nombre igual', () => {
    expect(filasConuee('Toyota', 'Frontier', CATALOGO_CONUEE_2023)).toEqual([]);
    expect(filasConuee('Nissan', 'Frontier', CATALOGO_CONUEE_2023).length).toBeGreaterThan(0);
  });

  it('entiende los nombres cortos de marca y los modelos con guion', () => {
    expect(filasConuee('VW', 'Amarok', CATALOGO_CONUEE_2023).length).toBeGreaterThan(0);
    expect(filasConuee('Honda', 'CRV', CATALOGO_CONUEE_2023)[0]?.modelo).toMatch(/^CR-?V/);
  });

  it('la cifra sale del renglón que elige la IA, no de lo que escriba', () => {
    const filas = filasConuee('Nissan', 'Frontier', CATALOGO_CONUEE_2023);
    const i = filas.findIndex((f) => f.modelo === 'FRONTIER DOBLE CABINA 4X2 AT');
    expect(limpiarConuee({ renglon: i + 1 }, filas)).toEqual({
      valor: 11.83,
      fuente: { tipo: 'CONUEE', pagina: 24 },
      version: 'FRONTIER DOBLE CABINA 4X2 AT',
    });
    expect(limpiarConuee({ renglon: null }, filas)).toBeNull();
    expect(limpiarConuee({ renglon: 0 }, filas)).toBeNull();
    expect(limpiarConuee({ renglon: 999 }, filas)).toBeNull();
    expect(limpiarConuee(null, filas)).toBeNull();
  });
});

describe('foto del tablero', () => {
  it('acepta lo que se lee y cabe', () => {
    expect(limpiarTablero({ odometroKm: 12480, combustible: '3/4', legible: true }, 12324)).toEqual({
      odometroKm: 12480,
      combustible: '3/4',
      legible: true,
    });
  });

  it('un odómetro no retrocede: se descarta y no se da por legible', () => {
    expect(limpiarTablero({ odometroKm: 12000, combustible: '1/2', legible: true }, 12324)).toEqual({
      odometroKm: null,
      combustible: '1/2',
      legible: false,
    });
  });

  it('nivel desconocido o foto ilegible no inventan nada', () => {
    expect(limpiarTablero({ odometroKm: null, combustible: 'medio', legible: false })).toEqual({
      odometroKm: null,
      combustible: null,
      legible: false,
    });
    expect(limpiarTablero(null).legible).toBe(false);
  });
});

describe('foto del ticket', () => {
  it('el ticket del mockup cuadra: 52.3 L × $24.50 = $1,281.35', () => {
    expect(limpiarTicket({ litros: 52.3, precioLitro: 24.5, importe: 1281.35, fecha: '2026-10-28', legible: true })).toEqual({
      litros: 52.3,
      precioLitro: 24.5,
      importe: 1281.35,
      fecha: '2026-10-28',
      legible: true,
      revisar: false,
    });
  });

  it('completa lo que falte con la cuenta', () => {
    expect(limpiarTicket({ litros: null, precioLitro: 24.5, importe: 1225, fecha: null, legible: true })).toMatchObject({
      litros: 50,
      legible: true,
      revisar: false,
    });
    expect(limpiarTicket({ litros: 50, precioLitro: null, importe: 1225, fecha: null, legible: true }).precioLitro).toBe(24.5);
    expect(limpiarTicket({ litros: 50, precioLitro: 24.5, importe: null, fecha: null, legible: true }).importe).toBe(1225);
  });

  it('si la cuenta no da, pide revisar', () => {
    expect(limpiarTicket({ litros: 52.3, precioLitro: 24.5, importe: 2281.35, fecha: null, legible: true }).revisar).toBe(true);
  });

  it('descarta lo imposible y una fecha mal formada', () => {
    const r = limpiarTicket({ litros: 9000, precioLitro: 2, importe: 1281.35, fecha: '28/10/26', legible: true });
    expect(r).toMatchObject({ litros: null, precioLitro: null, fecha: null, legible: false });
  });

  it('un papel que no es ticket no se da por legible', () => {
    expect(limpiarTicket({ litros: null, precioLitro: null, importe: null, fecha: null, legible: false }).legible).toBe(false);
    expect(limpiarTicket(null).legible).toBe(false);
  });
});
