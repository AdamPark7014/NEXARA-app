"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getActiveIntegraSiteId,
  setActiveIntegraSiteId,
  integraApi,
  btnGhost,
  inputStyle,
} from "./_lib";

type Site = {
  id: number;
  name: string;
  host: string;
  isDefault?: boolean;
  label?: string | null;
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
    return (
      <span style={{ fontSize: 12, color: "#5b6b7c", fontWeight: 600 }}>Sin sitios</span>
    );
  }

  if (sites.length === 1) {
    const s = sites[0];
    return (
      <span style={{ fontSize: 12, color: "#243247", fontWeight: 650 }}>
        {s.label || s.name}
        {s._count ? ` · ${s._count.cameras ?? 0}cam / ${s._count.doors ?? 0}p` : ""}
      </span>
    );
  }

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: "#5b6b7c", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 10 }}>
        Sitio
      </span>
      <select
        value={active ?? ""}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null;
          setActive(id);
          setActiveIntegraSiteId(id);
          onChange?.(id);
        }}
        style={{ ...inputStyle, maxWidth: 260 }}
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label || s.name}
            {s._count ? ` (${s._count.cameras ?? 0}c/${s._count.doors ?? 0}p)` : ""}
          </option>
        ))}
      </select>
      <button type="button" style={btnGhost} onClick={() => void load()} aria-label="Recargar sitios">
        ↻
      </button>
    </label>
  );
}
