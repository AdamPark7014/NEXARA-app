"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { buildApiUrl } from "@/lib/api-base";

const CATEGORIES = [
  { id: "IT", label: "💻 IT / Equipo", description: "Computadora, monitor, periféricos, red, impresora" },
  { id: "ACCESS", label: "🔑 Accesos", description: "Permisos, contraseñas, sistemas, VPN" },
  { id: "SOFTWARE", label: "🧩 Software", description: "Instalaciones, errores, licencias" },
  { id: "HR", label: "👤 RRHH", description: "Asistencia, vacaciones, prestaciones" },
  { id: "FACILITIES", label: "🏢 Instalaciones", description: "Oficina, aire, mantenimiento, suministros" },
  { id: "OTHER", label: "❓ Otro", description: "Cualquier otra solicitud interna" },
];

const PRIORITIES = [
  { id: "Baja", label: "🟢 Baja", description: "No afecta operación" },
  { id: "Media", label: "🟡 Media", description: "Afecta productividad" },
  { id: "Alta", label: "🔴 Alta", description: "Bloqueante crítico" },
];

export default function NewSupportTicket() {
  const { user } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    category: "IT",
    prioridad: "Media",
  });
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    if (!form.titulo || !form.descripcion) {
      setMsg("Título y descripción son obligatorios");
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      // Crea como Activity con ticketType derivado de la categoría
      const res = await fetch(buildApiUrl("activities"), {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: `[Helpdesk · ${form.category}] ${form.titulo}`,
          descripcion: form.descripcion,
          prioridad: form.prioridad,
          ticketType: "CORRECTIVO",
          fechaAsignacion: new Date().toISOString(),
          responsableId: user?.id,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("✅ Ticket levantado. El equipo Helpdesk te contactará pronto.");
      setForm({ titulo: "", descripcion: "", category: "IT", prioridad: "Media" });
      setTimeout(() => router.push("/support/my-tickets"), 1500);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>📝 Nuevo ticket interno</h1>
      <p style={{ color: "var(--text-secondary)", margin: 0 }}>
        Describe tu solicitud con detalle. Mientras más contexto incluyas, más rápido se resuelve.
      </p>

      {msg && (
        <div style={{
          marginTop: 12,
          padding: 10,
          background: msg.startsWith("✅") ? "#dcfce7" : "#fee2e2",
          color: msg.startsWith("✅") ? "#166534" : "#7f1d1d",
          borderRadius: 8,
        }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Field label="Título del ticket *">
          <input style={inputStyle} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. No tengo acceso al CRM" />
        </Field>

        <Field label="Categoría *">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginTop: 4 }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setForm({ ...form, category: c.id })}
                style={{
                  padding: 10,
                  border: form.category === c.id ? "2px solid #dc2626" : "1px solid var(--border)",
                  background: form.category === c.id ? "#fee2e2" : "var(--bg-primary)",
                  borderRadius: 8,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{c.description}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Prioridad *">
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            {PRIORITIES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setForm({ ...form, prioridad: p.id })}
                style={{
                  flex: 1,
                  padding: 8,
                  border: form.prioridad === p.id ? "2px solid #dc2626" : "1px solid var(--border)",
                  background: form.prioridad === p.id ? "#fee2e2" : "var(--bg-primary)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{p.description}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Descripción detallada *">
          <textarea
            style={{ ...inputStyle, minHeight: 140 }}
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="¿Qué intentas hacer? ¿Qué error ves? ¿Desde cuándo ocurre? Incluye capturas o pasos."
          />
        </Field>

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          style={{
            marginTop: 16,
            width: "100%",
            padding: 12,
            background: "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Enviando…" : "🚀 Enviar ticket"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)", marginTop: 12 }}>
      {label}
      {children}
    </label>
  );
}
const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: 10, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)", marginTop: 4 };
