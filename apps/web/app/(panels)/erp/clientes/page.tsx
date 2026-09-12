"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import {
  canSeeClientesModule,
  CLIENT_SECTOR_META,
  clientSectorsForEmail,
  slugFromSector,
} from "@/lib/client-sectors";

export default function ClientesHubPage() {
  const { user } = useUser();
  const router = useRouter();
  const sectors = useMemo(() => clientSectorsForEmail(user?.email), [user?.email]);
  const allowed = canSeeClientesModule(user?.email);

  if (!allowed) {
    return (
      <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
        No tienes acceso al módulo de clientes.
      </p>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Clientes</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
            Elige el padrón según el tipo de actividad. Un mismo cliente puede vivir en varios sectores.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/erp/clientes/nuevo")}
          style={{
            border: "none",
            background: "var(--primary)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            padding: "10px 14px",
            borderRadius: 12,
            cursor: "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          + Nuevo cliente
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {sectors.map((sector) => {
          const meta = CLIENT_SECTOR_META[sector];
          return (
            <Link
              key={sector}
              href={`/erp/clientes/${slugFromSector(sector)}`}
              style={{
                textDecoration: "none",
                color: "inherit",
                padding: 16,
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                minHeight: 140,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ fontSize: 26 }}>{meta.emoji}</div>
              <div style={{ marginTop: 10, fontWeight: 800, fontSize: 15 }}>{meta.title}</div>
              <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                {meta.help}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
