"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import { Tag } from "@/components/ui/DataTable";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { VEHICULOS_PATH } from "@/lib/recursos-core";
import { googleMapsLink } from "@/lib/static-map";
import {
  ETIQUETA_SLOT,
  etiquetaEstatus,
  formatoFecha,
  formatoHora,
  formatoKm,
  nivelDeCombustible,
  obtenerVehiculo,
  urlFoto,
  type AsignacionHistorial,
  type DetalleVehiculo,
  type FotoChecklist,
  type SlotChecklist,
} from "@/lib/vehiculos-api";
import styles from "../vehiculos-core.module.css";

/** Ficha de un vehículo: quién lo trae y cada viaje con su evidencia. */
export default function VehiculoDetallePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { user } = useUser();
  const token = user?.token ?? "";

  const [datos, setDatos] = useState<DetalleVehiculo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [foto, setFoto] = useState<FotoChecklist | null>(null);

  const cargar = useCallback(async () => {
    if (!token || !id) return;
    setCargando(true);
    setError(null);
    try {
      setDatos(await obtenerVehiculo(token, id));
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar el vehículo"));
    } finally {
      setCargando(false);
    }
  }, [token, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const vehiculo = datos?.vehiculo;
  const estado = etiquetaEstatus(vehiculo?.estatus);

  return (
    <div className={styles.wrap}>
      <PageHeader
        eyebrow={<Link href={VEHICULOS_PATH} className={styles.migas}>← Flotilla</Link>}
        title={vehiculo?.nombre || (cargando ? "Cargando…" : "Vehículo")}
        subtitle={vehiculo?.placas || undefined}
        density="ops"
        meta={
          vehiculo ? (
            <>
              <Tag variant={vehiculo.disponible ? "positive" : estado.variante} dot>
                {vehiculo.disponible ? "Disponible" : estado.texto}
              </Tag>
              {vehiculo.conductor && <Tag variant="accent">{vehiculo.conductor.nombre}</Tag>}
              {vehiculo.tieneRastreador && (
                <Tag variant="neutral">{vehiculo.gpsProveedor || "Con GPS"}</Tag>
              )}
            </>
          ) : undefined
        }
        actions={
          <Button variant="ghost" onClick={() => void cargar()} disabled={cargando}>
            Actualizar
          </Button>
        }
      />

      {error && <InlineAlert message={error} variant="danger" />}

      {vehiculo && (
        <Section title="Estado" dense>
          <div className={styles.datos}>
            <Dato label="Con" valor={vehiculo.conductor?.nombre ?? "Nadie"} />
            <Dato label="Desde" valor={formatoFecha(vehiculo.desde)} />
            <Dato label="Devuelve" valor={formatoFecha(vehiculo.proximaDevolucion)} />
            <Dato label="Odómetro" valor={formatoKm(vehiculo.odometroUltimo)} />
            <Dato label="Combustible" valor={nivelDeCombustible(vehiculo.combustibleUltimoPct)} />
          </div>
        </Section>
      )}

      <Section title={cargando ? "Historial" : `Historial · ${datos?.historial.length ?? 0} viajes`}>
        {cargando && <EmptyState title="Cargando…" variant="compact" />}
        {!cargando && error && (
          <EmptyState
            title="No se pudo cargar"
            description={error}
            variant="compact"
            action={
              <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                Reintentar
              </Button>
            }
          />
        )}
        {!cargando && !error && (datos?.historial.length ?? 0) === 0 && (
          <EmptyState title="Sin viajes" description="Este vehículo aún no se usa." variant="compact" />
        )}
        {!cargando && !error && (datos?.historial.length ?? 0) > 0 && (
          <div style={{ display: "grid", gap: 12 }}>
            {datos!.historial.map((viaje) => (
              <Viaje key={`${viaje.origen}-${viaje.id}`} viaje={viaje} onFoto={setFoto} />
            ))}
          </div>
        )}
      </Section>

      <Modal
        open={Boolean(foto)}
        onClose={() => setFoto(null)}
        title={foto ? ETIQUETA_SLOT[foto.slot as SlotChecklist] || foto.slot : undefined}
        maxWidth={760}
      >
        {foto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- evidencia servida por la API */}
            <img className={styles.visorImg} src={urlFoto(foto.url)} alt={foto.slot} />
            <p className={styles.mini} style={{ marginTop: 8 }}>
              {formatoFecha(foto.capturedAt)}
              {foto.lat !== null && foto.lng !== null && (
                <>
                  {" · "}
                  <a href={googleMapsLink(foto.lat, foto.lng)} target="_blank" rel="noopener noreferrer">
                    ver punto
                  </a>
                </>
              )}
            </p>
          </>
        )}
      </Modal>
    </div>
  );
}

function Viaje({
  viaje,
  onFoto,
}: {
  viaje: AsignacionHistorial;
  onFoto: (foto: FotoChecklist) => void;
}) {
  const estado = etiquetaEstatus(viaje.estatus);
  return (
    <article className={styles.viaje}>
      <div className={styles.viajeTop}>
        <div className={styles.filaVehiculo}>
          <span className={styles.nombre}>{viaje.conductor?.nombre ?? "Sin conductor"}</span>
          <span className={styles.mini}>
            {formatoFecha(viaje.inicio)} → {formatoFecha(viaje.fin)}
            {viaje.actividad ? ` · ${viaje.actividad}` : ""}
          </span>
        </div>
        <Tag variant={estado.variante}>{estado.texto}</Tag>
      </div>

      <div className={styles.datos}>
        <Dato
          label="Km"
          valor={
            viaje.kmRecorridos !== null
              ? formatoKm(viaje.kmRecorridos)
              : `${formatoKm(viaje.odometroInicio)} → ${formatoKm(viaje.odometroFin)}`
          }
        />
        <Dato
          label="Odómetro"
          valor={`${formatoKm(viaje.odometroInicio)} → ${formatoKm(viaje.odometroFin)}`}
        />
        <Dato
          label="Combustible"
          valor={`${nivelDeCombustible(viaje.combustibleInicioPct)} → ${nivelDeCombustible(viaje.combustibleFinPct)}`}
        />
        <Dato label="Origen" valor={viaje.origen === "solicitud" ? "Solicitud" : "Inventario"} />
      </div>

      <Tira titulo="Salida" fotos={viaje.fotosSalida} onFoto={onFoto} />
      <Tira titulo="Devolución" fotos={viaje.fotosDevolucion} onFoto={onFoto} />
    </article>
  );
}

function Tira({
  titulo,
  fotos,
  onFoto,
}: {
  titulo: string;
  fotos: FotoChecklist[];
  onFoto: (foto: FotoChecklist) => void;
}) {
  if (!fotos?.length) {
    return (
      <div>
        <div className={styles.tiraTitulo}>{titulo}</div>
        <span className={styles.mini}>Sin fotos</span>
      </div>
    );
  }
  // El tablero primero: es la foto que prueba el kilometraje y la gasolina.
  const ordenadas = [...fotos].sort((a, b) =>
    a.slot === "tablero" ? -1 : b.slot === "tablero" ? 1 : 0,
  );
  return (
    <div>
      <div className={styles.tiraTitulo}>{titulo}</div>
      <div className={styles.tira}>
        {ordenadas.map((foto) => {
          const esTablero = foto.slot === "tablero";
          return (
            <button
              key={`${foto.slot}-${foto.url}`}
              type="button"
              className={`${styles.foto} ${esTablero ? styles.fotoTablero : ""}`}
              onClick={() => onFoto(foto)}
              title={`${ETIQUETA_SLOT[foto.slot as SlotChecklist] || foto.slot} · ${formatoFecha(foto.capturedAt)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- evidencia servida por la API */}
              <img src={urlFoto(foto.url)} alt={ETIQUETA_SLOT[foto.slot as SlotChecklist] || foto.slot} />
              <span className={styles.fotoPie}>
                {ETIQUETA_SLOT[foto.slot as SlotChecklist] || foto.slot} · {formatoHora(foto.capturedAt)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className={styles.dato}>
      <span className={styles.datoLabel}>{label}</span>
      <span className={styles.datoValor}>{valor}</span>
    </div>
  );
}
