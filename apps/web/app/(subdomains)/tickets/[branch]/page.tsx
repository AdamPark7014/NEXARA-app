"use client";
import React, { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import PanelLogin from "@/components/PanelLogin";
import ClientLocationPicker, { ClientLocationValue } from "@/components/ClientLocationPicker";
import consoleStyles from "../../console/console.module.css";

type BranchSession = {
  token: string;
  branch: { id: number; name: string; branchNumber?: string | null; clientId: number; clientName?: string | null };
};

type BranchProfile = {
  id: number;
  name: string;
  branchNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  placeId?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  client?: { name?: string | null } | null;
};

type BranchRequest = {
  id: number;
  description: string;
  urgency: string;
  status: string;
  dueAt?: string | null;
  evidenceUrls?: string[];
};

export default function BranchTicketsPage() {
  const [session, setSession] = useState<BranchSession | null>(null);
  const [profile, setProfile] = useState<BranchProfile | null>(null);
  const [requests, setRequests] = useState<BranchRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<{ file: File; url: string; kind: "image" | "pdf" }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draft, setDraft] = useState({
    description: "",
    urgency: "Media",
    dueAt: "",
    placeId: "",
    latitud: null as number | null,
    longitud: null as number | null,
    address: "",
  });
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const branchSlug = Array.isArray(params?.branch) ? params.branch[0] : (params?.branch as string | undefined);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
  const getAssetUrl = (url?: string | null) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = API_URL.replace(/\/+api\/?$/, "");
    return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("branchSession") : null;
    if (saved) setSession(JSON.parse(saved));
  }, []);

  useEffect(() => () => {
    files.forEach((entry) => URL.revokeObjectURL(entry.url));
  }, [files]);

  const fetchProfile = async (token: string) => {
    const res = await fetch(buildApiUrl("branch-portal/profile"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    if (data) {
      setProfile(data);
      setDraft((prev) => ({
        ...prev,
        address: data.address || prev.address,
        placeId: data.placeId || prev.placeId,
        latitud: data.latitud ?? prev.latitud,
        longitud: data.longitud ?? prev.longitud,
      }));
    }
  };

  const fetchRequests = async (token: string) => {
    const res = await fetch(buildApiUrl("branch-portal/requests"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => []);
    setRequests(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (!session?.token) return;
    fetchProfile(session.token);
    fetchRequests(session.token);
  }, [session?.token]);

  useEffect(() => {
    if (!session?.branch) return;
    const expectedSlug = session.branch.branchNumber || `branch-${session.branch.id}`;
    if (branchSlug && branchSlug !== expectedSlug) {
      router.replace(`/${expectedSlug}`);
    }
  }, [branchSlug, router, session?.branch]);

  const handleBranchLogin = (data: { access_token: string; branch: BranchSession["branch"] }) => {
    const next = { token: data.access_token, branch: data.branch };
    window.sessionStorage.setItem("branchSession", JSON.stringify(next));
    setSession(next);
    setError(null);
    const expectedSlug = data.branch.branchNumber || `branch-${data.branch.id}`;
    router.replace(`/${expectedSlug}`);
  };

  const isSupportedFile = (file: File) => file.type.startsWith("image/") || file.type === "application/pdf";

  const handleFileSelect = (selected?: File[] | null) => {
    if (!selected || selected.length === 0) return;
    const next = selected.filter(isSupportedFile).map((file) => ({
      file,
      url: URL.createObjectURL(file),
      kind: (file.type === "application/pdf" ? "pdf" : "image") as "pdf" | "image",
    }));
    if (!next.length) return;
    setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const entry = prev[index];
      if (entry) URL.revokeObjectURL(entry.url);
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleSubmit = async () => {
    if (!session?.token) return;
    if (!draft.description.trim()) {
      setError("Describe el problema para levantar el ticket");
      return;
    }
    setLoading(true);
    setError(null);

    const formData = new FormData();
    files.forEach((entry) => formData.append("files", entry.file));
    formData.append("description", draft.description);
    formData.append("urgency", draft.urgency);
    if (draft.dueAt) formData.append("dueAt", draft.dueAt);
    if (draft.placeId) formData.append("placeId", draft.placeId);
    if (draft.latitud) formData.append("latitud", String(draft.latitud));
    if (draft.longitud) formData.append("longitud", String(draft.longitud));

    const res = await fetch(buildApiUrl("branch-portal/requests"), {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
      body: formData,
    });

    if (!res.ok) {
      setError("No se pudo levantar el ticket");
      setLoading(false);
      return;
    }

    files.forEach((entry) => URL.revokeObjectURL(entry.url));
    setFiles([]);
    setDraft((prev) => ({ ...prev, description: "", urgency: "Media", dueAt: "" }));
    await fetchRequests(session.token);
    setLoading(false);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem("branchSession");
    setSession(null);
  };

  if (!session) {
    return (
      <PanelLogin
        mode="branch"
        redirectTo={pathname || "/panel/tickets"}
        onBranchLogin={handleBranchLogin}
        title="Portal de sucursal"
        subtitle="Acceso para levantar tickets de tu tienda"
      />
    );
  }

  return (
    <div className={consoleStyles.consoleLayout}>
      <aside className={consoleStyles.sidebar}>
        <div className={consoleStyles.sidebarLogo}>
          <span className={consoleStyles.brandMark}>NEXARA</span>
          <span className={consoleStyles.brandSub}>Sucursal</span>
        </div>
        <div className={consoleStyles.sidebarUser}>
          <div className={consoleStyles.sidebarAvatar}>
            <span className={consoleStyles.sidebarName}>{(profile?.name || session.branch.name).slice(0, 2).toUpperCase()}</span>
          </div>
          <div className={consoleStyles.sidebarName}>{profile?.name || session.branch.name}</div>
          <div className={consoleStyles.sidebarEmail}>{profile?.client?.name || session.branch.clientName || "Cliente"}</div>
          <div className={consoleStyles.sidebarMeta}>
            <span className={consoleStyles.rolePill}>Sucursal</span>
          </div>
        </div>
        <div className={consoleStyles.menuTitle}>Menu sucursal</div>
        <ul className={consoleStyles.sidebarMenu}>
          <li className={consoleStyles.sidebarMenuItem}>
            <button
              type="button"
              className={`${consoleStyles.menuLink} ${consoleStyles.menuButton} ${consoleStyles.active}`}
            >
              Levantar ticket
            </button>
          </li>
          <li className={consoleStyles.sidebarMenuItem}>
            <button type="button" className={`${consoleStyles.menuLink} ${consoleStyles.menuButton}`} onClick={handleLogout}>
              Cerrar sesion
            </button>
          </li>
        </ul>
      </aside>
      <main className={consoleStyles.consoleMain}>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Levantar ticket</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Sucursal: {profile?.name || session.branch.name} {profile?.branchNumber ? `(${profile.branchNumber})` : ""}
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder="Descripcion del problema"
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Urgencia</label>
                <select className="input" value={draft.urgency} onChange={(e) => setDraft((prev) => ({ ...prev, urgency: e.target.value }))}>
                  <option value="Baja">Baja</option>
                  <option value="Media">Media</option>
                  <option value="Alta">Alta</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Fecha limite</label>
                <input className="input" type="date" value={draft.dueAt} onChange={(e) => setDraft((prev) => ({ ...prev, dueAt: e.target.value }))} />
              </div>
            </div>
            <ClientLocationPicker
              label="Ubicacion del ticket"
              value={{
                address: draft.address,
                placeId: draft.placeId,
                latitud: draft.latitud,
                longitud: draft.longitud,
              }}
              onChange={(value: ClientLocationValue) =>
                setDraft((prev) => ({
                  ...prev,
                  address: value.address || prev.address,
                  placeId: value.placeId || prev.placeId,
                  latitud: value.latitud ?? prev.latitud,
                  longitud: value.longitud ?? prev.longitud,
                }))
              }
            />
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                handleFileSelect(Array.from(event.dataTransfer.files || []));
              }}
              style={{
                border: `2px dashed ${isDragging ? "var(--primary)" : "var(--muted)"}`,
                background: isDragging ? "rgba(15, 106, 214, 0.08)" : "var(--surface-light)",
                borderRadius: 12,
                padding: 16,
                textAlign: "center",
              }}
            >
              <input
                id="branch-evidence-file"
                className="input"
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => handleFileSelect(Array.from(e.target.files || []))}
                style={{ display: "none" }}
              />
              <div style={{ color: "var(--text-secondary)", marginBottom: 8 }}>
                Arrastra tus archivos aqui o
              </div>
              <label htmlFor="branch-evidence-file" className="button-secondary" style={{ cursor: "pointer" }}>
                Seleccionar archivo
              </label>
              <div style={{ marginTop: 8, color: "var(--text-secondary)", fontSize: 12 }}>
                {files.length > 0 ? `${files.length} archivo(s) seleccionados` : "Ningun archivo seleccionado"}
              </div>
            </div>
            {files.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                  {files.map((entry, index) => (
                    <div key={`${entry.file.name}-${index}`} style={{ position: "relative", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden", background: "rgba(15, 106, 214, 0.08)", minHeight: entry.kind === "pdf" ? 180 : 110, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {entry.kind === "image" ? (
                        <img src={entry.url} alt={entry.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <object data={entry.url} type="application/pdf" width="100%" height="100%">
                          <embed src={entry.url} type="application/pdf" />
                          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 12, padding: 12 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>PDF</div>
                            <div style={{ wordBreak: "break-word" }}>{entry.file.name}</div>
                          </div>
                        </object>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", width: 24, height: 24, borderRadius: "50%", cursor: "pointer" }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="button-primary" type="button" onClick={handleSubmit} disabled={loading}>Levantar ticket</button>
              {error && <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>}
            </div>
          </div>

          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>Tickets enviados</div>
            {requests.length === 0 && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>No hay solicitudes aun.</div>}
            {requests.map((request) => (
              <div key={request.id} style={{ display: "grid", gap: 6, padding: 12, borderRadius: 12, border: "1px solid rgba(15, 106, 214, 0.15)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong>Ticket #{request.id}</strong>
                  <span className="badge">{request.status}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{request.description}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Urgencia: {request.urgency}</div>
                {Array.isArray(request.evidenceUrls) && request.evidenceUrls.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                    {request.evidenceUrls.map((url, idx) => (
                      <div key={`${request.id}-${idx}`} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(15, 106, 214, 0.08)" }}>
                        {url.toLowerCase().endsWith(".pdf") ? (
                          <object data={getAssetUrl(url)} type="application/pdf" width="100%" height="120">
                            <embed src={getAssetUrl(url)} type="application/pdf" />
                          </object>
                        ) : (
                          <img src={getAssetUrl(url)} alt="evidencia" style={{ width: "100%", height: 120, objectFit: "cover" }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
