"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import {
  Alert,
  Button,
  DataTable,
  ListFooter,
  ModulePage,
  ModuleToolbar,
  PersonCell,
  SearchInput,
  StatusBadge,
  WhenCell,
  type Column,
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

  const columnas: Column<WorkflowBucketItem>[] = [
    {
      key: "actividad",
      label: "Actividad",
      render: (i) => (
        <span className={s.actividad}>
          <span className={s.titulo}>{i.titulo}</span>
          {i.anNumber || i.detalle ? (
            <span className={s.detalle}>
              {i.anNumber ? <span className={c.folio}>{i.anNumber}</span> : null}
              {i.anNumber && i.detalle ? " · " : null}
              {i.detalle}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "persona",
      label: "Persona",
      width: 220,
      render: (i) =>
        i.persona ? (
          <PersonCell name={i.persona.nombre} avatarUrl={i.persona.avatarUrl} subtitle={i.persona.puesto ?? undefined} />
        ) : (
          <span className={c.pista}>—</span>
        ),
    },
    {
      key: "estado",
      label: "Estado",
      width: 160,
      render: (i) => (i.estatus ? <StatusBadge size="sm" status={i.estatus} /> : <span className={c.pista}>—</span>),
    },
    {
      key: "fecha",
      label: "Fecha",
      width: 130,
      render: (i) => <WhenCell time={fecha(i.fecha)} hint={hora(i.fecha)} />,
    },
  ];

  return (
    <div className={s.pagina}>
      <ModulePage
        back={{ href: "/erp/pizarra/flujo", label: "Flujo de actividades" }}
        title={WORKFLOW_BUCKET_LABELS[bucket]}
        description={
          bucket === "peerRejected"
            ? "Solicitudes entre compañeros que no se aceptaron."
            : "Las actividades que componen este número."
        }
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
              {data ? `${error}. Se muestra lo último que cargó.` : error}
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
          title: "Nada en este número para el periodo elegido",
          description: "Prueba con otro rango de fechas.",
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
          <DataTable
            columns={columnas}
            rows={visibles}
            rowKey={(i) => i.id}
            onRowClick={(i) => {
              if (i.activityId) router.push(`/erp/actividades/${i.activityId}`);
            }}
            flush
            ariaLabel={WORKFLOW_BUCKET_LABELS[bucket]}
            emptyTitle="Nadie coincide con la búsqueda"
          />
        ) : null}
      </ModulePage>
    </div>
  );
}
