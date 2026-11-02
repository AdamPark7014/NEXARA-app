"use client";

/** Ficha › Mantenimiento: el programa del manual, lo que se ha hecho y el diálogo para registrarlo. */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/base";
import { Aviso, Dialogo } from "@/components/mesa-contable/piezas";
import { pesos } from "@/lib/costos";
import { formatApiError } from "@/lib/erp-api";
import { urlFoto } from "@/lib/vehiculos-api";
import {
  aNumero,
  fechaCorta,
  km,
  quitarServicio,
  registrarServicio,
  textoIntervalo,
  type FichaVehiculo,
} from "@/lib/vehiculos-ficha";
import { Pastilla, c, v } from "./piezas";

const TONO = { VENCIDO: "mal", PRONTO: "atencion", OK: "ok" } as const;
const TEXTO = { VENCIDO: "Vencido", PRONTO: "Pronto", OK: "Al día" } as const;

export default function MantenimientoVehiculo({
  ficha,
  token,
  puedeEditar,
  onCambio,
}: {
  ficha: FichaVehiculo;
  token: string;
  puedeEditar: boolean;
  onCambio: (f: FichaVehiculo) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const { veCostos } = ficha.acceso;

  async function quitar(servicioId: number) {
    setError(null);
    try {
      onCambio(await quitarServicio(token, ficha.vehiculo.id, servicioId));
    } catch (e) {
      setError(formatApiError(e, "No se pudo quitar el servicio"));
    }
  }

  return (
    <>
      <section className={c.card}>
        <h2 className={v.titulo} style={{ marginBottom: 6 }}>
          Programa de servicio
        </h2>
        {ficha.programa.length ? (
          <div className={v.tablaCaja}>
            <table className={v.tabla}>
              <thead>
                <tr>
                  <th scope="col">Qué</th>
                  <th scope="col">Cada cuánto</th>
                  <th scope="col">Última vez</th>
                  <th scope="col">Toca</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ficha.programa.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.concepto}</td>
                    <td>{textoIntervalo(s)}</td>
                    <td>{s.ultimaFecha ? `${km(s.ultimoKm)} · ${fechaCorta(s.ultimaFecha)}` : "Sin registro"}</td>
                    <td>
                      {[s.proximoKm != null ? `A los ${km(s.proximoKm)}` : null, s.proximaFecha ? fechaCorta(s.proximaFecha) : null]
                        .filter(Boolean)
                        .join(" o ") || "—"}
                    </td>
                    <td>
                      <Pastilla tono={TONO[s.estado]}>{TEXTO[s.estado]}</Pastilla>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={c.hint}>Sin programa todavía: sale del manual, o se escribe en la ficha.</p>
        )}
      </section>

      <section className={c.card}>
        <h2 className={v.titulo} style={{ marginBottom: 6 }}>
          Servicios hechos
        </h2>
        {error ? <Aviso tono="danger">{error}</Aviso> : null}
        {ficha.servicios.length ? (
          <div className={v.tablaCaja}>
            <table className={v.tabla}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Qué se hizo</th>
                  <th scope="col" className={v.der}>
                    Odómetro
                  </th>
                  {veCostos ? (
                    <th scope="col" className={v.der}>
                      Costo
                    </th>
                  ) : null}
                  <th scope="col">Comprobante</th>
                  {puedeEditar ? <th scope="col" aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {ficha.servicios.map((s) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fechaCorta(s.fecha)}</td>
                    <td>
                      {s.concepto}
                      {s.proveedor ? <span className={v.celdaSub}>{s.proveedor}</span> : null}
                    </td>
                    <td className={v.der}>{km(s.odometro)}</td>
                    {veCostos ? <td className={v.der}>{pesos(s.costo)}</td> : null}
                    <td>
                      {s.comprobanteUrl ? (
                        <a className={v.enlace} href={urlFoto(s.comprobanteUrl)} target="_blank" rel="noopener noreferrer">
                          Abrir
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    {puedeEditar ? (
                      <td>
                        <button type="button" className={v.botonTexto} onClick={() => void quitar(s.id)} aria-label={`Quitar servicio del ${fechaCorta(s.fecha)}`}>
                          Quitar
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={c.hint}>Sin servicios registrados. Al registrarlos, el programa se mueve solo.</p>
        )}
      </section>
    </>
  );
}

export function RegistrarServicio({
  abierto,
  ficha,
  token,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  ficha: FichaVehiculo;
  token: string;
  onCerrar: () => void;
  onGuardado: (f: FichaVehiculo) => void;
}) {
  const hoy = useMemo(() => new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10), []);
  const [fecha, setFecha] = useState(hoy);
  const [odometro, setOdometro] = useState("");
  const [costo, setCosto] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [concepto, setConcepto] = useState("");
  const [planIds, setPlanIds] = useState<number[]>([]);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setFecha(hoy);
    setOdometro(ficha.odometro ? String(ficha.odometro.km) : "");
    setCosto("");
    setProveedor("");
    setConcepto("");
    setPlanIds([]);
    setComprobante(null);
    setError(null);
  }, [abierto, hoy, ficha.odometro]);

  const conceptoFinal =
    concepto.trim() ||
    ficha.programa
      .filter((p) => planIds.includes(p.id))
      .map((p) => p.concepto)
      .join(", ");

  async function guardar() {
    if (!conceptoFinal) {
      setError("Marca qué se le hizo o escríbelo");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      onGuardado(
        await registrarServicio(token, ficha.vehiculo.id, {
          fecha,
          odometro: aNumero(odometro),
          concepto: conceptoFinal,
          costo: aNumero(costo),
          proveedor,
          planIds,
          comprobante,
        }),
      );
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar el servicio"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo="Registrar servicio"
      descripcion={ficha.vehiculo.nombre}
      onCerrar={onCerrar}
      onEnviar={() => void guardar()}
      acciones={
        <>
          <Button variant="secondary" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar servicio"}
          </Button>
        </>
      }
    >
      {error ? <Aviso tono="danger">{error}</Aviso> : null}
      <div className={v.camposGrid}>
        <label className={v.campo}>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
        <label className={v.campo}>
          Odómetro
          <input inputMode="numeric" value={odometro} onChange={(e) => setOdometro(e.target.value)} />
        </label>
        {ficha.acceso.veCostos ? (
          <label className={v.campo}>
            Costo
            <input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
          </label>
        ) : null}
      </div>
      {ficha.programa.length ? (
        <fieldset style={{ border: 0, margin: "12px 0 0", padding: 0 }}>
          <legend style={{ padding: 0, fontSize: 12.5, color: "var(--ui-fg-2)" }}>Qué se le hizo</legend>
          {ficha.programa.map((p) => (
            <label className={v.casilla} key={p.id}>
              <input
                type="checkbox"
                checked={planIds.includes(p.id)}
                onChange={(e) => setPlanIds((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)))}
              />
              {p.concepto}
            </label>
          ))}
        </fieldset>
      ) : null}
      <label className={v.campo} style={{ marginTop: 10 }}>
        {ficha.programa.length ? "Otra cosa (opcional)" : "Qué se le hizo"}
        <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Cambio de llantas" />
      </label>
      <div className={v.camposGrid} style={{ marginTop: 10 }}>
        <label className={v.campo}>
          Taller
          <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </label>
        <label className={v.campo}>
          Comprobante
          <input type="file" accept="application/pdf,image/*" onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} />
        </label>
      </div>
    </Dialogo>
  );
}
