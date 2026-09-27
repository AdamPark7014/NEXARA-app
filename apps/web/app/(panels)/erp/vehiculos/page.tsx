"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import ContextRail from "@/components/ui/ContextRail";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { SkeletonRows } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { formatApiError } from "@/lib/erp-api";
import { usePantallaChica } from "@/lib/recursos-ui";
import {
  MIS_VEHICULOS_PATH,
  VEHICULOS_GPS_PATH,
  VEHICULOS_PATH,
  puedeGestionarInventarioVehiculos,
  puedeVerGpsDireccion,
} from "@/lib/recursos-core";
import {
  crearVehiculoInventario,
  etiquetaEstatus,
  formatoFecha,
  formatoKm,
  listarFlotilla,
  nivelDeCombustible,
  type VehiculoFlota,
} from "@/lib/vehiculos-api";
import styles from "./vehiculos-core.module.css";

type Filtro = "todos" | "disponibles" | "uso" | "fuera";

function grupoDe(v: VehiculoFlota): Exclude<Filtro, "todos"> | null {
  if (v.disponible) return "disponibles";
  const { variante } = etiquetaEstatus(v.estatus);
  if (variante === "warning" || variante === "danger" || !v.activo) return "fuera";
  if (v.conductor || variante === "accent") return "uso";
  return null;
}

function EstadoVehiculo({ v }: { v: VehiculoFlota }) {
  const est = etiquetaEstatus(v.estatus);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <Tag variant={v.disponible ? "positive" : est.variante} dot>
        {v.disponible ? "Disponible" : est.texto}
      </Tag>
      {v.tieneRastreador && (
        <span title={`Rastreador GPS: ${v.gpsProveedor || "instalado"}`}>
          <Tag variant="neutral" size="sm">GPS</Tag>
        </span>
      )}
    </span>
  );
}

/**
 * Flotilla en Core (`/erp/vehiculos`): qué hay, quién lo trae y cuándo vuelve.
 * Quien tiene `vehicles.inventory` puede dar de alta unidades (POST inventory).
 */
export default function VehiculosPage() {
  const router = useRouter();
  const { user } = useUser();
  const token = user?.token ?? "";
  const verGps = puedeVerGpsDireccion(user);
  const puedeAlta = puedeGestionarInventarioVehiculos(user);
  const pantallaChica = usePantallaChica();

  const [vehiculos, setVehiculos] = useState<VehiculoFlota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargadoUnaVez, setCargadoUnaVez] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const busquedaDiferida = useDeferredValue(busqueda);

  const [showAlta, setShowAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [placas, setPlacas] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [altaError, setAltaError] = useState<string | null>(null);
  const [altaOk, setAltaOk] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setVehiculos(await listarFlotilla(token));
      setCargadoUnaVez(true);
    } catch (e) {
      // Un refresco fallido no borra la lista que ya se veía.
      setError(formatApiError(e, "No se pudo cargar la flotilla"));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const kpis = useMemo(() => {
    const cuenta = { disponibles: 0, uso: 0, fuera: 0 };
    for (const v of vehiculos) {
      const g = grupoDe(v);
      if (g) cuenta[g] += 1;
    }
    return { total: vehiculos.length, ...cuenta };
  }, [vehiculos]);

  const visibles = useMemo(() => {
    const q = busquedaDiferida.trim().toLowerCase();
    return vehiculos.filter((v) => {
      if (filtro !== "todos" && grupoDe(v) !== filtro) return false;
      if (!q) return true;
      return [v.nombre, v.placas, v.conductor?.nombre]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(q));
    });
  }, [vehiculos, filtro, busquedaDiferida]);

  const abrirFicha = useCallback((v: VehiculoFlota) => router.push(`${VEHICULOS_PATH}/${v.id}`), [router]);

  const columnas = useMemo<Column<VehiculoFlota>[]>(
    () => [
      {
        key: "vehiculo",
        label: "Vehículo",
        render: (v) => (
          <div className={styles.filaVehiculo}>
            <span className={styles.nombre}>{v.nombre}</span>
            <span className={styles.placas}>{v.placas || "sin placas"}</span>
          </div>
        ),
      },
      { key: "estado", label: "Estado", render: (v) => <EstadoVehiculo v={v} /> },
      {
        key: "conductor",
        label: "Lo trae",
        render: (v) =>
          v.conductor ? (
            <div className={styles.filaVehiculo}>
              <span>{v.conductor.nombre}</span>
              {v.desde && <span className={styles.mini}>desde {formatoFecha(v.desde)}</span>}
            </div>
          ) : (
            <span className={styles.tenue}>—</span>
          ),
      },
      {
        key: "devolucion",
        label: "Devuelve",
        render: (v) =>
          v.proximaDevolucion ? (
            <span className={styles.num}>{formatoFecha(v.proximaDevolucion)}</span>
          ) : (
            <span className={styles.tenue}>—</span>
          ),
      },
      {
        key: "odometro",
        label: "Odómetro",
        numeric: true,
        render: (v) => (
          <div className={styles.filaVehiculo} style={{ alignItems: "flex-end" }}>
            <span>{formatoKm(v.odometroUltimo)}</span>
            {v.combustibleUltimoPct !== null && (
              <span className={styles.mini}>Tanque {nivelDeCombustible(v.combustibleUltimoPct)}</span>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  async function guardarAlta(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    setAltaError(null);
    setAltaOk(null);
    try {
      const creado = await crearVehiculoInventario(token, { nombre, placas, notas });
      setNombre("");
      setPlacas("");
      setNotas("");
      setAltaOk(`${creado.nombre} quedó en la flotilla`);
      await cargar();
    } catch (err) {
      setAltaError(formatApiError(err, "No se pudo agregar el vehículo"));
    } finally {
      setGuardando(false);
    }
  }

  const chips: { key: Filtro; label: string; cuenta: number }[] = [
    { key: "todos", label: "Todos", cuenta: kpis.total },
    { key: "disponibles", label: "Libres", cuenta: kpis.disponibles },
    { key: "uso", label: "Ocupados", cuenta: kpis.uso },
    ...(kpis.fuera > 0 ? [{ key: "fuera" as const, label: "Taller o baja", cuenta: kpis.fuera }] : []),
  ];

  const primeraCarga = cargando && !cargadoUnaVez;
  const hayFiltro = filtro !== "todos" || busqueda.trim() !== "";

  return (
    <div className={styles.wrap}>
      <PageHeader
        eyebrow="Core · Vehículos"
        title="Flotilla"
        density="ops"
        actions={
          <>
            {puedeAlta && (
              <Button
                variant="primary"
                aria-expanded={showAlta}
                onClick={() => {
                  setShowAlta((v) => !v);
                  setAltaError(null);
                  setAltaOk(null);
                }}
              >
                {showAlta ? "Cerrar" : "Agregar"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => void cargar()} disabled={cargando}>
              {cargando && cargadoUnaVez ? "Actualizando…" : "Actualizar"}
            </Button>
            {verGps && (
              <Button variant="secondary" onClick={() => router.push(VEHICULOS_GPS_PATH)}>
                GPS
              </Button>
            )}
          </>
        }
      />

      <ContextRail
        ariaLabel="Vehículos"
        items={[
          { id: "flotilla", label: "Flotilla", href: VEHICULOS_PATH, active: true },
          { id: "mios", label: "Mis vehículos", href: MIS_VEHICULOS_PATH },
          ...(verGps ? [{ id: "gps", label: "GPS", href: VEHICULOS_GPS_PATH }] : []),
        ]}
      />

      {error && cargadoUnaVez && (
        <InlineAlert
          message={error}
          variant="warning"
          action={
            <Button size="sm" variant="ghost" onClick={() => void cargar()}>
              Reintentar
            </Button>
          }
        />
      )}

      {showAlta && puedeAlta && (
        <Section title="Nuevo vehículo">
          <form className={styles.altaForm} onSubmit={(e) => void guardarAlta(e)}>
            {altaError && <InlineAlert message={altaError} variant="danger" />}
            {altaOk && <InlineAlert message={altaOk} variant="success" />}
            <div className={styles.altaGrid}>
              <div className={styles.altaCampo}>
                <label htmlFor="vehiculo-nombre">Nombre</label>
                <input
                  id="vehiculo-nombre"
                  className={styles.input}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nissan Frontier 2026"
                  required
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <div className={styles.altaCampo}>
                <label htmlFor="vehiculo-placas">Placas</label>
                <input
                  id="vehiculo-placas"
                  className={styles.input}
                  value={placas}
                  onChange={(e) => setPlacas(e.target.value)}
                  placeholder="SR-36-051"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </div>
              <div className={styles.altaCampoFull}>
                <label htmlFor="vehiculo-notas">Notas (opcional)</label>
                <textarea
                  id="vehiculo-notas"
                  className={styles.input}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  placeholder="Color, número económico, detalles…"
                />
              </div>
            </div>
            <div className={styles.altaAcciones}>
              <Button type="submit" variant="primary" disabled={!nombre.trim() || guardando}>
                {guardando ? "Guardando…" : "Guardar en flotilla"}
              </Button>
            </div>
          </form>
        </Section>
      )}

      <div className={styles.kpis}>
        <KpiCard label="Vehículos" value={kpis.total} />
        <KpiCard label="Disponibles" value={kpis.disponibles} variant="positive" />
        <KpiCard label="En uso" value={kpis.uso} variant="accent" />
        {kpis.fuera > 0 && <KpiCard label="Fuera de servicio" value={kpis.fuera} variant="warning" />}
      </div>

      <Section
        title={primeraCarga ? "Cargando flotilla…" : `${visibles.length} de ${vehiculos.length} vehículos`}
        flush
      >
        {vehiculos.length > 0 && (
          <div className={styles.filtros}>
            <input
              type="search"
              className={styles.busqueda}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, placas o conductor…"
              aria-label="Buscar vehículo"
            />
            <div className={styles.chips} role="group" aria-label="Filtrar por estado">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`${styles.chip} ${filtro === c.key ? styles.chipActivo : ""}`}
                  aria-pressed={filtro === c.key}
                  onClick={() => setFiltro(c.key)}
                >
                  {c.label}
                  <span className={styles.chipCuenta}>{c.cuenta}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {primeraCarga ? (
          <div className={styles.cuerpoLista}>
            <SkeletonRows rows={5} label="Cargando flotilla" />
          </div>
        ) : error && vehiculos.length === 0 ? (
          <div style={{ padding: 20 }}>
            <EmptyState
              title="No se pudo cargar la flotilla"
              description={error}
              variant="compact"
              action={
                <Button size="sm" variant="secondary" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            />
          </div>
        ) : visibles.length === 0 && hayFiltro ? (
          <div style={{ padding: 20 }}>
            <EmptyState
              title="Ningún vehículo coincide"
              description="Prueba con otro nombre o quita el filtro de estado."
              variant="compact"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setBusqueda("");
                    setFiltro("todos");
                  }}
                >
                  Quitar filtros
                </Button>
              }
            />
          </div>
        ) : pantallaChica && visibles.length > 0 ? (
          <div className={styles.cuerpoLista}>
            <ul className={styles.tarjetas} aria-label="Vehículos">
              {visibles.map((v) => (
                <li key={v.id}>
                  <button type="button" className={styles.tarjeta} onClick={() => abrirFicha(v)}>
                    <span className={styles.viajeTop} style={{ width: "100%" }}>
                      <span className={styles.filaVehiculo}>
                        <span className={styles.nombre}>{v.nombre}</span>
                        <span className={styles.placas}>{v.placas || "sin placas"}</span>
                      </span>
                      <EstadoVehiculo v={v} />
                    </span>
                    <span className={styles.tarjetaPie}>
                      <span>{v.conductor ? `Lo trae ${v.conductor.nombre}` : "Sin conductor"}</span>
                      <span>{formatoKm(v.odometroUltimo)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <DataTable
            columns={columnas}
            rows={visibles}
            rowKey={(v) => v.id}
            density="compact"
            ariaLabel="Flotilla"
            onRowClick={abrirFicha}
            emptyTitle="Sin vehículos"
            emptyDescription={
              puedeAlta ? "Agrega la primera unidad con el botón Agregar." : "La flotilla está vacía."
            }
            emptyAction={
              puedeAlta ? (
                <Button size="sm" variant="primary" onClick={() => setShowAlta(true)}>
                  Agregar vehículo
                </Button>
              ) : undefined
            }
          />
        )}
      </Section>
    </div>
  );
}
