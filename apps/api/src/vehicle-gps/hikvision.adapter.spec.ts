import {
  HikvisionGpsProvider,
  MSG_GPS,
  MSG_GPS_ALT,
  coordenadaConHemisferio,
  instanteHik,
  puntoDesdeEvento,
  puntosDesdeLote,
  rumboDesdeDireccion,
  velocidadKmhDesdeCmH,
  type EventoMqHik,
} from './hikvision.adapter';

/**
 * El adaptador de Hikvision contra el ejemplo REAL de la documentación.
 *
 * El `fixture` de abajo está copiado del ejemplo de respuesta de
 * `POST /api/hccgw/rawmsg/v1/mq/messages` en
 * `docs/API-DOCS/HIKVISION/HikConnect-Team/llms-full.txt` §5.2. Si algún día
 * el formato cambia, esta prueba es la que avisa.
 */

const LOTE_DOCUMENTADO: { batchId: string; event: EventoMqHik[] } = {
  batchId: '5823e397664b41e677fab5c4ee6e8c3f',
  event: [
    {
      basicInfo: {
        occurrenceTime: '2023-05-08 11:15:26',
        msgType: 'Msg330001',
        resource: { id: '25051e2467f44cf5947493a56921ca4c', name: '111' },
        device: { id: '0d961d4a05264d4b848522d3414eca3a', name: 'K70728087', category: 'mobileDevice' },
      },
      data: {
        vehicleRelatedInfo: {
          gpsInfo: {
            ew: 'E',
            lng: '6.943345',
            ns: 'N',
            lat: '50.331554',
            direction: 32759,
            height: 6090,
            speed: 33333,
          },
          vehicleInfo: { licensePlate: '111', id: '25051e2467f44cf5947493a56921ca4c' },
        },
      },
    },
    {
      basicInfo: {
        occurrenceTime: '2023-05-05 11:15:32',
        msgType: 'Msg330502',
        resource: { id: '25051e2467f44cf5947493a56921ca4c', name: '111' },
        device: { id: '0d961d4a05264d4b848522d3414eca3a', name: 'K70728087', category: 'mobileDevice' },
      },
      data: {
        vehicleRelatedInfo: {
          gpsInfo: {
            ew: 'E',
            lng: '6.943345',
            ns: 'N',
            lat: '50.331551',
            direction: 32759,
            height: 6090,
            speed: 33333,
          },
          vehicleInfo: { licensePlate: '111', id: '25051e2467f44cf5947493a56921ca4c' },
        },
      },
    },
  ],
};

describe('campos del bloque gpsInfo', () => {
  it('speed viene en cm/h: 100 000 cm/h son 1 km/h', () => {
    expect(velocidadKmhDesdeCmH(100_000)).toBe(1);
    expect(velocidadKmhDesdeCmH(33_333)).toBe(0.33);
    expect(velocidadKmhDesdeCmH(0)).toBe(0);
  });

  it('una velocidad ausente o absurda queda en null, no en cero', () => {
    expect(velocidadKmhDesdeCmH(undefined)).toBeNull();
    expect(velocidadKmhDesdeCmH('rápido')).toBeNull();
    expect(velocidadKmhDesdeCmH(-5)).toBeNull();
  });

  it('direction en grados pasa tal cual; cruda (>360) son centésimas', () => {
    expect(rumboDesdeDireccion(90)).toBe(90);
    expect(rumboDesdeDireccion(359.5)).toBe(359.5);
    // El ejemplo oficial trae 32759: 32759 / 100 = 327.59 → 328.
    expect(rumboDesdeDireccion(32759)).toBe(328);
  });

  it('el hemisferio pone el signo: sur y oeste son negativos', () => {
    expect(coordenadaConHemisferio('50.331554', 'N', 'S')).toBe(50.331554);
    expect(coordenadaConHemisferio('50.331554', 'S', 'S')).toBe(-50.331554);
    expect(coordenadaConHemisferio('98.2063', 'W', 'W')).toBe(-98.2063);
    expect(coordenadaConHemisferio('6.943345', 'E', 'W')).toBe(6.943345);
  });

  it('occurrenceTime no trae zona: se lee en la del área (México, -6)', () => {
    expect(instanteHik('2023-05-08 11:15:26')?.toISOString()).toBe('2023-05-08T17:15:26.000Z');
    expect(instanteHik('no es una hora')).toBeNull();
    expect(instanteHik(undefined)).toBeNull();
  });
});

describe('un evento de la cola', () => {
  it('se traduce al punto que guardamos', () => {
    const punto = puntoDesdeEvento(LOTE_DOCUMENTADO.event[0]);
    expect(punto).toEqual({
      dispositivoId: 'K70728087',
      lat: 50.331554,
      lng: 6.943345,
      velocidadKmh: 0.33,
      rumbo: 328,
      at: new Date('2023-05-08T17:15:26.000Z'),
    });
  });

  it('el id del equipo es el número de serie de basicInfo.device.name', () => {
    expect(puntoDesdeEvento(LOTE_DOCUMENTADO.event[0])?.dispositivoId).toBe('K70728087');
  });

  it('una alarma que adjunta gpsInfo también sirve: es una posición igual', () => {
    // El segundo evento del ejemplo es Msg330502 (uso de teléfono), no Msg330001.
    expect(puntoDesdeEvento(LOTE_DOCUMENTADO.event[1])).not.toBeNull();
  });

  it('un evento sin gpsInfo no es una posición', () => {
    expect(puntoDesdeEvento({ basicInfo: { occurrenceTime: '2023-05-08 11:15:26' } })).toBeNull();
  });

  it('0,0 no es una ubicación: es un rastreador sin señal', () => {
    const sinSenal: EventoMqHik = {
      basicInfo: { occurrenceTime: '2023-05-08 11:15:26', device: { name: 'K1' } },
      data: { vehicleRelatedInfo: { gpsInfo: { ns: 'N', ew: 'E', lat: '0', lng: '0', speed: 0, direction: 0 } } },
    };
    expect(puntoDesdeEvento(sinSenal)).toBeNull();
  });

  it('el lote entero sale sin repetidos', () => {
    const puntos = puntosDesdeLote(LOTE_DOCUMENTADO.event);
    expect(puntos).toHaveLength(2);
    expect(puntos.map((p) => p.at.toISOString())).toEqual([
      '2023-05-08T17:15:26.000Z',
      '2023-05-05T17:15:32.000Z',
    ]);
  });

  it('dos entregas del mismo evento cuentan como uno', () => {
    const puntos = puntosDesdeLote([LOTE_DOCUMENTADO.event[0], LOTE_DOCUMENTADO.event[0]]);
    expect(puntos).toHaveLength(1);
  });
});

describe('la pasada de sondeo', () => {
  function clienteFalso(lote = LOTE_DOCUMENTADO) {
    return {
      configured: true,
      rawmsgSubscribe: jest.fn().mockResolvedValue({}),
      rawmsgMessages: jest.fn().mockResolvedValue(lote),
      rawmsgComplete: jest.fn().mockResolvedValue({}),
    };
  }

  const credenciales = { host: 'https://ius.hikcentralconnect.com', appKey: 'ak', secretKey: 'sk' };

  it('se suscribe a los tipos de mensaje de GPS y acusa el lote', async () => {
    const cliente = clienteFalso();
    const proveedor = new HikvisionGpsProvider(credenciales, cliente);

    await proveedor.puntosRecientes(['K70728087'], null);

    expect(cliente.rawmsgSubscribe).toHaveBeenCalledWith([MSG_GPS, MSG_GPS_ALT]);
    // Sin `complete` la cola vuelve a servir el mismo lote para siempre.
    expect(cliente.rawmsgComplete).toHaveBeenCalledWith(LOTE_DOCUMENTADO.batchId);
  });

  it('solo devuelve los equipos que nos interesan', async () => {
    const proveedor = new HikvisionGpsProvider(credenciales, clienteFalso());
    const puntos = await proveedor.puntosRecientes(['OTRO-EQUIPO'], null);
    expect(puntos).toEqual([]);
  });

  it('descarta lo anterior a lo que ya teníamos guardado', async () => {
    const proveedor = new HikvisionGpsProvider(credenciales, clienteFalso());
    const puntos = await proveedor.puntosRecientes(
      ['K70728087'],
      new Date('2023-05-06T00:00:00.000Z'),
    );
    expect(puntos).toHaveLength(1);
    expect(puntos[0].at.toISOString()).toBe('2023-05-08T17:15:26.000Z');
  });

  it('sin credenciales no llama a nadie', async () => {
    const cliente = clienteFalso();
    const proveedor = new HikvisionGpsProvider({ host: '', appKey: '', secretKey: '' }, cliente);
    expect(proveedor.configurado).toBe(false);
    expect(await proveedor.puntosRecientes(['K70728087'], null)).toEqual([]);
    expect(cliente.rawmsgMessages).not.toHaveBeenCalled();
  });

  it('no se anuncia como demo: estos puntos son reales', () => {
    expect(new HikvisionGpsProvider(credenciales, clienteFalso()).demo).toBe(false);
  });
});
