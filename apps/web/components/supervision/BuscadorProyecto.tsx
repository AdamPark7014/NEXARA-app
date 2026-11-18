"use client";

import { useEffect, useMemo, useState } from "react";
import { listOperationalProjects, type OperationalProject } from "@/lib/ops-operational-api";

type Props = {
  token: string;
  valueNombre: string;
  valueId: number | null;
  onPick: (id: number | null, nombre: string) => void;
};

export default function BuscadorProyecto({ token, valueNombre, valueId, onPick }: Props) {
  const [q, setQ] = useState(valueNombre);
  const [all, setAll] = useState<OperationalProject[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQ(valueNombre);
  }, [valueNombre]);

  useEffect(() => {
    setAll([]);
    setLoaded(false);
  }, [token]);

  useEffect(() => {
    if (!token || loaded) return;
    let vigente = true;
    setError(null);
    void listOperationalProjects(token)
      .then((rows) => {
        if (!vigente) return;
        setAll(Array.isArray(rows) ? rows : []);
        setLoaded(true);
      })
      .catch(() => { if (vigente) { setLoaded(true); setError('No se pudieron cargar los proyectos.'); } });
    return () => { vigente = false; };
  }, [token, loaded]);

  const ops = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (texto.length < 1) return all.slice(0, 12);
    return all
      .filter((p) => p.title.toLowerCase().includes(texto) || String(p.id).includes(texto))
      .slice(0, 12);
  }, [all, q]);

  return (
    <div style={{ position: "relative", minWidth: 140 }}>
      <input
        value={q}
        placeholder="Proyecto existente"
        aria-label="Buscar proyecto"
        style={{ minHeight: 40, fontSize: 16, width: "100%", boxSizing: "border-box" }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          onPick(null, e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && !loaded ? <p role="status">Cargando proyectos…</p> : null}
      {open && error ? <p role="alert">{error} <button type="button" onClick={() => setLoaded(false)}>Reintentar</button></p> : null}
      {open && loaded && !error && ops.length === 0 ? <p>No hay proyectos que coincidan.</p> : null}
      {open && ops.length > 0 ? (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 20,
            left: 0,
            right: 0,
            margin: 0,
            padding: 0,
            listStyle: "none",
            background: "var(--ui-elev-1)",
            border: "1px solid var(--ui-border)",
            borderRadius: 8,
            maxHeight: 180,
            overflow: "auto",
          }}
        >
          {ops.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 14,
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p.id, p.title);
                  setQ(p.title);
                  setOpen(false);
                }}
              >
                {p.title}
                <span style={{ display: "block", fontSize: 12, color: "var(--ui-fg-2)" }}>
                  #{p.id}
                  {p.client?.name ? ` · ${p.client.name}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
