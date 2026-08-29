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

  if (sites.length <= 1) return null;

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: "var(--text-tertiary)" }}>Sitio</span>
      <select
        value={active ?? ""}
        onChange={(e) => {
          const id = e.target.value ? Number(e.target.value) : null;
          setActive(id);
          setActiveIntegraSiteId(id);
          onChange?.(id);
        }}
        style={{ ...inputStyle, maxWidth: 220 }}
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label || s.name}
          </option>
        ))}
      </select>
      <button type="button" style={btnGhost} onClick={() => void load()}>
        ↻
      </button>
    </label>
  );
}
