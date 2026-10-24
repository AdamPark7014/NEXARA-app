"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import {
  FilterChip,
  FilterChips,
  ListFooter,
  ModulePage,
  ModuleToolbar,
  SearchInput,
} from "@/components/base";
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

function EstadoVehiculo({ v, apilado = false }: { v: VehiculoFlota; apilado?: boolean }) {
  const est = etiquetaEstatus(v.estatus);
  const estado = (
    <Tag variant={v.disponible ? "positive" : est.variante} dot>
      {v.disponible ? "Disponible" : est.texto}
    </Tag>
  );
  const gps = v.tieneRastreador ? (
    <span title={`Rastreador GPS: ${v.gpsProveedor || "instalado"}`}>
      <Tag variant="neutral" size="sm">GPS</Tag>
    </span>
  ) : null;
  if (apilado) {
    return (
      <>
        <span className={styles.linea}>{estado}</span>
        {gps ? <span className={styles.linea}>{gps}</span> : null}
      </>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {estado}
      {gps}
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

  const quitarFiltros = () => {
    setBusqueda("");
    setFiltro("todos");
  };

  const sinFlotilla = !primeraCarga && !error && vehiculos.length === 0;
  const sinCoincidencias = !primeraCarga && vehiculos.length > 0 && visibles.length === 0;
  const fraseVacia = sinCoincidencias
    ? "Ningún vehículo coincide con estos filtros."
    : "Todavía no hay vehículos en la flotilla.";

  return (
    <ModulePage
      className={styles.wrap}
      title="Vehículos"
      primaryAction={
        puedeAlta ? (
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
        ) : undefined
      }
      secondaryActions={
        <>
          <Link href={MIS_VEHICULOS_PATH} className={styles.enlace}>
            Mis vehículos
          </Link>
          {verGps ? (
            <Button variant="secondary" onClick={() => router.push(VEHICULOS_GPS_PATH)}>
              GPS
            </Button>
          ) : null}
        </>
      }
      before={
        <>
          {error ? (
            <InlineAlert
              message={error}
              variant={vehiculos.length ? "warning" : "danger"}
              action={
                <Button size="sm" variant="ghost" onClick={() => void cargar()}>
                  Reintentar
                </Button>
              }
            />
          ) : null}
          {showAlta && puedeAlta ? (
            <Section title="Nuevo vehículo">
              <form className={styles.altaForm} onSubmit={(e) => void guardarAlta(e)}>
                {altaError ? <InlineAlert message={altaError} variant="danger" /> : null}
                {altaOk ? <InlineAlert message={altaOk} variant="success" /> : null}
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
                    <label htmlFor="vehiculo-notas">Notas</label>
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
          ) : null}
        </>
      }
      listLabel="Flotilla"
      toolbar={
        vehiculos.length > 0 ? (
          <ModuleToolbar
            search={
              <SearchInput
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, placas o conductor"
                aria-label="Buscar vehículo"
              />
            }
            chips={
              <FilterChips ariaLabel="Filtrar por estado">
                {chips.map((c) => (
                  <FilterChip key={c.key} active={filtro === c.key} count={c.cuenta} onClick={() => setFiltro(c.key)}>
                    {c.label}
                  </FilterChip>
                ))}
              </FilterChips>
            }
            end={
              hayFiltro ? (
                <Button size="sm" variant="ghost" onClick={quitarFiltros}>
                  Quitar filtros
                </Button>
              ) : null
            }
          />
        ) : undefined
      }
      loading={primeraCarga}
      loadingRows={5}
      empty={sinFlotilla || sinCoincidencias}
      emptyState={{
        title: fraseVacia,
        action: sinCoincidencias ? (
          <Button size="sm" variant="secondary" onClick={quitarFiltros}>
            Quitar filtros
          </Button>
        ) : puedeAlta ? (
          <Button size="sm" variant="primary" onClick={() => setShowAlta(true)}>
            Agregar
          </Button>
        ) : undefined,
      }}
      footer={
        !primeraCarga && visibles.length > 0 ? (
          <ListFooter total={visibles.length} unit={visibles.length === 1 ? "vehículo" : "vehículos"} />
        ) : undefined
      }
    >
      {visibles.length === 0 ? null : pantallaChica ? (
        <ul className={styles.tarjetas} aria-label="Vehículos">
          {visibles.map((v) => (
            <li key={v.id}>
              <button type="button" className={styles.tarjeta} onClick={() => abrirFicha(v)}>
                <span className={styles.lineaNombre}>{v.nombre}</span>
                <span className={styles.linea}>{v.placas || "sin placas"}</span>
                <EstadoVehiculo v={v} apilado />
                <span className={styles.linea}>{v.conductor ? v.conductor.nombre : "Sin conductor"}</span>
                {v.proximaDevolucion ? (
                  <span className={styles.linea}>Devuelve {formatoFecha(v.proximaDevolucion)}</span>
                ) : null}
                <span className={styles.linea}>{formatoKm(v.odometroUltimo)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <DataTable
          columns={columnas}
          rows={visibles}
          rowKey={(v) => v.id}
          density="compact"
          flush
          ariaLabel="Flotilla"
          onRowClick={abrirFicha}
          stickyHeader={false}
        />
      )}
    </ModulePage>
  );
}
