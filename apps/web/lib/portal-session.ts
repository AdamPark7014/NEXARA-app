export type ClientPortalSession = {
  token: string;
  client: { id: number; name: string; logoUrl?: string | null };
};

export type BranchPortalSession = {
  token: string;
  branch: {
    id: number;
    name: string;
    branchNumber?: string | null;
    clientId: number;
    clientName?: string | null;
    logoUrl?: string | null;
  };
};

const CLIENT_KEY = "clientSession";
const BRANCH_KEY = "branchSession";
export const PORTAL_SESSION_CHANGED = "nexara-portal-session-changed";

const STATIC_TICKETS_SEGMENTS = new Set(["mis-sucursales", "mis-servicios", "ayuda"]);

export function readClientSession(): ClientPortalSession | null {
  if (typeof window === "undefined") return null;
  const saved = window.sessionStorage.getItem(CLIENT_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as ClientPortalSession;
  } catch {
    window.sessionStorage.removeItem(CLIENT_KEY);
    return null;
  }
}

export function readBranchSession(): BranchPortalSession | null {
  if (typeof window === "undefined") return null;
  const saved = window.sessionStorage.getItem(BRANCH_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as BranchPortalSession;
  } catch {
    window.sessionStorage.removeItem(BRANCH_KEY);
    return null;
  }
}

export function readPortalToken(): string | null {
  const client = readClientSession();
  if (client?.token) return client.token;
  const branch = readBranchSession();
  return branch?.token ?? null;
}

export function writeClientSession(session: ClientPortalSession) {
  window.sessionStorage.setItem(CLIENT_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(PORTAL_SESSION_CHANGED));
}

export function writeBranchSession(session: BranchPortalSession) {
  window.sessionStorage.setItem(BRANCH_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(PORTAL_SESSION_CHANGED));
}

export function clearPortalSessions() {
  window.sessionStorage.removeItem(CLIENT_KEY);
  window.sessionStorage.removeItem(BRANCH_KEY);
  window.dispatchEvent(new Event(PORTAL_SESSION_CHANGED));
}

export function isBranchPortalRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "");
  const match = normalized.match(/\/tickets\/([^/]+)$/);
  if (!match) return false;
  return !STATIC_TICKETS_SEGMENTS.has(match[1]);
}

export function usesClientPortalShell(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, "") || "/tickets";
  if (normalized === "/tickets") return true;
  return (
    normalized.endsWith("/mis-sucursales") ||
    normalized.endsWith("/mis-servicios") ||
    normalized.endsWith("/ayuda")
  );
}

/** @deprecated use usesClientPortalShell */
export function portalShellRoutes(pathname: string): boolean {
  return usesClientPortalShell(pathname);
}
