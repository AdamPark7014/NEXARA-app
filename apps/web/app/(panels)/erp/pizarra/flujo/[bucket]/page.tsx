"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import {
  Alert,
  Button,
  ListFooter,
  ModulePage,
  ModuleToolbar,
  PersonCell,
  SearchInput,
  StatusBadge,
  WhenCell,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { RangoSelector } from "@/components/pizarra/PizarraKpi";
import { formatApiError } from "@/lib/erp-api";
import {
  WORKFLOW_BUCKET_LABELS,
  fetchWorkflowBucket,
  rangoDePreset,
  type BoardRange,
  type RangoPreset,
  type WorkflowBucket,
  type WorkflowBucketItem,
  type WorkflowBucketResponse,
} from "@/lib/team-board-api";
import c from "@/components/pizarra/comun.module.css";
import s from "../flujo.module.css";

const BUCKETS = new Set<string>(Object.keys(WORKFLOW_BUCKET_LABELS));

function esBucketValido(v: string | string[] | undefined): v is WorkflowBucket {
  return typeof v === "string" && BUCKETS.has(v);
}

function fecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

function hora(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export default function FlujoBucketPage() {
  const params = useParams();
  const router = useRouter();
  const bucketParam = params?.bucket;
  const bucket = esBucketValido(bucketParam) ? bucketParam : null;
  const { user } = useUser();
  const token = user?.token ?? "";
  const [preset, setPreset] = useState<RangoPreset>("semana");
  const [rango, setRango] = useState<BoardRange>(() => rangoDePreset("semana"));
  const [data, setData] = useState<WorkflowBucketResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    if (!token || !bucket) return;
    setCargando(true);
    setError(null);
    try {
      setData(await fetchWorkflowBucket(token, bucket, rango));
    } catch (e) {
      // Un fallo al refrescar no borra la lista que ya se veía: solo se avisa.
      setError(formatApiError(e, "No se pudo cargar el detalle"));
    } finally {
      setCargando(false);
    }
  }, [token, bucket, rango]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return items;
    return items.filter((i) => normalizar(`${i.anNumber ?? ""} ${i.titulo} ${i.persona?.nombre ?? ""}`).includes(q));
  }, [items, busqueda]);

  if (!bucket) {
    return (
      <div className={s.pagina}>
        <ModulePage
          back={{ href: "/erp/pizarra/flujo", label: "Flujo de actividades" }}
          title="Dato desconocido"
          card={false}
        >
          <Alert tone="danger" role="alert">
            No reconozco ese dato del flujo.
          </Alert>
        </ModulePage>
      </div>
    );
  }

  const fila = {
    width: "100%",
    display: "grid",
    gap: 4,
    padding: "12px 16px",
    border: 0,
    borderBottom: "1px solid var(--ui-border-subtle)",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    textAlign: "left" as const,
    cursor: "pointer",
  };

  return (
    <div className={s.pagina}>
      <ModulePage
        back={{ href: "/erp/pizarra/flujo", label: "Flujo de actividades" }}
        title={WORKFLOW_BUCKET_LABELS[bucket]}
        before={
          error ? (
            <Alert
              tone={data ? "warning" : "danger"}
              role="alert"
              action={
                <Button size="sm" className={c.tap} onClick={() => void cargar()} loading={cargando}>
                  Reintentar
                </Button>
              }
            >
              {data ? "No se pudo actualizar." : error}
            </Alert>
          ) : null
        }
        toolbar={
          <ModuleToolbar
            search={
              <SearchInput
                placeholder="Buscar folio, actividad o persona"
                aria-label="Buscar folio, actividad o persona"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            }
            end={
              <RangoSelector
                preset={preset}
                rango={rango}
                onChange={(p, r) => {
                  setPreset(p);
                  setRango(r);
                }}
              />
            }
          />
        }
        loading={cargando && !data}
        loadingRows={5}
        empty={!cargando && Boolean(data) && items.length === 0}
        emptyState={{
          icon: <InboxOutlinedIcon />,
          title: "Nada en este número para el periodo elegido.",
          tone: "neutral",
        }}
        footer={
          items.length > 0 ? (
            <ListFooter>
              {busqueda.trim() ? `${visibles.length} de ${items.length} actividades` : `${items.length} actividades`}
            </ListFooter>
          ) : null
        }
        listLabel={WORKFLOW_BUCKET_LABELS[bucket]}
      >
        {items.length > 0 ? (
          visibles.length === 0 ? (
            <p className={c.tenue} style={{ padding: "16px" }}>
              Nadie coincide con la búsqueda.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {visibles.map((i) => {
                const cuerpo = (
                  <>
                    <span className={s.titulo}>{i.titulo}</span>
                    {i.anNumber ? <span className={c.folio}>{i.anNumber}</span> : null}
                    {i.detalle ? <span className={s.detalle}>{i.detalle}</span> : null}
                    {i.persona ? (
                      <PersonCell name={i.persona.nombre} avatarUrl={i.persona.avatarUrl} subtitle={i.persona.puesto ?? undefined} />
                    ) : (
                      <span className={c.pista}>Sin persona</span>
                    )}
                    {i.estatus ? <StatusBadge size="sm" status={i.estatus} /> : <span className={c.pista}>Sin estado</span>}
                    <WhenCell time={fecha(i.fecha)} hint={hora(i.fecha)} />
                  </>
                );
                return (
                  <li key={i.id}>
                    {i.activityId ? (
                      <button type="button" className={s.actividad} style={fila} onClick={() => router.push(`/erp/actividades/${i.activityId}`)}>
                        {cuerpo}
                      </button>
                    ) : (
                      <div className={s.actividad} style={{ ...fila, cursor: "default" }}>
                        {cuerpo}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </ModulePage>
    </div>
  );
}
