import {
  describeAcsEvent,
  listAllCardInfo,
  mapIsapiUserToPersonDto,
  mapMirrorPersonToDto,
  searchCardInfo,
  type IsapiAcsEvent,
} from './isapi-acs';
import type { HikvisionIsapiClient } from './isapi.client';
import type { XmlValue } from './xml';

describe('isapi-acs helpers', () => {
  it('describeAcsEvent etiqueta desde el catálogo, no desde una tabla propia', () => {
    // Esta función tenía su propia tabla — la quinta copia del mismo mapa, con
    // los mismos dos errores: el 21 como «Acceso denegado» cuando es la puerta
    // abriéndose, y el 22 como «Puerta abierta por botón» cuando es la puerta
    // cerrándose (el botón es el 23).
    expect(describeAcsEvent({ major: 5, minor: 75 })).toBe('Acceso concedido · rostro');
    expect(describeAcsEvent({ major: 5, minor: 1 })).toBe('Acceso concedido · tarjeta');
    expect(describeAcsEvent({ major: 5, minor: 21 })).toBe('Puerta desbloqueada');
    expect(describeAcsEvent({ major: 5, minor: 23 })).toBe('Botón de salida pulsado');
    expect(describeAcsEvent({ major: 1, minor: 3 } as IsapiAcsEvent)).toMatch(/Evento|Alarma/);
  });

  it('un minor que no está en el Apéndice C no se etiqueta a ojo', () => {
    // El 38 lo daba por «Acceso denegado» la tabla vieja. No aparece en la
    // tabla oficial del fabricante ni en los 47.343 eventos de Oficinas, así
    // que afirmarlo era inventarlo. Se admite como desconocido, con su número
    // a la vista para poder buscarlo si algún día aparece.
    expect(describeAcsEvent({ major: 5, minor: 38 })).toContain('38');
  });
});

/**
 * Cliente falso: solo `postJson`, que es lo único que toca `CardInfo/Search`.
 * Se apunta cada cuerpo enviado para poder afirmar sobre la paginación, que
 * es donde estos drenados se rompen de verdad.
 */
type PostedBody = { CardInfoSearchCond: Record<string, unknown> };

function fakeCardClient(pages: Array<Record<string, XmlValue>>) {
  const sent: PostedBody[] = [];
  const paths: string[] = [];
  let call = 0;
  const client = {
    postJson: async (path: string, payload: unknown): Promise<Record<string, XmlValue>> => {
      paths.push(path);
      sent.push(payload as PostedBody);
      return pages[Math.min(call++, pages.length - 1)] ?? {};
    },
  };
  return { client: client as unknown as HikvisionIsapiClient, sent, paths };
}

/** 30 tarjetas seguidas: una página llena obliga a pedir la siguiente. */
function fullPage(from: number): Record<string, XmlValue> {
  return {
    CardInfoSearch: {
      totalMatches: '31',
      CardInfo: Array.from({ length: 30 }, (_, i) => ({
        employeeNo: String(1000 + from + i),
        cardNo: String(900000 + from + i),
        cardType: 'normalCard',
      })),
    },
  };
}

describe('searchCardInfo', () => {
  it('pega en la ruta documentada y arma CardInfoSearchCond', async () => {
    const { client, sent, paths } = fakeCardClient([
      {
        CardInfoSearch: {
          totalMatches: '1',
          CardInfo: { employeeNo: '42', cardNo: '1234567890', cardType: 'normalCard' },
        },
      },
    ]);
    const page = await searchCardInfo(client, { position: 0, maxResults: 30 });

    expect(paths[0]).toBe('/ISAPI/AccessControl/CardInfo/Search?format=json');
    expect(sent[0].CardInfoSearchCond).toMatchObject({
      searchResultPosition: 0,
      maxResults: 30,
    });
    // Sin filtro no se manda CardNoList: pedirlo todo es lo que permite saber
    // de quién es cada tarjeta.
    expect(sent[0].CardInfoSearchCond).not.toHaveProperty('CardNoList');
    expect(page.total).toBe(1);
    expect(page.cards).toEqual([
      { employeeNo: '42', cardNo: '1234567890', cardType: 'normalCard' },
    ]);
  });

  it('acepta un solo CardInfo o una lista, y descarta filas sin cardNo', async () => {
    const { client } = fakeCardClient([
      {
        CardInfoSearch: {
          CardInfo: [
            { employeeNo: '1', cardNo: '111' },
            { employeeNo: '2', cardNo: '' },
            { employeeNo: '3', cardNo: '333' },
          ],
        },
      },
    ]);
    const page = await searchCardInfo(client);
    expect(page.cards.map((c) => c.cardNo)).toEqual(['111', '333']);
  });

  it('lee MatchList cuando el firmware usa ese contenedor', async () => {
    const { client } = fakeCardClient([
      {
        CardInfoSearch: {
          totalMatches: '1',
          MatchList: [{ employeeNo: '7', cardNo: '777' }],
        },
      },
    ]);
    const page = await searchCardInfo(client);
    expect(page.cards).toHaveLength(1);
    expect(page.cards[0].employeeNo).toBe('7');
  });

  it('el filtro opcional viaja como CardNoList', async () => {
    const { client, sent } = fakeCardClient([{}]);
    await searchCardInfo(client, { cardNos: ['111', ' 222 ', ''] });
    expect(sent[0].CardInfoSearchCond.CardNoList).toEqual([
      { cardNo: '111' },
      { cardNo: '222' },
    ]);
  });
});

describe('listAllCardInfo', () => {
  it('pagina de 30 en 30 hasta que la página no viene llena', async () => {
    const { client, sent } = fakeCardClient([
      fullPage(0),
      { CardInfoSearch: { totalMatches: '31', CardInfo: { employeeNo: '9', cardNo: '999' } } },
    ]);
    const cards = await listAllCardInfo(client);

    expect(cards).toHaveLength(31);
    expect(sent).toHaveLength(2);
    expect(sent[0].CardInfoSearchCond.searchResultPosition).toBe(0);
    expect(sent[1].CardInfoSearchCond.searchResultPosition).toBe(30);
    // Un solo searchID para todo el drenado, como en listAllUserInfo.
    expect(sent[0].CardInfoSearchCond.searchID).toBe(sent[1].CardInfoSearchCond.searchID);
  });

  it('para al llegar al total aunque la página venga llena', async () => {
    const { client, sent } = fakeCardClient([
      { CardInfoSearch: { totalMatches: '30', CardInfo: fullPageCards(0) } },
      fullPage(100),
    ]);
    const cards = await listAllCardInfo(client);
    expect(cards).toHaveLength(30);
    expect(sent).toHaveLength(1);
  });
});

function fullPageCards(from: number) {
  return Array.from({ length: 30 }, (_, i) => ({
    employeeNo: String(1000 + from + i),
    cardNo: String(900000 + from + i),
  }));
}

describe('mapIsapiUserToPersonDto', () => {
  it('userType va a userType y NO a orgName', () => {
    const dto = mapIsapiUserToPersonDto({
      employeeNo: '42',
      name: 'Ana',
      userType: 'normal',
    });
    expect(dto.userType).toBe('normal');
    // orgName es el DEPARTAMENTO. ISAPI no lo entrega: vacío, no 'normal'.
    expect(dto.orgName).toBeUndefined();
  });

  it('adjunta los números de tarjeta cuando se le pasan', () => {
    const dto = mapIsapiUserToPersonDto(
      { employeeNo: '42', name: 'Ana', numOfCard: 2 },
      { sourceIp: '192.168.9.163', cardNos: ['111', '222'] },
    );
    expect(dto.numOfCard).toBe(2);
    expect(dto.cardNos).toEqual(['111', '222']);
    expect(dto.sourceIp).toBe('192.168.9.163');
  });
});

describe('mapMirrorPersonToDto', () => {
  const base = {
    personId: '42',
    personName: 'Ana',
    personCode: '42',
    orgIndexCode: null,
    orgName: null,
    raw: null,
  };

  it('la columna gana sobre raw', () => {
    const dto = mapMirrorPersonToDto({
      ...base,
      userType: 'visitor',
      gender: 'female',
      validEnable: true,
      validFrom: new Date(2026, 0, 1, 8, 0, 0),
      validTo: new Date(2026, 11, 31, 23, 59, 59),
      numOfFace: 1,
      numOfFP: 2,
      numOfCard: 3,
      faceUrl: 'http://192.168.9.163/pic?id=42',
      sourceIp: '192.168.9.163',
      raw: { userType: 'normal', gender: 'male', numOfFP: 9 },
    });
    expect(dto.userType).toBe('visitor');
    expect(dto.gender).toBe('female');
    expect(dto.numOfFP).toBe(2);
    expect(dto.numOfCard).toBe(3);
    expect(dto.sourceIp).toBe('192.168.9.163');
    expect(dto.hasFace).toBe(true);
  });

  it('la vigencia vuelve con la hora de pared del terminal, sin saltar a UTC', () => {
    const dto = mapMirrorPersonToDto({
      ...base,
      validFrom: new Date(2020, 0, 1, 0, 0, 0),
      validTo: new Date(2037, 11, 31, 23, 59, 59),
    });
    expect(dto.validFrom).toBe('2020-01-01T00:00:00');
    expect(dto.validTo).toBe('2037-12-31T23:59:59');
  });

  it('cae a raw mientras el sync no haya repoblado las columnas', () => {
    const dto = mapMirrorPersonToDto({
      ...base,
      raw: {
        userType: 'normal',
        gender: 'male',
        numOfCard: 1,
        sourceIp: '192.168.9.163',
        Valid: { enable: true, beginTime: '2020-01-01T00:00:00', endTime: '2037-12-31T23:59:59' },
      },
    });
    expect(dto.userType).toBe('normal');
    expect(dto.gender).toBe('male');
    expect(dto.validTo).toBe('2037-12-31T23:59:59');
    expect(dto.sourceIp).toBe('192.168.9.163');
  });

  it('orgName ya no se rellena con el userType', () => {
    const withOrg = mapMirrorPersonToDto({
      ...base,
      orgName: 'Ingeniería',
      userType: 'normal',
    });
    expect(withOrg.orgName).toBe('Ingeniería');
    expect(withOrg.userType).toBe('normal');

    const withoutOrg = mapMirrorPersonToDto({ ...base, userType: 'normal' });
    expect(withoutOrg.orgName).toBeUndefined();
    // El front pinta `userType || orgName`: sigue teniendo qué pintar.
    expect(withoutOrg.userType).toBe('normal');
  });

  it('expone los números de tarjeta que le pase el servicio', () => {
    const dto = mapMirrorPersonToDto({ ...base, numOfCard: 2 }, { cardNos: ['111', '222'] });
    expect(dto.cardNos).toEqual(['111', '222']);
    const sinTarjetas = mapMirrorPersonToDto({ ...base }, { cardNos: [] });
    expect(sinTarjetas.cardNos).toBeUndefined();
  });
});
