"use client";

import { useState, type ReactNode } from "react";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import styles from "../WorkspaceChat.module.css";
import { attachmentHref, initials } from "./chat-utils";
import type { ChannelKind, MessageReceipt, ReactionUser, ReceiptState } from "./types";

export function avatarHue(id: number) {
  return styles[`avatarHue${id % 6}` as keyof typeof styles] ?? styles.avatarHue0;
}

type AvatarSize = "lg" | "md" | "sm" | "xs";

const SIZE_CLASS: Record<AvatarSize, string | undefined> = {
  lg: undefined,
  md: styles.avatarMd,
  sm: styles.avatarSm,
  xs: styles.avatarXs,
};

/**
 * Foto de perfil cuando la API trae `avatarUrl`; si no hay o la imagen falla, iniciales sobre un
 * tinte estable por persona.
 */
export function Avatar({
  user,
  size = "lg",
  className,
}: {
  user: { id: number; nombre: string; avatarUrl?: string | null };
  size?: AvatarSize;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const cls = [styles.avatar, SIZE_CLASS[size], className].filter(Boolean).join(" ");
  if (user.avatarUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={attachmentHref(user.avatarUrl)}
        alt=""
        className={`${cls} ${styles.avatarImg}`}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <span className={`${cls} ${avatarHue(user.id)}`} aria-hidden="true">
      {initials(user.nombre)}
    </span>
  );
}

/** Avatar de un reactor: imagen si hay avatarUrl (con fallback a iniciales si falla), o iniciales. */
export function ReactorAvatar({ user }: { user: ReactionUser }) {
  const [imgError, setImgError] = useState(false);
  if (user.avatarUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={attachmentHref(user.avatarUrl)}
        alt=""
        className={styles.reactorAvatarImg}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={`${styles.avatar} ${avatarHue(user.id)}`} style={{ width: 30, height: 30, fontSize: 11, marginTop: 0 }}>
      {initials(user.nombre)}
    </div>
  );
}

function CheckMark() {
  return (
    <svg className={styles.tickSvg} width="15" height="11" viewBox="0 0 16 11" aria-hidden="true">
      <path
        fill="currentColor"
        d="M15.01 1.01a1 1 0 0 0-1.42 0L6.3 8.3 2.41 4.4A1 1 0 1 0 1 5.82l4.6 4.6a1 1 0 0 0 1.41 0l8-8a1 1 0 0 0 0-1.41z"
      />
    </svg>
  );
}

export function ReceiptTicks({
  receipt,
  pending,
  failed,
}: {
  receipt?: MessageReceipt | null;
  pending?: boolean;
  failed?: boolean;
}) {
  if (failed) return <span className={styles.receiptFailed}>No se envió</span>;
  const state: ReceiptState = pending || !receipt ? "sent" : receipt.state;
  const title =
    state === "read" ? "Visto por todos" : state === "delivered" ? "Entregado" : "Enviado";
  const double = state === "delivered" || state === "read";
  return (
    <span
      className={`${styles.ticks} ${state === "read" ? styles.ticksRead : ""}`}
      title={title}
      aria-label={title}
    >
      <CheckMark />
      {double ? (
        <span className={styles.tickSecond}>
          <CheckMark />
        </span>
      ) : null}
    </span>
  );
}

/** Prefijo visual del canal: candado para privados, "#" para públicos, null para directos. */
export function channelPrefixNode(kind: ChannelKind): ReactNode {
  if (kind === "DIRECT") return null;
  if (kind === "PRIVATE") {
    return (
      <LockOutlinedIcon
        titleAccess="Canal privado"
        sx={{ fontSize: 14, verticalAlign: "middle", display: "inline-block" }}
      />
    );
  }
  return "#";
}
