import { personColumnsFromUserInfo } from './integra-sync.service';

/**
 * Lo que el sync escribe en las columnas nuevas de `integra_people`.
 *
 * Importa pinarlo porque un `validTo` mal parseado no falla: deja la columna
 * en null y el índice de vencimientos queda vacío sin que nadie se entere.
 */
describe('personColumnsFromUserInfo', () => {
  const ip = '192.168.9.163';

  it('userType va a su columna y orgName queda libre para el departamento', () => {
    const cols = personColumnsFromUserInfo(
      { employeeNo: '42', name: 'Ana', userType: 'normal' },
      ip,
    );
    expect(cols.userType).toBe('normal');
    // Era el bug: `orgName: String(u.userType)` guardaba el tipo de usuario
    // en la columna del departamento.
    expect(cols.orgName).toBeNull();
    // ISAPI no entrega organización, así que tampoco hay id de organización.
    expect(cols.orgIndexCode).toBeNull();
  });

  it('promueve vigencia, contadores, género, faceURL e IP', () => {
    const cols = personColumnsFromUserInfo(
      {
        employeeNo: '42',
        name: 'Ana',
        gender: 'female',
        numOfFace: 1,
        numOfFP: 2,
        numOfCard: 3,
        faceURL: 'http://192.168.9.163/pic?id=42',
        Valid: {
          enable: true,
          beginTime: '2020-01-01T00:00:00',
          endTime: '2037-12-31T23:59:59',
        },
      },
      ip,
    );
    expect(cols.gender).toBe('female');
    expect(cols.numOfFace).toBe(1);
    expect(cols.numOfFP).toBe(2);
    expect(cols.numOfCard).toBe(3);
    expect(cols.faceUrl).toBe('http://192.168.9.163/pic?id=42');
    expect(cols.sourceIp).toBe(ip);
    expect(cols.validEnable).toBe(true);
    // Hora de pared del terminal, sin desplazarla a UTC.
    expect(cols.validFrom?.getFullYear()).toBe(2020);
    expect(cols.validFrom?.getMonth()).toBe(0);
    expect(cols.validFrom?.getDate()).toBe(1);
    expect(cols.validTo?.getFullYear()).toBe(2037);
    expect(cols.validTo?.getMonth()).toBe(11);
    expect(cols.validTo?.getDate()).toBe(31);
    expect(cols.validTo?.getHours()).toBe(23);
  });

  it('lo que no tiene forma de fecha se descarta, no se inventa', () => {
    const cols = personColumnsFromUserInfo(
      {
        employeeNo: '42',
        name: 'Ana',
        Valid: { enable: false, beginTime: '', endTime: 'siempre' },
      },
      ip,
    );
    expect(cols.validFrom).toBeNull();
    expect(cols.validTo).toBeNull();
    expect(cols.validEnable).toBe(false);
  });

  it('un UserInfo pelado deja las columnas en null, no en cadenas vacías', () => {
    const cols = personColumnsFromUserInfo({ employeeNo: '42', name: 'Ana' }, ip);
    expect(cols.userType).toBeNull();
    expect(cols.gender).toBeNull();
    expect(cols.numOfCard).toBeNull();
    expect(cols.faceUrl).toBeNull();
    expect(cols.validEnable).toBeNull();
  });

  it('recorta al ancho de la columna en vez de reventar el INSERT', () => {
    const cols = personColumnsFromUserInfo(
      { employeeNo: '42', name: 'Ana', faceURL: `http://x/${'a'.repeat(900)}` },
      ip,
    );
    expect(cols.faceUrl?.length).toBe(500);
  });
});
