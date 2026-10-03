"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { erpInputStyle, formatApiError } from "@/lib/erp-api";
import {
  NOTA_GUARDIA_MAX,
  diaCorto,
  fetchGuardias,
  finesDeSemana,
  programarGuardia,
  quitarGuardia,
  type Guardia,
  type GuardiasRango,
} from "@/lib/guardias-api";

/**
 * Guardias de fin de semana: quién trabaja cada sábado y domingo de las próximas semanas.
 *
 * Solo quien tiene guardia puede checar ese día; su entrada se registra sola al iniciar su
 * primer servicio o tarea, desde donde esté. Dirección programa a cualquiera y un encargado
 * a su gente; los demás solo ven sus propias guardias.
 */
export default function GuardiasPanel({ token }: { token: string }) {
  const [datos, setDatos] = useState<GuardiasRango | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [persona, setPersona] = useState("");
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmState | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setDatos(await fetchGuardias(token));
    } catch (e) {
      setError(formatApiError(e, "No se pudieron cargar las guardias"));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const fines = useMemo(() => (datos ? finesDeSemana(datos.desde, datos.hasta) : []), [datos]);
  const dias = useMemo(
    () => fines.flatMap((f) => [f.sabado, f.domingo]).filter((d): d is string => Boolean(d)),
    [fines],
  );
  const porDia = useMemo(() => {
    const m = new Map<string, Guardia[]>();
    for (const g of datos?.items ?? []) m.set(g.fecha, [...(m.get(g.fecha) ?? []), g]);
    return m;
  }, [datos]);

  const programar = async () => {
    if (!persona || !fecha) return;
    setGuardando(true);
    setErrorForm(null);
    try {
      await programarGuardia(token, { userId: Number(persona), fecha, nota: nota.trim() || undefined });
      setPersona("");
      setNota("");
      await cargar();
    } catch (e) {
      setErrorForm(formatApiError(e, "No se pudo programar la guardia"));
    } finally {
      setGuardando(false);
    }
  };

  const pedirQuitar = (g: Guardia) => {
    setConfirmar({
      title: "Quitar guardia",
      message: `${g.persona?.nombre ?? "Esta persona"} ya no podrá checar el ${diaCorto(g.fecha)}.`,
      confirmLabel: "Quitar",
      danger: true,
      fn: async () => {
        try {
          await quitarGuardia(token, g.id);
          await cargar();
        } catch (e) {
          setError(formatApiError(e, "No se pudo quitar la guardia"));
        }
      },
    });
  };

  if (cargando && !datos) {
    return <p style={{ margin: 0, fontSize: 13, color: "var(--text-tertiary)" }}>Cargando guardias…</p>;
  }

  if (error && !datos) {
    return (
      <InlineAlert
        variant="danger"
        message={error}
        action={
          <Button size="sm" variant="secondary" onClick={() => void cargar()}>
            Reintentar
          </Button>
        }
      />
    );
  }
  if (!datos) return null;

  const sinNada = !datos.puedeProgramar && datos.items.length === 0;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-tertiary)" }}>
        El sábado y el domingo solo checa quien tiene guardia. Su entrada se registra sola al iniciar su primer
        servicio o tarea del día, con la ubicación de ese inicio.
      </p>

      {error ? <InlineAlert variant="danger" message={error} onDismiss={() => setError(null)} /> : null}

      {datos.puedeProgramar ? (
        <section
          aria-label="Programar guardia"
          style={{ display: "grid", gap: 10, padding: 12, borderRadius: 12, border: "1px solid var(--border)" }}
        >
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5, fontWeight: 600 }}>
              Persona
              <select value={persona} onChange={(e) => setPersona(e.target.value)} style={erpInputStyle}>
                <option value="">Elige a quién</option>
                {datos.personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.puesto ? ` · ${p.puesto}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5, fontWeight: 600 }}>
              Día
              <select value={fecha} onChange={(e) => setFecha(e.target.value)} style={erpInputStyle}>
                <option value="">Sábado o domingo</option>
                {dias.map((d) => (
                  <option key={d} value={d}>
                    {diaCorto(d)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 12.5, fontWeight: 600 }}>
            Nota <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>(opcional)</span>
            <input
              value={nota}
              maxLength={NOTA_GUARDIA_MAX}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Cubre emergencias de CCTV"
              style={erpInputStyle}
            />
          </label>
          {errorForm ? <InlineAlert variant="danger" message={errorForm} /> : null}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button size="sm" variant="primary" disabled={!persona || !fecha || guardando} onClick={() => void programar()}>
              {guardando ? "Programando…" : "Programar guardia"}
            </Button>
          </div>
        </section>
      ) : null}

      {sinNada ? (
        <EmptyState
          variant="compact"
          icon={<EventAvailableOutlinedIcon />}
          title="No tienes guardias programadas"
          description="Si te toca trabajar un fin de semana, tu encargado te programa aquí."
        />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {fines.map((f) => (
            <section
              key={f.sabado ?? f.domingo}
              aria-label={`Fin de semana del ${diaCorto((f.sabado ?? f.domingo) as string)}`}
              style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
            >
              {[f.sabado, f.domingo]
                .filter((d): d is string => Boolean(d))
                .map((d) => {
                  const lista = porDia.get(d) ?? [];
                  return (
                    <div
                      key={d}
                      style={{
                        display: "grid",
                        gap: 6,
                        alignContent: "start",
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: d === datos.hoy ? "var(--nx-panel-surface-overlay)" : "var(--surface)",
                      }}
                    >
                      <strong style={{ fontSize: 13, textTransform: "capitalize" }}>
                        {diaCorto(d)}
                        {d === datos.hoy ? " · hoy" : ""}
                      </strong>
                      {lista.length === 0 ? (
                        <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Nadie de guardia</span>
                      ) : (
                        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                          {lista.map((g) => (
                            <li key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                {g.persona?.nombre ?? `Persona #${g.userId}`}
                                {g.nota ? (
                                  <span style={{ display: "block", fontSize: 11.5, color: "var(--text-tertiary)" }}>
                                    {g.nota}
                                  </span>
                                ) : null}
                              </span>
                              {g.puedeQuitar ? (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  aria-label={`Quitar guardia de ${g.persona?.nombre ?? "esta persona"} el ${diaCorto(g.fecha)}`}
                                  onClick={() => pedirQuitar(g)}
                                >
                                  Quitar
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog state={confirmar} onClose={() => setConfirmar(null)} />
    </div>
  );
}
