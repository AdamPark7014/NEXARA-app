"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import FolderOffOutlinedIcon from "@mui/icons-material/FolderOffOutlined";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { useUser } from "@/components/UserContext";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHead,
  EmptyState,
  LinkButton,
  PageHead,
  Skeleton,
} from "@/components/base";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import ClientSectorIcon from "@/components/erp/ClientSectorIcon";
import { formatApiError } from "@/lib/erp-api";
import {
  ALL_CLIENT_SECTORS,
  canSeeClientesModule,
  canSeeClientSector,
  CLIENT_SECTOR_META,
  clientSectorsForEmail,
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
  updateSalesClient,
  type ClientPermissions,
  type SalesClient,
} from "@/lib/sales-api";
import {
  createOperationalProject,
  deactivateOperationalProject,
  deleteOperationalProject,
  formatOperationalProjectStatus,
  isInactiveOperationalProject,
  listOperationalProjects,
  reactivateOperationalProject,
  type OperationalProject,
} from "@/lib/ops-operational-api";
import { nombreSector } from "../sectores";
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

function fechaCorta(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children || <span className={styles.vacio}>Sin capturar</span>}</dd>
    </>
  );
}

function Campo({
  id,
  label,
  error,
  aviso,
  hint,
  children,
  full,
}: {
  id: string;
  label: string;
  error?: string;
  aviso?: string;
  hint?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`${styles.field} ${full ? styles.fieldFull : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span id={`${id}-error`} className={styles.fieldError} role="alert">
          {error}
        </span>
      ) : aviso ? (
        <span id={`${id}-error`} className={styles.fieldAviso}>
          {aviso}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className={styles.fieldHint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function Cargando() {
  return (
    <div className={styles.wrap} aria-busy="true" aria-label="Cargando cliente">
      <div className={styles.skeletonHead}>
        <Skeleton width={90} height={12} />
        <Skeleton width="42%" height={24} />
        <Skeleton width={220} height={14} />
      </div>
      <div className={styles.detalle}>
        <Skeleton height={240} radius={12} />
        <Skeleton height={240} radius={12} />
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
  const [projects, setProjects] = useState<OperationalProject[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectStart, setProjectStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [permisos, setPermisos] = useState<ClientPermissions>(NO_CLIENT_PERMISSIONS);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [editando, setEditando] = useState(false);
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [edit, setEdit] = useState<Edicion>(VACIO);

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

  const mySectors = useMemo(() => clientSectorsForEmail(user?.email), [user?.email]);
  const clientSectors = useMemo(
    () => (client?.sectors ?? []).map((s) => s.sector as ClientSector),
    [client],
  );
  const hasProyecto = clientSectors.includes("PROYECTO");
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
      if (c.serviceClientId) {
        try {
          const all = await listOperationalProjects(token);
          setProjects(all.filter((p) => p.client?.id === c.serviceClientId));
        } catch {
          setProjects([]);
        }
      } else {
        setProjects([]);
      }
    } catch (e) {
      setLoadError(formatApiError(e, "No se pudo cargar el cliente"));
    }
  }, [token, id]);

  useEffect(() => {
    if (!canSeeClientesModule(user?.email)) {
      router.replace("/erp/pizarra");
      return;
    }
    void load();
  }, [load, user?.email, router]);

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

  const onCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !client?.serviceClientId || !user?.id) return;
    if (projectTitle.trim().length < 3) {
      setProjectError("El nombre del proyecto necesita al menos 3 letras");
      return;
    }
    setBusy(true);
    setProjectError(null);
    setError(null);
    try {
      await createOperationalProject(token, {
        title: projectTitle.trim(),
        clientId: client.serviceClientId,
        vendorId: user.id,
        startDate: projectStart,
        projectType: "OTRO",
      });
      setProjectTitle("");
      await load();
    } catch (err) {
      setProjectError(formatApiError(err, "No se pudo crear el proyecto"));
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
  const pedirCambioEstatusProyecto = (p: OperationalProject, activar: boolean) => {
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

  const pedirEliminarProyecto = (p: OperationalProject) => {
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
      <div className={styles.wrap}>
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
      <div className={styles.wrap}>
        <EmptyState
          icon={<ErrorOutlineRoundedIcon />}
          title="No pudimos abrir el cliente"
          description={loadError}
          action={
            <span className={styles.acciones}>
              <Button variant="primary" onClick={() => void load()}>
                Reintentar
              </Button>
              <ButtonLink href="/erp/clientes">Volver a clientes</ButtonLink>
            </span>
          }
        />
      </div>
    );
  }
  if (!client) return <Cargando />;

  const inactivo = isInactiveClient(client.status);
  const errorNombre = intentoGuardar && edit.name.trim().length < 2 ? "Escribe el nombre comercial" : undefined;
  const aria = (campo: keyof Edicion, invalido: boolean) =>
    invalido ? { "aria-invalid": true, "aria-describedby": `edit-${campo}-error` } : {};

  return (
    <div className={styles.wrap}>
      <PageHead
        back={{ href: "/erp/clientes", label: "Clientes" }}
        title={client.name}
        description={client.legalName && client.legalName !== client.name ? client.legalName : undefined}
        meta={
          <>
            <Badge tone={inactivo ? "neutral" : "success"} dot>
              {inactivo ? "Inactivo" : "Activo"}
            </Badge>
            {clientSectors.map((s) => (
              <Badge key={s} tone="outline">
                {nombreSector(s)}
              </Badge>
            ))}
            <span className={styles.metaDato}>Encargado: {client.owner?.nombre || "sin asignar"}</span>
          </>
        }
        actions={
          <>
            {permisos.puedeEliminar ? (
              <Button variant="ghost" className={styles.peligro} disabled={busy} onClick={pedirEliminar}>
                <DeleteOutlineOutlinedIcon aria-hidden="true" />
                Eliminar
              </Button>
            ) : null}
            {permisos.puedeDesactivar ? (
              <Button variant="ghost" disabled={busy} onClick={() => pedirCambioEstatus(inactivo)}>
                {inactivo ? <RestartAltOutlinedIcon aria-hidden="true" /> : <BlockOutlinedIcon aria-hidden="true" />}
                {inactivo ? "Reactivar" : "Desactivar"}
              </Button>
            ) : null}
            {permisos.puedeEditar && !editando ? (
              <Button variant="primary" disabled={busy} onClick={abrirEdicion}>
                <EditOutlinedIcon aria-hidden="true" />
                Editar datos
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <Alert tone="danger" role="alert" action={<LinkButton onClick={() => setError(null)}>Cerrar</LinkButton>}>
          {error}
        </Alert>
      ) : null}
      {loadError ? (
        <Alert tone="warning" role="status" action={<LinkButton onClick={() => void load()}>Reintentar</LinkButton>}>
          No se pudo actualizar la información; ves la última versión cargada.
        </Alert>
      ) : null}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      <div className={styles.detalle}>
        {editando ? (
          <Card as="div" className={styles.span2}>
            <form onSubmit={(e) => void onGuardarEdicion(e)} noValidate>
              <div className={styles.cardPad}>
                <CardHead title="Editar datos" subtitle="Lo que captures aquí se usa en cotizaciones y facturas." />
                <div className={styles.formGrid}>
                  <Campo id="edit-name" label="Nombre comercial *" error={errorNombre} full>
                    <input
                      id="edit-name"
                      className={`${styles.input} ${errorNombre ? styles.inputError : ""}`}
                      required
                      autoComplete="organization"
                      value={edit.name}
                      onChange={(e) => setEdit((f) => ({ ...f, name: e.target.value }))}
                      {...aria("name", Boolean(errorNombre))}
                    />
                  </Campo>
                  <Campo id="edit-legalName" label="Razón social" hint="Como aparece en la constancia fiscal">
                    <input
                      id="edit-legalName"
                      className={styles.input}
                      value={edit.legalName}
                      onChange={(e) => setEdit((f) => ({ ...f, legalName: e.target.value }))}
                    />
                  </Campo>
                  <Campo id="edit-taxId" label="RFC" aviso={avisos.taxId}>
                    <input
                      id="edit-taxId"
                      className={`${styles.input} ${styles.mono}`}
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={13}
                      value={edit.taxId}
                      onChange={(e) => setEdit((f) => ({ ...f, taxId: e.target.value }))}
                      {...aria("taxId", Boolean(avisos.taxId))}
                    />
                  </Campo>
                  <Campo id="edit-fiscalAddress" label="Dirección fiscal" full>
                    <input
                      id="edit-fiscalAddress"
                      className={styles.input}
                      autoComplete="street-address"
                      value={edit.fiscalAddress}
                      onChange={(e) => setEdit((f) => ({ ...f, fiscalAddress: e.target.value }))}
                    />
                  </Campo>
                  <Campo id="edit-fiscalZipCode" label="Código postal fiscal" aviso={avisos.fiscalZipCode}>
                    <input
                      id="edit-fiscalZipCode"
                      className={styles.input}
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={5}
                      value={edit.fiscalZipCode}
                      onChange={(e) => setEdit((f) => ({ ...f, fiscalZipCode: e.target.value }))}
                      {...aria("fiscalZipCode", Boolean(avisos.fiscalZipCode))}
                    />
                  </Campo>
                  <Campo id="edit-fiscalRegime" label="Régimen fiscal" hint="Clave del SAT, por ejemplo 601">
                    <input
                      id="edit-fiscalRegime"
                      className={styles.input}
                      value={edit.fiscalRegime}
                      onChange={(e) => setEdit((f) => ({ ...f, fiscalRegime: e.target.value }))}
                    />
                  </Campo>
                  <Campo id="edit-billingEmail" label="Correo de facturación" aviso={avisos.billingEmail}>
                    <input
                      id="edit-billingEmail"
                      type="email"
                      className={styles.input}
                      autoComplete="email"
                      value={edit.billingEmail}
                      onChange={(e) => setEdit((f) => ({ ...f, billingEmail: e.target.value }))}
                      {...aria("billingEmail", Boolean(avisos.billingEmail))}
                    />
                  </Campo>
                  <Campo id="edit-billingPhone" label="Teléfono">
                    <input
                      id="edit-billingPhone"
                      type="tel"
                      className={styles.input}
                      autoComplete="tel"
                      value={edit.billingPhone}
                      onChange={(e) => setEdit((f) => ({ ...f, billingPhone: e.target.value }))}
                    />
                  </Campo>
                  <Campo id="edit-notes" label="Notas" hint="Solo las ve tu equipo" full>
                    <textarea
                      id="edit-notes"
                      className={styles.textarea}
                      value={edit.notes}
                      onChange={(e) => setEdit((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </Campo>
                </div>
              </div>
              <div className={styles.saveBar}>
                <Button disabled={busy} onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={busy} aria-busy={busy || undefined}>
                  {busy ? "Guardando…" : "Guardar cambios"}
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card pad>
            <CardHead title="Datos fiscales" subtitle="Se usan en cotizaciones y facturas." />
            <dl className={styles.dl}>
              <Dato label="Razón social">{client.legalName}</Dato>
              <Dato label="RFC">{client.taxId ? <span className={styles.mono}>{client.taxId}</span> : null}</Dato>
              <Dato label="Dirección">{client.fiscalAddress}</Dato>
              <Dato label="Código postal">{client.fiscalZipCode}</Dato>
              <Dato label="Régimen">{client.fiscalRegime}</Dato>
              <Dato label="Correo">
                {client.billingEmail ? <a href={`mailto:${client.billingEmail}`}>{client.billingEmail}</a> : null}
              </Dato>
              <Dato label="Teléfono">
                {client.billingPhone ? <a href={`tel:${client.billingPhone}`}>{client.billingPhone}</a> : null}
              </Dato>
            </dl>
            {client.notes ? <p className={styles.notas}>{client.notes}</p> : null}
          </Card>
        )}

        {!editando ? (
          <Card pad>
            <CardHead title="Sectores" subtitle="Dónde se puede elegir a este cliente." />
            <div className={styles.sectorPick}>
              {clientSectors.map((s) => (
                <span key={s} className={styles.sectorChip}>
                  <ClientSectorIcon icon={CLIENT_SECTOR_META[s].icon} size={15} />
                  {nombreSector(s)}
                </span>
              ))}
            </div>
            {addable.length > 0 ? (
              <>
                <p className={styles.fieldHint}>Súmalo a otro sector sin duplicarlo:</p>
                <div className={styles.sectorPick}>
                  {addable.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      className={styles.sectorPickBtn}
                      onClick={() => void addSector(s)}
                    >
                      <AddRoundedIcon aria-hidden="true" fontSize="inherit" />
                      {nombreSector(s)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </Card>
        ) : null}

        {hasProyecto ? (
          <Card pad className={styles.span2}>
            <CardHead
              title={projects.length ? `Proyectos · ${projects.length}` : "Proyectos"}
              subtitle="Los proyectos operativos de este cliente."
            />
            {!client.serviceClientId ? (
              <Alert tone="info" role="status">
                Este cliente todavía no está enlazado con operaciones, así que aún no se le pueden crear proyectos.
              </Alert>
            ) : (
              <>
                {projects.length === 0 ? (
                  <EmptyState
                    icon={<FolderOffOutlinedIcon />}
                    title="Sin proyectos todavía"
                    description={
                      canSeeClientSector(user?.email, "PROYECTO") ? "Crea el primero con el formulario de abajo." : undefined
                    }
                  />
                ) : (
                  <ul className={styles.proyectos}>
                    {projects.map((p) => {
                      const proyectoInactivo = isInactiveOperationalProject(p.status);
                      const inicio = fechaCorta(p.startDate);
                      return (
                        <li key={p.id} className={styles.proyecto}>
                          <div className={styles.proyectoTexto}>
                            <span className={styles.proyectoNombre}>{p.title}</span>
                            <span className={styles.proyectoSub}>
                              <Badge tone={proyectoInactivo ? "neutral" : "info"} dot>
                                {proyectoInactivo ? "Inactivo" : formatOperationalProjectStatus(p.status)}
                              </Badge>
                              {inicio ? <span>Inicio {inicio}</span> : null}
                            </span>
                          </div>
                          {permisos.puedeDesactivar || permisos.puedeEliminar ? (
                            <div className={styles.acciones}>
                              {permisos.puedeDesactivar ? (
                                <Button
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => pedirCambioEstatusProyecto(p, proyectoInactivo)}
                                >
                                  {proyectoInactivo ? (
                                    <RestartAltOutlinedIcon aria-hidden="true" />
                                  ) : (
                                    <BlockOutlinedIcon aria-hidden="true" />
                                  )}
                                  {proyectoInactivo ? "Reactivar" : "Desactivar"}
                                </Button>
                              ) : null}
                              {permisos.puedeEliminar ? (
                                <Button
                                  variant="ghost"
                                  icon
                                  className={styles.peligro}
                                  disabled={busy}
                                  onClick={() => pedirEliminarProyecto(p)}
                                  aria-label={`Eliminar el proyecto ${p.title}`}
                                  title="Eliminar proyecto"
                                >
                                  <DeleteOutlineOutlinedIcon aria-hidden="true" />
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {canSeeClientSector(user?.email, "PROYECTO") ? (
                  <form className={styles.nuevoProyecto} onSubmit={(e) => void onCreateProject(e)} noValidate>
                    <Campo id="proyecto-nombre" label="Nuevo proyecto" error={projectError ?? undefined}>
                      <input
                        id="proyecto-nombre"
                        className={`${styles.input} ${projectError ? styles.inputError : ""}`}
                        value={projectTitle}
                        onChange={(e) => {
                          setProjectTitle(e.target.value);
                          if (projectError) setProjectError(null);
                        }}
                        placeholder="Nombre del proyecto"
                        aria-invalid={projectError ? true : undefined}
                        aria-describedby={projectError ? "proyecto-nombre-error" : undefined}
                      />
                    </Campo>
                    <Campo id="proyecto-inicio" label="Inicio">
                      <input
                        id="proyecto-inicio"
                        type="date"
                        className={styles.input}
                        value={projectStart}
                        onChange={(e) => setProjectStart(e.target.value)}
                      />
                    </Campo>
                    <Button type="submit" variant="secondary" disabled={busy} className={styles.nuevoProyectoBtn}>
                      <AddRoundedIcon aria-hidden="true" />
                      Crear proyecto
                    </Button>
                  </form>
                ) : null}
              </>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
