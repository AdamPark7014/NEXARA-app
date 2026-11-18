"use client";

import { useEffect, useRef, useState } from "react";
import { buscarClientesParecidos, type ClienteParecido } from "@/lib/sales-api";

type Props = {
  token: string;
  valueNombre: string;
  valueId: number | null;
  onPick: (id: number | null, nombre: string) => void;
};

/** Solo catálogo existente (soloCodigo); nunca crea cliente. */
export default function BuscadorCliente({ token, valueNombre, valueId, onPick }: Props) {
  const [q, setQ] = useState(valueNombre);
  const [ops, setOps] = useState<ClienteParecido[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQ(valueNombre);
  }, [valueNombre]);

  useEffect(() => {
    let vigente = true;
    setError(null);
    setLoading(false);
    setOps([]);
    if (tRef.current) clearTimeout(tRef.current);
    const texto = q.trim();
    if (texto.length < 2) {
      setOps([]);
      return;
    }
    tRef.current = setTimeout(() => {
      setLoading(true);
      void buscarClientesParecidos(token, { nombre: texto, soloCodigo: true })
        .then((rows) => { if (vigente) setOps(rows.filter((r) => r.puedeUsar)); })
        .catch(() => { if (vigente) { setOps([]); setError('No se pudo buscar. Cambia el texto para reintentar.'); } })
        .finally(() => { if (vigente) setLoading(false); });
    }, 250);
    return () => {
      vigente = false;
      if (tRef.current) clearTimeout(tRef.current);
    };
  }, [q, token]);

  return (
    <div style={{ position: "relative", minWidth: 140 }}>
      <input
        value={q}
        placeholder="Cliente del catálogo"
        aria-label="Buscar cliente"
        style={{ minHeight: 40, fontSize: 16, width: "100%", boxSizing: "border-box" }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          onPick(null, e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && loading ? <p role="status">Buscando clientes…</p> : null}
      {open && error ? <p role="alert">{error}</p> : null}
      {open && q.trim().length >= 2 && !loading && !error && ops.length === 0 ? <p>No hay clientes que coincidan. Prueba otro nombre.</p> : null}
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
          {ops.map((o) => (
            <li key={o.id}>
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
                  const id = o.serviceClientId ?? o.id;
                  onPick(id, o.nombre);
                  setQ(o.nombre);
                  setOpen(false);
                }}
              >
                {o.nombre}
                <span style={{ display: "block", fontSize: 12, color: "var(--ui-fg-2)" }}>{o.porque}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
