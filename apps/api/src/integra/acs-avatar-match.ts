/**
 * Emparejamiento puro usuario ERP ↔ persona ACS para importar el avatar.
 *
 * Nadie tiene `User.avatarUrl`, pero los terminales Hikvision guardan la cara
 * enrolada de cada empleado. Los nombres NO coinciden letra a letra: acentos
 * ("Josue" / "Josué"), mayúsculas ("Ivan camargo"), dobles espacios, nombres
 * incompletos ("Luis Aguilar" frente a "Luis Joel Aguilar Castillo") y erratas
 * ("Cervantez"). Aquí no hay E/S: entra una lista de usuarios y otra de
 * personas, sale quién es quién y por qué.
 *
 * Reglas, en orden:
 *  1. Si el usuario ya está vinculado (`employeeNumber` == `personId` /
 *     `personCode`, misma clave que `IdentityLinkService`), ese vínculo gana y
 *     el nombre ni se mira.
 *  2. Por nombre: el primer nombre tiene que coincidir (se tolera 1 letra de
 *     diferencia) Y al menos un apellido tiene que coincidir. Si el nombre solo
 *     coincide de forma aproximada ("Daniel" / "Daniela") el apellido tiene que
 *     ser exacto.
 *  3. Excepción: un registro ACS sin apellidos cuyo nombre completo está
 *     contenido palabra a palabra en el del usuario ("Joan Sebastián" dentro de
 *     "Joan Sebastián Sánchez Espinoza").
 *  4. Varios candidatos para un usuario (el duplicado "Ivan camargo" / "Ivan
 *     Camargo"): gana el que tiene foto; luego el sincronizado más reciente;
 *     luego la mejor puntuación. Empate total → `ambiguous`.
 *  5. Una misma persona ACS reclamada por dos usuarios: se la queda la
 *     puntuación estrictamente mayor; si empatan, ambos van a `ambiguous`.
 */

import { acsIdentityKeys, erpIdentityKeys } from '../attendance/attendance-hybrid.match';

export type AvatarMatchUser = {
  id: number;
  nombre: string;
  employeeNumber?: string | null;
  companyEmployeeNumber?: string | null;
};

export type AvatarMatchPerson = {
  personId: string;
  personName: string;
  personCode?: string | null;
  siteId: number;
  syncedAt?: Date | string | null;
  /** JPEG local en uploads o `faceUrl` anunciada por el terminal. */
  hasFace?: boolean;
};

export type AvatarMatchCandidate = {
  personId: string;
  personName: string;
  siteId: number;
  score: number;
  reason: string;
  hasFace: boolean;
  syncedAt: string | null;
};

export type AvatarMatched = {
  userId: number;
  userName: string;
  personId: string;
  personName: string;
  siteId: number;
  /** 1 = vínculo de identidad; 0–0.99 = por nombre. */
  score: number;
  reason: string;
  hasFace: boolean;
  /** Cuántos registros ACS eran candidatos antes de desempatar. */
  candidates: number;
};

export type AvatarAmbiguous = {
  userId: number;
  userName: string;
  reason: string;
  candidates: AvatarMatchCandidate[];
};

export type AvatarUnmatchedUser = { userId: number; userName: string };

export type AvatarMatchResult = {
  matched: AvatarMatched[];
  ambiguous: AvatarAmbiguous[];
  unmatchedUsers: AvatarUnmatchedUser[];
};

/** Partículas que no distinguen a nadie: "Del Pozo" y "Pozo" son el mismo apellido. */
export const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

/** "Alejandro González  Bustamante" → "alejandro gonzalez bustamante". */
export function normalizePersonName(raw?: string | null): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function personNameTokens(raw?: string | null): string[] {
  const norm = normalizePersonName(raw);
  if (!norm) return [];
  return norm.split(' ').filter((t) => t && !NAME_PARTICLES.has(t));
}

/** Levenshtein con corte: devuelve `max + 1` en cuanto se pasa. */
export function boundedLevenshtein(a: string, b: string, max = 1): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export type TokenHit = 'exact' | 'fuzzy' | null;

/** Exacto, o 1 letra de diferencia si ambas palabras tienen 4+ letras. */
export function compareNameTokens(a: string, b: string): TokenHit {
  if (!a || !b) return null;
  if (a === b) return 'exact';
  if (a.length >= 4 && b.length >= 4 && boundedLevenshtein(a, b, 1) <= 1) return 'fuzzy';
  return null;
}

/**
 * Nombres vs apellidos de un nombre ERP ya tokenizado.
 * 2 → [n][a] · 3 → [n][a a] · 4+ → [n… ][a a] (los dos últimos son apellidos).
 */
function surnameStart(tokenCount: number): number {
  if (tokenCount <= 1) return tokenCount;
  if (tokenCount <= 3) return 1;
  return tokenCount - 2;
}

const HIT_WEIGHT = { exact: 1, fuzzy: 0.75 } as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Puntúa un par por nombre. `null` = no son la misma persona según las reglas.
 */
export function scoreNamePair(
  userName: string,
  personName: string,
): { score: number; reason: string } | null {
  const u = personNameTokens(userName);
  const p = personNameTokens(personName);
  // Un solo token en ACS ("Adam") es demasiado poco para poner una cara.
  if (u.length < 2 || p.length < 2) return null;

  const givenHit = compareNameTokens(p[0], u[0]);
  if (!givenHit) return null;

  const sStart = surnameStart(u.length);
  const used = new Set<number>([0]);
  let weight = HIT_WEIGHT[givenHit];
  let surnameExact = 0;
  let surnameFuzzy = 0;
  let givenExtraExact = 0;
  let givenExtraFuzzy = 0;
  let unmatched = 0;

  for (const pt of p.slice(1)) {
    let bestIdx = -1;
    let bestHit: TokenHit = null;
    for (let i = 1; i < u.length; i++) {
      if (used.has(i)) continue;
      const hit = compareNameTokens(pt, u[i]);
      if (hit === 'exact') {
        bestIdx = i;
        bestHit = hit;
        break;
      }
      if (hit === 'fuzzy' && bestHit === null) {
        bestIdx = i;
        bestHit = hit;
      }
    }
    if (bestIdx < 0 || !bestHit) {
      unmatched++;
      continue;
    }
    used.add(bestIdx);
    weight += HIT_WEIGHT[bestHit];
    const isSurname = bestIdx >= sStart;
    if (isSurname && bestHit === 'exact') surnameExact++;
    else if (isSurname) surnameFuzzy++;
    else if (bestHit === 'exact') givenExtraExact++;
    else givenExtraFuzzy++;
  }

  // "Daniel" / "Daniela": el nombre aproximado solo vale con apellido exacto.
  if (givenHit === 'fuzzy' && surnameExact === 0) return null;

  const coverage = 0.6 * (weight / p.length) + 0.39 * (weight / u.length);
  const givenLabel = givenHit === 'exact' ? 'nombre' : 'nombre aproximado';

  if (surnameExact + surnameFuzzy > 0) {
    const surnameLabel =
      surnameExact > 0 ? 'apellido' : 'apellido aproximado';
    const penalty = unmatched > 0 ? 0.9 : 1;
    return {
      score: round2(Math.min(0.99, coverage * penalty)),
      reason: `${givenLabel} + ${surnameLabel}`,
    };
  }

  if (
    givenHit === 'exact' &&
    unmatched === 0 &&
    givenExtraFuzzy === 0 &&
    givenExtraExact >= 1
  ) {
    return {
      score: round2(Math.min(0.99, coverage * 0.9)),
      reason: 'nombres completos (el ACS no trae apellidos)',
    };
  }

  return null;
}

function syncedMs(v: Date | string | null | undefined): number {
  if (!v) return 0;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : 0;
}

function toIso(v: Date | string | null | undefined): string | null {
  const ms = syncedMs(v);
  return ms ? new Date(ms).toISOString() : null;
}

type Scored = AvatarMatchCandidate & { syncedMs: number };

/** <0 si `a` va antes. Foto → sincronizado más reciente → puntuación. */
function compareCandidates(a: Scored, b: Scored): number {
  if (a.hasFace !== b.hasFace) return a.hasFace ? -1 : 1;
  if (a.syncedMs !== b.syncedMs) return b.syncedMs - a.syncedMs;
  if (a.score !== b.score) return b.score - a.score;
  return 0;
}

function describeTieBreak(winner: Scored, runnerUp: Scored): string {
  if (winner.hasFace !== runnerUp.hasFace) return 'el que tiene foto';
  if (winner.syncedMs !== runnerUp.syncedMs) return 'el sincronizado más reciente';
  return 'la mejor puntuación';
}

function stripScored(c: Scored): AvatarMatchCandidate {
  const { syncedMs: _ignored, ...rest } = c;
  return rest;
}

export function matchUsersToAcsPeople(
  users: AvatarMatchUser[],
  people: AvatarMatchPerson[],
): AvatarMatchResult {
  const personKeys = people.map((p) =>
    acsIdentityKeys({ personId: p.personId, personCode: p.personCode }),
  );

  const matched: AvatarMatched[] = [];
  const ambiguous: AvatarAmbiguous[] = [];
  const unmatchedUsers: AvatarUnmatchedUser[] = [];

  for (const user of users) {
    const userName = String(user.nombre ?? '').trim();
    const erpKeys = new Set(
      erpIdentityKeys({
        employeeNumber: user.employeeNumber,
        companyEmployeeNumber: user.companyEmployeeNumber,
      }),
    );

    const toScored = (p: AvatarMatchPerson, score: number, reason: string): Scored => ({
      personId: p.personId,
      personName: p.personName,
      siteId: p.siteId,
      score,
      reason,
      hasFace: Boolean(p.hasFace),
      syncedAt: toIso(p.syncedAt),
      syncedMs: syncedMs(p.syncedAt),
    });

    let candidates: Scored[] = [];
    if (erpKeys.size) {
      people.forEach((p, idx) => {
        if (personKeys[idx].some((k) => erpKeys.has(k))) {
          candidates.push(toScored(p, 1, 'vínculo de identidad (número de empleado)'));
        }
      });
    }
    if (!candidates.length) {
      for (const p of people) {
        const s = scoreNamePair(userName, p.personName);
        if (s) candidates.push(toScored(p, s.score, s.reason));
      }
    }

    if (!candidates.length) {
      unmatchedUsers.push({ userId: user.id, userName });
      continue;
    }

    candidates.sort(compareCandidates);
    const [best, second] = candidates;
    if (
      second &&
      compareCandidates(best, second) === 0 &&
      // El mismo employeeNo en dos sitios es la misma persona, no un empate.
      best.personId !== second.personId
    ) {
      ambiguous.push({
        userId: user.id,
        userName,
        reason: `${candidates.length} candidatos empatados (foto, sincronización y puntuación)`,
        candidates: candidates.map(stripScored),
      });
      continue;
    }

    const reason = second
      ? `${best.reason} · ${candidates.length} candidatos → ${describeTieBreak(best, second)}`
      : best.reason;
    matched.push({
      userId: user.id,
      userName,
      personId: best.personId,
      personName: best.personName,
      siteId: best.siteId,
      score: best.score,
      reason,
      hasFace: best.hasFace,
      candidates: candidates.length,
    });
  }

  // Una persona ACS no puede ser la cara de dos usuarios.
  const byPerson = new Map<string, AvatarMatched[]>();
  for (const m of matched) {
    const key = m.personId.trim().toLowerCase();
    const list = byPerson.get(key) ?? [];
    list.push(m);
    byPerson.set(key, list);
  }

  const losers = new Set<AvatarMatched>();
  for (const list of byPerson.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.score - a.score);
    const topTie = sorted[0].score === sorted[1].score;
    for (const [i, m] of sorted.entries()) {
      if (i === 0 && !topTie) continue;
      losers.add(m);
      const others = list.filter((o) => o !== m).map((o) => o.userName);
      ambiguous.push({
        userId: m.userId,
        userName: m.userName,
        reason: `la persona ACS "${m.personName}" también empareja con ${others.join(', ')}`,
        candidates: [
          {
            personId: m.personId,
            personName: m.personName,
            siteId: m.siteId,
            score: m.score,
            reason: m.reason,
            hasFace: m.hasFace,
            syncedAt: null,
          },
        ],
      });
    }
  }

  const order = new Map(users.map((u, i) => [u.id, i] as const));
  ambiguous.sort((a, b) => (order.get(a.userId) ?? 0) - (order.get(b.userId) ?? 0));

  return {
    matched: matched.filter((m) => !losers.has(m)),
    ambiguous,
    unmatchedUsers,
  };
}
