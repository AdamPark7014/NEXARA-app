"use client";

/** Ficha › Gasolina: las cargas, y el diálogo para registrar una leyendo las fotos. */

import { useEffect, useState } from "react";
import { Button } from "@/components/base";
import { Aviso, Dialogo } from "@/components/mesa-contable/piezas";
import { pesos2 } from "@/lib/costos";
import { formatApiError } from "@/lib/erp-api";
import { urlFoto } from "@/lib/vehiculos-api";
import {
  aNumero,
  fechaCorta,
  km,
  kmPorLitro,
  leerTablero,
  leerTicket,
  quitarCarga,
  registrarCarga,
  rendimientoDeEstaCarga,
  type FichaVehiculo,
} from "@/lib/vehiculos-ficha";
import { c, v } from "./piezas";

export default function GasolinaVehiculo({
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
  const { rendimiento } = ficha;

  async function quitar(cargaId: number) {
    setError(null);
    try {
      onCambio(await quitarCarga(token, ficha.vehiculo.id, cargaId));
    } catch (e) {
      setError(formatApiError(e, "No se pudo quitar la carga"));
    }
  }

  return (
    <section className={c.card}>
      <h2 className={v.titulo}>Cargas de gasolina</h2>
      <p className={v.nota}>
        {rendimiento.fuente === "REAL"
          ? `La tarifa usa el rendimiento real: ${kmPorLitro(rendimiento.real)}.`
          : `La tarifa usa el rendimiento oficial. ${rendimiento.faltan === 1 ? "Falta 1 tanque medido" : `Faltan ${rendimiento.faltan} tanques medidos`} para usar el real.`}
      </p>
      {error ? <Aviso tono="danger">{error}</Aviso> : null}
      {ficha.cargas.length ? (
        <div className={v.tablaCaja}>
          <table className={v.tabla}>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col" className={v.der}>
                  Odómetro
                </th>
                <th scope="col" className={v.der}>
                  Litros
                </th>
                <th scope="col" className={v.der}>
                  Importe
                </th>
                <th scope="col">Tanque</th>
                <th scope="col">Fotos</th>
                {puedeEditar ? <th scope="col" aria-label="Acciones" /> : null}
              </tr>
            </thead>
            <tbody>
              {ficha.cargas.map((x) => (
                <tr key={x.id}>
                  <td>{fechaCorta(x.fecha)}</td>
                  <td className={v.der}>{km(x.odometro)}</td>
                  <td className={v.der}>{x.litros.toLocaleString("es-MX")}</td>
                  <td className={v.der}>{pesos2(x.importe)}</td>
                  <td>{x.tanqueLleno ? "Lleno" : "Parcial"}</td>
                  <td>
                    {x.ticketUrl ? (
                      <a className={v.enlace} href={urlFoto(x.ticketUrl)} target="_blank" rel="noopener noreferrer">
                        Ticket
                      </a>
                    ) : null}
                    {x.ticketUrl && x.tableroUrl ? " · " : ""}
                    {x.tableroUrl ? (
                      <a className={v.enlace} href={urlFoto(x.tableroUrl)} target="_blank" rel="noopener noreferrer">
                        Tablero
                      </a>
                    ) : null}
                    {!x.ticketUrl && !x.tableroUrl ? "—" : null}
                  </td>
                  {puedeEditar ? (
                    <td>
                      <button type="button" className={v.botonTexto} onClick={() => void quitar(x.id)} aria-label={`Quitar carga del ${fechaCorta(x.fecha)}`}>
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
        <p className={c.hint}>Sin cargas todavía. Con la foto del ticket y la del tablero, la IA llena los datos y tú los confirmas.</p>
      )}
    </section>
  );
}

/** Registrar una carga: se toman las dos fotos, se lee lo que se pueda y la persona confirma. */
export function CargarGasolina({
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
  const [ticket, setTicket] = useState<File | null>(null);
  const [tablero, setTablero] = useState<File | null>(null);
  const [litros, setLitros] = useState("");
  const [importe, setImporte] = useState("");
  const [odometro, setOdometro] = useState("");
  const [lleno, setLleno] = useState(true);
  const [leyendo, setLeyendo] = useState<"ticket" | "tablero" | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setTicket(null);
    setTablero(null);
    setLitros("");
    setImporte("");
    setOdometro("");
    setLleno(true);
    setNota(null);
    setError(null);
  }, [abierto]);

  async function fotoTicket(archivo: File | null) {
    setTicket(archivo);
    if (!archivo) return;
    setLeyendo("ticket");
    setNota(null);
    try {
      const r = await leerTicket(token, archivo);
      if (r.litros != null) setLitros(String(r.litros));
      if (r.importe != null) setImporte(String(r.importe));
      if (!r.legible) setNota("No se pudo leer el ticket: escribe los datos.");
      else if (r.revisar) setNota("Los litros por el precio no dan el total: revisa las cifras.");
    } catch {
      setNota("No se pudo leer el ticket: escribe los datos.");
    } finally {
      setLeyendo(null);
    }
  }

  async function fotoTablero(archivo: File | null) {
    setTablero(archivo);
    if (!archivo) return;
    setLeyendo("tablero");
    try {
      const r = await leerTablero(token, archivo, ficha.odometro?.km ?? null);
      if (r.odometroKm != null) setOdometro(String(r.odometroKm));
      else setNota("No se pudo leer el odómetro: escríbelo.");
    } catch {
      setNota("No se pudo leer el odómetro: escríbelo.");
    } finally {
      setLeyendo(null);
    }
  }

  const litrosN = aNumero(litros);
  const odometroN = aNumero(odometro);
  const medido = lleno && litrosN && odometroN ? rendimientoDeEstaCarga(ficha.cargas, odometroN, litrosN) : null;

  async function guardar() {
    const importeN = aNumero(importe);
    if (odometroN == null || !litrosN || !importeN) {
      setError("Faltan el odómetro, los litros o el importe");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      onGuardado(
        await registrarCarga(token, ficha.vehiculo.id, {
          odometro: Math.trunc(odometroN),
          litros: litrosN,
          importe: importeN,
          tanqueLleno: lleno,
          ticket,
          tablero,
        }),
      );
    } catch (e) {
      setError(formatApiError(e, "No se pudo guardar la carga"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo="Cargar gasolina"
      descripcion={`${ficha.vehiculo.nombre}${ficha.vehiculo.placas ? ` · ${ficha.vehiculo.placas}` : ""}`}
      onCerrar={onCerrar}
      onEnviar={() => void guardar()}
      acciones={
        <>
          <Button variant="secondary" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando || Boolean(leyendo)}>
            {guardando ? "Guardando…" : "Guardar carga"}
          </Button>
        </>
      }
    >
      {error ? <Aviso tono="danger">{error}</Aviso> : null}
      {nota ? <Aviso tono="warning">{nota}</Aviso> : null}
      <div className={v.camposGrid}>
        <label className={v.campo}>
          Foto del ticket
          <input type="file" accept="image/*" capture="environment" onChange={(e) => void fotoTicket(e.target.files?.[0] ?? null)} />
        </label>
        <label className={v.campo}>
          Foto del tablero
          <input type="file" accept="image/*" capture="environment" onChange={(e) => void fotoTablero(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {leyendo ? (
        <p className={c.hint} role="status">
          Leyendo la foto…
        </p>
      ) : null}
      <div className={v.camposGrid} style={{ marginTop: 12 }}>
        <label className={v.campo}>
          Litros
          <input inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} />
        </label>
        <label className={v.campo}>
          Total
          <input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} />
        </label>
        <label className={v.campo}>
          Odómetro
          <input inputMode="numeric" value={odometro} onChange={(e) => setOdometro(e.target.value)} />
        </label>
      </div>
      <label className={v.casilla} style={{ marginTop: 10 }}>
        <input type="checkbox" checked={lleno} onChange={(e) => setLleno(e.target.checked)} />
        Llené el tanque
      </label>
      {medido ? (
        <div className={v.leido} style={{ marginTop: 10 }}>
          <b>{kmPorLitro(medido.kmPorLitro)}</b>
          {km(medido.km)} desde el tanque anterior, entre {medido.litros.toLocaleString("es-MX")} litros.
        </div>
      ) : null}
    </Dialogo>
  );
}
