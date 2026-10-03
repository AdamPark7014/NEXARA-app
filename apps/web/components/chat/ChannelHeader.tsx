"use client";

import { useEffect, useRef, useState } from "react";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import NotificationsOffOutlinedIcon from "@mui/icons-material/NotificationsOffOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import styles from "../WorkspaceChat.module.css";
import { Avatar, channelPrefixNode } from "./ChatAtoms";
import { formatClock, readableChatPreview } from "./chat-utils";
import { highlightMatches } from "./rich-text";
import type { Channel, Message, SearchScope } from "./types";

export type ChannelTab = "messages" | "pins";

export const TAB_IDS = {
  messages: { tab: "chat-tab-messages", panel: "chat-panel-messages" },
  pins: { tab: "chat-tab-pins", panel: "chat-panel-pins" },
} as const;

type Props = {
  detail: Channel | null;
  starred: boolean;
  onToggleStar: () => void;
  showMembers: boolean;
  onToggleMembers: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  notifyOn: boolean;
  onToggleNotify: () => void;
  onToggleMute: () => void;
  canLeave: boolean;
  onLeave: () => void;
  onSaveTopic: (topic: string) => void;
  tab: ChannelTab;
  onTab: (tab: ChannelTab) => void;
  pinnedCount: number;
  searchOpen: boolean;
  onSearchOpen: (open: boolean) => void;
  searchQ: string;
  onSearch: (q: string) => void;
  searchScope: SearchScope;
  onSearchScope: (scope: SearchScope) => void;
  searchHits: Message[];
  onPickHit: (hit: Message) => void;
  onMobileBack: () => void;
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: "America/Mexico_City",
  });
}

export default function ChannelHeader({
  detail,
  starred,
  onToggleStar,
  showMembers,
  onToggleMembers,
  soundOn,
  onToggleSound,
  notifyOn,
  onToggleNotify,
  onToggleMute,
  canLeave,
  onLeave,
  onSaveTopic,
  tab,
  onTab,
  pinnedCount,
  searchOpen,
  onSearchOpen,
  searchQ,
  onSearch,
  searchScope,
  onSearchScope,
  searchHits,
  onPickHit,
  onMobileBack,
}: Props) {
  const readOnly = Boolean(detail?.readOnly);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEditingTopic(false);
    setMenuOpen(false);
  }, [detail?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !menuBtnRef.current?.contains(t)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) onSearchOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchOpen, onSearchOpen]);

  const startTopicEdit = () => {
    if (readOnly) return;
    setTopicDraft(detail?.topic ?? "");
    setEditingTopic(true);
  };

  const commitTopic = () => {
    setEditingTopic(false);
    if (topicDraft.trim() !== (detail?.topic ?? "").trim()) onSaveTopic(topicDraft.trim());
  };

  const members = detail?.members ?? [];
  const stack = members.slice(0, 3);
  const isDirect = detail?.kind === "DIRECT";

  const menuItem = (label: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      role="menuitem"
      className={`${styles.menuItem} ${danger ? styles.menuItemDanger : ""}`}
      onClick={() => {
        setMenuOpen(false);
        onClick();
      }}
      onKeyDown={(e) => {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
        const i = items.indexOf(e.currentTarget);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          items[(i + 1) % items.length]?.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          items[(i - 1 + items.length) % items.length]?.focus();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          setMenuOpen(false);
          menuBtnRef.current?.focus();
        }
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <header className={styles.channelHeader}>
        <button
          type="button"
          className={styles.mobileBack}
          aria-label="Volver a la lista de canales"
          onClick={onMobileBack}
        >
          ← Canales
        </button>
        <div className={styles.channelTitleBlock} title={detail?.description ?? undefined}>
          <div className={styles.channelTitle}>
            <span className={styles.channelTitlePrefix}>{channelPrefixNode(detail?.kind ?? "PUBLIC")}</span>
            <h2 className={styles.channelName}>{detail?.name ?? "…"}</h2>
            {detail ? (
              <button
                type="button"
                className={`${styles.titleStar} ${starred ? styles.titleStarOn : ""}`}
                aria-label={starred ? "Quitar de favoritos" : "Añadir a favoritos"}
                aria-pressed={starred}
                data-tip={starred ? "Quitar de favoritos" : "Añadir a favoritos"}
                onClick={onToggleStar}
              >
                {starred ? (
                  <StarIcon aria-hidden="true" sx={{ fontSize: 15 }} />
                ) : (
                  <StarBorderIcon aria-hidden="true" sx={{ fontSize: 15 }} />
                )}
              </button>
            ) : null}
            {detail?.supervised ? (
              <span className={styles.supervisePill} title="Vista de supervisión (solo lectura)">
                Supervisión
              </span>
            ) : null}
          </div>
          {editingTopic ? (
            <input
              className={styles.topicInput}
              aria-label="Tema del canal"
              value={topicDraft}
              autoFocus
              maxLength={250}
              placeholder="Escribe el tema del canal"
              onChange={(e) => setTopicDraft(e.target.value)}
              onBlur={commitTopic}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  commitTopic();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditingTopic(false);
                }
              }}
            />
          ) : readOnly ? (
            <div className={styles.channelTopic}>{detail?.topic || "Sin tema"}</div>
          ) : (
            <button
              type="button"
              className={`${styles.channelTopic} ${styles.channelTopicBtn}`}
              onClick={startTopicEdit}
              aria-label={detail?.topic ? `Tema: ${detail.topic}. Editar tema` : "Añadir tema"}
            >
              {detail?.topic || "Añadir tema…"}
            </button>
          )}
        </div>

        <div className={styles.headerMeta}>
          {typeof detail?.memberCount === "number" && (
            <button
              type="button"
              className={`${styles.memberStack} ${showMembers ? styles.memberStackOn : ""}`}
              aria-label={`Ver miembros del canal (${detail.memberCount})`}
              aria-pressed={showMembers}
              data-tip="Miembros"
              onClick={onToggleMembers}
            >
              <span className={styles.memberStackAvs} aria-hidden="true">
                {stack.map((m) => (
                  <Avatar key={m.id} user={m} size="xs" className={styles.memberStackAv} />
                ))}
              </span>
              <span>{detail.memberCount}</span>
            </button>
          )}

          <div className={styles.headerSearch} ref={searchRef}>
            <SearchIcon aria-hidden="true" sx={{ fontSize: 16 }} />
            <input
              aria-label={searchScope === "all" ? "Buscar en todos los canales" : "Buscar en el canal"}
              placeholder={searchScope === "all" ? "Buscar en todos los canales" : "Buscar en el canal"}
              value={searchQ}
              onFocus={() => onSearchOpen(true)}
              onChange={(e) => {
                onSearchOpen(true);
                onSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  onSearchOpen(false);
                  e.currentTarget.blur();
                } else if (e.key === "Enter" && searchHits[0]) {
                  e.preventDefault();
                  onPickHit(searchHits[0]);
                }
              }}
            />
            {searchQ ? (
              <button
                type="button"
                className={styles.searchClear}
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  onSearch("");
                  onSearchOpen(false);
                }}
              >
                <CloseIcon aria-hidden="true" sx={{ fontSize: 14 }} />
              </button>
            ) : null}

            {searchOpen && (
              <div className={styles.searchPanel} role="region" aria-label="Resultados de búsqueda">
                <div className={styles.searchScope} role="group" aria-label="Dónde buscar">
                  <button
                    type="button"
                    className={`${styles.scopeBtn} ${searchScope === "channel" ? styles.scopeBtnOn : ""}`}
                    aria-pressed={searchScope === "channel"}
                    onClick={() => onSearchScope("channel")}
                  >
                    Este canal
                  </button>
                  <button
                    type="button"
                    className={`${styles.scopeBtn} ${searchScope === "all" ? styles.scopeBtnOn : ""}`}
                    aria-pressed={searchScope === "all"}
                    onClick={() => onSearchScope("all")}
                  >
                    Todos los canales
                  </button>
                </div>
                {searchQ.trim().length < 2 ? (
                  <div className={styles.searchEmpty}>Escribe al menos 2 letras.</div>
                ) : searchHits.length === 0 ? (
                  <div className={styles.searchEmpty}>Sin resultados para «{searchQ.trim()}».</div>
                ) : (
                  <div className={styles.searchHits}>
                    {searchHits.map((h) => (
                      <button key={h.id} type="button" className={styles.searchHit} onClick={() => onPickHit(h)}>
                        <div className={styles.searchHitMeta}>
                          <strong>{h.author.nombre}</strong>
                          {h.channel && searchScope === "all" ? (
                            <span>
                              {" "}
                              · {h.channel.kind === "PUBLIC" ? "#" : ""}
                              {h.channel.name}
                            </span>
                          ) : null}
                          <span>
                            {" "}
                            · {shortDate(h.createdAt)} {formatClock(h.createdAt)}
                          </span>
                          {h.parentId ? <span> · en un hilo</span> : null}
                        </div>
                        {h.replyTo?.deleted && <div className={styles.replyCite}>Mensaje eliminado</div>}
                        <div className={styles.searchHitBody}>
                          {highlightMatches(readableChatPreview(h.body), searchQ)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {!readOnly && (
            <button
              type="button"
              className={`${styles.iconBtn} ${detail?.muted ? styles.iconBtnActive : ""}`}
              aria-label={detail?.muted ? "Reactivar notificaciones del canal" : "Silenciar canal"}
              aria-pressed={Boolean(detail?.muted)}
              data-tip={detail?.muted ? "Reactivar notificaciones" : "Silenciar canal"}
              onClick={onToggleMute}
            >
              {detail?.muted ? (
                <NotificationsOffOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
              ) : (
                <NotificationsNoneOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
              )}
            </button>
          )}

          <div className={styles.menuAnchor}>
            <button
              ref={menuBtnRef}
              type="button"
              className={`${styles.iconBtn} ${menuOpen ? styles.iconBtnActive : ""}`}
              aria-label="Más opciones del canal"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-tip="Más opciones"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <MoreHorizIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            </button>
            {menuOpen && (
              <div ref={menuRef} className={styles.menu} role="menu" aria-label="Opciones del canal">
                {menuItem(soundOn ? "Desactivar sonido" : "Activar sonido", onToggleSound)}
                {menuItem(
                  notifyOn ? "Desactivar avisos del navegador" : "Activar avisos del navegador",
                  onToggleNotify,
                )}
                {menuItem(showMembers ? "Ocultar miembros" : "Ver miembros", onToggleMembers)}
                {canLeave && !isDirect ? menuItem("Salir del canal", onLeave, true) : null}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Vistas del canal">
        <button
          type="button"
          role="tab"
          id={TAB_IDS.messages.tab}
          aria-controls={TAB_IDS.messages.panel}
          aria-selected={tab === "messages"}
          className={`${styles.tab} ${tab === "messages" ? styles.tabOn : ""}`}
          onClick={() => onTab("messages")}
        >
          <ChatBubbleOutlineIcon aria-hidden="true" sx={{ fontSize: 15 }} />
          Mensajes
        </button>
        <button
          type="button"
          role="tab"
          id={TAB_IDS.pins.tab}
          aria-controls={TAB_IDS.pins.panel}
          aria-selected={tab === "pins"}
          className={`${styles.tab} ${tab === "pins" ? styles.tabOn : ""}`}
          onClick={() => onTab("pins")}
        >
          <PushPinOutlinedIcon aria-hidden="true" sx={{ fontSize: 15 }} />
          Fijados
          {pinnedCount > 0 ? <span className={styles.tabCount}>{pinnedCount}</span> : null}
        </button>
      </div>
    </>
  );
}
