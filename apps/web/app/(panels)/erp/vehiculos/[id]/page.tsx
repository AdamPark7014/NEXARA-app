"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import { Tag } from "@/components/ui/DataTable";
import { ButtonLink, SkeletonRows } from "@/components/base";
import { Aviso } from "@/components/mesa-contable/piezas";
import { useUser } from "@/components/UserContext";
import EspecificacionesVehiculo from "@/components/vehiculos/EspecificacionesVehiculo";
import GasolinaVehiculo, { CargarGasolina } from "@/components/vehiculos/GasolinaVehiculo";
import MantenimientoVehiculo, { RegistrarServicio } from "@/components/vehiculos/MantenimientoVehiculo";
import FaltaPorCapturar from "@/components/vehiculos/FaltaPorCapturar";
import ResumenVehiculo from "@/components/vehiculos/ResumenVehiculo";
import { KpiBanda, c, v } from "@/components/vehiculos/piezas";
import { pesos2 } from "@/lib/costos";
import { formatApiError } from "@/lib/erp-api";
import { VEHICULOS_PATH, puedeGestionarInventarioVehiculos } from "@/lib/recursos-core";
import { googleMapsLink } from "@/lib/static-map";
import { fechaCorta, getFicha, km, kmPorLitro, type FichaVehiculo } from "@/lib/vehiculos-ficha";
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

const PESTANAS = [
  { id: "resumen", texto: "Resumen" },
  { id: "especificaciones", texto: "Especificaciones" },
  { id: "viajes", texto: "Viajes" },
  { id: "gasolina", texto: "Gasolina" },
  { id: "mantenimiento", texto: "Mantenimiento" },
] as const;

type Pestana = (typeof PESTANAS)[number]["id"];

/**
 * Ficha de un vehículo (mockup aprobado 01-11-2026): cuánto cuesta cada kilómetro, gasolina, desgaste y
 * servicios, además de quién lo trae y cada viaje con su evidencia. El dinero solo lo ve quien ya ve
 * costos completos: la API no lo manda a los demás.
 */
export default function VehiculoDetallePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const consulta = useSearchParams();
  const { user } = useUser();
  const token = user?.token ?? "";
  const puedeEditar = puedeGestionarInventarioVehiculos(user);

  const [datos, setDatos] = useState<DetalleVehiculo | null>(null);
  const [ficha, setFicha] = useState<FichaVehiculo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [foto, setFoto] = useState<FotoChecklist | null>(null);
  const [pestana, setPestana] = useState<Pestana>(() => {
    const pedida = consulta?.get("tab");
    return PESTANAS.some((x) => x.id === pedida) ? (pedida as Pestana) : "resumen";
  });
  const [dialogo, setDialogo] = useState<"gasolina" | "servicio" | null>(null);

  const cargar = useCallback(async () => {
    if (!token || !id) return;
    setCargando(true);
    setError(null);
    try {
      setDatos(await obtenerVehiculo(token, id));
    } catch (e) {
      // Si ya había ficha, se queda: el aviso de arriba ofrece reintentar.
      setError(formatApiError(e, "No se pudo cargar el vehículo"));
    } finally {
      setCargando(false);
    }
    // Va aparte: si falla, el estado y los viajes se siguen viendo.
    getFicha(token, id)
      .then((f) => setFicha(f?.rendimiento ? f : null))
      .catch(() => setFicha(null));
  }, [token, id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function cambiarPestana(nueva: Pestana) {
    setPestana(nueva);
    // Sin pasar por el enrutador: al cambiar solo la consulta, Next dejaría el título por omisión de la pestaña.
    window.history.replaceState(null, "", `${VEHICULOS_PATH}/${id}?tab=${nueva}`);
  }

  const vehiculo = datos?.vehiculo;
  const estado = etiquetaEstatus(vehiculo?.estatus);
  const primeraCarga = cargando && !datos;
  const reintentar = (
    <Button size="sm" variant="secondary" onClick={() => void cargar()}>
      Reintentar
    </Button>
  );
  const odometro = ficha?.odometro?.km ?? vehiculo?.odometroUltimo ?? null;
  const veCostos = Boolean(ficha?.acceso.veCostos);
  const especificacion = ficha?.especificacion;

  const panelEstado = vehiculo ? (
    <Section title="Estado" dense>
      <div className={styles.datos}>
        <Dato label="Lo trae" valor={vehiculo.conductor?.nombre ?? "Nadie"} />
        <Dato label="Desde" valor={formatoFecha(vehiculo.desde)} />
        <Dato label="Devuelve" valor={formatoFecha(vehiculo.proximaDevolucion)} />
        <Dato label="Combustible" valor={nivelDeCombustible(vehiculo.combustibleUltimoPct)} />
      </div>
    </Section>
  ) : null;

  return (
    <div className={c.page}>
      <header className={c.band}>
        <div className={c.bandHead}>
          <div>
            <div className={c.crumb}>
              <Link href={VEHICULOS_PATH} className={styles.migasBanda}>
                ← Flotilla
              </Link>
              {[vehiculo?.placas, especificacion?.version, especificacion?.combustible].filter(Boolean).map((x) => ` · ${x}`)}
            </div>
            <h1 className={c.bandTitle}>{vehiculo?.nombre || (primeraCarga ? "Cargando…" : "Vehículo")}</h1>
            {vehiculo ? (
              <div className={v.acciones} style={{ marginTop: 8 }}>
                <Tag variant={vehiculo.disponible ? "positive" : estado.variante} dot>
                  {vehiculo.disponible ? "Disponible" : estado.texto}
                </Tag>
                {vehiculo.conductor && <Tag variant="accent">{vehiculo.conductor.nombre}</Tag>}
                {vehiculo.tieneRastreador && <Tag variant="neutral">{vehiculo.gpsProveedor || "Con GPS"}</Tag>}
              </div>
            ) : null}
          </div>
          <div className={v.acciones}>
            {ficha && puedeEditar ? (
              <>
                <ButtonLink variant="secondary" href={`${VEHICULOS_PATH}/nuevo?vehiculo=${id}`}>
                  {ficha.tieneFicha ? "Editar ficha" : "Completar ficha"}
                </ButtonLink>
                <Button variant="secondary" onClick={() => setDialogo("servicio")}>
                  Registrar servicio
                </Button>
              </>
            ) : null}
            {ficha ? <Button onClick={() => setDialogo("gasolina")}>Cargar gasolina</Button> : null}
            <Button variant="ghost" onClick={() => void cargar()} disabled={cargando}>
              {cargando && datos ? "Actualizando…" : "Actualizar"}
            </Button>
          </div>
        </div>
        <div className={c.kpis}>
          {veCostos && ficha?.costos ? <KpiBanda cifra={pesos2(ficha.costos.porKm)} texto="Cuesta cada kilómetro" /> : null}
          <KpiBanda
            cifra={formatoKm(odometro)}
            texto={ficha?.odometro ? `Odómetro, lectura del ${fechaCorta(ficha.odometro.fecha)}` : "Odómetro"}
          />
          {ficha ? (
            <KpiBanda
              cifra={kmPorLitro(ficha.rendimiento.real ?? ficha.rendimiento.oficial)}
              texto={
                ficha.rendimiento.real
                  ? `Rendimiento real${ficha.rendimiento.oficial ? `; oficial ${ficha.rendimiento.oficial.toFixed(1)}` : ""}`
                  : "Rendimiento oficial; faltan cargas reales"
              }
            />
          ) : null}
          {ficha?.proximoServicio ? (
            <KpiBanda
              cifra={ficha.proximoServicio.faltanKm != null ? km(Math.abs(ficha.proximoServicio.faltanKm)) : fechaCorta(ficha.proximoServicio.fecha)}
              texto={ficha.proximoServicio.estado === "VENCIDO" ? "Servicio vencido" : "Para el próximo servicio"}
              tono={ficha.proximoServicio.estado === "VENCIDO" ? "mal" : ficha.proximoServicio.estado === "PRONTO" ? "atencion" : undefined}
            />
          ) : null}
        </div>
        <nav className={c.tabs} aria-label="Secciones de la ficha">
          {PESTANAS.map((x) => (
            <button
              key={x.id}
              type="button"
              className={styles.pestanaBoton}
              aria-current={pestana === x.id ? "page" : undefined}
              onClick={() => cambiarPestana(x.id)}
            >
              {x.texto}
            </button>
          ))}
        </nav>
      </header>

      {error && datos && <InlineAlert message={error} variant="warning" action={reintentar} />}

      {!cargando && error && !datos && (
        <EmptyState title="No se pudo cargar el vehículo" description={error} variant="compact" action={reintentar} />
      )}

      {primeraCarga && (
        <Section title="Estado" dense>
          <SkeletonRows rows={2} label="Cargando vehículo" />
        </Section>
      )}

      {ficha && !ficha.tieneFicha && puedeEditar && pestana !== "viajes" ? (
        <Aviso tono="info" titulo="Este vehículo aún no tiene ficha.">
          <Link href={`${VEHICULOS_PATH}/nuevo?vehiculo=${id}`}>Súbele el manual</Link> para sacarle costo, rendimiento oficial y programa de servicio.
        </Aviso>
      ) : null}

      {pestana === "resumen" ? (
        ficha ? (
          <ResumenVehiculo
            ficha={ficha}
            estado={panelEstado}
            faltantes={puedeEditar ? <FaltaPorCapturar ficha={ficha} onDocumentos={() => cambiarPestana("especificaciones")} onGasolina={() => setDialogo("gasolina")} /> : null}
          />
        ) : (
          panelEstado
        )
      ) : null}

      {pestana === "especificaciones" && ficha ? (
        <EspecificacionesVehiculo ficha={ficha} token={token} puedeEditar={puedeEditar} onCambio={setFicha} />
      ) : null}

      {pestana === "gasolina" && ficha ? <GasolinaVehiculo ficha={ficha} token={token} puedeEditar={puedeEditar} onCambio={setFicha} /> : null}

      {pestana === "mantenimiento" && ficha ? (
        <MantenimientoVehiculo ficha={ficha} token={token} puedeEditar={puedeEditar} onCambio={setFicha} />
      ) : null}

      {pestana === "viajes" ? (
        <Section title={!datos ? "Historial" : `Historial · ${datos.historial.length} viajes`}>
          {primeraCarga && <SkeletonRows rows={3} label="Cargando historial" />}
          {datos && datos.historial.length === 0 && (
            <EmptyState
              title="Sin viajes"
              description="Cuando alguien registre una salida, aquí verás el recorrido y sus fotos."
              variant="compact"
            />
          )}
          {datos && datos.historial.length > 0 && (
            <div style={{ display: "grid", gap: 12 }}>
              {datos.historial.map((viaje) => (
                <Viaje key={`${viaje.origen}-${viaje.id}`} viaje={viaje} onFoto={setFoto} />
              ))}
            </div>
          )}
        </Section>
      ) : null}

      {ficha ? (
        <>
          <CargarGasolina
            abierto={dialogo === "gasolina"}
            ficha={ficha}
            token={token}
            onCerrar={() => setDialogo(null)}
            onGuardado={(f) => {
              setFicha(f);
              setDialogo(null);
            }}
          />
          <RegistrarServicio
            abierto={dialogo === "servicio"}
            ficha={ficha}
            token={token}
            onCerrar={() => setDialogo(null)}
            onGuardado={(f) => {
              setFicha(f);
              setDialogo(null);
            }}
          />
        </>
      ) : null}

      <Modal
        open={Boolean(foto)}
        onClose={() => setFoto(null)}
        title={foto ? ETIQUETA_SLOT[foto.slot as SlotChecklist] || foto.slot : undefined}
        maxWidth={760}
      >
        {foto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- evidencia servida por la API */}
            <img
              className={styles.visorImg}
              src={urlFoto(foto.url)}
              alt={ETIQUETA_SLOT[foto.slot as SlotChecklist] || foto.slot}
            />
            <p className={styles.mini} style={{ marginTop: 8 }}>
              Tomada el {formatoFecha(foto.capturedAt)}
              {foto.lat !== null && foto.lng !== null && (
                <>
                  {" · "}
                  <a href={googleMapsLink(foto.lat, foto.lng)} target="_blank" rel="noopener noreferrer">
                    Ver ubicación en el mapa
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
