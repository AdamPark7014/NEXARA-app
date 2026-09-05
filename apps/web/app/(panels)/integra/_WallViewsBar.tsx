"use client";

import { memo, useState } from "react";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import SaveIcon from "@mui/icons-material/Save";
import SaveAsIcon from "@mui/icons-material/SaveAs";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import wall from "./_wall.module.css";
import type { WallView } from "./_wallViews";

type Props = {
  views: WallView[];
  currentId: string | null;
  defaultId: string | null;
  /** La disposición en pantalla ya no coincide con la vista cargada. */
  dirty: boolean;
  busy: boolean;
  gridFullscreen: boolean;
  onLoad: (id: string) => void;
  onSaveOver: () => void;
  onSaveAs: (name: string) => void;
  onDelete: (id: string) => void;
  onToggleDefault: (id: string) => void;
  onToggleGridFullscreen: () => void;
  onOpenHelp: () => void;
};

/**
 * Barra de vistas guardadas. Va memoizada porque cuelga encima de la rejilla:
 * sin `memo`, cada tecla del muro la volvería a pintar junto a los mosaicos.
 */
export const WallViewsBar = memo(function WallViewsBar({
  views,
  currentId,
  defaultId,
  dirty,
  busy,
  gridFullscreen,
  onLoad,
  onSaveOver,
  onSaveAs,
  onDelete,
  onToggleDefault,
  onToggleGridFullscreen,
  onOpenHelp,
}: Props) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");

  const current = views.find((v) => v.id === currentId) || null;

  const commitName = () => {
    const name = draft.trim();
    if (!name) {
      setNaming(false);
      return;
    }
    onSaveAs(name);
    setDraft("");
    setNaming(false);
  };

  return (
    <div className={wall.viewsBar}>
      <span className={wall.viewsLabel}>Vistas</span>

      {naming ? (
        <>
          <input
            className={wall.viewsSelect}
            value={draft}
            autoFocus
            placeholder="Nombre de la vista…"
            aria-label="Nombre de la vista nueva"
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitName();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setNaming(false);
                setDraft("");
              }
            }}
          />
          <button type="button" className={wall.iconBtn} title="Guardar" aria-label="Guardar vista nueva" onClick={commitName}>
            <SaveIcon sx={{ fontSize: 15 }} />
          </button>
        </>
      ) : (
        <>
          <select
            className={wall.viewsSelect}
            value={currentId ?? ""}
            disabled={busy}
            aria-label="Vista guardada"
            onChange={(e) => {
              if (e.target.value) onLoad(e.target.value);
            }}
          >
            <option value="">
              {views.length ? "Cargar vista…" : "Aún no hay vistas guardadas"}
            </option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id === defaultId ? "★ " : ""}
                {v.name} · {v.layout === 1 ? "1" : `${Math.sqrt(v.layout)}×${Math.sqrt(v.layout)}`}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={wall.iconBtn}
            title={current ? `Sobrescribir «${current.name}» con lo que hay en pantalla` : "Carga una vista para poder sobrescribirla"}
            aria-label="Sobrescribir la vista cargada"
            disabled={!current || busy}
            onClick={onSaveOver}
          >
            <SaveIcon sx={{ fontSize: 15 }} />
          </button>

          <button
            type="button"
            className={wall.iconBtn}
            title="Guardar la disposición actual como vista nueva"
            aria-label="Guardar como vista nueva"
            disabled={busy}
            onClick={() => {
              setDraft("");
              setNaming(true);
            }}
          >
            <SaveAsIcon sx={{ fontSize: 15 }} />
          </button>

          <button
            type="button"
            className={wall.iconBtn}
            data-on={current && current.id === defaultId ? "1" : undefined}
            title={
              current
                ? current.id === defaultId
                  ? "Dejar de abrir esta vista al entrar"
                  : "Abrir esta vista al entrar al panel"
                : "Carga una vista para marcarla como predeterminada"
            }
            aria-label="Marcar la vista como predeterminada"
            aria-pressed={Boolean(current && current.id === defaultId)}
            disabled={!current}
            onClick={() => current && onToggleDefault(current.id)}
          >
            {current && current.id === defaultId ? (
              <StarIcon sx={{ fontSize: 16 }} />
            ) : (
              <StarBorderIcon sx={{ fontSize: 16 }} />
            )}
          </button>

          <button
            type="button"
            className={wall.iconBtn}
            title={current ? `Borrar «${current.name}»` : "Carga una vista para borrarla"}
            aria-label="Borrar la vista cargada"
            disabled={!current || busy}
            onClick={() => current && onDelete(current.id)}
          >
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </button>

          {dirty && current && <span className={wall.viewsDirty}>sin guardar</span>}
        </>
      )}

      <span className={wall.viewsSpacer} />

      <button
        type="button"
        className={wall.iconBtn}
        title={gridFullscreen ? "Salir de pantalla completa (Esc)" : "Pantalla completa de la rejilla (Shift+F)"}
        aria-label={gridFullscreen ? "Salir de pantalla completa" : "Pantalla completa de la rejilla"}
        aria-pressed={gridFullscreen}
        onClick={onToggleGridFullscreen}
      >
        {gridFullscreen ? <FullscreenExitIcon sx={{ fontSize: 17 }} /> : <FullscreenIcon sx={{ fontSize: 17 }} />}
      </button>

      <button
        type="button"
        className={wall.iconBtn}
        title="Atajos de teclado (?)"
        aria-label="Ver atajos de teclado"
        onClick={onOpenHelp}
      >
        <KeyboardIcon sx={{ fontSize: 16 }} />
      </button>
    </div>
  );
});
