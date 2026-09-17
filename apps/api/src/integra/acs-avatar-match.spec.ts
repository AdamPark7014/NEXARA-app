import {
  compareNameTokens,
  matchUsersToAcsPeople,
  normalizePersonName,
  personNameTokens,
  scoreNamePair,
  type AvatarMatchPerson,
  type AvatarMatchUser,
} from './acs-avatar-match';

/** Nombres tal cual están en el servidor de pruebas (usuarios ERP). */
const USERS: AvatarMatchUser[] = [
  'Alejandro González Bustamante',
  'Carolina Juárez Álvarez',
  'Luis Joel Aguilar Castillo',
  'Josué Teodulo Cervantes Arellano',
  'Mónica García Guzmán',
  'Daniela Galindo Almazán',
  'David Morales Zenón',
  'Iván Camargo Cañete',
  'Joan Sebastián Sánchez Espinoza',
  'Israel Ramos Lima',
  'Christian Eduardo Del Pozo Sánchez',
  'Adam Del Pozo',
].map((nombre, i) => ({ id: i + 1, nombre }));

/** Personas ACS reales, con sus espacios dobles y minúsculas. */
const ACS_NAMES = [
  'Alejandro González  Bustamante',
  'Carolina Juarez alvarez',
  'Luis Aguilar',
  'Josue Cervantez',
  'Monica Garcia',
  'Daniel Galindo',
  'David Morales  Zenón',
  'Ivan camargo',
  'Ivan Camargo',
  'Joan Sebastián',
  'Israel Ramos',
  'Christian Pozo',
  'Adam Del Pozo',
  // No son empleados:
  'evy pata de punto',
  'Arturo taja',
  'melanie Del pozo',
  'Juan José González Rojas',
  'Isaias Garcia',
  'Daniela Hernandez',
  'Jose Antonio Ramírez  Salazar',
  'Paulina Tlapaltotoli  Alvarez',
];

const NON_EMPLOYEES = new Set(ACS_NAMES.slice(13));

function buildPeople(): AvatarMatchPerson[] {
  return ACS_NAMES.map((personName, i) => ({
    personId: String(100 + i),
    personName,
    siteId: 1,
    hasFace: true,
    syncedAt: new Date('2026-09-15T10:00:00Z'),
  }));
}

const EXPECTED: Record<string, string> = {
  'Alejandro González Bustamante': 'Alejandro González  Bustamante',
  'Carolina Juárez Álvarez': 'Carolina Juarez alvarez',
  'Luis Joel Aguilar Castillo': 'Luis Aguilar',
  'Josué Teodulo Cervantes Arellano': 'Josue Cervantez',
  'Mónica García Guzmán': 'Monica Garcia',
  'Daniela Galindo Almazán': 'Daniel Galindo',
  'David Morales Zenón': 'David Morales  Zenón',
  'Iván Camargo Cañete': 'Ivan Camargo',
  'Joan Sebastián Sánchez Espinoza': 'Joan Sebastián',
  'Israel Ramos Lima': 'Israel Ramos',
  'Christian Eduardo Del Pozo Sánchez': 'Christian Pozo',
  'Adam Del Pozo': 'Adam Del Pozo',
};

describe('acs-avatar-match', () => {
  it('normaliza acentos, mayúsculas, espacios y partículas', () => {
    expect(normalizePersonName('  Alejandro González  Bustamante ')).toBe(
      'alejandro gonzalez bustamante',
    );
    expect(personNameTokens('Christian Eduardo Del Pozo Sánchez')).toEqual([
      'christian',
      'eduardo',
      'pozo',
      'sanchez',
    ]);
    expect(personNameTokens('Iván Camargo Cañete')).toEqual(['ivan', 'camargo', 'canete']);
  });

  it('tolera una letra solo en palabras de 4+ letras', () => {
    expect(compareNameTokens('cervantez', 'cervantes')).toBe('fuzzy');
    expect(compareNameTokens('daniel', 'daniela')).toBe('fuzzy');
    expect(compareNameTokens('eva', 'evy')).toBeNull();
    expect(compareNameTokens('garcia', 'garcia')).toBe('exact');
  });

  it('"Daniel" no empareja con "Daniela" si el apellido no coincide', () => {
    expect(scoreNamePair('Daniela Hernández Soto', 'Daniel Galindo')).toBeNull();
    expect(scoreNamePair('Daniela Galindo Almazán', 'Daniel Galindo')).not.toBeNull();
    // Nombre exacto sin apellido común tampoco basta.
    expect(scoreNamePair('Daniela Galindo Almazán', 'Daniela Hernandez')).toBeNull();
  });

  it('los 12 empleados del servidor de pruebas encuentran su registro ACS', () => {
    const people = buildPeople();
    // El duplicado: solo el "Ivan Camargo" con mayúscula tiene foto.
    people.find((p) => p.personName === 'Ivan camargo')!.hasFace = false;

    const result = matchUsersToAcsPeople(USERS, people);

    expect(result.unmatchedUsers).toEqual([]);
    expect(result.ambiguous).toEqual([]);
    expect(result.matched).toHaveLength(12);

    const byUser = Object.fromEntries(result.matched.map((m) => [m.userName, m.personName]));
    expect(byUser).toEqual(EXPECTED);

    for (const m of result.matched) {
      expect(NON_EMPLOYEES.has(m.personName)).toBe(false);
      expect(m.score).toBeGreaterThan(0.5);
      expect(m.score).toBeLessThan(1);
    }

    const ivan = result.matched.find((m) => m.userName === 'Iván Camargo Cañete')!;
    expect(ivan.candidates).toBe(2);
    expect(ivan.reason).toContain('el que tiene foto');
  });

  it('ningún no-empleado empareja con nadie, aunque comparta apellido o se parezca', () => {
    const people = buildPeople().filter((p) => NON_EMPLOYEES.has(p.personName));
    const result = matchUsersToAcsPeople(USERS, people);
    expect(result.matched).toEqual([]);
    expect(result.ambiguous).toEqual([]);
    expect(result.unmatchedUsers).toHaveLength(12);
  });

  it('duplicado Ivan con ambos con foto → gana el sincronizado más reciente', () => {
    const people = buildPeople();
    people.find((p) => p.personName === 'Ivan camargo')!.syncedAt = new Date(
      '2026-09-16T08:00:00Z',
    );
    const result = matchUsersToAcsPeople(USERS, people);
    const ivan = result.matched.find((m) => m.userName === 'Iván Camargo Cañete')!;
    expect(ivan.personName).toBe('Ivan camargo');
    expect(ivan.reason).toContain('sincronizado más reciente');
  });

  it('duplicado Ivan idéntico en foto y sincronización → ambiguo', () => {
    const result = matchUsersToAcsPeople(USERS, buildPeople());
    expect(result.matched.find((m) => m.userName === 'Iván Camargo Cañete')).toBeUndefined();
    const amb = result.ambiguous.find((a) => a.userName === 'Iván Camargo Cañete')!;
    expect(amb.candidates.map((c) => c.personName).sort()).toEqual([
      'Ivan Camargo',
      'Ivan camargo',
    ]);
  });

  it('el vínculo de identidad gana al nombre', () => {
    const users: AvatarMatchUser[] = [
      { id: 7, nombre: 'Adam Del Pozo', employeeNumber: null, companyEmployeeNumber: 'EMP-9' },
    ];
    const people: AvatarMatchPerson[] = [
      { personId: '1', personName: 'Adam Del Pozo', siteId: 1, hasFace: true },
      { personId: 'emp-9', personName: 'A. Pozo (recepción)', siteId: 2, hasFace: false },
    ];
    const result = matchUsersToAcsPeople(users, people);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({ personId: 'emp-9', siteId: 2, score: 1 });
    expect(result.matched[0].reason).toContain('vínculo de identidad');
  });

  it('una persona ACS reclamada por dos usuarios se queda con la mejor puntuación', () => {
    const users: AvatarMatchUser[] = [
      { id: 1, nombre: 'Luis Aguilar Castillo' },
      { id: 2, nombre: 'Luis Joel Aguilar Castillo Pérez Ruiz' },
    ];
    const people: AvatarMatchPerson[] = [
      { personId: '5', personName: 'Luis Aguilar Castillo', siteId: 1, hasFace: true },
    ];
    const result = matchUsersToAcsPeople(users, people);
    expect(result.matched.map((m) => m.userId)).toEqual([1]);
    expect(result.ambiguous.map((a) => a.userId)).toEqual([2]);
  });

  it('el mismo employeeNo en dos sitios no es empate', () => {
    const users: AvatarMatchUser[] = [{ id: 1, nombre: 'Israel Ramos Lima' }];
    const at = new Date('2026-09-15T10:00:00Z');
    const people: AvatarMatchPerson[] = [
      { personId: '42', personName: 'Israel Ramos', siteId: 1, hasFace: true, syncedAt: at },
      { personId: '42', personName: 'Israel Ramos', siteId: 2, hasFace: true, syncedAt: at },
    ];
    const result = matchUsersToAcsPeople(users, people);
    expect(result.matched).toHaveLength(1);
    expect(result.ambiguous).toEqual([]);
  });
});
