"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
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
import ClientSectorIcon from "@/components/erp/ClientSectorIcon";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import BlockOutlinedIcon from "@mui/icons-material/BlockOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { IconLabel } from "@/components/ui/IconBadge";
import {
  createOperationalProject,
  listOperationalProjects,
  type OperationalProject,
} from "@/lib/ops-operational-api";
import styles from "../clientes-core.module.css";

export default function ClienteDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useUser();
  const id = Number(params?.id);

  const [client, setClient] = useState<SalesClient | null>(null);
  const [projects, setProjects] = useState<OperationalProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectStart, setProjectStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [permisos, setPermisos] = useState<ClientPermissions>(NO_CLIENT_PERMISSIONS);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [editando, setEditando] = useState(false);
  const [edit, setEdit] = useState({
    name: "",
    legalName: "",
    taxId: "",
    fiscalAddress: "",
    fiscalZipCode: "",
    fiscalRegime: "",
    billingEmail: "",
    billingPhone: "",
    notes: "",
  });

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
  const addable = ALL_CLIENT_SECTORS.filter(
    (s) => mySectors.includes(s) && !clientSectors.includes(s),
  );

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(id)) return;
    setError(null);
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
      setError(e instanceof Error ? e.message : "No se pudo cargar");
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
      setError(e instanceof Error ? e.message : "No se pudo agregar sector");
    } finally {
      setBusy(false);
    }
  };

  const onCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !client?.serviceClientId || !user?.id) return;
    if (projectTitle.trim().length < 3) {
      setError("Título muy corto");
      return;
    }
    setBusy(true);
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
      setError(err instanceof Error ? err.message : "No se pudo crear el proyecto");
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
    setEditando(true);
  };

  const onGuardarEdicion = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (edit.name.trim().length < 2) {
      setError("Escribe el nombre comercial");
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
      setError(err instanceof Error ? err.message : "No se pudo guardar el cliente");
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
          setError(err instanceof Error ? err.message : "No se pudo cambiar el estatus del cliente");
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
          setError(err instanceof Error ? err.message : "No se pudo eliminar el cliente");
        }
      },
    });
  };

  if (!Number.isFinite(id)) return <p className={styles.error}>Cliente no válido.</p>;
  if (!client && !error) return <p className={styles.sub}>Cargando…</p>;
  if (!client) return <p className={styles.error}>{error}</p>;

  const inactivo = isInactiveClient(client.status);

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.ghostBtn} onClick={() => router.push("/erp/clientes")}>
        ← Clientes
      </button>

      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>
            {client.name}
            {inactivo ? (
              <span className={styles.chip} style={{ marginLeft: 10, fontSize: 12, verticalAlign: "middle" }}>
                Inactivo
              </span>
            ) : null}
          </h1>
          <p className={styles.sub}>Encargado: {client.owner?.nombre || "—"}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {permisos.puedeEditar && !editando ? (
            <button type="button" className={styles.ghostBtn} disabled={busy} onClick={abrirEdicion}>
              <IconLabel icon={EditOutlinedIcon} size={15} gap={5}>
                Editar
              </IconLabel>
            </button>
          ) : null}
          {permisos.puedeDesactivar ? (
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={busy}
              onClick={() => pedirCambioEstatus(inactivo)}
            >
              <IconLabel icon={inactivo ? RestartAltOutlinedIcon : BlockOutlinedIcon} size={15} gap={5}>
                {inactivo ? "Reactivar" : "Desactivar"}
              </IconLabel>
            </button>
          ) : null}
          {permisos.puedeEliminar ? (
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={busy}
              onClick={pedirEliminar}
              style={{ color: "var(--danger)" }}
            >
              <IconLabel icon={DeleteOutlineOutlinedIcon} size={15} gap={5}>
                Eliminar
              </IconLabel>
            </button>
          ) : null}
        </div>
      </div>

      {editando ? (
        <form className={styles.panel} onSubmit={(e) => void onGuardarEdicion(e)}>
          <div className={styles.fieldLabel}>Editar datos</div>
          <div className={styles.field}>
            <label htmlFor="edit-name">Nombre comercial *</label>
            <input
              id="edit-name"
              className={styles.input}
              required
              value={edit.name}
              onChange={(e) => setEdit((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="edit-legal">Razón social</label>
              <input
                id="edit-legal"
                className={styles.input}
                value={edit.legalName}
                onChange={(e) => setEdit((f) => ({ ...f, legalName: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="edit-rfc">RFC</label>
              <input
                id="edit-rfc"
                className={styles.input}
                value={edit.taxId}
                onChange={(e) => setEdit((f) => ({ ...f, taxId: e.target.value }))}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="edit-address">Dirección fiscal</label>
            <input
              id="edit-address"
              className={styles.input}
              value={edit.fiscalAddress}
              onChange={(e) => setEdit((f) => ({ ...f, fiscalAddress: e.target.value }))}
            />
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="edit-cp">CP fiscal</label>
              <input
                id="edit-cp"
                className={styles.input}
                value={edit.fiscalZipCode}
                onChange={(e) => setEdit((f) => ({ ...f, fiscalZipCode: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="edit-regimen">Régimen fiscal</label>
              <input
                id="edit-regimen"
                className={styles.input}
                value={edit.fiscalRegime}
                onChange={(e) => setEdit((f) => ({ ...f, fiscalRegime: e.target.value }))}
              />
            </div>
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label htmlFor="edit-email">Email facturación</label>
              <input
                id="edit-email"
                type="email"
                className={styles.input}
                value={edit.billingEmail}
                onChange={(e) => setEdit((f) => ({ ...f, billingEmail: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="edit-phone">Teléfono</label>
              <input
                id="edit-phone"
                className={styles.input}
                value={edit.billingPhone}
                onChange={(e) => setEdit((f) => ({ ...f, billingPhone: e.target.value }))}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="edit-notes">Notas</label>
            <textarea
              id="edit-notes"
              className={styles.textarea}
              value={edit.notes}
              onChange={(e) => setEdit((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className={styles.primaryBtn} disabled={busy}>
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
            <button type="button" className={styles.ghostBtn} disabled={busy} onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      <section className={styles.panel}>
        <div className={styles.fieldLabel}>Fiscal</div>
        <dl className={styles.dl}>
          <dt>Razón social</dt>
          <dd>{client.legalName || "—"}</dd>
          <dt>RFC</dt>
          <dd>{client.taxId || "—"}</dd>
          <dt>Dirección</dt>
          <dd>{client.fiscalAddress || "—"}</dd>
          <dt>CP / régimen</dt>
          <dd>
            {[client.fiscalZipCode, client.fiscalRegime].filter(Boolean).join(" · ") || "—"}
          </dd>
          <dt>Contacto</dt>
          <dd>
            {[client.billingEmail, client.billingPhone].filter(Boolean).join(" · ") || "—"}
          </dd>
        </dl>
      </section>

      <section className={styles.panel}>
        <div className={styles.fieldLabel}>Sectores</div>
        <div className={styles.sectorPick}>
          {clientSectors.map((s) => (
            <span key={s} className={styles.chip}>
              <ClientSectorIcon icon={CLIENT_SECTOR_META[s].icon} size={14} />
              {CLIENT_SECTOR_META[s].title.replace(/^Clientes de |^Clientes /i, "")}
            </span>
          ))}
        </div>
        {addable.length > 0 ? (
          <div className={styles.sectorPick}>
            {addable.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                className={styles.sectorPickBtn}
                onClick={() => void addSector(s)}
              >
                + {CLIENT_SECTOR_META[s].title.replace(/^Clientes de |^Clientes /i, "")}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {hasProyecto ? (
        <section className={styles.panel}>
          <div className={styles.fieldLabel}>Proyectos ({projects.length})</div>
          {!client.serviceClientId ? (
            <p className={styles.sub} style={{ margin: 0 }}>
              Falta puente operativo.
            </p>
          ) : (
            <>
              {projects.length === 0 ? (
                <p className={styles.sub} style={{ margin: 0 }}>
                  Sin proyectos aún.
                </p>
              ) : (
                <div className={styles.list}>
                  {projects.map((p) => (
                    <div key={p.id} className={styles.row} style={{ cursor: "default" }}>
                      <div>
                        <div className={styles.rowName}>{p.title}</div>
                        <div className={styles.rowSub}>{p.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {canSeeClientSector(user?.email, "PROYECTO") ? (
                <form
                  onSubmit={(e) => void onCreateProject(e)}
                  style={{ display: "grid", gap: 8, marginTop: 4 }}
                >
                  <input
                    className={styles.input}
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="Nombre del proyecto"
                  />
                  <div className={styles.grid2}>
                    <input
                      type="date"
                      className={styles.input}
                      value={projectStart}
                      onChange={(e) => setProjectStart(e.target.value)}
                    />
                    <button type="submit" className={styles.primaryBtn} disabled={busy}>
                      Crear proyecto
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
