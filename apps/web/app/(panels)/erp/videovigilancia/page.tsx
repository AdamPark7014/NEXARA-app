"use client";

/**
 * Videovigilancia · lista de diseños y alta (`docs/DISENADOR-CCTV.md`). Mockup aprobado por Adam
 * el 29-10-2026 (lienzo «Diseñador de videovigilancia — mockup», artboard 0).
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  DataTable,
  EmptyState,
  Field,
  Input,
  ModulePage,
  Select,
  type Column,
} from "@/components/base";
import { useUser } from "@/components/UserContext";
import { ETIQUETA_ESTADO_DISENO, consultarAcceso, crearDiseno, listarDisenos, type DisenoFila } from "@/lib/cctv/api";
import { listSalesClients, type SalesClient } from "@/lib/sales-api";
import styles from "./videovigilancia.module.css";

const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function VideovigilanciaPage() {
  const { token } = useUser();
  const router = useRouter();
  const [acceso, setAcceso] = useState<boolean | null>(null);
  const [disenos, setDisenos] = useState<DisenoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alta, setAlta] = useState(false);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const puede = await consultarAcceso(token);
      setAcceso(puede);
      if (puede) setDisenos(await listarDisenos(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los diseños.");
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  if (acceso === false) {
    return (
      <div className={styles.sinAcceso}>
        <EmptyState
          icon={<VideocamOutlinedIcon />}
          title="El diseñador de videovigilancia es para encargados de área"
          description="Lo usan los encargados de área y el arquitecto. Si lo necesitas para un proyecto, pídele a tu encargado que lo abra contigo."
          tone="neutral"
        />
      </div>
    );
  }

  const columnas: Column<DisenoFila>[] = [
    {
      key: "nombre",
      label: "Diseño",
      render: (d) => (
        <div>
          <div className={styles.nombre}>{d.nombre}</div>
          <div className={styles.tenue}>{d.cotizacionId ? `Cotización ligada` : "Sin cotización ligada"}</div>
        </div>
      ),
    },
    { key: "cliente", label: "Cliente", render: (d) => d.clienteNombre ?? <span className={styles.tenue}>Sin cliente</span> },
    { key: "camaras", label: "Cámaras", numeric: true, align: "right", render: (d) => d.resumen?.camaras ?? 0 },
    {
      key: "cobertura",
      label: "Interior cubierto",
      render: (d) => {
        const c = d.resumen?.cobertura;
        if (!c) return <span className={styles.tenue}>Sin muros</span>;
        return (
          <span className={styles.cobertura}>
            <span className={styles.barra} aria-hidden="true">
              <span style={{ width: `${Math.min(c.cubierto, 100)}%` }} />
            </span>
            <b>{Math.round(c.cubierto)} %</b>
          </span>
        );
      },
    },
    {
      key: "estado",
      label: "Estado",
      render: (d) => (
        <Badge tone={d.estado === "aprobada" ? "success" : d.estado === "enviada" ? "info" : "neutral"}>
          {ETIQUETA_ESTADO_DISENO[d.estado] ?? d.estado}
        </Badge>
      ),
    },
    { key: "responsable", label: "Responsable", render: (d) => d.creadoPor?.nombre ?? "—" },
    {
      key: "actualizado",
      label: "Actualizado",
      render: (d) => (
        <span className={styles.tenue} title={d.actualizadoPor ? `Por ${d.actualizadoPor.nombre}` : undefined}>
          {fecha.format(new Date(d.updatedAt))}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.pagina}>
      <ModulePage
        title="Videovigilancia"
        description="Diseña el sistema sobre el plano del sitio, revisa qué ve cada cámara y saca la propuesta para el cliente."
        breadcrumbs={[{ label: "Clientes y obra" }, { label: "Videovigilancia" }]}
        icon={<VideocamOutlinedIcon />}
        primaryAction={
          <Button variant="primary" iconStart={<AddRoundedIcon />} onClick={() => setAlta(true)} disabled={!acceso}>
            Nuevo diseño
          </Button>
        }
        before={
          <>
            {error ? (
              <Alert tone="danger" action={<Button size="sm" onClick={() => void cargar()}>Reintentar</Button>}>
                {error}
              </Alert>
            ) : null}
            {alta && token ? (
              <AltaDiseno
                token={token}
                onCancelar={() => setAlta(false)}
                onCreado={(id) => router.push(`/erp/videovigilancia/${id}`)}
              />
            ) : null}
          </>
        }
        listLabel="Diseños de videovigilancia"
        loading={cargando && !disenos.length}
        empty={!cargando && !disenos.length}
        emptyState={{
          title: "Todavía no hay diseños",
          description: "Crea el primero con el croquis del sitio: Core lee los muros, tú calibras con una cota y colocas las cámaras.",
          tone: "brand",
          action: (
            <Button variant="primary" iconStart={<AddRoundedIcon />} onClick={() => setAlta(true)}>
              Nuevo diseño
            </Button>
          ),
        }}
      >
        <DataTable
          flush
          ariaLabel="Diseños de videovigilancia"
          columns={columnas}
          rows={disenos}
          rowKey={(d) => d.id}
          onRowClick={(d) => router.push(`/erp/videovigilancia/${d.id}`)}
          rowActionsLabel="Acciones"
          rowActions={(d) => (
            <ButtonLink href={`/erp/videovigilancia/${d.id}`} size="sm" variant="tertiary">
              Abrir plano
            </ButtonLink>
          )}
        />
      </ModulePage>
    </div>
  );
}

function AltaDiseno({ token, onCancelar, onCreado }: { token: string; onCancelar: () => void; onCreado: (id: number) => void }) {
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clientes, setClientes] = useState<SalesClient[] | null>(null);
  const [sinPadron, setSinPadron] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listSalesClients(token)
      .then((lista) => vivo && setClientes(lista.slice().sort((a, b) => a.name.localeCompare(b.name, "es"))))
      .catch(() => vivo && setSinPadron(true));
    return () => {
      vivo = false;
    };
  }, [token]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("Ponle nombre al diseño.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const d = await crearDiseno(token, { nombre: nombre.trim(), clienteId: clienteId ? Number(clienteId) : null });
      onCreado(d.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el diseño.");
      setGuardando(false);
    }
  };

  return (
    <form className={styles.alta} onSubmit={enviar} aria-label="Nuevo diseño">
      <div className={styles.altaCabeza}>
        <h2>Nuevo diseño</h2>
        <p>Después de crearlo subes el croquis (JPG, PNG o PDF) y lo calibras con una cota.</p>
      </div>
      <div className={styles.altaCampos}>
        <Field label="Nombre del diseño" required error={error}>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. CCTV Bodega Norte" maxLength={160} autoFocus />
        </Field>
        <Field label="Cliente" optional hint={sinPadron ? "No tienes acceso al padrón de clientes; puedes ligarlo después." : undefined}>
          <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={!clientes}>
            <option value="">{clientes ? "Sin cliente por ahora" : sinPadron ? "Sin acceso al padrón" : "Cargando clientes…"}</option>
            {(clientes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className={styles.altaPie}>
        <Button type="button" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={guardando}>
          Crear y abrir el plano
        </Button>
      </div>
    </form>
  );
}
