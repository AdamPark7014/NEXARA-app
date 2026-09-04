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
  orgName?: string;
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
  extras?: { sourceIp?: string },
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
    orgName: userType,
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
    faceUrl,
    hasFace: Boolean(faceUrl) || (numOfFace != null && numOfFace > 0),
    sourceIp: extras?.sourceIp,
  };
}

/** Reconstruye el DTO desde la fila espejo (`raw` + columnas). */
export function mapMirrorPersonToDto(row: {
  personId: string;
  personName: string;
  personCode: string | null;
  orgIndexCode: string | null;
  orgName: string | null;
  raw: unknown;
}): IntegraPersonDto {
  const raw = (row.raw && typeof row.raw === 'object' ? row.raw : {}) as IsapiUserInfo & {
    sourceIp?: string;
  };
  const fromRaw = mapIsapiUserToPersonDto(
    {
      ...raw,
      employeeNo: row.personId,
      name: row.personName || raw.name || row.personId,
    },
    { sourceIp: raw.sourceIp },
  );
  return {
    ...fromRaw,
    code: row.personCode || fromRaw.code,
    orgId: row.orgIndexCode || undefined,
    orgName: row.orgName || fromRaw.orgName,
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
