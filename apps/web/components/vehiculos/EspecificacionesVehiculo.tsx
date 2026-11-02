"use client";

/** Ficha › Especificaciones: cada dato con la fuente de donde salió, y los documentos del vehículo. */

import { useState } from "react";
import { Button, ButtonLink, EmptyState } from "@/components/base";
import { Aviso, Dialogo } from "@/components/mesa-contable/piezas";
import { formatApiError } from "@/lib/erp-api";
import { VEHICULOS_PATH } from "@/lib/recursos-core";
import { urlFoto } from "@/lib/vehiculos-api";
import {
  agregarDocumento,
  fechaLarga,
  km,
  kmPorLitro,
  quitarDocumento,
  type Especificacion,
  type FichaVehiculo,
  type Fuente,
} from "@/lib/vehiculos-ficha";
import { Pastilla, PastillaFuente, c, v } from "./piezas";

type Fila = { campo: string; valor: string | null; fuente?: Fuente | null };

const ETIQUETA_DOCUMENTO: Record<string, string> = {
  MANUAL: "Manual del propietario",
  TARJETA: "Tarjeta de circulación",
  POLIZA: "Póliza de seguro",
  VERIFICACION: "Verificación",
  OTRO: "Otro",
};

/** El manual se sube desde la ficha, donde además se lee. Aquí solo quedaría guardado sin usarse. */
const SE_AGREGAN_AQUI = ["TARJETA", "POLIZA", "VERIFICACION", "OTRO"];

const conUnidad = (n: number | null | undefined, unidad: string) => (n == null ? null : `${n.toLocaleString("es-MX")} ${unidad}`);

function grupos(e: Especificacion, ficha: FichaVehiculo): Array<{ titulo: string; filas: Fila[] }> {
  const f = e.fuentes ?? {};
  return [
    {
      titulo: "Identidad",
      filas: [
        { campo: "Marca y modelo", valor: [e.marca, e.modelo].filter(Boolean).join(" ") || null, fuente: f.modelo ?? f.marca },
        { campo: "Año", valor: e.anio ? String(e.anio) : null, fuente: f.anio },
        { campo: "Versión", valor: e.version, fuente: f.version },
        { campo: "Placas", valor: ficha.vehiculo.placas },
        { campo: "Número de serie", valor: e.numeroSerie, fuente: f.numeroSerie },
        { campo: "Comprada", valor: e.fechaCompra ? fechaLarga(e.fechaCompra) : null },
      ],
    },
    {
      titulo: "Motor y transmisión",
      filas: [
        { campo: "Motor", valor: e.motor, fuente: f.motor },
        { campo: "Potencia", valor: conUnidad(e.potenciaHp, "hp"), fuente: f.potenciaHp },
        { campo: "Transmisión", valor: e.transmision, fuente: f.transmision },
        { campo: "Combustible", valor: e.combustible, fuente: f.combustible },
      ],
    },
    {
      titulo: "Capacidades",
      filas: [
        { campo: "Tanque", valor: conUnidad(e.tanqueLitros, "L"), fuente: f.tanqueLitros },
        {
          campo: "Aceite de motor",
          valor: [e.aceiteTipo, conUnidad(e.aceiteLitros, "L")].filter(Boolean).join(", ") || null,
          fuente: f.aceiteTipo ?? f.aceiteLitros,
        },
        {
          campo: "Autonomía",
          valor: ficha.autonomiaKm ? `${km(ficha.autonomiaKm)} por tanque` : null,
          fuente: ficha.rendimiento.fuente === "REAL" ? { tipo: "TICKETS" } : undefined,
        },
        { campo: "Carga máxima", valor: conUnidad(e.cargaKg, "kg"), fuente: f.cargaKg },
      ],
    },
    {
      titulo: "Llantas y rendimiento",
      filas: [
        { campo: "Medida", valor: e.llantaMedida, fuente: f.llantaMedida },
        { campo: "Presión", valor: conUnidad(e.llantaPsi, "psi"), fuente: f.llantaPsi },
        { campo: "Rendimiento oficial", valor: e.rendimientoOficial ? kmPorLitro(e.rendimientoOficial) : null, fuente: f.rendimientoOficial },
        { campo: "Rendimiento real", valor: ficha.rendimiento.real ? kmPorLitro(ficha.rendimiento.real) : null, fuente: { tipo: "TICKETS" } },
      ],
    },
  ];
}

export default function EspecificacionesVehiculo({
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
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = ficha.vehiculo.id;

  async function quitar(documentoId: number) {
    setError(null);
    try {
      onCambio(await quitarDocumento(token, id, documentoId));
    } catch (e) {
      setError(formatApiError(e, "No se pudo quitar el documento"));
    }
  }

  return (
    <>
      {ficha.especificacion ? (
        <div className={v.rejillaFicha}>
          {grupos(ficha.especificacion, ficha).map((g) => (
            <section className={c.card} key={g.titulo}>
              <h2 className={v.titulo} style={{ marginBottom: 6 }}>
                {g.titulo}
              </h2>
              {g.filas
                .filter((x) => x.valor)
                .map((x) => (
                  <div className={v.datoFila} key={x.campo}>
                    <span>{x.campo}</span>
                    <span>
                      <b>{x.valor}</b> {x.fuente && x.fuente.tipo !== "CAPTURA" ? <PastillaFuente fuente={x.fuente} /> : null}
                    </span>
                  </div>
                ))}
              {!g.filas.some((x) => x.valor) ? <p className={c.hint}>Sin datos todavía.</p> : null}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState title="Este vehículo aún no tiene ficha" description="Súbele el manual o escribe el modelo, y aquí verás sus especificaciones con la fuente de cada dato." />
      )}

      <section className={c.card}>
        <div className={v.cabecera}>
          <h2 className={v.titulo}>Documentos</h2>
          {puedeEditar ? (
            <div className={v.acciones}>
              {ficha.documentos.some((d) => d.tipo === "MANUAL") ? null : (
                <ButtonLink variant="secondary" size="sm" href={`${VEHICULOS_PATH}/nuevo?vehiculo=${id}`}>
                  Subir manual
                </ButtonLink>
              )}
              <Button variant="secondary" size="sm" onClick={() => setSubiendo(true)}>
                Agregar documento
              </Button>
            </div>
          ) : null}
        </div>
        {error ? <Aviso tono="danger">{error}</Aviso> : null}
        {ficha.documentos.length ? (
          ficha.documentos.map((d) => (
            <div className={v.renglon} key={d.id}>
              <div className={v.renglonTexto}>
                <b>{d.nombre}</b>
                <span>
                  {[d.nombre === ETIQUETA_DOCUMENTO[d.tipo] ? null : ETIQUETA_DOCUMENTO[d.tipo], d.paginas ? `${d.paginas} páginas` : null].filter(Boolean).join(" · ")}
                </span>
              </div>
              {d.venceEl ? (
                <Pastilla tono={d.estado === "VENCIDO" ? "mal" : d.estado === "PRONTO" ? "atencion" : "ok"}>
                  {d.estado === "VENCIDO" ? "Venció" : "Vence"} {fechaLarga(d.venceEl)}
                </Pastilla>
              ) : null}
              <a className={v.enlace} href={urlFoto(d.url)} target="_blank" rel="noopener noreferrer">
                Abrir
              </a>
              {puedeEditar ? (
                <button type="button" className={v.botonTexto} onClick={() => void quitar(d.id)} aria-label={`Quitar ${d.nombre}`}>
                  Quitar
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <p className={c.hint}>Sin documentos: manual, tarjeta, póliza y verificación, con su vencimiento para que avise antes.</p>
        )}
      </section>

      <SubirDocumento
        abierto={subiendo}
        onCerrar={() => setSubiendo(false)}
        onGuardar={async (datos) => {
          onCambio(await agregarDocumento(token, id, datos));
          setSubiendo(false);
        }}
      />
    </>
  );
}

function SubirDocumento({
  abierto,
  onCerrar,
  onGuardar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onGuardar: (d: { tipo: string; nombre?: string; venceEl?: string | null; archivo: File }) => Promise<void>;
}) {
  const [tipo, setTipo] = useState("POLIZA");
  const [venceEl, setVenceEl] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!archivo) {
      setError("Elige el archivo");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({ tipo, archivo, venceEl: venceEl || null, nombre: ETIQUETA_DOCUMENTO[tipo] });
      setArchivo(null);
      setVenceEl("");
    } catch (e) {
      setError(formatApiError(e, "No se pudo subir el documento"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      titulo="Agregar documento"
      onCerrar={onCerrar}
      onEnviar={() => void enviar()}
      acciones={
        <>
          <Button variant="secondary" type="button" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {guardando ? "Subiendo…" : "Guardar"}
          </Button>
        </>
      }
    >
      {error ? <Aviso tono="danger">{error}</Aviso> : null}
      <div className={v.camposGrid}>
        <label className={v.campo}>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {SE_AGREGAN_AQUI.map((id) => (
              <option key={id} value={id}>
                {ETIQUETA_DOCUMENTO[id]}
              </option>
            ))}
          </select>
        </label>
        <label className={v.campo}>
          Vence
          <input type="date" value={venceEl} onChange={(e) => setVenceEl(e.target.value)} />
        </label>
      </div>
      <label className={v.campo} style={{ marginTop: 12 }}>
        Archivo
        <input type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
      </label>
    </Dialogo>
  );
}
