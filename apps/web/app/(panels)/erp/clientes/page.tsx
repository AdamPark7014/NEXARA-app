"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useUser } from "@/components/UserContext";
import { ORG_EMAILS } from "@/lib/activity-kinds";
import {
  canSeeClientesModule,
  CLIENT_SECTOR_META,
  clientSectorsForEmail,
  type ClientSector,
} from "@/lib/client-sectors";
import { listSalesClients, type SalesClient } from "@/lib/sales-api";
import { IconLabel } from "@/components/ui/IconBadge";
import { CLIENT_SECTOR_ICONS } from "@/components/erp/ClientSectorIcon";
import styles from "./clientes-core.module.css";

function norm(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

function ClientesWorkspace() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, token } = useUser();
  const allowedSectors = useMemo(() => clientSectorsForEmail(user?.email), [user?.email]);
  const showOwner = norm(user?.email) === ORG_EMAILS.ceo || Boolean(user?.isSuperAdmin);

  const sectorParam = String(search.get("sector") || "").toUpperCase() as ClientSector;
  const initialSector =
    allowedSectors.includes(sectorParam) ? sectorParam : allowedSectors[0] ?? null;

  const [sector, setSector] = useState<ClientSector | null>(initialSector);
  const [items, setItems] = useState<SalesClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (initialSector && initialSector !== sector) setSector(initialSector);
  }, [initialSector, sector]);

  const load = useCallback(async () => {
    if (!token || !sector) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listSalesClients(token, { sector }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, sector]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectSector = (s: ClientSector) => {
    setSector(s);
    router.replace(`/erp/clientes?sector=${CLIENT_SECTOR_META[s].slug}`, { scroll: false });
  };

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.legalName ?? "").toLowerCase().includes(query) ||
        (c.taxId ?? "").toLowerCase().includes(query) ||
        (c.owner?.nombre ?? "").toLowerCase().includes(query),
    );
  }, [items, q]);

  if (!canSeeClientesModule(user?.email) || !sector) {
    return <p className={styles.sub}>No tienes acceso al módulo de clientes.</p>;
  }

  const meta = CLIENT_SECTOR_META[sector];

  return (
    <div className={styles.wrap}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>Clientes</h1>
          <p className={styles.sub}>Un padrón, tres usos. Cambia de sector sin salir de aquí.</p>
        </div>
        <Link
          className={styles.primaryBtn}
          href={`/erp/clientes/nuevo?sector=${meta.slug}`}
        >
          Nuevo
        </Link>
      </div>

      {allowedSectors.length > 1 ? (
        <div className={styles.tabs} role="tablist" aria-label="Sector">
          {allowedSectors.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={sector === s}
              className={`${styles.tab} ${sector === s ? styles.tabActive : ""}`}
              onClick={() => selectSector(s)}
            >
              <IconLabel icon={CLIENT_SECTOR_ICONS[CLIENT_SECTOR_META[s].icon]} size={15} gap={5}>
                {CLIENT_SECTOR_META[s].title.replace(/^Clientes de |^Clientes /i, "")}
              </IconLabel>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.sub} style={{ margin: 0 }}>
          <IconLabel icon={CLIENT_SECTOR_ICONS[meta.icon]} size={16} gap={5}>
            {meta.title}
          </IconLabel>
        </p>
      )}

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nombre, RFC…"
          aria-label="Buscar clientes"
        />
      </div>

      <div className={styles.metaRow}>
        <span>{meta.help}</span>
        <span>{loading ? "…" : `${visible.length}`}</span>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <p className={styles.sub}>Cargando…</p>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          Nadie en este sector todavía.{" "}
          <Link href={`/erp/clientes/nuevo?sector=${meta.slug}`}>Crear el primero</Link>
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map((c) => (
            <Link key={c.id} href={`/erp/clientes/${c.id}`} className={styles.row}>
              <div style={{ minWidth: 0 }}>
                <div className={styles.rowName}>{c.name}</div>
                <div className={styles.rowSub}>
                  {[c.taxId, c.legalName].filter(Boolean).join(" · ") || "Sin datos fiscales"}
                </div>
              </div>
              <div className={styles.rowSub} style={{ minWidth: 0 }}>
                {(c.sectors ?? [])
                  .map((s) => CLIENT_SECTOR_META[s.sector as ClientSector]?.title.replace(/^Clientes de |^Clientes /i, "") ?? s.sector)
                  .join(" · ")}
              </div>
              <div className={styles.chip}>
                {showOwner
                  ? c.owner?.nombre?.split(/\s+/).slice(0, 2).join(" ") || "Sin encargado"
                  : "Ver →"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientesHubPage() {
  return (
    <Suspense fallback={<p className={styles.sub}>Cargando…</p>}>
      <ClientesWorkspace />
    </Suspense>
  );
}
