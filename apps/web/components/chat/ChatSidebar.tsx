"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import NotificationsOffOutlinedIcon from "@mui/icons-material/NotificationsOffOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import styles from "../WorkspaceChat.module.css";
import { Avatar, channelPrefixNode } from "./ChatAtoms";
import { SECTIONS_KEY, loadJson, readableChatPreview, saveJson } from "./chat-utils";
import type { Channel } from "./types";

export type SectionId = "favoritos" | "canales" | "directos";

type Props = {
  starred: Channel[];
  publics: Channel[];
  dms: Channel[];
  activeId: number | null;
  loading: boolean;
  presence: Record<number, "online" | "away">;
  starredIds: number[];
  totalUnread: number;
  filter: string;
  onFilterChange: (value: string) => void;
  onSelect: (id: number) => void;
  onToggleStar: (id: number) => void;
  onNewChannel: () => void;
  onNewDm: () => void;
  onOpenSwitcher: () => void;
};

function unreadOf(c: Channel) {
  return c.unreadCount ?? 0;
}

function badgeText(n: number) {
  return n > 99 ? "99+" : String(n);
}

function Section({
  title,
  collapsed,
  onToggle,
  addLabel,
  onAdd,
  rows,
  activeId,
  renderRow,
  footer,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  addLabel?: string;
  onAdd?: () => void;
  rows: Channel[];
  activeId: number | null;
  renderRow: (c: Channel) => ReactNode;
  footer?: ReactNode;
}) {
  const baseId = useId();
  // Plegada, la sección sigue enseñando el canal abierto y los que tienen pendientes: lo no leído
  // nunca se esconde.
  const visibles = collapsed ? rows.filter((c) => c.id === activeId || unreadOf(c) > 0) : rows;
  const ocultos = rows.length - visibles.length;
  return (
    <div className={styles.section} role="group" aria-labelledby={`${baseId}-h`}>
      <div className={styles.secHead}>
        <button
          id={`${baseId}-h`}
          type="button"
          className={styles.secToggle}
          aria-expanded={!collapsed}
          aria-controls={`${baseId}-l`}
          onClick={onToggle}
        >
          {collapsed ? (
            <KeyboardArrowRightIcon aria-hidden="true" sx={{ fontSize: 16 }} />
          ) : (
            <KeyboardArrowDownIcon aria-hidden="true" sx={{ fontSize: 16 }} />
          )}
          <span>{title}</span>
          {collapsed && ocultos > 0 ? (
            <span className={styles.secCount} aria-label={`${ocultos} ocultos`}>
              +{ocultos}
            </span>
          ) : null}
        </button>
        {onAdd && addLabel ? (
          <button
            type="button"
            className={styles.secAdd}
            aria-label={addLabel}
            data-tip={addLabel}
            onClick={onAdd}
          >
            <AddIcon aria-hidden="true" sx={{ fontSize: 17 }} />
          </button>
        ) : null}
      </div>
      <div id={`${baseId}-l`} className={styles.rows}>
        {visibles.map(renderRow)}
        {!collapsed ? footer : null}
      </div>
    </div>
  );
}

/** Barra lateral del chat: Favoritos, Canales y Mensajes directos, cada una plegable. */
export default function ChatSidebar({
  starred,
  publics,
  dms,
  activeId,
  loading,
  presence,
  starredIds,
  totalUnread,
  filter,
  onFilterChange,
  onSelect,
  onToggleStar,
  onNewChannel,
  onNewDm,
  onOpenSwitcher,
}: Props) {
  const [collapsed, setCollapsed] = useState<Partial<Record<SectionId, boolean>>>(() =>
    loadJson<Partial<Record<SectionId, boolean>>>(SECTIONS_KEY, {}),
  );

  useEffect(() => {
    saveJson(SECTIONS_KEY, collapsed);
  }, [collapsed]);

  const filtering = filter.trim().length > 0;
  const isCollapsed = (id: SectionId) => !filtering && Boolean(collapsed[id]);
  const toggle = (id: SectionId) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const row = (c: Channel) => {
    const active = activeId === c.id;
    const unread = unreadOf(c);
    const isUnread = Boolean(c.unread) && !active;
    const isStarred = starredIds.includes(c.id);
    const preview = c.lastMessagePreview ? readableChatPreview(c.lastMessagePreview) : null;
    return (
      <div
        key={c.id}
        className={[
          styles.row,
          active ? styles.rowActive : "",
          isUnread ? styles.rowUnread : "",
          c.muted ? styles.rowMuted : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className={styles.rowMain}
          onClick={() => onSelect(c.id)}
          title={preview ?? c.topic ?? c.name}
          aria-current={active ? "page" : undefined}
          aria-label={`${c.kind === "DIRECT" ? "Mensaje directo con " : "Canal "}${c.name}${
            unread > 0 && !active ? `, ${unread} sin leer` : ""
          }${c.muted ? ", silenciado" : ""}`}
        >
          {c.kind === "DIRECT" ? (
            <span className={styles.rowAvatar}>
              <Avatar user={{ id: c.peer?.id ?? c.id, nombre: c.name, avatarUrl: c.peer?.avatarUrl }} size="xs" />
              <span
                className={`${styles.presenceDot} ${
                  c.peer && presence[c.peer.id] === "online" ? styles.presenceOnline : ""
                }`}
              />
            </span>
          ) : (
            <span className={styles.rowIcon}>{channelPrefixNode(c.kind)}</span>
          )}
          <span className={styles.rowName}>{c.name}</span>
          {c.supervised ? <span className={styles.superviseTag}>Sup</span> : null}
          {c.muted ? (
            <span className={styles.rowMeta} aria-hidden="true">
              <NotificationsOffOutlinedIcon sx={{ fontSize: 14 }} />
            </span>
          ) : null}
          {unread > 0 && !active ? (
            <span className={`${styles.unreadBadge} ${c.muted ? styles.unreadBadgeMuted : ""}`} aria-hidden="true">
              {badgeText(unread)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`${styles.rowStar} ${isStarred ? styles.rowStarOn : ""}`}
          aria-label={isStarred ? `Quitar ${c.name} de favoritos` : `Añadir ${c.name} a favoritos`}
          aria-pressed={isStarred}
          title={isStarred ? "Quitar de favoritos" : "Añadir a favoritos"}
          onClick={() => onToggleStar(c.id)}
        >
          {isStarred ? (
            <StarIcon aria-hidden="true" sx={{ fontSize: 14 }} />
          ) : (
            <StarBorderIcon aria-hidden="true" sx={{ fontSize: 14 }} />
          )}
        </button>
      </div>
    );
  };

  return (
    <aside className={styles.sidebar} aria-label="Canales y mensajes directos">
      <div className={styles.workspaceHead}>
        <div className={styles.workspaceName}>
          <span className={styles.liveDot} />
          <span className={styles.workspaceTitle}>NEXARA</span>
          {totalUnread > 0 && (
            <span className={styles.unreadBadge} aria-label={`${totalUnread} mensajes sin leer`}>
              {badgeText(totalUnread)}
            </span>
          )}
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={`${styles.headIcon} ${styles.tipBelow}`}
            aria-label="Ir a un canal (Ctrl+K)"
            data-tip="Ir a un canal (Ctrl+K)"
            onClick={onOpenSwitcher}
          >
            <SearchIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          </button>
          <button
            type="button"
            className={`${styles.headIcon} ${styles.headIconStrong} ${styles.tipBelow}`}
            aria-label="Nuevo mensaje directo"
            data-tip="Nuevo mensaje directo"
            onClick={onNewDm}
          >
            <EditNoteOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          </button>
        </div>
      </div>

      <div className={styles.sidebarSearch}>
        <SearchIcon aria-hidden="true" sx={{ fontSize: 16 }} />
        <input
          aria-label="Filtrar canales"
          placeholder="Filtrar canales y personas…"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
              e.preventDefault();
              onOpenSwitcher();
            }
          }}
        />
        <span className={styles.kbd}>Ctrl K</span>
      </div>

      <nav className={styles.sidebarScroll} aria-label="Conversaciones">
        {starred.length > 0 && (
          <Section
            title="Favoritos"
            collapsed={isCollapsed("favoritos")}
            onToggle={() => toggle("favoritos")}
            rows={starred}
            activeId={activeId}
            renderRow={row}
          />
        )}
        <Section
          title="Canales"
          collapsed={isCollapsed("canales")}
          onToggle={() => toggle("canales")}
          addLabel="Crear canal"
          onAdd={onNewChannel}
          rows={publics}
          activeId={activeId}
          renderRow={row}
          footer={
            <>
              {loading && <div className={styles.loadingLine}>Cargando…</div>}
              <button type="button" className={styles.rowAdd} onClick={onNewChannel}>
                <span className={styles.plusBox} aria-hidden="true">
                  <AddIcon sx={{ fontSize: 14 }} />
                </span>
                Crear canal
              </button>
            </>
          }
        />
        <Section
          title="Mensajes directos"
          collapsed={isCollapsed("directos")}
          onToggle={() => toggle("directos")}
          addLabel="Nuevo mensaje directo"
          onAdd={onNewDm}
          rows={dms}
          activeId={activeId}
          renderRow={row}
          footer={
            <button type="button" className={styles.rowAdd} onClick={onNewDm}>
              <span className={styles.plusBox} aria-hidden="true">
                <AddIcon sx={{ fontSize: 14 }} />
              </span>
              Escribir a alguien
            </button>
          }
        />
      </nav>
    </aside>
  );
}
