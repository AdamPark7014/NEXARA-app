"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getActiveIntegraSiteId,
  setActiveIntegraSiteId,
  integraApi,
} from "./_lib";
import styles from "./integra.module.css";

type Site = {
  id: number;
  name: string;
  host: string;
  isDefault?: boolean;
  label?: string | null;
  provider?: string;
  _count?: { cameras?: number; doors?: number };
};

export function IntegraSiteSwitcher({ onChange }: { onChange?: (id: number | null) => void }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [active, setActive] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await integraApi<Site[]>("integra/sites");
      setSites(list);
      const saved = getActiveIntegraSiteId();
      const pick =
        (saved && list.some((s) => s.id === saved) ? saved : null) ||
        list.find((s) => s.isDefault)?.id ||
        list[0]?.id ||
        null;
      setActive(pick);
      if (pick) setActiveIntegraSiteId(pick);
    } catch {
      setSites([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (sites.length === 0) {
    return <span className={styles.siteMuted}>Sin sitios configurados</span>;
  }

  const current = sites.find((s) => s.id === active) || sites[0];
  const inv =
    current?._count != null
      ? `${current._count.cameras ?? 0} cam · ${current._count.doors ?? 0} pta`
      : null;

  if (sites.length === 1 && current) {
    return (
      <div className={styles.siteChip} title={current.host}>
        <span className={styles.siteChipName}>{current.label || current.name}</span>
        {inv && <span className={styles.siteChipMeta}>{inv}</span>}
      </div>
    );
  }

  return (
    <div className={styles.siteSwitcher}>
      <label className={styles.siteSwitcherLabel} htmlFor="integra-site-select">
        Sitio
      </label>
      <select
        id="integra-site-select"
        className={styles.siteSelect}
        value={active ?? ""}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null;
          setActive(id);
          setActiveIntegraSiteId(id);
          onChange?.(id);
        }}
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label || s.name}
            {s._count ? ` · ${s._count.cameras ?? 0}c/${s._count.doors ?? 0}p` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles.siteReload}
        onClick={() => void load()}
        aria-label="Recargar sitios"
        title="Recargar"
      >
        ↻
      </button>
    </div>
  );
}
