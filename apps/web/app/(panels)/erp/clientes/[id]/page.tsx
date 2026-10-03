"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FolderOffOutlinedIcon from "@mui/icons-material/FolderOffOutlined";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import { useUser } from "@/components/UserContext";
import {
  Alert,
  AsideCard,
  Button,
  ButtonLink,
  DateInput,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  LinkButton,
  Progress,
  RecordPage,
  RecordSection,
  Skeleton,
  StatusBadge,
  Tabs,
  Textarea,
} from "@/components/base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import { CLIENT_SECTOR_ICONS } from "@/components/erp/ClientSectorIcon";
import { formatApiError } from "@/lib/erp-api";
import {
  ALL_CLIENT_SECTORS,
  canAccessClientPadron,
  CLIENT_SECTOR_META,
  clientSectorsForUser,
  type ClientSector,
} from "@/lib/client-sectors";
import {
  addSalesClientSector,
  deactivateSalesClient,
  deleteSalesClient,
  getClientPermissions,
  getSalesClient,
  isInactiveClient,
  NO_CLIENT_PERMISSIONS,
  reactivateSalesClient,
  removeSalesClientSector,
  updateSalesClient,
  type ClientPermissions,
  type SalesClient,
} from "@/lib/sales-api";
import {
  deactivateOperationalProject,
  deleteOperationalProject,
  isInactiveOperationalProject,
  quickCreateOperationalProject,
  reactivateOperationalProject,
} from "@/lib/ops-operational-api";
import { etiquetaEstado, formatoFecha, listarProyectos, type ProyectoFila } from "@/lib/proyectos-api";
import { canUserAccessPath } from "@/lib/user-access";
import { nombreSector } from "../sectores";
import { TiposCliente } from "../_componentes/TiposCliente";
import styles from "../clientes-core.module.css";

const VACIO = {
  name: "",
  legalName: "",
  taxId: "",
  fiscalAddress: "",
  fiscalZipCode: "",
  fiscalRegime: "",
  billingEmail: "",
  billingPhone: "",
  notes: "",
};

type Edicion = typeof VACIO;
type Pestana = "proyectos" | "datos";

const RFC_MX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Avisos que no bloquean el guardado: hay clientes extranjeros con datos fuera del formato del SAT. */
function avisosEdicion(edit: Edicion): Partial<Record<keyof Edicion, string>> {
  const e: Partial<Record<keyof Edicion, string>> = {};
  const rfc = edit.taxId.trim().toUpperCase();
  if (rfc && !RFC_MX.test(rfc)) e.taxId = "Revisa el RFC: son 12 caracteres (empresa) o 13 (persona física)";
  if (edit.billingEmail.trim() && !EMAIL.test(edit.billingEmail.trim())) e.billingEmail = "Revisa el correo";
  if (edit.fiscalZipCode.trim() && !/^\d{5}$/.test(edit.fiscalZipCode.trim())) e.fiscalZipCode = "El código postal lleva 5 dígitos";
  return e;
}

/** Solo lo que hace falta para pedir confirmación y llamar a la API. */
type ProyectoDelCliente = Pick<ProyectoFila, "id" | "title">;

/** «12 sep 2026 → 30 nov 2026», o lo que haya: un proyecto recién creado puede no tener fechas. */
function plazoDelProyecto(p: ProyectoFila): string | null {
  if (!p.startDate && !p.endDate) return null;
  if (!p.endDate) return `Inicio ${formatoFecha(p.startDate)}`;
  if (!p.startDate) return `Fin ${formatoFecha(p.endDate)}`;
  return `${formatoFecha(p.startDate)} → ${formatoFecha(p.endDate)}`;
}

function tonoDelProyecto(status: string): "neutral" | "info" | "success" | "warning" {
  if (status === "ACTIVE") return "info";
  if (status === "COMPLETED") return "success";
  if (status === "PLANNED") return "warning";
  return "neutral";
}

function Dato({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? `${styles.dato} ${styles.datoFull}` : styles.dato}>
      <dt>{label}</dt>
      <dd>{children || <span className={styles.vacio}>Sin capturar</span>}</dd>
    </div>
  );
}

/**
 * Aviso amarillo bajo el campo: no impide guardar. Siempre hay una pista de respaldo: si la
 * pista apareciera y desapareciera, `Field` remontaría el control a media captura.
 */
function aviso(texto?: string) {
  return texto ? <span className={styles.aviso}>{texto}</span> : undefined;
}

function Cargando() {
  return (
    <div className={styles.pagina} aria-busy="true" aria-label="Cargando cliente">
      <div className={styles.skeletonHead}>
        <Skeleton width={120} height={12} />
        <Skeleton width="42%" height={26} />
        <Skeleton width={260} height={14} />
      </div>
      <div className={styles.skeletonCuerpo}>
        <Skeleton height={320} radius={16} />
        <Skeleton height={240} radius={16} />
      </div>
    </div>
  );
}

export default function ClienteDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useUser();
  const id = Number(params?.id);

  const [client, setClient] = useState<SalesClient | null>(null);
  const [projects, setProjects] = useState<ProyectoFila[]>([]);
  const [projectsLoadErr, setProjectsLoadErr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectApiError, setProjectApiError] = useState<string | null>(null);
  const [projectStart, setProjectStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [permisos, setPermisos] = useState<ClientPermissions>(NO_CLIENT_PERMISSIONS);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [editando, setEditando] = useState(false);
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [edit, setEdit] = useState<Edicion>(VACIO);
  const [pestana, setPestana] = useState<Pestana>("proyectos");

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    getClientPermissions(token)
      .then((p) => vivo && setPermisos(p))
      .catch(() => vivo && setPermisos(NO_CLIENT_PERMISSIONS));
    return () => {
      vivo = false;
    };
  }, [token]);

  const mySectors = useMemo(() => clientSectorsForUser(user), [user]);
  const clientSectors = useMemo(
    () => (client?.sectors ?? []).map((s) => s.sector as ClientSector),
    [client],
  );
  const addable = useMemo(
    () => ALL_CLIENT_SECTORS.filter((s) => mySectors.includes(s) && !clientSectors.includes(s)),
    [mySectors, clientSectors],
  );
  const avisos = useMemo(() => avisosEdicion(edit), [edit]);

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(id)) return;
    setLoadError(null);
    try {
      const c = await getSalesClient(token, id);
      setClient(c);
      setProjectsLoadErr(null);
      if (c.serviceClientId) {
        try {
          // Los proyectos se ligan al cliente de operación; el filtro lo aplica el servidor.
          setProjects(await listarProyectos(token, { incluirCancelados: true, clientId: c.serviceClientId }));
        } catch (e) {
          setProjects([]);
          setProjectsLoadErr(formatApiError(e, "No se pudieron cargar los proyectos de este cliente"));
        }
      } else {
        setProjects([]);
      }
    } catch (e) {
      setLoadError(formatApiError(e, "No se pudo cargar el cliente"));
    }
  }, [token, id]);

  useEffect(() => {
    if (!canAccessClientPadron(user)) {
      router.replace("/erp/pizarra");
      return;
    }
    void load();
  }, [load, user, router]);

  const addSector = async (sector: ClientSector) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setClient(await addSalesClientSector(token, id, sector));
    } catch (e) {
      setError(formatApiError(e, "No se pudo agregar el sector"));
    } finally {
      setBusy(false);
    }
  };

  const removeSector = async (sector: ClientSector) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setClient(await removeSalesClientSector(token, id, sector));
    } catch (e) {
      setError(formatApiError(e, "No se pudo quitar el sector"));
    } finally {
      setBusy(false);
    }
  };

  const onCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !client) return;
    if (projectTitle.trim().length < 3) {
      setProjectError("El nombre del proyecto necesita al menos 3 letras");
      return;
    }
    setBusy(true);
    setProjectError(null);
    setProjectApiError(null);
    setError(null);
    try {
      // Alta mínima: el servidor liga el cliente a operación si faltaba y lo deja como
      // cliente de proyecto. Fechas, alcance y equipo se completan después en Proyectos.
      await quickCreateOperationalProject(token, {
        title: projectTitle.trim(),
        salesClientId: client.id,
        ...(projectStart ? { startDate: projectStart } : {}),
      });
      setProjectTitle("");
      await load();
    } catch (err) {
      // El mensaje de la API va tal cual (p. ej. el 403 del padrón): dice qué pedir y a quién.
      setProjectApiError(formatApiError(err, "No se pudo crear el proyecto"));
    } finally {
      setBusy(false);
    }
  };

  const abrirEdicion = () => {
    if (!client) return;
    setEdit({
      name: client.name ?? "",
      legalName: client.legalName ?? "",
      taxId: client.taxId ?? "",
      fiscalAddress: client.fiscalAddress ?? "",
      fiscalZipCode: client.fiscalZipCode ?? "",
      fiscalRegime: client.fiscalRegime ?? "",
      billingEmail: client.billingEmail ?? "",
      billingPhone: client.billingPhone ?? "",
      notes: client.notes ?? "",
    });
    setError(null);
    setIntentoGuardar(false);
    setPestana("datos");
    setEditando(true);
  };

  const onGuardarEdicion = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIntentoGuardar(true);
    if (edit.name.trim().length < 2) {
      document.getElementById("edit-name")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateSalesClient(token, id, {
        ...edit,
        name: edit.name.trim(),
        taxId: edit.taxId.trim().toUpperCase(),
      });
      setEditando(false);
      await load();
    } catch (err) {
      setError(formatApiError(err, "No se pudo guardar el cliente"));
    } finally {
      setBusy(false);
    }
  };

  const pedirCambioEstatus = (activar: boolean) => {
    if (!client) return;
    setConfirm({
      title: activar ? "Reactivar cliente" : "Desactivar cliente",
      message: activar
        ? `«${client.name}» volverá a estar activo en el padrón.`
        : `«${client.name}» quedará inactivo. Sus datos y su historial se conservan y podrás reactivarlo después.`,
      confirmLabel: activar ? "Reactivar" : "Desactivar",
      danger: !activar,
      fn: async () => {
        if (!token) return;
        setError(null);
        try {
          await (activar ? reactivateSalesClient(token, id) : deactivateSalesClient(token, id));
          await load();
        } catch (err) {
          setError(formatApiError(err, "No se pudo cambiar el estatus del cliente"));
        }
      },
    });
  };

  const pedirEliminar = () => {
    if (!client) return;
    setConfirm({
      title: "Eliminar cliente",
      message: `¿Eliminar «${client.name}» del padrón? Esta acción no se puede deshacer. Si solo ya no trabajan con él, mejor desactívalo.`,
      confirmLabel: "Eliminar",
      danger: true,
      fn: async () => {
        if (!token) return;
        setError(null);
        try {
          await deleteSalesClient(token, id);
          router.push("/erp/clientes");
        } catch (err) {
          setError(formatApiError(err, "No se pudo eliminar el cliente"));
        }
      },
    });
  };

  // Proyectos: misma regla que el cliente (solo Christian desactiva, reactiva o elimina).
  const pedirCambioEstatusProyecto = (p: ProyectoDelCliente, activar: boolean) => {
    setConfirm({
      title: activar ? "Reactivar proyecto" : "Desactivar proyecto",
      message: activar
        ? `«${p.title}» volverá a estar activo.`
        : `«${p.title}» quedará inactivo. Sus actividades y su historial se conservan y podrás reactivarlo después.`,
      confirmLabel: activar ? "Reactivar" : "Desactivar",
      danger: !activar,
      fn: async () => {
        if (!token) return;
        setError(null);
        try {
          await (activar ? reactivateOperationalProject(token, p.id) : deactivateOperationalProject(token, p.id));
          await load();
        } catch (err) {
          setError(formatApiError(err, "No se pudo cambiar el estatus del proyecto"));
        }
      },
    });
  };

  const pedirEliminarProyecto = (p: ProyectoDelCliente) => {
    setConfirm({
      title: "Eliminar proyecto",
      message: `¿Eliminar el proyecto «${p.title}»? Esta acción no se puede deshacer. Sus actividades conservan su historial. Si solo está detenido, mejor desactívalo.`,
      confirmLabel: "Eliminar",
      danger: true,
      fn: async () => {
        if (!token) return;
        setError(null);
        try {
          await deleteOperationalProject(token, p.id);
          await load();
        } catch (err) {
          setError(formatApiError(err, "No se pudo eliminar el proyecto"));
        }
      },
    });
  };

  if (!Number.isFinite(id)) {
    return (
      <div className={styles.pagina}>
        <EmptyState
          icon={<ErrorOutlineRoundedIcon />}
          title="Este cliente no existe"
          description="El enlace está incompleto o el cliente ya no está en el padrón."
          action={<ButtonLink href="/erp/clientes">Volver a clientes</ButtonLink>}
        />
      </div>
    );
  }
  if (!client && loadError) {
    return (
      <div className={styles.pagina}>
        <EmptyState
          icon={<ErrorOutlineRoundedIcon />}
          title="No pudimos abrir el cliente"
          description={loadError}
          tone="danger"
          action={
            <Button variant="primary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
          secondaryAction={<ButtonLink href="/erp/clientes">Volver a clientes</ButtonLink>}
        />
      </div>
    );
  }
  if (!client) return <Cargando />;

  const inactivo = isInactiveClient(client.status);
  // Quien lleva proyectos en su área, o quien administra el padrón, arranca uno desde aquí.
  const puedeCrearProyecto = mySectors.includes("PROYECTO") || permisos.puedeAgregar;
  const puedeAbrirProyectos = canUserAccessPath(user, "/erp/proyectos/nuevo");
  const vigentes = projects.filter((p) => p.status !== "CANCELLED" && p.status !== "COMPLETED").length;
  const errorNombre = intentoGuardar && edit.name.trim().length < 2 ? "Escribe el nombre comercial" : undefined;
  const principal = (client.tipo as ClientSector | null | undefined) ?? clientSectors[0];
  const IconoTipo = principal && CLIENT_SECTOR_META[principal] ? CLIENT_SECTOR_ICONS[CLIENT_SECTOR_META[principal].icon] : BusinessOutlinedIcon;
  const setCampo = (campo: keyof Edicion) => (e: { target: { value: string } }) =>
    setEdit((f) => ({ ...f, [campo]: e.target.value }));

  const proyectos = (
    <RecordSection
      title={projects.length ? `Proyectos · ${projects.length}` : "Proyectos"}
      subtitle={
        projects.length
          ? `${vigentes === 1 ? "1 vigente" : `${vigentes} vigentes`}. Cada uno abre su cronograma, alcance, equipo y documentos.`
          : "Los proyectos que se le llevan a este cliente."
      }
      end={
        puedeCrearProyecto && puedeAbrirProyectos ? (
          <ButtonLink href={`/erp/proyectos/nuevo?clienteId=${client.id}`} iconStart={<AddRoundedIcon />}>
            Nuevo proyecto con plan
          </ButtonLink>
        ) : null
      }
    >
            {projectsLoadErr ? (
        <Alert tone="danger" role="alert" action={<LinkButton onClick={() => void load()}>Reintentar</LinkButton>}>
          {projectsLoadErr}
        </Alert>
      ) : null}
      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOffOutlinedIcon />}
          title="Sin proyectos todavía"
          description={puedeCrearProyecto ? "Crea el primero con el formulario de abajo." : undefined}
          size="compact"
          tone="neutral"
        />
      ) : (
        <ul className={styles.proyectos}>
          {projects.map((p) => {
            const proyectoInactivo = isInactiveOperationalProject(p.status);
            const plazo = plazoDelProyecto(p);
            const avance = p.resumen?.avance?.porcentaje;
            return (
              <li key={p.id} className={styles.proyecto}>
                <span className={styles.proyectoIco} aria-hidden="true">
                  <AccountTreeOutlinedIcon fontSize="inherit" />
                </span>
                <div className={styles.proyectoTexto}>
                  <Link href={`/erp/proyectos/${p.id}`} className={styles.proyectoNombre}>
                    {p.title}
                  </Link>
                  <span className={styles.proyectoSub}>
                    <span>{plazo ?? "Sin fechas"}</span>
                    {p.responsable?.nombre ? <span>Responsable: {p.responsable.nombre}</span> : null}
                  </span>
                </div>
                <div className={styles.proyectoAvance}>
                  {avance != null ? (
                    <Progress value={avance} max={100} label={`${avance} % de avance`} ariaLabel={`Avance de ${p.title}`} />
                  ) : (
                    <span className={styles.tenue}>Sin avance medido</span>
                  )}
                </div>
                <StatusBadge
                  size="sm"
                  label={proyectoInactivo ? "Inactivo" : etiquetaEstado(p.status)}
                  tone={proyectoInactivo ? "neutral" : tonoDelProyecto(p.status)}
                />
                {permisos.puedeDesactivar || permisos.puedeEliminar ? (
                  <div className={styles.proyectoAcciones}>
                    {permisos.puedeDesactivar ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        iconStart={proyectoInactivo ? <RestartAltOutlinedIcon /> : <BlockOutlinedIcon />}
                        onClick={() => pedirCambioEstatusProyecto(p, proyectoInactivo)}
                      >
                        {proyectoInactivo ? "Reactivar" : "Desactivar"}
                      </Button>
                    ) : null}
                    {permisos.puedeEliminar ? (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        icon
                        disabled={busy}
                        onClick={() => pedirEliminarProyecto(p)}
                        aria-label={`Eliminar el proyecto ${p.title}`}
                        title="Eliminar proyecto"
                      >
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {puedeCrearProyecto ? (
        <form className={styles.nuevoProyecto} onSubmit={(e) => void onCreateProject(e)} noValidate aria-label="Alta rápida de proyecto">
          <div className={styles.nuevoProyectoCampos}>
            <Field label="Nuevo proyecto" error={projectError} hint="Con el nombre basta; lo demás se completa en Proyectos.">
              <Input
                id="proyecto-nombre"
                value={projectTitle}
                onChange={(e) => {
                  setProjectTitle(e.target.value);
                  if (projectError) setProjectError(null);
                  if (projectApiError) setProjectApiError(null);
                }}
                placeholder="Nombre del proyecto"
              />
            </Field>
            <Field label="Inicio" hint="Opcional">
              <DateInput id="proyecto-inicio" value={projectStart} onChange={(e) => setProjectStart(e.target.value)} />
            </Field>
            <Button type="submit" loading={busy && Boolean(projectTitle.trim())} disabled={busy} iconStart={<AddRoundedIcon />} className={styles.nuevoProyectoBtn}>
              Crear proyecto
            </Button>
          </div>
          {projectApiError ? (
            <Alert tone="danger" role="alert" srLabel="Error" onDismiss={() => setProjectApiError(null)}>
              {projectApiError}
            </Alert>
          ) : null}
        </form>
      ) : null}
    </RecordSection>
  );

  const datosFiscales = editando ? (
    <form className={styles.edicion} onSubmit={(e) => void onGuardarEdicion(e)} noValidate aria-label="Editar datos del cliente">
      <RecordSection title="Identidad" subtitle="Cómo lo ubica tu equipo en listas y buscadores.">
        <FieldGrid>
          <Field label="Nombre comercial" required error={errorNombre} fullWidth>
            <Input id="edit-name" autoComplete="organization" value={edit.name} onChange={setCampo("name")} />
          </Field>
        </FieldGrid>
      </RecordSection>
      <RecordSection title="Datos fiscales" subtitle="Lo que captures aquí se usa en cotizaciones y facturas.">
        <FieldGrid>
          <Field label="Razón social" hint="Como aparece en la constancia fiscal">
            <Input id="edit-legalName" value={edit.legalName} onChange={setCampo("legalName")} />
          </Field>
          <Field label="RFC" hint={aviso(avisos.taxId) ?? "12 caracteres (empresa) o 13 (persona física)"}>
            <Input
              id="edit-taxId"
              className={styles.mono}
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={13}
              value={edit.taxId}
              onChange={setCampo("taxId")}
              aria-invalid={avisos.taxId ? true : undefined}
            />
          </Field>
          <Field label="Dirección fiscal" fullWidth>
            <Input id="edit-fiscalAddress" autoComplete="street-address" value={edit.fiscalAddress} onChange={setCampo("fiscalAddress")} />
          </Field>
          <Field label="Código postal fiscal" hint={aviso(avisos.fiscalZipCode) ?? "5 dígitos"}>
            <Input
              id="edit-fiscalZipCode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              value={edit.fiscalZipCode}
              onChange={setCampo("fiscalZipCode")}
              aria-invalid={avisos.fiscalZipCode ? true : undefined}
            />
          </Field>
          <Field label="Régimen fiscal" hint="Clave del SAT, por ejemplo 601">
            <Input id="edit-fiscalRegime" value={edit.fiscalRegime} onChange={setCampo("fiscalRegime")} />
          </Field>
        </FieldGrid>
      </RecordSection>
      <RecordSection title="Contacto" subtitle="A dónde llegan cotizaciones y facturas.">
        <FieldGrid>
          <Field label="Correo de facturación" hint={aviso(avisos.billingEmail) ?? "Aquí llegan cotizaciones y facturas"}>
            <Input
              id="edit-billingEmail"
              type="email"
              autoComplete="email"
              value={edit.billingEmail}
              onChange={setCampo("billingEmail")}
              aria-invalid={avisos.billingEmail ? true : undefined}
            />
          </Field>
          <Field label="Teléfono">
            <Input id="edit-billingPhone" type="tel" autoComplete="tel" value={edit.billingPhone} onChange={setCampo("billingPhone")} />
          </Field>
          <Field label="Notas" hint="Solo las ve tu equipo" fullWidth>
            <Textarea id="edit-notes" rows={4} value={edit.notes} onChange={setCampo("notes")} />
          </Field>
        </FieldGrid>
      </RecordSection>
      <div className={styles.edicionPie}>
        <Button variant="tertiary" disabled={busy} onClick={() => setEditando(false)}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Guardar cambios
        </Button>
      </div>
    </form>
  ) : (
    <RecordSection title="Datos fiscales" subtitle="Se usan en cotizaciones y facturas.">
      <dl className={styles.datos}>
        <Dato label="Razón social" full>
          {client.legalName}
        </Dato>
        <Dato label="RFC">{client.taxId ? <span className={styles.mono}>{client.taxId}</span> : null}</Dato>
        <Dato label="Régimen">{client.fiscalRegime}</Dato>
        <Dato label="Dirección" full>
          {client.fiscalAddress}
        </Dato>
        <Dato label="Código postal">{client.fiscalZipCode}</Dato>
        <Dato label="Correo">
          {client.billingEmail ? <a href={`mailto:${client.billingEmail}`}>{client.billingEmail}</a> : null}
        </Dato>
        <Dato label="Teléfono">
          {client.billingPhone ? <a href={`tel:${client.billingPhone}`}>{client.billingPhone}</a> : null}
        </Dato>
      </dl>
      {client.notes ? <p className={styles.notas}>{client.notes}</p> : null}
    </RecordSection>
  );

  const puedeQuitarTipo = (s: ClientSector) => permisos.puedeEditar && clientSectors.length > 1 && mySectors.includes(s);

  return (
    <>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <RecordPage
        className={styles.pagina}
        breadcrumbs={[{ label: "Clientes", href: "/erp/clientes" }, { label: client.name }]}
        icon={<IconoTipo />}
        code={client.taxId ? <span className={styles.mono}>{client.taxId}</span> : undefined}
        statusLabel={inactivo ? "Inactivo" : "Activo"}
        statusTone={inactivo ? "neutral" : "success"}
        badges={<TiposCliente sectores={clientSectors} size="sm" />}
        title={client.name}
        person={client.owner?.nombre ? { name: client.owner.nombre, role: "Encargado" } : undefined}
        meta={
          client.legalName && client.legalName !== client.name
            ? [{ icon: <ApartmentOutlinedIcon fontSize="inherit" />, label: client.legalName }]
            : client.owner?.nombre
              ? undefined
              : [{ label: "Sin encargado asignado" }]
        }
        tertiaryActions={
          permisos.puedeEliminar ? (
            <Button variant="danger-ghost" disabled={busy} onClick={pedirEliminar} iconStart={<DeleteOutlineOutlinedIcon />}>
              Eliminar
            </Button>
          ) : null
        }
        secondaryActions={
          permisos.puedeDesactivar ? (
            <Button
              disabled={busy}
              onClick={() => pedirCambioEstatus(inactivo)}
              iconStart={inactivo ? <RestartAltOutlinedIcon /> : <BlockOutlinedIcon />}
            >
              {inactivo ? "Reactivar" : "Desactivar"}
            </Button>
          ) : null
        }
        primaryAction={
          permisos.puedeEditar && !editando ? (
            <Button variant="primary" disabled={busy} onClick={abrirEdicion} iconStart={<EditOutlinedIcon />}>
              Editar datos
            </Button>
          ) : null
        }
        tabs={
          <Tabs<Pestana>
            ariaLabel="Secciones del cliente"
            items={[
              { id: "proyectos", label: "Proyectos", icon: AccountTreeOutlinedIcon, count: projects.length },
              { id: "datos", label: editando ? "Editar datos" : "Datos fiscales", icon: ReceiptLongOutlinedIcon },
            ]}
            value={pestana}
            onChange={setPestana}
          />
        }
        factsTitle="Datos clave"
        facts={[
          {
            label: "Correo",
            value: client.billingEmail ? (
              <a className={styles.enlace} href={`mailto:${client.billingEmail}`}>
                {client.billingEmail}
              </a>
            ) : (
              <span className={styles.vacio}>Sin capturar</span>
            ),
          },
          {
            label: "Teléfono",
            value: client.billingPhone ? (
              <a className={styles.enlace} href={`tel:${client.billingPhone}`}>
                {client.billingPhone}
              </a>
            ) : (
              <span className={styles.vacio}>Sin capturar</span>
            ),
          },
          {
            label: "RFC",
            value: client.taxId ? <span className={styles.mono}>{client.taxId}</span> : <span className={styles.aviso}>Falta para facturar</span>,
          },
          {
            label: "Encargado",
            value: client.owner?.nombre || <span className={styles.vacio}>Sin asignar</span>,
          },
        ]}
        aside={
          <AsideCard title="Tipos">
            <p className={styles.ayuda}>Dónde se puede elegir a este cliente. Puede estar en varios a la vez.</p>
            <ul className={styles.tiposLista}>
              {clientSectors.map((s) => {
                const Icono = CLIENT_SECTOR_META[s] ? CLIENT_SECTOR_ICONS[CLIENT_SECTOR_META[s].icon] : BusinessOutlinedIcon;
                return (
                  <li key={s} className={styles.tipoFila}>
                    <span className={styles.tipoIco} aria-hidden="true">
                      <Icono fontSize="inherit" />
                    </span>
                    <span className={styles.tipoNombre}>{nombreSector(s)}</span>
                    {puedeQuitarTipo(s) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        disabled={busy}
                        onClick={() => void removeSector(s)}
                        aria-label={`Quitar de ${nombreSector(s)}`}
                        title={`Quitar de ${nombreSector(s)}`}
                      >
                        <CloseRoundedIcon fontSize="small" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {permisos.puedeEditar && addable.length > 0 ? (
              <div className={styles.sumarTipo}>
                <span className={styles.sumarTitulo}>Sumar tipo</span>
                <p className={styles.ayuda}>Súmalo a otro sector sin duplicarlo:</p>
                <div className={styles.sumarBotones}>
                  {addable.map((s) => (
                    <Button key={s} size="sm" variant="tonal" disabled={busy} iconStart={<AddRoundedIcon />} onClick={() => void addSector(s)}>
                      {nombreSector(s)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </AsideCard>
        }
      >
        <span id="proyectos" className={styles.ancla} />
        {error ? (
          <Alert tone="danger" role="alert" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
        {loadError ? (
          <Alert tone="warning" role="status" action={<LinkButton onClick={() => void load()}>Reintentar</LinkButton>}>
            No se pudo actualizar la información; ves la última versión cargada.
          </Alert>
        ) : null}
        {pestana === "proyectos" ? proyectos : datosFiscales}
      </RecordPage>
    </>
  );
}
