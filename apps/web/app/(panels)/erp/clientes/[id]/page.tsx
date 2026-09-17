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
import { addSalesClientSector, getSalesClient, type SalesClient } from "@/lib/sales-api";
import ClientSectorIcon from "@/components/erp/ClientSectorIcon";
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

  if (!Number.isFinite(id)) return <p className={styles.error}>Cliente no válido.</p>;
  if (!client && !error) return <p className={styles.sub}>Cargando…</p>;
  if (!client) return <p className={styles.error}>{error}</p>;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.ghostBtn} onClick={() => router.push("/erp/clientes")}>
        ← Clientes
      </button>

      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>{client.name}</h1>
          <p className={styles.sub}>Encargado: {client.owner?.nombre || "—"}</p>
        </div>
      </div>

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
