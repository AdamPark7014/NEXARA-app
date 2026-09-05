"use client";

import { useCallback, useEffect, useState } from "react";
import RefreshIcon from "@mui/icons-material/Refresh";
import { getActiveIntegraSiteId, setActiveIntegraSiteId } from "./_lib";
import { diagnosticar, pedirIntegra, type Diagnostico } from "./_fallosApi";
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
  /**
   * Un fallo al pedir los sitios se traga y se pintaba «Sin sitios
   * configurados»: el operador leía que su empresa no tiene nada dado de alta
   * cuando lo que pasaba es que el backend estaba caído o su rol no llega. Son
   * conclusiones opuestas, así que el fallo se guarda y se dice.
   */
  const [fallo, setFallo] = useState<Diagnostico | null>(null);

  const load = useCallback(async () => {
    setFallo(null);
    try {
      const list = await pedirIntegra<Site[]>("integra/sites");
      setSites(list);
      const saved = getActiveIntegraSiteId();
      const pick =
        (saved && list.some((s) => s.id === saved) ? saved : null) ||
        list.find((s) => s.isDefault)?.id ||
        list[0]?.id ||
        null;
      setActive(pick);
      if (pick) setActiveIntegraSiteId(pick);
    } catch (e) {
      setSites([]);
      setFallo(diagnosticar(e, "cargar los sitios"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (fallo) {
    return (
      <span className={styles.siteMuted} role="status" title={fallo.cuerpo}>
        {fallo.titulo}
      </span>
    );
  }

  if (sites.length === 0) {
    return <span className={styles.siteMuted}>Sin sitios configurados</span>;
  }

  const current = sites.find((s) => s.id === active) || sites[0];
  // El inventario del sitio activo ya lo muestran los KPI de la barra, con más
  // detalle (puertas en línea sobre el total, y personas). Repetirlo aquí daba
  // dos veces el mismo número en la misma fila, y a veces desincronizados
  // porque cada uno se refresca por su lado. En el desplegable sí se conserva:
  // ahí sirve para elegir entre sitios.

  if (sites.length === 1 && current) {
    return (
      <div className={styles.siteChip} title={current.host}>
        <span className={styles.siteChipName}>{current.label || current.name}</span>
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
        aria-label="Recargar la lista de sitios"
        title="Recargar"
      >
        <RefreshIcon fontSize="inherit" aria-hidden />
      </button>
    </div>
  );
}
