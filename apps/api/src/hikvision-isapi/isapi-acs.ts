import { randomUUID } from 'node:crypto';
import { IsapiApiError, type HikvisionIsapiClient } from './isapi.client';

/**
 * Personas y eventos ACS por ISAPI directo (sin HikCentral).
 *
 * Rutas verificadas en Postman oficial HikGateway + sitio Oficinas NEXARA
 * (DS-K1T, Acceso General 192.168.9.163):
 *
 * | Método + ruta                                      | Uso                |
 * |----------------------------------------------------|--------------------|
 * | `POST /ISAPI/AccessControl/UserInfo/Search?format=json` | listar personas |
 * | `POST /ISAPI/AccessControl/CardInfo/Search?format=json` | listar tarjetas |
 * | `POST /ISAPI/AccessControl/AcsEvent?format=json`        | eventos acceso  |
 *
 * Tope de página del firmware: **30**. `major/minor = 0` = todos los tipos.
 */

export type IsapiUserInfo = {
  employeeNo: string;
  name: string;
  userType?: string;
  gender?: string;
  Valid?: { enable?: boolean; beginTime?: string; endTime?: string };
  doorRight?: string;
  RightPlan?: unknown;
  faceURL?: string;
  numOfCard?: number;
  numOfFace?: number;
  numOfFP?: number;
  [key: string]: unknown;
};

/** DTO de persona para la consola (espejo o live ISAPI). */
export type IntegraPersonDto = {
  id: string;
  name: string;
  code?: string;
  orgId?: string;
  /**
   * Departamento REAL, no el tipo de usuario. Por ISAPI queda vacío: el
   * `UserInfo` del DS-K1T no trae organización. Se llena por Artemis.
   */
  orgName?: string;
  /** `normal` | `visitor` | `blackList` | `patrol`. */
  userType?: string;
  gender?: string;
  validEnable?: boolean;
  validFrom?: string;
  validTo?: string;
  doorRight?: string;
  rightPlan?: unknown;
  numOfFace?: number;
  numOfFP?: number;
  numOfCard?: number;
  /**
   * Números de tarjeta ya resueltos (`CardInfo/Search`). `numOfCard` dice
   * cuántas tiene; esto dice cuáles. Vacío si el sync aún no las ha leído.
   */
  cardNos?: string[];
  /** URL en el terminal; el navegador usa el proxy autenticado. */
  faceUrl?: string | null;
  hasFace?: boolean;
  /** JPEG guardado en NEXARA (uploads) aunque el ACS no entregue faceURL. */
  hasLocalFace?: boolean;
  /** IDs de huella (1–10) con plantilla Base64 en NEXARA. */
  localFpIds?: number[];
  sourceIp?: string;
  /** Nombre del terminal donde está dada de alta. La IP no le dice nada a nadie. */
  sourceName?: string;
  /** Puertas a las que tiene derecho, ya resueltas a nombre. */
  doorNames?: string[];
};

export function mapIsapiUserToPersonDto(
  u: IsapiUserInfo,
  extras?: { sourceIp?: string; cardNos?: string[] },
): IntegraPersonDto {
  const id = String(u.employeeNo ?? '').trim();
  const valid = u.Valid;
  const faceRaw = u.faceURL ?? (u as Record<string, unknown>).FaceURL;
  const faceUrl =
    typeof faceRaw === "string" && faceRaw.trim() ? faceRaw.trim() : null;
  const numOfFace = u.numOfFace != null ? Number(u.numOfFace) : undefined;
  const userType = u.userType != null ? String(u.userType) : undefined;
  return {
    id,
    name: String(u.name || id).trim() || id,
    code: id,
    // `orgName` es DEPARTAMENTO. El `UserInfo` de ISAPI no trae organización,
    // así que se queda vacío: meterle el `userType` —lo que se hacía antes—
    // era guardar el tipo de usuario en la columna del departamento.
    orgName: undefined,
    userType,
    gender: u.gender != null ? String(u.gender) : undefined,
    validEnable: valid?.enable,
    validFrom: valid?.beginTime,
    validTo: valid?.endTime,
    doorRight: u.doorRight != null ? String(u.doorRight) : undefined,
    rightPlan: u.RightPlan ?? (u as { rightPlan?: unknown }).rightPlan,
    numOfFace: Number.isFinite(numOfFace) ? numOfFace : undefined,
    numOfFP: u.numOfFP != null ? Number(u.numOfFP) : undefined,
    numOfCard: u.numOfCard != null ? Number(u.numOfCard) : undefined,
    cardNos: extras?.cardNos?.length ? extras.cardNos : undefined,
    faceUrl,
    hasFace: Boolean(faceUrl) || (numOfFace != null && numOfFace > 0),
    sourceIp: extras?.sourceIp,
  };
}

/**
 * Fila espejo mínima que el DTO necesita. Las columnas promovidas son
 * opcionales a propósito: una fila leída antes de la migración —o un `select`
 * parcial— sigue funcionando, cayendo a `raw`.
 */
export type MirrorPersonRow = {
  personId: string;
  personName: string;
  personCode: string | null;
  orgIndexCode: string | null;
  orgName: string | null;
  gender?: string | null;
  userType?: string | null;
  validEnable?: boolean | null;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
  numOfFace?: number | null;
  numOfFP?: number | null;
  numOfCard?: number | null;
  faceUrl?: string | null;
  sourceIp?: string | null;
  raw: unknown;
};

/**
 * `Date` → el mismo `2037-12-31T23:59:59` que mandó el terminal.
 *
 * Se formatea con los componentes LOCALES, no con `toISOString()`: la columna
 * se guardó haciendo `new Date('2037-12-31T23:59:59')` sobre la hora local del
 * equipo, así que pasar por UTC devolvería un día y una hora distintos a los
 * que el DS-K1T tiene grabados — y esa cadena se vuelve a escribir en el
 * terminal y se compara contra `2037-12-31` para decidir «indefinido».
 */
function isoLocal(v: Date | string | null | undefined): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (Number.isNaN(v.getTime())) return undefined;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${p(v.getFullYear(), 4)}-${p(v.getMonth() + 1)}-${p(v.getDate())}` +
    `T${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`
  );
}

function numOrUndefined(v: number | null | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Reconstruye el DTO desde la fila espejo.
 *
 * La columna gana sobre `raw`: `raw` es el respaldo para filas que aún no ha
 * tocado el sync tras la migración, no la fuente. Así el DTO no cambia de forma
 * mientras las filas se van repoblando.
 */
export function mapMirrorPersonToDto(
  row: MirrorPersonRow,
  extras?: { cardNos?: string[] },
): IntegraPersonDto {
  const raw = (row.raw && typeof row.raw === 'object' ? row.raw : {}) as IsapiUserInfo & {
    sourceIp?: string;
  };
  const fromRaw = mapIsapiUserToPersonDto(
    {
      ...raw,
      employeeNo: row.personId,
      name: row.personName || raw.name || row.personId,
    },
    { sourceIp: row.sourceIp ?? raw.sourceIp },
  );
  const validFrom = isoLocal(row.validFrom) ?? fromRaw.validFrom;
  const validTo = isoLocal(row.validTo) ?? fromRaw.validTo;
  const numOfFace = numOrUndefined(row.numOfFace) ?? fromRaw.numOfFace;
  const faceUrl = row.faceUrl ?? fromRaw.faceUrl ?? null;
  return {
    ...fromRaw,
    code: row.personCode || fromRaw.code,
    orgId: row.orgIndexCode || undefined,
    // Departamento real y solo eso. Si el terminal no lo da, va vacío — ya no
    // se rellena con el `userType`, que tiene columna propia.
    orgName: row.orgName || undefined,
    userType: row.userType || fromRaw.userType,
    gender: row.gender || fromRaw.gender,
    validEnable: row.validEnable ?? fromRaw.validEnable,
    validFrom,
    validTo,
    numOfFace,
    numOfFP: numOrUndefined(row.numOfFP) ?? fromRaw.numOfFP,
    numOfCard: numOrUndefined(row.numOfCard) ?? fromRaw.numOfCard,
    cardNos: extras?.cardNos?.length ? extras.cardNos : undefined,
    faceUrl,
    hasFace: Boolean(faceUrl) || (numOfFace != null && numOfFace > 0),
  };
}

export type IsapiAcsEvent = {
  major?: number;
  minor?: number;
  time?: string;
  employeeNoString?: string;
  name?: string;
  cardNo?: string;
  doorNo?: number;
  doorName?: string;
  cardReaderNo?: number;
  type?: number;
  serialNo?: number;
  currentVerifyMode?: string;
  pictureURL?: string;
  [key: string]: unknown;
};

export type UserInfoPage = {
  total: number;
  position: number;
  users: IsapiUserInfo[];
  responseStatus?: string;
};

export type AcsEventPage = {
  total: number;
  position: number;
  events: IsapiAcsEvent[];
  responseStatus?: string;
};

function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Página de usuarios del terminal. `position` es offset 0-based. */
export async function searchUserInfo(
  client: HikvisionIsapiClient,
  opts: {
    position?: number;
    maxResults?: number;
    searchID?: string;
    /**
     * Filtro opcional por empleado. Está en capacidades Postman
     * (`UserInfoSearchCond.EmployeeNoList`); si el firmware lo ignora,
     * devolvemos página normal y el caller hace fallback.
     */
    employeeNos?: string[];
  } = {},
): Promise<UserInfoPage> {
  const maxResults = Math.min(Math.max(1, opts.maxResults ?? 30), 30);
  const position = Math.max(0, opts.position ?? 0);
  const nos = (opts.employeeNos || [])
    .map((n) => String(n).trim())
    .filter(Boolean)
    .slice(0, 30);
  const body = {
    UserInfoSearchCond: {
      searchID: opts.searchID || randomUUID(),
      searchResultPosition: position,
      maxResults,
      ...(nos.length
        ? { EmployeeNoList: nos.map((employeeNo) => ({ employeeNo })) }
        : {}),
    },
  };
  const raw = await client.postJson(
    '/ISAPI/AccessControl/UserInfo/Search?format=json',
    body,
  );
  const search = (raw.UserInfoSearch ?? raw) as Record<string, unknown>;
  const users = asArray(search.UserInfo as IsapiUserInfo | IsapiUserInfo[]).filter(
    (u) => u && String(u.employeeNo ?? '').length > 0,
  );
  return {
    total: num(search.totalMatches ?? search.numOfMatches, users.length),
    position,
    users,
    responseStatus: search.responseStatus != null ? String(search.responseStatus) : undefined,
  };
}

/** Drena todas las páginas de UserInfo (tope 30/página). */
export async function listAllUserInfo(
  client: HikvisionIsapiClient,
  maxPages = 50,
): Promise<IsapiUserInfo[]> {
  const all: IsapiUserInfo[] = [];
  const searchID = randomUUID();
  for (let page = 0; page < maxPages; page++) {
    const pos = page * 30;
    const batch = await searchUserInfo(client, { position: pos, maxResults: 30, searchID });
    all.push(...batch.users);
    if (batch.users.length < 30) break;
    if (batch.total > 0 && all.length >= batch.total) break;
  }
  return all;
}

/**
 * Tarjeta tal y como la describe el mensaje `CardInfo`
 * (HikGateway APÉNDICE-A → `CardInfo`): empleado, número y tipo. Nada más:
 * lo que el firmware añada queda en el índice abierto, sin inventarlo aquí.
 */
export type IsapiCardInfo = {
  employeeNo?: string;
  cardNo?: string;
  /**
   * `normalCard` (por omisión), `patrolCard`, `hijackCard`, `superCard`,
   * `dismissingCard`, `emergencyCard`.
   */
  cardType?: string;
  [key: string]: unknown;
};

export type CardInfoPage = {
  total: number;
  position: number;
  cards: IsapiCardInfo[];
  responseStatus?: string;
};

/**
 * Página de tarjetas del terminal. `position` es offset 0-based.
 *
 * Ruta: `POST /ISAPI/AccessControl/CardInfo/Search?format=json`
 * (HikGateway README §4.3.3 «Buscar tarjetas», línea 523; el `devIndex` de la
 * doc es del gateway — aquí hablamos ISAPI directo al equipo, igual que
 * `UserInfo/Search`). Cuerpo `CardInfoSearchCond` con `searchID`,
 * `searchResultPosition` y `maxResults`, y el filtro opcional `CardNoList`
 * tal cual lo trae el Postman oficial (`HikGateway.postman_collection.json`,
 * «Consultar no. tarjeta por no. empleado»).
 *
 * Sin filtro devuelve todas las tarjetas del equipo, y cada `CardInfo` viene
 * con su `employeeNo`: así es como se sabe de quién es cada credencial.
 */
export async function searchCardInfo(
  client: HikvisionIsapiClient,
  opts: {
    position?: number;
    maxResults?: number;
    searchID?: string;
    /** Filtro documentado del cond: `CardInfoSearchCond.CardNoList`. */
    cardNos?: string[];
  } = {},
): Promise<CardInfoPage> {
  const maxResults = Math.min(Math.max(1, opts.maxResults ?? 30), 30);
  const position = Math.max(0, opts.position ?? 0);
  const nos = (opts.cardNos || [])
    .map((n) => String(n).trim())
    .filter(Boolean)
    .slice(0, 30);
  const body = {
    CardInfoSearchCond: {
      searchID: opts.searchID || randomUUID(),
      searchResultPosition: position,
      maxResults,
      ...(nos.length ? { CardNoList: nos.map((cardNo) => ({ cardNo })) } : {}),
    },
  };
  const raw = await client.postJson(
    '/ISAPI/AccessControl/CardInfo/Search?format=json',
    body,
  );
  const search = (raw.CardInfoSearch ?? raw) as Record<string, unknown>;
  // El contenedor de resultados no está tabulado en la doc: unos firmwares
  // devuelven `CardInfo`, otros el `MatchList` que usan AcsEvent y FDSearch.
  // Se aceptan los dos nombres documentados — ninguno inventado.
  const list = asArray(search.CardInfo as IsapiCardInfo | IsapiCardInfo[]).length
    ? asArray(search.CardInfo as IsapiCardInfo | IsapiCardInfo[])
    : asArray(search.MatchList as IsapiCardInfo | IsapiCardInfo[]);
  const cards = list.filter((c) => c && String(c.cardNo ?? '').trim().length > 0);
  return {
    total: num(search.totalMatches ?? search.numOfMatches, cards.length),
    position,
    cards,
    responseStatus:
      search.responseStatus != null
        ? String(search.responseStatus)
        : search.responseStatusStrg != null
          ? String(search.responseStatusStrg)
          : undefined,
  };
}

/** Drena todas las páginas de CardInfo (mismo tope de 30 que UserInfo). */
export async function listAllCardInfo(
  client: HikvisionIsapiClient,
  maxPages = 50,
): Promise<IsapiCardInfo[]> {
  const all: IsapiCardInfo[] = [];
  const searchID = randomUUID();
  for (let page = 0; page < maxPages; page++) {
    const pos = page * 30;
    const batch = await searchCardInfo(client, { position: pos, maxResults: 30, searchID });
    all.push(...batch.cards);
    if (batch.cards.length < 30) break;
    if (batch.total > 0 && all.length >= batch.total) break;
  }
  return all;
}

/** Página de eventos ACS. Requiere ventana de tiempo (ISO local o offset). */
export async function searchAcsEvents(
  client: HikvisionIsapiClient,
  opts: {
    startTime: string;
    endTime: string;
    position?: number;
    maxResults?: number;
    searchID?: string;
    /** 0 = todos. */
    major?: number;
    minor?: number;
  },
): Promise<AcsEventPage> {
  const maxResults = Math.min(Math.max(1, opts.maxResults ?? 30), 30);
  const position = Math.max(0, opts.position ?? 0);
  const body = {
    AcsEventCond: {
      searchID: opts.searchID || randomUUID(),
      searchResultPosition: position,
      maxResults,
      major: opts.major ?? 0,
      minor: opts.minor ?? 0,
      startTime: opts.startTime,
      endTime: opts.endTime,
    },
  };
  const raw = await client.postJson('/ISAPI/AccessControl/AcsEvent?format=json', body);
  const search = (raw.AcsEvent ?? raw) as Record<string, unknown>;
  const events = asArray(search.InfoList as IsapiAcsEvent | IsapiAcsEvent[]).length
    ? asArray(search.InfoList as IsapiAcsEvent | IsapiAcsEvent[])
    : asArray(search.AcsEventInfo as IsapiAcsEvent | IsapiAcsEvent[]);
  return {
    total: num(search.totalMatches ?? search.numOfMatches, events.length),
    position,
    events,
    responseStatus: search.responseStatus != null ? String(search.responseStatus) : undefined,
  };
}

/**
 * Drena eventos ACS en la ventana. Orden típico del equipo: más recientes primero
 * o por position — devolvemos tal cual y el caller ordena si hace falta.
 */
export async function listAcsEvents(
  client: HikvisionIsapiClient,
  opts: {
    startTime: string;
    endTime: string;
    maxResults?: number;
    maxPages?: number;
    major?: number;
    minor?: number;
  },
): Promise<IsapiAcsEvent[]> {
  const pageSize = Math.min(opts.maxResults ?? 30, 30);
  const maxPages = opts.maxPages ?? 20;
  const searchID = randomUUID();
  const all: IsapiAcsEvent[] = [];
  for (let page = 0; page < maxPages; page++) {
    const batch = await searchAcsEvents(client, {
      startTime: opts.startTime,
      endTime: opts.endTime,
      position: page * pageSize,
      maxResults: pageSize,
      searchID,
      major: opts.major,
      minor: opts.minor,
    });
    all.push(...batch.events);
    if (batch.events.length < pageSize) break;
    if (batch.total > 0 && all.length >= batch.total) break;
  }
  return all;
}

/** Etiqueta legible a partir de major/minor cuando el equipo no manda nombre. */
export function describeAcsEvent(ev: IsapiAcsEvent): string {
  const major = num(ev.major);
  const minor = num(ev.minor);
  // major 5 = evento de autenticación (doc Hikvision ACS)
  if (major === 5) {
    if (minor === 1 || minor === 75) return 'Acceso concedido';
    if (minor === 21 || minor === 38) return 'Acceso denegado';
    if (minor === 22) return 'Puerta abierta por botón';
    return `Auth ${minor}`;
  }
  if (major === 1) return `Alarma ${minor}`;
  if (major === 3) return `Excepción ${minor}`;
  return `Evento ${major}.${minor}`;
}

export type UserInfoWrite = {
  employeeNo: string;
  name: string;
  userType?: string;
  gender?: string;
  Valid?: { enable?: boolean; beginTime?: string; endTime?: string };
  doorRight?: string;
  RightPlan?: unknown;
};

export type DeviceOpResult = {
  deviceIp: string;
  ok: boolean;
  error?: string;
};

const DEFAULT_VALID = {
  enable: true,
  beginTime: '2020-01-01T00:00:00',
  endTime: '2037-12-31T23:59:59',
};

/** Alta en un terminal. Doc HikGateway 5.8.1 — UserInfo/Record. */
export async function recordUserInfo(
  client: HikvisionIsapiClient,
  user: UserInfoWrite,
): Promise<void> {
  await client.postJson('/ISAPI/AccessControl/UserInfo/Record?format=json', {
    UserInfo: [
      {
        employeeNo: user.employeeNo,
        name: user.name,
        userType: user.userType || 'normal',
        ...(user.gender ? { gender: user.gender } : {}),
        Valid: user.Valid
          ? {
              enable: user.Valid.enable !== false,
              beginTime: user.Valid.beginTime || DEFAULT_VALID.beginTime,
              endTime: user.Valid.endTime || DEFAULT_VALID.endTime,
            }
          : DEFAULT_VALID,
        ...(user.doorRight != null ? { doorRight: user.doorRight } : {}),
        ...(user.RightPlan != null ? { RightPlan: user.RightPlan } : {}),
      },
    ],
  });
}

/** Edición. Doc HikGateway 5.8.3 — UserInfo/Modify. */
export async function modifyUserInfo(
  client: HikvisionIsapiClient,
  user: UserInfoWrite,
): Promise<void> {
  await client.putJson('/ISAPI/AccessControl/UserInfo/Modify?format=json', {
    UserInfo: {
      employeeNo: user.employeeNo,
      name: user.name,
      ...(user.userType ? { userType: user.userType } : {}),
      ...(user.gender ? { gender: user.gender } : {}),
      ...(user.Valid
        ? {
            Valid: {
              enable: user.Valid.enable !== false,
              beginTime: user.Valid.beginTime || DEFAULT_VALID.beginTime,
              endTime: user.Valid.endTime || DEFAULT_VALID.endTime,
            },
          }
        : {}),
      ...(user.doorRight != null ? { doorRight: user.doorRight } : {}),
      ...(user.RightPlan != null ? { RightPlan: user.RightPlan } : {}),
    },
  });
}

/** Baja. Doc HikGateway 5.8.2 — UserInfoDetail/Delete (+ DeleteProcess). */
export async function deleteUserInfo(
  client: HikvisionIsapiClient,
  employeeNo: string,
): Promise<void> {
  const no = String(employeeNo).trim();
  if (!no) throw new Error('employeeNo vacío');

  // Idempotente: si ya no está, listo (reintento / terminal que nunca la tuvo).
  if (!(await userStillOnDevice(client, no))) {
    return;
  }

  // Rostro primero: algunos firmwares dejan el UserInfo “pegado” si queda FaceData.
  try {
    await deleteFaceData(client, no);
  } catch (e) {
    if (!isBenignMissingError(e)) {
      // Seguir igual: el Delete de UserInfo a veces limpia el rostro.
    }
  }

  await putDeleteByEmployeeNo(client, no);
  await waitUserInfoDeleteProcess(client);

  // Algunos firmwares tardan; reintenta Delete una vez si sigue listada.
  let still = await userStillOnDevice(client, no);
  if (still) {
    await sleep(900);
    await putDeleteByEmployeeNo(client, no);
    await waitUserInfoDeleteProcess(client);
    await sleep(700);
    still = await userStillOnDevice(client, no);
  }
  if (still) {
    throw new Error(`El terminal aún lista a ${no} tras Delete`);
  }
}

async function putDeleteByEmployeeNo(
  client: HikvisionIsapiClient,
  employeeNo: string,
): Promise<void> {
  try {
    await client.putJson('/ISAPI/AccessControl/UserInfoDetail/Delete?format=json', {
      UserInfoDetail: {
        mode: 'byEmployeeNo',
        EmployeeNoList: [{ employeeNo }],
      },
    });
  } catch (e) {
    // Ya no existe en ese terminal → OK para fan-out.
    if (isBenignMissingError(e)) return;
    throw e;
  }
}

function isBenignMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /notExist|not.?exist|noExist|employeeNoNotExist|UserNotExist|does not exist|no such|not found|404/i.test(
    msg,
  );
}

/** Progreso async del borrado. Doc HikGateway §4.3.2 / DeleteProcess. */
async function waitUserInfoDeleteProcess(
  client: HikvisionIsapiClient,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let sawProcess = false;
  while (Date.now() < deadline) {
    await sleep(450);
    try {
      const raw = await client.get('/ISAPI/AccessControl/UserInfoDetail/DeleteProcess?format=json');
      sawProcess = true;
      const block = (raw.UserInfoDetailDeleteProcess ??
        raw.UserInfoDetailDeleteProcessStatus ??
        raw) as Record<string, unknown>;
      const status = String(
        block.status ?? block.processStatus ?? block.responseStatusStrg ?? '',
      ).toLowerCase();
      if (!status) continue;
      if (
        status === 'success' ||
        status === 'ok' ||
        status === 'completed' ||
        status === 'complete' ||
        status === 'idle' ||
        status === 'true'
      ) {
        return;
      }
      if (status === 'failed' || status === 'error' || status === 'false') {
        throw new Error(`DeleteProcess=${status}`);
      }
      // processing / running → seguir
    } catch (e) {
      // Firmware sin DeleteProcess (404): el PUT ya aceptó la baja.
      if (e instanceof IsapiApiError && (e.status === 404 || e.status === 400)) {
        if (!sawProcess) return;
      }
      if (e instanceof Error && /DeleteProcess=/.test(e.message)) throw e;
      // Otros errores temporales: reintentar hasta timeout.
    }
  }
  if (sawProcess) {
    // Timeout con proceso visto: no fallar duro — la verificación UserInfo decide.
    return;
  }
}

async function userStillOnDevice(
  client: HikvisionIsapiClient,
  employeeNo: string,
): Promise<boolean> {
  const want = String(employeeNo).trim();

  // Rápido: si EmployeeNoList la encuentra, sigue ahí.
  try {
    const page = await searchUserInfo(client, {
      position: 0,
      maxResults: 30,
      employeeNos: [want],
    });
    if (page.users.some((u) => String(u.employeeNo).trim() === want)) {
      return true;
    }
  } catch {
    // Seguir con listado completo.
  }

  // Autoritativo: drenar UserInfo. Si no podemos listar, NO fingimos éxito
  // (eso borraba el espejo y el sync 15 min «reaparecía» a la persona).
  try {
    const users = await listAllUserInfo(client, 80);
    return users.some((u) => String(u.employeeNo).trim() === want);
  } catch (e) {
    throw new Error(
      `No se pudo verificar baja de ${want}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sonda honesta de capacidades ACS (cara / huella / httpHosts).
 * Solo rutas documentadas HikGateway — no inventa FaceContrast ni score.
 */
export async function probeAcsIdentityCaps(client: HikvisionIsapiClient): Promise<{
  accessControl: boolean;
  fdLibCount: boolean;
  captureFingerPrintCaps: boolean;
  fingerPrintCfgCaps: boolean;
  httpHosts: boolean;
  notes: string[];
}> {
  const notes: string[] = [];
  const tryGet = async (path: string) => {
    try {
      await client.get(path);
      return true;
    } catch {
      return false;
    }
  };
  const tryGetJson = async (path: string) => {
    try {
      await client.get(path.includes('?') ? path : `${path}?format=json`);
      return true;
    } catch {
      return false;
    }
  };

  const accessControl = await tryGet('/ISAPI/AccessControl/capabilities');
  const fdLibCount = await tryGetJson('/ISAPI/Intelligent/FDLib/Count');
  const captureFingerPrintCaps = await tryGetJson(
    '/ISAPI/AccessControl/CaptureFingerPrint/capabilities',
  );
  const fingerPrintCfgCaps = await tryGetJson(
    '/ISAPI/AccessControl/FingerPrintCfg/capabilities',
  );
  let httpHosts = false;
  try {
    await client.get('/ISAPI/Event/notification/httpHosts');
    httpHosts = true;
  } catch {
    httpHosts = false;
  }

  notes.push(
    'Face JPEG: FaceDataRecord multipart (upload). Muchos DS-K1T no exportan faceURL descargable — NEXARA guarda copia local.',
  );
  notes.push(
    'Huella: CaptureFingerPrint → FingerPrintDownload/Upload/Delete (HikGateway §5.11).',
  );
  if (!captureFingerPrintCaps) {
    notes.push('CaptureFingerPrint/capabilities no respondió en este equipo.');
  }

  return {
    accessControl,
    fdLibCount,
    captureFingerPrintCaps,
    fingerPrintCfgCaps,
    httpHosts,
    notes,
  };
}

/**
 * Empuja JPEG de cara al terminal. Doc HikGateway 5.9.1 — FaceDataRecord multipart.
 * `faceLibType` por defecto `blackFD` (lista ACS habitual).
 *
 * Calidad: DS-K1T enrola mejor con JPEG frontal ~50–400 KB (cara llena el
 * cuadro). PNG/WebP fallan; >~1.5 MB a menudo se rechaza.
 */
export async function uploadFaceData(
  client: HikvisionIsapiClient,
  opts: { employeeNo: string; jpeg: Buffer; faceLibType?: string },
): Promise<void> {
  const meta = JSON.stringify({
    faceLibType: opts.faceLibType || 'blackFD',
    FaceInfo: { employeeNo: opts.employeeNo, faceLibType: opts.faceLibType || 'blackFD' },
  });
  await client.postMultipart('/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', [
    { name: 'FaceDataRecord', contentType: 'application/json', body: meta },
    {
      name: 'FaceImage',
      contentType: 'image/jpeg',
      body: opts.jpeg,
      filename: 'face.jpg',
    },
  ]);
}

/** Quita el registro de rostro. Doc HikGateway 5.9.2. */
export async function deleteFaceData(
  client: HikvisionIsapiClient,
  employeeNo: string,
  faceLibType = 'blackFD',
): Promise<void> {
  await client.putJson('/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json', {
    FaceInfoDelCond: {
      faceLibType,
      EmployeeNoList: [{ employeeNo }],
    },
  });
}

/**
 * Busca registro de rostro por empleado. Postman «Buscar rostro» —
 * FaceInfoSearchCond. Sirve para verificar enrolo tras FaceDataRecord.
 */
export async function searchFaceInfo(
  client: HikvisionIsapiClient,
  opts: { employeeNo: string; faceLibType?: string; maxResults?: number },
): Promise<{ total: number; matches: Array<Record<string, unknown>> }> {
  const employeeNo = String(opts.employeeNo || '').trim();
  if (!employeeNo) return { total: 0, matches: [] };
  const raw = await client.postJson('/ISAPI/Intelligent/FDLib/FDSearch?format=json', {
    FaceInfoSearchCond: {
      searchID: randomUUID(),
      searchResultPosition: 0,
      maxResults: Math.min(Math.max(1, opts.maxResults ?? 10), 30),
      faceLibType: opts.faceLibType || 'blackFD',
      employeeNo,
    },
  });
  const block = (raw.FaceInfoSearch ?? raw.FaceInfoSearchResult ?? raw) as Record<string, unknown>;
  const matches = asArray(
    (block.FaceInfo as Record<string, unknown> | Record<string, unknown>[] | undefined) ??
      (block.MatchList as Record<string, unknown> | Record<string, unknown>[] | undefined),
  ).filter(Boolean);
  return {
    total: num(block.totalMatches ?? block.numOfMatches, matches.length),
    matches,
  };
}

/**
 * Huella — rutas HikGateway §5.11 + Postman oficial (sin `devIndex`: ISAPI
 * directo al equipo, igual que UserInfo).
 *
 * - Capture → Base64 `fingerData` + calidad
 * - Download → aplica plantilla a persona en el lector
 * - Upload → obtiene plantilla del lector (si el firmware la exporta)
 * - Delete → baja por employeeNo
 */

export type CapturedFingerPrint = {
  fingerData: string;
  fingerNo: number;
  fingerPrintQuality?: number;
};

/** Captura en el sensor del terminal. Bloquea hasta que el usuario ponga el dedo. */
export async function captureFingerPrint(
  client: HikvisionIsapiClient,
  fingerNo = 1,
): Promise<CapturedFingerPrint> {
  const n = Math.min(10, Math.max(1, Math.floor(fingerNo) || 1));
  const raw = await client.postJson('/ISAPI/AccessControl/CaptureFingerPrint?format=json', {
    CaptureFingerPrintCond: { fingerNo: n },
  });
  const block = (raw.CaptureFingerPrint ?? raw) as Record<string, unknown>;
  const fingerData = String(block.fingerData ?? '').trim();
  if (!fingerData) {
    throw new Error('El terminal no devolvió fingerData (captura vacía o cancelada)');
  }
  const quality = block.fingerPrintQuality != null ? Number(block.fingerPrintQuality) : undefined;
  return {
    fingerData,
    fingerNo: num(block.fingerNo, n),
    fingerPrintQuality: Number.isFinite(quality) ? quality : undefined,
  };
}

/** Empuja plantilla a una persona. Doc HikGateway 5.11.2 — FingerPrintDownload. */
export async function downloadFingerPrint(
  client: HikvisionIsapiClient,
  opts: {
    employeeNo: string;
    fingerPrintID: number;
    fingerData: string;
    fingerType?: string;
    enableCardReader?: number[];
  },
): Promise<void> {
  const fingerPrintID = Math.min(10, Math.max(1, Math.floor(opts.fingerPrintID) || 1));
  await client.postJson('/ISAPI/AccessControl/FingerPrintDownload?format=json', {
    FingerPrintCfg: {
      employeeNo: opts.employeeNo,
      fingerPrintID,
      fingerData: opts.fingerData,
      fingerType: opts.fingerType || 'normalFP',
      enableCardReader: opts.enableCardReader?.length ? opts.enableCardReader : [1],
    },
  });
}

/**
 * Obtiene plantilla del lector. Postman «Obtener huella» —
 * FingerPrintUpload + FingerPrintCond.
 */
export async function uploadFingerPrint(
  client: HikvisionIsapiClient,
  opts: { employeeNo: string; fingerPrintID?: number; searchID?: string },
): Promise<CapturedFingerPrint | null> {
  const fingerPrintID = Math.min(
    10,
    Math.max(1, Math.floor(opts.fingerPrintID ?? 1) || 1),
  );
  const raw = await client.postJson('/ISAPI/AccessControl/FingerPrintUpload?format=json', {
    FingerPrintCond: {
      searchID: opts.searchID || randomUUID(),
      employeeNo: opts.employeeNo,
      fingerPrintID,
    },
  });
  const block = (raw.FingerPrintInfo ??
    raw.FingerPrintCfg ??
    raw.FingerPrint ??
    raw.CaptureFingerPrint ??
    raw) as Record<string, unknown>;
  const fingerData = String(block.fingerData ?? '').trim();
  if (!fingerData) return null;
  return {
    fingerData,
    fingerNo: num(block.fingerPrintID ?? block.fingerNo, fingerPrintID),
    fingerPrintQuality:
      block.fingerPrintQuality != null ? Number(block.fingerPrintQuality) : undefined,
  };
}

/** Baja huellas. Postman + HikGateway 5.11.3 — mode byEmployeeNo. */
export async function deleteFingerPrint(
  client: HikvisionIsapiClient,
  employeeNo: string,
  fingerPrintIDs?: number[],
): Promise<void> {
  const no = String(employeeNo).trim();
  if (!no) throw new Error('employeeNo vacío');
  const ids = (fingerPrintIDs || [])
    .map((n) => Math.min(10, Math.max(1, Math.floor(Number(n)) || 0)))
    .filter((n) => n >= 1);
  await client.putJson('/ISAPI/AccessControl/FingerPrint/Delete?format=json', {
    FingerPrintDelete: {
      mode: 'byEmployeeNo',
      EmployeeNoDetail: {
        employeeNo: no,
        ...(ids.length ? { fingerPrintID: ids } : {}),
      },
    },
  });
}
