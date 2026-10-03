"use client";

import type { ReactNode } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import InlineAlert from "@/components/ui/InlineAlert";
import styles from "../WorkspaceChat.module.css";
import { Avatar, ReactorAvatar, channelPrefixNode } from "./ChatAtoms";
import { formatMexicoDateTime, formatRelativeTime } from "./chat-utils";
import type { Channel, ChatUser, MentionEntity, Message, ReactionUser, ReadPerson } from "./types";

export const MENTION_KIND_ICON: Record<MentionEntity["kind"], SvgIconComponent> = {
  USER: PersonOutlineIcon,
  ACTIVITY: AssignmentOutlinedIcon,
  EVIDENCE: PhotoCameraOutlinedIcon,
};

function Modal({
  labelledBy,
  onClose,
  className,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={onClose}>
      <div
        className={`${styles.modal} ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function NewChannelDialog({
  name,
  onName,
  topic,
  onTopic,
  description,
  onDescription,
  isPrivate,
  onPrivate,
  error,
  creating,
  onCreate,
  onClose,
}: {
  name: string;
  onName: (v: string) => void;
  topic: string;
  onTopic: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  isPrivate: boolean;
  onPrivate: (v: boolean) => void;
  error: string | null;
  creating: boolean;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <Modal labelledBy="chat-modal-new-channel" onClose={onClose}>
      <div className={styles.modalTitle} id="chat-modal-new-channel">
        Crear canal
      </div>
      <p className={styles.modalHint}>
        Un canal reúne a un equipo o a un tema. Los públicos los ve toda la empresa; los privados, solo quien invites.
      </p>
      <label className={styles.fieldLabel} htmlFor="chat-new-channel-name">
        Nombre
      </label>
      <input
        id="chat-new-channel-name"
        className={styles.modalInput}
        placeholder="Nombre del canal, por ejemplo: operaciones"
        aria-label="Nombre del canal"
        value={name}
        onChange={(e) => onName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onCreate();
          }
        }}
        autoFocus
      />
      <label className={styles.fieldLabel} htmlFor="chat-new-channel-topic">
        Tema <small>(opcional)</small>
      </label>
      <input
        id="chat-new-channel-topic"
        className={styles.modalInput}
        placeholder="De qué se habla aquí, por ejemplo: material y evidencias"
        value={topic}
        maxLength={250}
        onChange={(e) => onTopic(e.target.value)}
      />
      <label className={styles.fieldLabel} htmlFor="chat-new-channel-description">
        Descripción <small>(opcional)</small>
      </label>
      <textarea
        id="chat-new-channel-description"
        className={`${styles.modalInput} ${styles.modalTextarea}`}
        placeholder="Para qué sirve el canal y quién debería estar"
        rows={3}
        value={description}
        maxLength={1000}
        onChange={(e) => onDescription(e.target.value)}
      />
      <label className={styles.optionRow}>
        <input type="checkbox" checked={isPrivate} onChange={(e) => onPrivate(e.target.checked)} />
        <span className={styles.optionText}>
          Canal privado
          <small>Solo lo ven y entran quienes invites.</small>
        </span>
      </label>
      {error ? (
        <p className={styles.modalError} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.modalActions}>
        <button type="button" className={styles.actionBtn} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className={styles.sendBtn} onClick={onCreate} disabled={!name.trim() || creating}>
          {creating ? "Creando…" : "Crear canal"}
        </button>
      </div>
    </Modal>
  );
}

function ColleagueButton({
  user,
  presence,
  onClick,
}: {
  user: ChatUser;
  presence: Record<number, "online" | "away">;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.colleagueBtn} onClick={onClick}>
      <span className={styles.presenceWrap}>
        <Avatar user={user} size="md" />
        <span
          className={`${styles.presenceDot} ${presence[user.id] === "online" ? styles.presenceOnline : ""}`}
          style={{ borderColor: "var(--surface)" }}
        />
      </span>
      <div className={styles.colleagueMeta}>
        <div className={styles.colleagueName}>{user.nombre}</div>
        <div className={styles.colleagueEmail}>{user.email}</div>
      </div>
    </button>
  );
}

export function ColleaguesDialog({
  id,
  title,
  query,
  onQuery,
  colleagues,
  presence,
  onPick,
  onClose,
}: {
  id: string;
  title: string;
  query: string;
  onQuery: (q: string) => void;
  colleagues: ChatUser[];
  presence: Record<number, "online" | "away">;
  onPick: (userId: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal labelledBy={id} onClose={onClose}>
      <div className={styles.modalTitle} id={id}>
        {title}
      </div>
      <input
        className={styles.modalInput}
        placeholder="Buscar compañero…"
        aria-label="Buscar compañero"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoFocus
      />
      <div className={styles.colleagueList}>
        {colleagues.map((u) => (
          <ColleagueButton key={u.id} user={u} presence={presence} onClick={() => onPick(u.id)} />
        ))}
        {colleagues.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: 8 }}>Sin resultados</div>
        )}
      </div>
      <div className={styles.modalActions}>
        <button type="button" className={styles.actionBtn} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

export function EntityPickerDialog({
  kind,
  onKind,
  query,
  onQuery,
  results,
  loading,
  onPick,
  onClose,
}: {
  kind: MentionEntity["kind"];
  onKind: (kind: MentionEntity["kind"]) => void;
  query: string;
  onQuery: (q: string) => void;
  results: MentionEntity[];
  loading: boolean;
  onPick: (entity: MentionEntity) => void;
  onClose: () => void;
}) {
  return (
    <Modal labelledBy="chat-modal-entity" onClose={onClose} className={styles.entityPickerModal}>
      <div className={styles.modalTitle} id="chat-modal-entity">
        Mencionar en el mensaje
      </div>
      <div className={styles.entityTabs}>
        {(
          [
            ["USER", "Personas"],
            ["ACTIVITY", "Actividades"],
            ["EVIDENCE", "Evidencias"],
          ] as Array<[MentionEntity["kind"], string]>
        ).map(([k, label]) => {
          const TabIcon = MENTION_KIND_ICON[k];
          return (
            <button
              key={k}
              type="button"
              className={`${styles.entityTab} ${kind === k ? styles.entityTabActive : ""}`}
              aria-pressed={kind === k}
              onClick={() => onKind(k)}
            >
              <TabIcon aria-hidden="true" sx={{ fontSize: 16 }} />
              {label}
            </button>
          );
        })}
      </div>
      <input
        className={styles.modalInput}
        aria-label="Buscar"
        placeholder={
          kind === "USER"
            ? "Buscar por nombre o correo…"
            : kind === "ACTIVITY"
              ? "Buscar por AN, título o estado…"
              : "Buscar evidencia, actividad o comentario…"
        }
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoFocus
      />
      <div className={styles.entityResults}>
        {loading && <div className={styles.loadingLine}>Buscando…</div>}
        {!loading &&
          results.map((entity) => {
            const KindIcon = MENTION_KIND_ICON[entity.kind];
            return (
              <button
                key={`${entity.kind}-${entity.id}`}
                type="button"
                className={styles.entityResult}
                onClick={() => onPick(entity)}
              >
                <span className={styles.entityResultIcon}>
                  <KindIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                </span>
                <span className={styles.entityResultText}>
                  <strong>{entity.label}</strong>
                  <small>{entity.subtitle}</small>
                </span>
                <span className={styles.entityResultAdd}>Mencionar</span>
              </button>
            );
          })}
        {!loading && results.length === 0 && <div className={styles.entityEmpty}>No hay resultados disponibles.</div>}
      </div>
      <div className={styles.modalActions}>
        <button type="button" className={styles.actionBtn} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

export function SwitcherDialog({
  query,
  onQuery,
  items,
  index,
  onIndex,
  onPick,
  onClose,
}: {
  query: string;
  onQuery: (q: string) => void;
  items: Channel[];
  index: number;
  onIndex: (next: number | ((i: number) => number)) => void;
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal labelledBy="chat-modal-switcher" onClose={onClose} className={styles.switcher}>
      <div className={styles.modalTitle} id="chat-modal-switcher">
        Ir a canal
      </div>
      <input
        className={styles.modalInput}
        placeholder="Escribe para filtrar…"
        aria-label="Filtrar canales"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            onIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && items[index]) {
            e.preventDefault();
            onPick(items[index].id);
          }
        }}
      />
      <div className={styles.switcherList}>
        {items.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={`${styles.switcherItem} ${i === index ? styles.switcherItemActive : ""}`}
            onMouseEnter={() => onIndex(i)}
            onClick={() => onPick(c.id)}
          >
            <span className={styles.channelPrefix}>{channelPrefixNode(c.kind) ?? "·"}</span>
            <span className={styles.channelLabel}>{c.name}</span>
            {(c.unreadCount ?? 0) > 0 && <span className={styles.unreadBadge}>{c.unreadCount}</span>}
          </button>
        ))}
        {items.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: 10 }}>Sin coincidencias</div>
        )}
      </div>
      <div className={styles.switcherHint}>↑↓ navegar · Enter abrir · Esc cerrar</div>
    </Modal>
  );
}

export function ReadInfoDialog({
  loading,
  error,
  info,
  onClose,
}: {
  loading: boolean;
  error: string | null;
  info: { seen: ReadPerson[]; pending: ReadPerson[] } | null;
  onClose: () => void;
}) {
  return (
    <Modal labelledBy="chat-modal-reads" onClose={onClose} className={styles.reactorsModal}>
      <div className={styles.modalTitle} id="chat-modal-reads">
        Info · Visto por
      </div>
      {loading && <div className={styles.loadingLine}>Cargando…</div>}
      {error && <InlineAlert variant="danger" dense message={error} />}
      {!loading && info && (
        <div className={styles.reactorsList}>
          <div className={styles.readSectionLabel}>Visto · {info.seen.length}</div>
          {info.seen.map((person) => (
            <div key={`seen-${person.id}`} className={styles.reactorRow}>
              <ReactorAvatar user={person} />
              <div className={styles.reactorMeta}>
                <span className={styles.reactorName}>{person.nombre}</span>
                <span className={styles.reactorTime}>{person.readAt ? formatMexicoDateTime(person.readAt) : "—"}</span>
              </div>
            </div>
          ))}
          {info.seen.length === 0 && <div className={styles.readEmpty}>Nadie lo ha visto todavía.</div>}
          <div className={styles.readSectionLabel}>Aún no · {info.pending.length}</div>
          {info.pending.map((person) => (
            <div key={`pending-${person.id}`} className={styles.reactorRow}>
              <ReactorAvatar user={person} />
              <div className={styles.reactorMeta}>
                <span className={styles.reactorName}>{person.nombre}</span>
                <span className={styles.reactorTime}>{person.delivered ? "Entregado" : "Sin entregar"}</span>
              </div>
            </div>
          ))}
          {info.pending.length === 0 && <div className={styles.readEmpty}>Todos los destinatarios lo vieron.</div>}
        </div>
      )}
      <div className={styles.modalActions}>
        <button type="button" className={styles.actionBtn} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

export function ReactionsDialog({
  target,
  emoji,
  onEmoji,
  onClose,
}: {
  target: Message | undefined;
  emoji: string;
  onEmoji: (emoji: string) => void;
  onClose: () => void;
}) {
  const reactions = target?.reactions ?? [];
  if (!target || !reactions.length) return null;
  const activeEmoji = reactions.some((r) => r.emoji === emoji) ? emoji : "__all__";
  const totalCount = reactions.reduce((sum, r) => sum + r.count, 0);
  const activeReactors: Array<ReactionUser & { emoji: string }> =
    activeEmoji === "__all__"
      ? reactions
          .flatMap((r) => (r.users ?? []).map((u) => ({ ...u, emoji: r.emoji })))
          .sort((a, b) => {
            const ta = a.reactedAt ? new Date(a.reactedAt).getTime() : 0;
            const tb = b.reactedAt ? new Date(b.reactedAt).getTime() : 0;
            return ta - tb;
          })
      : (reactions.find((r) => r.emoji === activeEmoji)?.users ?? []).map((u) => ({
          ...u,
          emoji: activeEmoji,
        }));

  return (
    <Modal labelledBy="chat-modal-reactions" onClose={onClose} className={styles.reactorsModal}>
      <div className={styles.modalTitle} id="chat-modal-reactions">
        Reacciones
      </div>
      <div className={styles.entityTabs}>
        <button
          type="button"
          className={`${styles.entityTab} ${activeEmoji === "__all__" ? styles.entityTabActive : ""}`}
          onClick={() => onEmoji("__all__")}
        >
          Todas · {totalCount}
        </button>
        {reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            className={`${styles.entityTab} ${activeEmoji === r.emoji ? styles.entityTabActive : ""}`}
            onClick={() => onEmoji(r.emoji)}
          >
            <span>{r.emoji}</span> {r.count}
          </button>
        ))}
      </div>
      <div className={styles.reactorsList}>
        {activeReactors.map((u, i) => (
          <div key={`${u.emoji}-${u.id}-${i}`} className={styles.reactorRow}>
            <ReactorAvatar user={u} />
            <div className={styles.reactorMeta}>
              <span className={styles.reactorName}>{u.nombre}</span>
              <span className={styles.reactorTime}>{formatRelativeTime(u.reactedAt) || "—"}</span>
            </div>
            {activeEmoji === "__all__" && <span className={styles.reactorEmoji}>{u.emoji}</span>}
          </div>
        ))}
        {activeReactors.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: 8 }}>Sin reacciones</div>
        )}
      </div>
      <div className={styles.modalActions}>
        <button type="button" className={styles.actionBtn} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
