"use client";
import React, { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import PanelLogin from "@/components/PanelLogin";
import BranchesForm, { Branch } from "../../../../components/BranchesForm";
import consoleStyles from "../../console/console.module.css";

type ClientSession = {
  token: string;
  client: { id: number; name: string; logoUrl?: string | null };
};

type ClientProfile = {
  id: number;
  name: string;
  logoUrl?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

export default function MyBranchesPage() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
  const getSocketBaseUrl = () => API_URL.replace(/\/+api\/?$/, "");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("clientSession") : null;
    if (saved) {
      setSession(JSON.parse(saved));
    }
  }, []);

  const fetchProfile = async (token: string) => {
    const res = await fetch(buildApiUrl("client-portal/profile"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => null);
    if (data) {
      setProfile(data);
      setBranches(Array.isArray(data.branches) ? data.branches : []);
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchProfile(session.token);
    }
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return undefined;
    const socketUrl = getSocketBaseUrl();
    const socket: Socket = io(socketUrl, { transports: ["websocket"] });
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "ServiceClientBranch" || payload?.model === "ServiceClient") {
        fetchProfile(session.token);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [session?.token]);

  const handleClientLogin = (data: { access_token: string; client: { id: number; name: string; logoUrl?: string | null } }) => {
    const nextSession = { token: data.access_token, client: data.client };
    window.sessionStorage.setItem("clientSession", JSON.stringify(nextSession));
    setSession(nextSession);
    setError(null);
  };

  const handleBranchLogin = (data: { access_token: string; branch: any }) => {
    const slug = data.branch.branchNumber || `branch-${data.branch.id}`;
    window.location.replace(`/${slug}`);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem("clientSession");
    setSession(null);
    setProfile(null);
    setBranches([]);
  };

  if (!session) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            className="button-primary"
            type="button"
            onClick={() => {}}
            style={{ opacity: 0.5, cursor: "default" }}
            disabled
          >
            Cliente
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={() => {}}
            style={{ opacity: 0.5, cursor: "default" }}
            disabled
          >
            Sucursal
          </button>
        </div>
        <PanelLogin
          mode="client"
          redirectTo="/mis-sucursales"
          onClientLogin={handleClientLogin}
          title="Mis sucursales"
          subtitle="Gestiona las sucursales de tu empresa"
        />
      </div>
    );
  }

  return (
    <div className={consoleStyles.consolePage}>
      <div className={consoleStyles.consoleHeader}>
        <div className={consoleStyles.headerContent}>
          <div>
            <div className={consoleStyles.brandMain} title="Portal del cliente">
              Mis sucursales
            </div>
            <span className={consoleStyles.brandSub}>Gestión de sucursales</span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginLeft: "auto",
            }}
          >
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {session.client.name}
              </div>
              <button
                onClick={handleLogout}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Cerrar sesión
              </button>
            </div>
            {session.client.logoUrl && (
              <img
                src={(process.env.NEXT_PUBLIC_API_URL?.replace(/[\/.]+api\/?$/, "") || "") + session.client.logoUrl}
                alt="Logo"
                style={{
                  height: 40,
                  width: 40,
                  borderRadius: 8,
                  objectFit: "cover",
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "24px",
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {error && (
          <div
            style={{
              padding: 12,
              background: "rgba(255, 76, 76, 0.1)",
              border: "1px solid rgba(255, 76, 76, 0.3)",
              borderRadius: 8,
              color: "var(--error)",
              fontSize: 13,
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        <BranchesForm
          token={session.token}
          branches={branches}
          onBranchSaved={() => fetchProfile(session.token)}
          clientLogoUrl={profile?.logoUrl}
          companyLogoUrl={session.client.logoUrl}
          apiUrl={API_URL}
        />
      </div>
    </div>
  );
}
