"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import DataTable, { Tag, type Column } from "@/components/ui/DataTable";
import { ButtonLink, SkeletonRows } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { Aviso } from "@/components/mesa-contable/piezas";
import { Barra, KpiBanda, c, v } from "@/components/vehiculos/piezas";
import { pesos, pesos2 } from "@/lib/costos";
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
  etiquetaEstatus,
  formatoFecha,
  formatoKm,
  listarFlotilla,
  nivelDeCombustible,
  type VehiculoFlota,
} from "@/lib/vehiculos-api";
import {
  getFlotillaMes,
  km,
  kmPorLitro,
  mesActual,
  mesesRecientes,
  nombreMes,
  repartoDelMes,
  textoServicio,
  type FlotillaMes,
} from "@/lib/vehiculos-ficha";
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
 * Flotilla en Core (`/erp/vehiculos`): qué hay, quién lo trae, cuándo vuelve, cuánto cuesta cada
 * kilómetro y a dónde se fue el costo del mes. El dinero solo lo ve quien ya ve costos completos.
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

  const [mes, setMes] = useState(() => mesActual());
  const [datosMes, setDatosMes] = useState<FlotillaMes | null>(null);
  const meses = useMemo(() => mesesRecientes(6), []);

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

  // Va aparte: si falla, la flotilla de siempre se sigue viendo.
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    getFlotillaMes(token, mes)
      .then((d) => vivo && setDatosMes(d?.resumen ? d : null))
      .catch(() => vivo && setDatosMes(null));
    return () => {
      vivo = false;
    };
  }, [token, mes]);

  const veCostos = Boolean(datosMes?.acceso?.veCostos);
  const delMes = useMemo(() => new Map((datosMes?.vehiculos ?? []).map((x) => [x.id, x])), [datosMes]);
  const reparto = datosMes && veCostos ? repartoDelMes(datosMes.reparto) : null;

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
              {v.proximaDevolucion ? (
                <span className={styles.mini}>devuelve {formatoFecha(v.proximaDevolucion)}</span>
              ) : v.desde ? (
                <span className={styles.mini}>desde {formatoFecha(v.desde)}</span>
              ) : null}
            </div>
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
      {
        key: "kmMes",
        label: "Km del mes",
        numeric: true,
        render: (v) => {
          const fila = delMes.get(v.id);
          return fila?.kmDelMes ? fila.kmDelMes.toLocaleString("es-MX") : <span className={styles.tenue}>—</span>;
        },
      },
      ...(veCostos
        ? [
            {
              key: "porKm",
              label: "Costo por km",
              numeric: true,
              render: (v: VehiculoFlota) => {
                const porKm = delMes.get(v.id)?.porKm;
                return porKm != null ? <strong>{pesos2(porKm)}</strong> : <span className={styles.tenue}>—</span>;
              },
            } satisfies Column<VehiculoFlota>,
          ]
        : []),
      {
        key: "rendimiento",
        label: "Rendimiento real",
        numeric: true,
        render: (v) => {
          const fila = delMes.get(v.id);
          if (!fila?.rendimientoReal && !fila?.rendimientoOficial) return <span className={styles.tenue}>—</span>;
          return (
            <div className={styles.filaVehiculo} style={{ alignItems: "flex-end" }}>
              <span>{kmPorLitro(fila.rendimientoReal)}</span>
              {fila.rendimientoOficial ? <span className={styles.mini}>oficial {fila.rendimientoOficial}</span> : null}
            </div>
          );
        },
      },
      {
        key: "servicio",
        label: "Próximo servicio",
        render: (v) => {
          const proximo = delMes.get(v.id)?.proximoServicio;
          if (!proximo) return <span className={styles.tenue}>—</span>;
          return (
            <span
              style={
                proximo.estado === "VENCIDO"
                  ? { color: "var(--ui-danger-text, #8f2626)", fontWeight: 600 }
                  : proximo.estado === "PRONTO"
                    ? { color: "var(--ui-warning-text)", fontWeight: 500 }
                    : undefined
              }
            >
              {textoServicio(proximo)}
            </span>
          );
        },
      },
    ],
    [delMes, veCostos],
  );

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
      <header className={c.band}>
        <div className={c.bandHead}>
          <div>
            <div className={c.crumb}>{datosMes ? nombreMes(datosMes.mes) : "Core · Vehículos"}</div>
            <h1 className={c.bandTitle}>Vehículos</h1>
            <p className={c.bandSub}>Cuánto cuesta cada kilómetro, a qué trabajo se fue y cuándo le toca servicio a cada vehículo.</p>
          </div>
          <div className={v.acciones}>
            {puedeAlta && (
              <ButtonLink href={`${VEHICULOS_PATH}/nuevo`} variant="primary">
                Agregar vehículo
              </ButtonLink>
            )}
            <Button variant="ghost" onClick={() => void cargar()} disabled={cargando}>
              {cargando && cargadoUnaVez ? "Actualizando…" : "Actualizar"}
            </Button>
            {verGps && (
              <Button variant="secondary" onClick={() => router.push(VEHICULOS_GPS_PATH)}>
                GPS
              </Button>
            )}
          </div>
        </div>
        <div className={c.kpis}>
          {veCostos && datosMes ? (
            <>
              <KpiBanda cifra={pesos(datosMes.resumen.costoMes)} texto="Costo de la flotilla en el mes" />
              <KpiBanda cifra={km(datosMes.resumen.km)} texto="Recorridos, de las fotos del tablero" />
              <KpiBanda cifra={pesos2(datosMes.resumen.porKm)} texto="Por kilómetro, en promedio" />
              <KpiBanda cifra={pesos(datosMes.resumen.aIndirectos)} texto="Se va a indirectos" tono="atencion" />
            </>
          ) : (
            <>
              <KpiBanda cifra={kpis.total} texto="Vehículos" />
              <KpiBanda cifra={kpis.disponibles} texto="Disponibles" tono="ok" />
              <KpiBanda cifra={kpis.uso} texto="En uso" />
              {kpis.fuera > 0 && <KpiBanda cifra={kpis.fuera} texto="Fuera de servicio" tono="atencion" />}
              {datosMes?.resumen ? <KpiBanda cifra={km(datosMes.resumen.km)} texto="Recorridos en el mes" /> : null}
            </>
          )}
        </div>
        <nav className={c.tabs} aria-label="Vehículos">
          <Link href={VEHICULOS_PATH} className={c.tab} aria-current="page">
            Flotilla
          </Link>
          <Link href={MIS_VEHICULOS_PATH} className={c.tab}>
            Mis vehículos
          </Link>
          {verGps && (
            <Link href={VEHICULOS_GPS_PATH} className={c.tab}>
              Mapa
            </Link>
          )}
        </nav>
      </header>

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
              puedeAlta ? "Agrega la primera unidad con su manual." : "La flotilla está vacía."
            }
            emptyAction={
              puedeAlta ? (
                <ButtonLink size="sm" variant="primary" href={`${VEHICULOS_PATH}/nuevo`}>
                  Agregar vehículo
                </ButtonLink>
              ) : undefined
            }
          />
        )}
      </Section>

      {datosMes && (reparto || datosMes.avisos.length) ? (
        <div className={v.columnas}>
          {reparto ? (
            <section className={c.card} style={{ flex: "999 1 560px", minWidth: 0 }}>
              <div className={v.cabecera}>
                <h2 className={v.titulo}>A dónde se fue el costo este mes</h2>
                <select className={v.selectorMes} value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes">
                  {meses.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.texto}
                    </option>
                  ))}
                </select>
              </div>
              <p className={v.nota}>Lo que va a un proyecto es costo directo. La oficina y el tiempo parado se van a indirectos.</p>
              <Barra
                etiqueta={`Reparto del costo de la flotilla: ${reparto.renglones.map((r) => `${r.nombre} ${r.pct} por ciento`).join(", ")}`}
                partes={reparto.renglones.map((r) => ({ tono: r.tono, pct: r.pct }))}
              />
              {reparto.renglones.map((r) => (
                <div className={v.renglon} key={r.id}>
                  <span className={v.punto} data-tono={r.tono} aria-hidden="true" />
                  <div className={v.renglonTexto}>
                    <b>{r.nombre}</b>
                    <span>{r.nota}</span>
                  </div>
                  <span className={v.renglonDato}>{r.km == null ? "—" : km(r.km)}</span>
                  <span className={v.renglonImporte}>{pesos(r.importe)}</span>
                </div>
              ))}
            </section>
          ) : null}
          {datosMes.avisos.length ? (
            <section className={c.card} style={{ flex: "1 1 320px", minWidth: 0 }}>
              <h2 className={v.titulo} style={{ marginBottom: 10 }}>
                Requiere atención
              </h2>
              <div className={c.notas} style={{ marginTop: 0 }}>
                {datosMes.avisos.map((a) => (
                  <Link key={`${a.vehicleId}-${a.titulo}`} href={`${VEHICULOS_PATH}/${a.vehicleId}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <Aviso tono={a.tono} titulo={`${a.titulo}.`}>
                      {a.texto}
                    </Aviso>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
