"use client";

import { useEffect, useRef, useState } from "react";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import styles from "../WorkspaceChat.module.css";
import MentionTextarea from "./MentionTextarea";
import EmojiPicker from "./EmojiPicker";
import EntityCards from "./EntityCards";
import { Avatar, ReceiptTicks } from "./ChatAtoms";
import { renderMessageBody } from "./rich-text";
import {
  REACCIONES_RAPIDAS,
  attachmentHref,
  dayKey,
  dayLabel,
  formatClock,
  formatMexicoDateTime,
  isImageAttachment,
  summarizeReactors,
} from "./chat-utils";
import { isJumboEmoji } from "@/lib/chat-emoji";
import type { Message } from "./types";

export type MessageListCtx = {
  currentUserId: number;
  token: string;
  readOnly: boolean;
  canDeleteMessages: boolean;
  highlightId: number | null;
  editingId: number | null;
  editDraft: string;
  onEditDraft: (value: string) => void;
  onStartEdit: (m: Message) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
  onReact: (id: number, emoji: string) => void;
  onOpenReactions: (id: number, emoji: string) => void;
  hoveredReaction: { messageId: number; emoji: string } | null;
  onHoverReaction: (
    next:
      | { messageId: number; emoji: string }
      | null
      | ((cur: { messageId: number; emoji: string } | null) => { messageId: number; emoji: string } | null),
  ) => void;
  emojiPickerFor: number | null;
  onEmojiPickerFor: (next: number | null | ((cur: number | null) => number | null)) => void;
  onOpenThread: (m: Message) => void;
  onTogglePin: (id: number) => void;
  onOpenReadInfo: (id: number) => void;
  onAskDelete: (m: Message) => void;
  /** Hilo abierto en el panel derecho, para marcar su resumen. */
  openThreadId?: number | null;
};

type ListProps = {
  list: Message[];
  ctx: MessageListCtx;
  compactStart?: boolean;
  /** Marca de tiempo de la última lectura; los mensajes ajenos posteriores van tras «Nuevos». */
  unreadBoundaryTs?: number | null;
};

function MessageRow({
  m,
  ctx,
  compact,
}: {
  m: Message;
  ctx: MessageListCtx;
  compact: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const { currentUserId, readOnly, canDeleteMessages } = ctx;
  const ts = new Date(m.createdAt).getTime();
  const mine = m.authorId === currentUserId;
  const canEdit = mine && Date.now() - ts <= 60 * 60 * 1000;
  const mineReaction = (emoji: string) =>
    m.reactions.some((r) => r.emoji === emoji && r.userIds.includes(currentUserId));
  const pinned = Boolean(m.pinnedAt) && !m.deleted;

  useEffect(() => {
    if (!moreOpen) return;
    moreRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!moreRef.current?.contains(t) && !moreBtnRef.current?.contains(t)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [moreOpen]);

  const showEdit = !readOnly && canEdit;
  const showInfo = !readOnly && mine && !m.pending && m.id > 0;
  const showDelete = canDeleteMessages && !m.pending && m.id > 0;
  const toolbarOpen = moreOpen || ctx.emojiPickerFor === m.id;

  const moreItem = (label: string, onClick: () => void, opts?: { danger?: boolean; title?: string }) => (
    <button
      type="button"
      role="menuitem"
      title={opts?.title}
      className={`${styles.menuItem} ${opts?.danger ? styles.menuItemDanger : ""}`}
      onClick={() => {
        setMoreOpen(false);
        onClick();
      }}
      onKeyDown={(e) => {
        const items = Array.from(moreRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
        const i = items.indexOf(e.currentTarget);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          items[(i + 1) % items.length]?.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          items[(i - 1 + items.length) % items.length]?.focus();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          setMoreOpen(false);
          moreBtnRef.current?.focus();
        }
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className={[
        styles.msg,
        compact ? styles.msgCompact : "",
        ctx.highlightId === m.id ? styles.msgHighlight : "",
        mine ? styles.msgMine : "",
        pinned ? styles.msgPinned : "",
        toolbarOpen ? styles.msgToolbarOpen : "",
      ]
        .filter(Boolean)
        .join(" ")}
      id={`msg-${m.id}`}
      {...(!mine && m.id > 0 ? { "data-incoming-msg": String(m.id), "data-channel-id": String(m.channelId) } : {})}
    >
      {compact ? (
        <>
          <span className={styles.msgTimeHover}>{formatClock(m.createdAt)}</span>
          <div className={styles.avatarSpacer} />
        </>
      ) : (
        <Avatar user={m.author} />
      )}
      <div className={styles.msgContent}>
        {pinned && (
          <div className={styles.pinNote} title={m.pinnedAt ? `Fijado el ${formatMexicoDateTime(m.pinnedAt)}` : undefined}>
            <PushPinIcon aria-hidden="true" sx={{ fontSize: 12 }} />
            Fijado
          </div>
        )}
        {!compact && (
          <div className={styles.msgMeta}>
            <span className={styles.msgAuthor}>{m.author.nombre}</span>
            <time className={styles.msgTime} dateTime={m.createdAt} title={formatMexicoDateTime(m.createdAt)}>
              {formatClock(m.createdAt)}
            </time>
            {m.editedAt && !m.deleted && <span className={styles.edited}>(editado)</span>}
            {mine && !m.deleted && (
              <button
                type="button"
                className={styles.receiptBtn}
                title="Visto por"
                aria-label="Visto por"
                disabled={Boolean(m.pending) || m.id < 0}
                onClick={() => ctx.onOpenReadInfo(m.id)}
              >
                <ReceiptTicks receipt={m.receipt} pending={m.pending} failed={m.failed} />
              </button>
            )}
          </div>
        )}

        {m.replyTo?.deleted && !m.deleted && <div className={styles.replyCite}>Mensaje eliminado</div>}

        {m.deleted ? (
          <div className={styles.msgDeleted}>Mensaje eliminado</div>
        ) : ctx.editingId === m.id ? (
          <div className={styles.editBox}>
            <MentionTextarea value={ctx.editDraft} onChange={ctx.onEditDraft} rows={3} aria-label="Editar mensaje" />
            <div className={styles.editActions}>
              <button type="button" className={styles.sendBtn} onClick={() => ctx.onSaveEdit(m.id)}>
                Guardar
              </button>
              <button type="button" className={styles.actionBtn} onClick={ctx.onCancelEdit}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          m.body &&
          m.body !== `Archivo: ${m.attachmentName}` && (
            <div
              className={`${styles.msgBody} ${!m.attachmentUrl && isJumboEmoji(m.body) ? styles.msgBodyJumbo : ""}`}
            >
              {renderMessageBody(m.body)}
            </div>
          )
        )}

        {!m.deleted && ctx.editingId !== m.id && m.body ? <EntityCards body={m.body} token={ctx.token} /> : null}

        {!m.deleted &&
          m.attachmentUrl &&
          ctx.editingId !== m.id &&
          (isImageAttachment(m.attachmentName ?? "") ? (
            <a href={attachmentHref(m.attachmentUrl)} target="_blank" rel="noreferrer" className={styles.msgAttachmentImageLink}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachmentHref(m.attachmentUrl)}
                alt={m.attachmentName ?? "Adjunto"}
                className={styles.msgAttachmentImage}
              />
            </a>
          ) : (
            <a href={attachmentHref(m.attachmentUrl)} target="_blank" rel="noreferrer" className={styles.msgAttachmentFile}>
              <span className={styles.attachChipIcon}>
                <DescriptionOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
              </span>
              <span className={styles.attachChipName}>{m.attachmentName ?? "Archivo"}</span>
              <span className={styles.msgAttachmentDownload}>Descargar</span>
            </a>
          ))}

        {!m.deleted && m.reactions?.length > 0 && (
          <div className={styles.reactions}>
            {m.reactions.map((r) => (
              <div
                key={r.emoji}
                className={`${styles.reaction} ${mineReaction(r.emoji) ? styles.reactionMine : ""}`}
                onMouseEnter={() => ctx.onHoverReaction({ messageId: m.id, emoji: r.emoji })}
                onMouseLeave={() =>
                  ctx.onHoverReaction((cur) => (cur && cur.messageId === m.id && cur.emoji === r.emoji ? null : cur))
                }
              >
                <button
                  type="button"
                  className={styles.reactionEmojiBtn}
                  onClick={() => {
                    if (readOnly) return;
                    ctx.onReact(m.id, r.emoji);
                  }}
                  disabled={readOnly}
                  title={mineReaction(r.emoji) ? "Quitar tu reacción" : "Reaccionar"}
                >
                  {r.emoji}
                </button>
                <button
                  type="button"
                  className={styles.reactionCountBtn}
                  onClick={() => ctx.onOpenReactions(m.id, r.emoji)}
                  aria-label={`Ver quién reaccionó con ${r.emoji}`}
                >
                  {r.count}
                </button>
                {ctx.hoveredReaction?.messageId === m.id && ctx.hoveredReaction.emoji === r.emoji && r.users?.length ? (
                  <div className={styles.reactionTooltip} role="tooltip">
                    {summarizeReactors(r.users)}
                  </div>
                ) : null}
              </div>
            ))}
            {!readOnly && (
              <button
                type="button"
                className={`${styles.reaction} ${styles.reactionAdd}`}
                aria-label="Agregar reacción"
                onClick={() => ctx.onEmojiPickerFor((cur) => (cur === m.id ? null : m.id))}
              >
                <AddReactionOutlinedIcon aria-hidden="true" sx={{ fontSize: 15 }} />
              </button>
            )}
          </div>
        )}

        {!m.deleted && (!readOnly || canDeleteMessages) && (
          <div className={styles.msgActions} data-emoji-picker role="toolbar" aria-label="Acciones del mensaje">
            {!readOnly &&
              REACCIONES_RAPIDAS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionEmoji}`}
                  aria-label={`Reaccionar con ${e}`}
                  aria-pressed={mineReaction(e)}
                  data-tip={`Reaccionar con ${e}`}
                  onClick={() => ctx.onReact(m.id, e)}
                >
                  <span aria-hidden="true">{e}</span>
                </button>
              ))}
            {!readOnly && (
              <button
                type="button"
                className={styles.actionBtn}
                aria-label="Elegir otra reacción"
                data-tip="Reaccionar"
                aria-expanded={ctx.emojiPickerFor === m.id}
                aria-haspopup="dialog"
                onClick={() => ctx.onEmojiPickerFor((cur) => (cur === m.id ? null : m.id))}
              >
                <AddReactionOutlinedIcon aria-hidden="true" sx={{ fontSize: 17 }} />
              </button>
            )}
            {!readOnly && ctx.emojiPickerFor === m.id && (
              <div data-emoji-picker>
                <EmojiPicker
                  title="Reaccionar con un emoji"
                  className={styles.reactionPickerPos}
                  onSelect={(emoji) => {
                    ctx.onReact(m.id, emoji);
                    ctx.onEmojiPickerFor(null);
                  }}
                  onClose={() => ctx.onEmojiPickerFor(null)}
                />
              </div>
            )}
            {!readOnly && <span className={styles.actionSep} aria-hidden="true" />}
            {!readOnly && !m.parentId && (
              <button
                type="button"
                className={styles.actionBtn}
                aria-label="Responder en hilo"
                data-tip="Responder en hilo"
                onClick={() => ctx.onOpenThread(m)}
              >
                <ForumOutlinedIcon aria-hidden="true" sx={{ fontSize: 17 }} />
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                className={styles.actionBtn}
                aria-label={m.pinnedAt ? "Quitar de fijados" : "Fijar mensaje"}
                aria-pressed={Boolean(m.pinnedAt)}
                data-tip={m.pinnedAt ? "Quitar de fijados" : "Fijar mensaje"}
                onClick={() => ctx.onTogglePin(m.id)}
              >
                {m.pinnedAt ? (
                  <PushPinIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                ) : (
                  <PushPinOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                )}
              </button>
            )}
            {(showEdit || showInfo || showDelete) && (
              <span className={styles.menuAnchor}>
                <button
                  ref={moreBtnRef}
                  type="button"
                  className={`${styles.actionBtn} ${moreOpen ? styles.actionBtnOn : ""}`}
                  aria-label="Más acciones"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  data-tip="Más"
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  <MoreHorizIcon aria-hidden="true" sx={{ fontSize: 17 }} />
                </button>
                {moreOpen && (
                  <div ref={moreRef} className={`${styles.menu} ${styles.menuMsg}`} role="menu" aria-label="Más acciones">
                    {showEdit &&
                      moreItem("Editar mensaje", () => ctx.onStartEdit(m), {
                        title: "Disponible durante 1 hora después de enviar",
                      })}
                    {showInfo && moreItem("Visto por", () => ctx.onOpenReadInfo(m.id))}
                    {showDelete && moreItem("Eliminar para todos", () => ctx.onAskDelete(m), { danger: true })}
                  </div>
                )}
              </span>
            )}
          </div>
        )}

        {mine && compact && !m.deleted && (
          <div className={styles.receiptLine}>
            <button
              type="button"
              className={styles.receiptBtn}
              title="Visto por"
              aria-label="Visto por"
              disabled={Boolean(m.pending) || m.id < 0}
              onClick={() => ctx.onOpenReadInfo(m.id)}
            >
              <ReceiptTicks receipt={m.receipt} pending={m.pending} failed={m.failed} />
            </button>
          </div>
        )}

        {!m.parentId && m.replyCount > 0 && (
          <button
            type="button"
            className={`${styles.threadHint} ${ctx.openThreadId === m.id ? styles.threadHintOpen : ""}`}
            onClick={() => ctx.onOpenThread(m)}
          >
            <strong>
              {m.replyCount} {m.replyCount === 1 ? "respuesta" : "respuestas"}
            </strong>
            <span>Ver hilo</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Lista de mensajes con separadores de día y de «Nuevos». Agrupa por autor: dentro de 5 minutos y
 * el mismo día, el siguiente mensaje de la misma persona va sin foto ni nombre.
 */
export default function MessageList({ list, ctx, compactStart, unreadBoundaryTs }: ListProps) {
  let lastAuthor: number | null = null;
  let lastDay: string | null = null;
  let lastTs = 0;
  let dividerShown = false;
  return (
    <>
      {list.map((m) => {
        const dk = dayKey(m.createdAt);
        const showDay = dk !== lastDay;
        lastDay = dk;
        const ts = new Date(m.createdAt).getTime();
        const showUnreadDivider =
          unreadBoundaryTs != null && !dividerShown && ts > unreadBoundaryTs && m.authorId !== ctx.currentUserId;
        if (showUnreadDivider) dividerShown = true;
        const compact =
          !showDay &&
          !showUnreadDivider &&
          lastAuthor === m.authorId &&
          ts - lastTs < 5 * 60 * 1000 &&
          !compactStart &&
          !(m.pinnedAt && !m.deleted);
        lastAuthor = m.authorId;
        lastTs = ts;
        return (
          <div key={m.id}>
            {showDay && (
              <div className={styles.dayDivider} role="separator" aria-label={dayLabel(m.createdAt)}>
                <span>{dayLabel(m.createdAt)}</span>
              </div>
            )}
            {showUnreadDivider && (
              <div className={styles.newDivider} role="separator" aria-label="Mensajes nuevos">
                <span>Nuevos</span>
              </div>
            )}
            <MessageRow m={m} ctx={ctx} compact={compact} />
          </div>
        );
      })}
    </>
  );
}
