"use client";

import React, { useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import BranchesForm, { Branch } from "@/components/BranchesForm";
import { usePortalSession } from "@/components/portal/PortalShell";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import styles from "../tickets.module.css";

type ClientProfile = {
  id: number;
  name: string;
  logoUrl?: string | null;
  contactName?: string | null;
  branches?: Branch[];
};

export default function MyBranchesPage() {
  const { token, client } = usePortalSession();
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [profile, setProfile] = useState<ClientProfile | null>(null);

  const fetchProfile = async (authToken: string) => {
    try {
      const res = await fetch(buildApiUrl("client-portal/profile"), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        setError(`No se pudo cargar el perfil (error ${res.status}).`);
        return;
      }
      const data = (await res.json().catch(() => null)) as ClientProfile | null;
      if (data) {
        setProfile(data);
        setBranches(Array.isArray(data.branches) ? data.branches : []);
        setError(null);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      setError("Error de red al cargar sucursales.");
    }
  };

  useEffect(() => {
    if (token) void fetchProfile(token);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const socket: Socket = createRealtimeSocket(getSocketBaseUrl(), { transports: ["polling", "websocket"] });
    socket.on("entity:updated", (payload: { model?: string }) => {
      if (payload?.model === "ServiceClientBranch" || payload?.model === "ServiceClient") {
        void fetchProfile(token);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, [token]);

  if (!token || !client) return null;

  return (
    <div className={styles.sectionStack} style={{ gap: 24 }}>
      <div className={`card ${styles.gradientHeader}`}>
        <div className={styles.headerSplit}>
          <div>
            <h1 style={{ margin: "0 0 4px 0", fontSize: 28, fontWeight: 700, color: "var(--primary)" }}>
              Mis sucursales
            </h1>
            <p className={styles.mutedText} style={{ margin: 0, fontSize: 13 }}>
              Administra todas las sucursales de tu empresa en una vista centralizada
            </p>
          </div>
          {profile && (
            <div className={styles.companyBox}>
              <div className={styles.mutedText}>Empresa</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{profile.name}</div>
              <div className={styles.mutedText}>Contacto: {profile.contactName || "—"}</div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: "rgba(255, 76, 76, 0.1)",
            border: "1px solid rgba(255, 76, 76, 0.3)",
            borderRadius: 8,
            color: "var(--error)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <BranchesForm
        token={token}
        branches={branches}
        onBranchSaved={() => fetchProfile(token)}
        clientLogoUrl={profile?.logoUrl}
        companyLogoUrl={client.client.logoUrl}
      />

      {branches.length > 0 && (
        <div
          className="card"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}
        >
          <div
            style={{
              padding: 12,
              background: "var(--surface)",
              borderRadius: 8,
              border: "1px solid rgba(76, 175, 80, 0.2)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Sucursales activas</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#4caf50" }}>
              {branches.filter((b) => b.isActive !== false).length}
            </div>
          </div>
          <div
            style={{
              padding: 12,
              background: "var(--surface)",
              borderRadius: 8,
              border: "1px solid rgba(255, 76, 76, 0.2)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Sucursales inactivas</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#ff4c4c" }}>
              {branches.filter((b) => b.isActive === false).length}
            </div>
          </div>
          <div
            style={{
              padding: 12,
              background: "var(--surface)",
              borderRadius: 8,
              border: "1px solid rgba(31,137,252, 0.2)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Total de sucursales</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--primary)" }}>{branches.length}</div>
          </div>
        </div>
      )}
    </div>
  );
}
