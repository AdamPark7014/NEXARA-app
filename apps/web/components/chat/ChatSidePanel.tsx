"use client";

import { useMemo, useState, type ReactNode } from "react";
import CloseIcon from "@mui/icons-material/Close";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import styles from "../WorkspaceChat.module.css";
import { Avatar, channelPrefixNode } from "./ChatAtoms";
import MessageList, { type MessageListCtx } from "./MessageList";
import type { Channel, Message } from "./types";

function PanelHead({
  title,
  subtitle,
  onClose,
  closeLabel,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.panelHead}>
      <button type="button" className={styles.mobileBack} aria-label="Volver al canal" onClick={onClose}>
        ← Chat
      </button>
      <div className={styles.panelTitleBlock}>
        <h3 className={styles.panelTitle}>{title}</h3>
        {subtitle ? <div className={styles.panelSub}>{subtitle}</div> : null}
      </div>
      <div className={styles.panelActions}>
        {actions}
        <button type="button" className={styles.panelClose} aria-label={closeLabel} data-tip="Cerrar" onClick={onClose}>
          <CloseIcon aria-hidden="true" sx={{ fontSize: 18 }} />
        </button>
      </div>
    </div>
  );
}

export function MembersPanel({
  detail,
  currentUserId,
  presence,
  onClose,
  onInvite,
  onOpenDm,
}: {
  detail: Channel | null;
  currentUserId: number;
  presence: Record<number, "online" | "away">;
  onClose: () => void;
  onInvite: () => void;
  onOpenDm: (userId: number) => void;
}) {
  const [q, setQ] = useState("");
  const members = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = detail?.members ?? [];
    if (!needle) return all;
    return all.filter((m) => m.nombre.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle));
  }, [detail?.members, q]);

  return (
    <>
      <PanelHead
        title="Miembros"
        subtitle={
          detail ? (
            <>
              {channelPrefixNode(detail.kind)}
              {detail.name} · {detail.memberCount}
            </>
          ) : null
        }
        onClose={onClose}
        closeLabel="Cerrar panel"
        actions={
          detail?.kind !== "DIRECT" && !detail?.readOnly ? (
            <button type="button" className={styles.ghostBtn} onClick={onInvite}>
              <PersonAddAltOutlinedIcon aria-hidden="true" sx={{ fontSize: 15 }} />
              Invitar
            </button>
          ) : null
        }
      />
      <div className={styles.panelBody}>
        {detail?.description ? <p className={styles.panelAbout}>{detail.description}</p> : null}
        <div className={styles.panelSearch}>
          <input
            className={styles.modalInput}
            aria-label="Buscar miembro"
            placeholder="Buscar miembro…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {members.map((m) => (
          <div key={m.id} className={styles.memberRow}>
            <span className={styles.presenceWrap}>
              <Avatar user={m} />
              <span
                className={`${styles.presenceDot} ${presence[m.id] === "online" ? styles.presenceOnline : ""}`}
                style={{ borderColor: "var(--surface)" }}
              />
            </span>
            <div className={styles.memberMeta}>
              <div className={styles.memberName}>
                {m.nombre}
                {m.role === "owner" ? <span className={styles.roleBadge}>Administrador</span> : null}
              </div>
              <div className={styles.memberEmail}>{m.email}</div>
            </div>
            {m.id !== currentUserId && (
              <button
                type="button"
                className={styles.ghostBtn}
                style={{ marginLeft: "auto" }}
                aria-label={`Mensaje directo a ${m.nombre}`}
                onClick={() => onOpenDm(m.id)}
              >
                Mensaje
              </button>
            )}
          </div>
        ))}
        {members.length === 0 && <div className={styles.loadingLine}>Sin coincidencias</div>}
      </div>
    </>
  );
}

export function ThreadPanel({
  detail,
  root,
  replies,
  ctx,
  onClose,
  composer,
}: {
  detail: Channel | null;
  root: Message;
  replies: Message[];
  ctx: MessageListCtx;
  onClose: () => void;
  composer: ReactNode;
}) {
  return (
    <>
      <PanelHead
        title="Hilo"
        subtitle={
          detail ? (
            <>
              {channelPrefixNode(detail.kind)}
              {detail.name}
            </>
          ) : null
        }
        onClose={onClose}
        closeLabel="Cerrar hilo"
      />
      <div className={styles.panelBody}>
        <MessageList list={[root]} ctx={ctx} compactStart />
        {replies.length > 0 && (
          <div className={styles.threadCount}>
            {replies.length} {replies.length === 1 ? "respuesta" : "respuestas"}
          </div>
        )}
        <MessageList list={replies} ctx={ctx} />
      </div>
      <div className={styles.composerWrap}>
        {detail?.readOnly ? (
          <div className={styles.superviseBanner} role="status">
            Solo lectura en supervisión
          </div>
        ) : (
          composer
        )}
      </div>
    </>
  );
}
