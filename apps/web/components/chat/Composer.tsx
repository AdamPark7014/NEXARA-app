"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import SentimentSatisfiedAltOutlinedIcon from "@mui/icons-material/SentimentSatisfiedAltOutlined";
import AlternateEmailIcon from "@mui/icons-material/AlternateEmail";
import SendIcon from "@mui/icons-material/Send";
import styles from "../WorkspaceChat.module.css";
import MentionTextarea, { type MentionTextareaHandle } from "./MentionTextarea";
import EmojiPicker from "./EmojiPicker";
import FormatToolbar from "./FormatToolbar";
import { accionDeAtajo, aplicarFormato, type AccionFormato } from "./formato";
import { attachmentHref, formatFileSize, isImageAttachment } from "./chat-utils";
import type { Attachment, MentionEntity } from "./types";

type Props = {
  variant: "main" | "thread";
  textareaRef: RefObject<MentionTextareaHandle>;
  value: string;
  onChange: (markup: string) => void;
  placeholder: string;
  ariaLabel: string;
  attachment: Attachment | null;
  uploading: boolean;
  onRemoveAttachment: () => void;
  onPickFile: (file: File | undefined) => void;
  onSend: () => void;
  onSticker: (emoji: string) => void;
  sendDisabled: boolean;
  sendLabel: string;
  emojiOpen: boolean;
  onToggleEmoji: () => void;
  onCloseEmoji: () => void;
  onOpenEntityPicker: (kind: MentionEntity["kind"]) => void;
  /** Teclas que consume antes el autocompletado de `@`; devuelve `true` si ya la atendió. */
  onKeyDownBefore?: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Menú flotante (sugerencias de `@`). */
  menu?: ReactNode;
  hint: string;
};

/**
 * Redactor del canal y del hilo: barra de formato, `textarea` con pastillas, adjunto y barra de
 * acciones. Enter envía, Shift+Enter hace salto de línea.
 */
export default function Composer({
  variant,
  textareaRef,
  value,
  onChange,
  placeholder,
  ariaLabel,
  attachment,
  uploading,
  onRemoveAttachment,
  onPickFile,
  onSend,
  onSticker,
  sendDisabled,
  sendLabel,
  emojiOpen,
  onToggleEmoji,
  onCloseEmoji,
  onOpenEntityPicker,
  onKeyDownBefore,
  menu,
  hint,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);

  const format = (accion: AccionFormato) => {
    const handle = textareaRef.current;
    if (!handle) return;
    const sel = handle.getSelection();
    const res = aplicarFormato(value, sel.start, sel.end, accion);
    handle.selectAfterChange(res.inicio, res.fin);
    onChange(res.markup);
    handle.focus();
  };

  return (
    <div className={`${styles.composer} ${variant === "thread" ? styles.composerThread : ""}`}>
      {menu}
      <FormatToolbar onFormat={format} />
      {(attachment || uploading) && (
        <div className={styles.attachChip}>
          {attachment ? (
            <>
              {isImageAttachment(attachment.name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachmentHref(attachment.url)} alt={attachment.name} className={styles.attachChipThumb} />
              ) : (
                <span className={styles.attachChipIcon}>
                  <AttachFileOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                </span>
              )}
              <span className={styles.attachChipName}>{attachment.name}</span>
              <span className={styles.attachChipSize}>{formatFileSize(attachment.size)}</span>
              <button
                type="button"
                className={styles.attachChipRemove}
                aria-label={`Quitar ${attachment.name}`}
                onClick={onRemoveAttachment}
              >
                ×
              </button>
            </>
          ) : (
            <span className={styles.attachChipName}>Subiendo…</span>
          )}
        </div>
      )}
      <MentionTextarea
        ref={textareaRef}
        className={styles.composerTextarea}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        rows={2}
        onChange={onChange}
        onPaste={(e) => {
          const file = Array.from(e.clipboardData?.files ?? [])[0];
          if (file) onPickFile(file);
        }}
        onKeyDown={(e) => {
          if (onKeyDownBefore?.(e)) return;
          const accion = accionDeAtajo(e);
          if (accion) {
            e.preventDefault();
            format(accion);
            return;
          }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <div className={styles.composerBar}>
        <div className={styles.composerBarLeft}>
          <button
            type="button"
            className={styles.toolBtn}
            aria-label="Adjuntar archivo"
            data-tip="Adjuntar archivo"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <AttachFileOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(e) => {
              onPickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <span className={styles.emojiAnchor}>
            <button
              ref={emojiBtnRef}
              type="button"
              className={styles.toolBtn}
              aria-label="Emojis y stickers"
              data-tip="Emojis y stickers"
              aria-haspopup="dialog"
              aria-expanded={emojiOpen}
              onClick={onToggleEmoji}
            >
              <SentimentSatisfiedAltOutlinedIcon aria-hidden="true" sx={{ fontSize: 18 }} />
            </button>
            {emojiOpen && (
              <EmojiPicker
                title={variant === "thread" ? "Emojis y stickers del hilo" : "Emojis y stickers"}
                className={styles.composerPickerPos}
                returnFocusTo={emojiBtnRef}
                onSelect={(emoji) => {
                  textareaRef.current?.insertText(emoji);
                  textareaRef.current?.focus();
                }}
                onSticker={onSticker}
                onClose={onCloseEmoji}
              />
            )}
          </span>
          <button
            type="button"
            className={styles.toolBtn}
            aria-label="Mencionar persona"
            data-tip="Mencionar persona"
            onClick={() => onOpenEntityPicker("USER")}
          >
            <AlternateEmailIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          </button>
          <span className={styles.barSep} aria-hidden="true" />
          <button
            type="button"
            className={styles.entityBtn}
            aria-label="Mencionar actividad"
            onClick={() => onOpenEntityPicker("ACTIVITY")}
          >
            <AssignmentOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
            <span>Actividad</span>
          </button>
          <button
            type="button"
            className={styles.entityBtn}
            aria-label="Mencionar evidencia"
            onClick={() => onOpenEntityPicker("EVIDENCE")}
          >
            <PhotoCameraOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
            <span>Evidencia</span>
          </button>
        </div>
        <span className={styles.composerHint}>{hint}</span>
        <button type="button" className={styles.sendBtn} disabled={sendDisabled} onClick={onSend}>
          <SendIcon aria-hidden="true" sx={{ fontSize: 15 }} />
          {sendLabel}
        </button>
      </div>
    </div>
  );
}
