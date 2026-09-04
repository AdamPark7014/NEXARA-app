import { randomUUID } from 'node:crypto';
import type { HikvisionIsapiClient } from './isapi.client';

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
  opts: { position?: number; maxResults?: number; searchID?: string } = {},
): Promise<UserInfoPage> {
  const maxResults = Math.min(Math.max(1, opts.maxResults ?? 30), 30);
  const position = Math.max(0, opts.position ?? 0);
  const body = {
    UserInfoSearchCond: {
      searchID: opts.searchID || randomUUID(),
      searchResultPosition: position,
      maxResults,
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
