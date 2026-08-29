import { buildApiUrl } from "@/lib/api-base";

export async function integraApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body?.message === "string"
        ? body.message
        : body?.message?.message || body?.detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const btnPrimary: React.CSSProperties = {
  border: "none",
  background: "var(--accent, #1d4ed8)",
  color: "#fff",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
};

export const btnGhost: React.CSSProperties = {
  border: "1px solid var(--border, #e2e8f0)",
  background: "transparent",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

export const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border, #e2e8f0)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 13,
  width: "100%",
  maxWidth: 280,
};
