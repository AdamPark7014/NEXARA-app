"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { type Socket } from "socket.io-client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import styles from "./WorkspaceChat.module.css";
import { createRealtimeSocket } from '@/lib/realtime-socket';
import { type MentionTextareaHandle } from "./chat/MentionTextarea";
import { esCeoChristian } from "@/lib/ceo-user";
import { formatApiError } from "@/lib/erp-api";
import InlineAlert from "@/components/ui/InlineAlert";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import {
  entityMentionToken,
  insertMentionToken,
  toDisplay,
  userMentionToken,
} from "@/lib/chat-mentions";
import type {
  Attachment,
  Channel,
  ChatUser,
  DeletedPayload,
  MentionEntity,
  Message,
  MessageReceipt,
  ReadPerson,
  SearchScope,
} from "./chat/types";
import {
  DRAFTS_KEY,
  FAVORITES_KEY,
  apiFetch,
  channelPrefix,
  findMessageInLists,
  formatMexicoDateTime,
  loadJson,
  mergeMessage,
  readableChatPreview,
  saveJson,
} from "./chat/chat-utils";
import { Avatar } from "./chat/ChatAtoms";
import ChatSidebar from "./chat/ChatSidebar";
import ChannelHeader, { TAB_IDS } from "./chat/ChannelHeader";
import MessageList, { type MessageListCtx } from "./chat/MessageList";
import Composer from "./chat/Composer";
import { MembersPanel, ThreadPanel } from "./chat/ChatSidePanel";
import {
  ColleaguesDialog,
  EntityPickerDialog,
  NewChannelDialog,
  ReactionsDialog,
  ReadInfoDialog,
  SwitcherDialog,
} from "./chat/ChatDialogs";

type Props = {
  token: string;
  currentUserId: number;
  currentUserName?: string;
};

export default function WorkspaceChat({
  token,
  currentUserId,
  currentUserName = "Tú",
}: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadRoot, setThreadRoot] = useState<Message | null>(null);
  const [threadReplies, setThreadReplies] = useState<Message[]>([]);
  const [threadDraft, setThreadDraft] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showDm, setShowDm] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelTopic, setNewChannelTopic] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  /** Errores del alta de canal van dentro del modal: antes salían detrás del fondo y parecía que no pasaba nada. */
  const [newChannelError, setNewChannelError] = useState<string | null>(null);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [colleagueQ, setColleagueQ] = useState("");
  const [colleagues, setColleagues] = useState<ChatUser[]>([]);
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<Message[]>([]);
  const [searchScope, setSearchScope] = useState<SearchScope>("channel");
  const [typingUsers, setTypingUsers] = useState<Record<number, { nombre: string; at: number }>>({});
  const [presence, setPresence] = useState<Record<number, "online" | "away">>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQ, setMentionQ] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherQ, setSwitcherQ] = useState("");
  const [switcherIndex, setSwitcherIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("nexara.chat.sound") !== "0";
  });
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [threadAttachment, setThreadAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [emojiPickerFor, setEmojiPickerFor] = useState<number | null>(null);
  /** Selector de emoji del compositor: `"main"` el del canal, `"thread"` el del hilo. */
  const [composerEmojiFor, setComposerEmojiFor] = useState<"main" | "thread" | null>(null);
  const [hoveredReaction, setHoveredReaction] = useState<{ messageId: number; emoji: string } | null>(null);
  const [reactionsDialog, setReactionsDialog] = useState<{ messageId: number; emoji: string } | null>(null);
  const [readInfoId, setReadInfoId] = useState<number | null>(null);
  const [readInfo, setReadInfo] = useState<{ seen: ReadPerson[]; pending: ReadPerson[] } | null>(null);
  const [readInfoLoading, setReadInfoLoading] = useState(false);
  const [readInfoError, setReadInfoError] = useState<string | null>(null);
  /** Confirmaciones de la pantalla (eliminar mensaje, salir del canal). */
  const [confirmAction, setConfirmAction] = useState<ConfirmState | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [unreadBoundary, setUnreadBoundary] = useState<{ channelId: number; before: string } | null>(null);
  const [notifyOn, setNotifyOn] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("nexara.chat.notify") === "1";
  });
  const [starredIds, setStarredIds] = useState<number[]>(() => loadJson<number[]>(FAVORITES_KEY, []));
  const [pinned, setPinned] = useState<Message[]>([]);
  const [dragOver, setDragOver] = useState(false);
  /** Pestaña «Fijados» de la cabecera; `false` es la pestaña «Mensajes». */
  const [showPins, setShowPins] = useState(false);
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  const [entityKind, setEntityKind] = useState<MentionEntity["kind"]>("ACTIVITY");
  const [entityTarget, setEntityTarget] = useState<"main" | "thread">("main");
  const [entityQ, setEntityQ] = useState("");
  const [entityResults, setEntityResults] = useState<MentionEntity[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "chat" | "panel">("list");
  const deepChannelRef = useRef<number | null>(null);
  const deepMsgRef = useRef<number | null>(null);
  const deepLinkBootstrapped = useRef(false);
  const skipAutoScrollRef = useRef(false);
  /** Mensaje al que saltar en cuanto llegue a la lista (búsqueda o fijados de un mensaje no cargado). */
  const pendingJumpRef = useRef<number | null>(null);
  const searchSeqRef = useRef(0);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<MentionTextareaHandle | null>(null);
  const threadComposerRef = useRef<MentionTextareaHandle | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const threadRootRef = useRef<Message | null>(null);
  const deletedSeenRef = useRef(new Set<number>());
  const applyDeletedRef = useRef<(payload: DeletedPayload) => void>(() => {});
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearBottomRef = useRef(true);
  const draftsRef = useRef<Record<number, string>>(loadJson<Record<number, string>>(DRAFTS_KEY, {}));
  const mutedIdsRef = useRef<Set<number>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const syncChatUrl = useCallback((channelId: number | null, msgId?: number | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (channelId != null) url.searchParams.set("channel", String(channelId));
    else url.searchParams.delete("channel");
    if (msgId != null) url.searchParams.set("msg", String(msgId));
    else url.searchParams.delete("msg");
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", next);
    }
  }, []);

  useEffect(() => {
    if (deepLinkBootstrapped.current || typeof window === "undefined") return;
    deepLinkBootstrapped.current = true;
    const sp = new URLSearchParams(window.location.search);
    const ch = Number(sp.get("channel"));
    const msg = Number(sp.get("msg"));
    if (Number.isFinite(ch) && ch > 0) deepChannelRef.current = ch;
    if (Number.isFinite(msg) && msg > 0) deepMsgRef.current = msg;
  }, []);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    threadRootRef.current = threadRoot;
  }, [threadRoot]);

  const canDeleteMessages = esCeoChristian(currentUserId);
  applyDeletedRef.current = (payload) => {
    const id = Number(payload?.id);
    if (!Number.isFinite(id) || id <= 0 || deletedSeenRef.current.has(id)) return;
    deletedSeenRef.current.add(id);
    const parentId = payload.parentId ?? null;
    const cite = (m: Message): Message =>
      m.parentId === id || m.replyTo?.id === id
        ? { ...m, replyTo: { id, deleted: true, body: "Mensaje eliminado" } }
        : m;
    const dropReply = (m: Message): Message =>
      parentId != null && m.id === parentId
        ? { ...m, replyCount: Math.max(0, (m.replyCount ?? 0) - 1) }
        : m;

    setMessages((prev) => prev.filter((m) => m.id !== id).map((m) => dropReply(cite(m))));
    setThreadReplies((prev) => prev.filter((m) => m.id !== id).map(cite));
    setPinned((prev) => prev.filter((m) => m.id !== id));
    setSearchHits((prev) => prev.filter((m) => m.id !== id).map(cite));
    setThreadRoot((prev) => {
      if (!prev) return prev;
      if (prev.id === id) {
        return {
          ...prev,
          body: "Mensaje eliminado",
          attachmentUrl: null,
          attachmentName: null,
          reactions: [],
          pinnedAt: null,
          deleted: true,
        };
      }
      return dropReply(cite(prev));
    });
    setEditingId((cur) => (cur === id ? null : cur));
    setReadInfoId((cur) => (cur === id ? null : cur));

    if (parentId != null) return;
    setChannels((prev) =>
      prev.map((c) => {
        if (c.id !== payload.channelId) return c;
        let unreadCount = c.unreadCount ?? 0;
        const created = payload.createdAt ? new Date(payload.createdAt).getTime() : 0;
        const readAt = c.lastReadAt ? new Date(c.lastReadAt).getTime() : 0;
        const wasUnread =
          payload.authorId !== currentUserId &&
          !c.supervised &&
          created > 0 &&
          payload.channelId !== activeIdRef.current &&
          (c.lastReadAt ? created > readAt : true);
        if (wasUnread) unreadCount = Math.max(0, unreadCount - 1);
        return {
          ...c,
          unreadCount,
          unread: unreadCount > 0,
          lastMessagePreview:
            payload.lastMessagePreview === undefined ? c.lastMessagePreview : payload.lastMessagePreview,
          lastMessageAt: payload.lastMessageAt === undefined ? c.lastMessageAt : payload.lastMessageAt,
        };
      }),
    );
  };

  useEffect(() => {
    localStorage.setItem("nexara.chat.sound", soundOn ? "1" : "0");
  }, [soundOn]);

  useEffect(() => {
    localStorage.setItem("nexara.chat.notify", notifyOn ? "1" : "0");
  }, [notifyOn]);

  useEffect(() => {
    saveJson(FAVORITES_KEY, starredIds);
  }, [starredIds]);

  useEffect(() => {
    mutedIdsRef.current = new Set(channels.filter((c) => c.muted).map((c) => c.id));
  }, [channels]);

  useEffect(() => {
    if (!entityPickerOpen) return;
    const timer = window.setTimeout(() => {
      setEntityLoading(true);
      const qs = new URLSearchParams({ kind: entityKind });
      if (entityQ.trim()) qs.set("q", entityQ.trim());
      void apiFetch(`chat/mentions?${qs}`, token)
        .then((data) => setEntityResults(Array.isArray(data) ? data : []))
        .catch(() => setEntityResults([]))
        .finally(() => setEntityLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [entityPickerOpen, entityKind, entityQ, token]);

  const persistDrafts = useCallback(() => {
    saveJson(DRAFTS_KEY, draftsRef.current);
  }, []);

  const toggleStar = (id: number, e?: ReactMouseEvent) => {
    e?.stopPropagation();
    setStarredIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleNotify = () => {
    if (notifyOn) {
      setNotifyOn(false);
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      setNotifyOn(true);
      return;
    }
    void Notification.requestPermission().then((perm) => {
      if (perm === "granted") setNotifyOn(true);
    });
  };

  const notify = useCallback(
    (msg: Message) => {
      if (!notifyOn || typeof window === "undefined") return;
      if (document.visibilityState === "visible") return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        const n = new Notification(`${msg.author.nombre} · NEXARA Chat`, {
          body: msg.attachmentName ? `Adjunto: ${msg.attachmentName}` : msg.body.slice(0, 140),
          tag: `nexara-chat-${msg.channelId}`,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        /* ignore */
      }
    },
    [notifyOn],
  );

  const playPing = useCallback(() => {
    if (!soundOn || typeof window === "undefined") return;
    if (document.visibilityState === "visible") return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  const playPingRef = useRef(playPing);
  const notifyRef = useRef(notify);
  useEffect(() => {
    playPingRef.current = playPing;
  }, [playPing]);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const deliveredAckRef = useRef<Set<string>>(new Set());
  const seenAckRef = useRef<Set<string>>(new Set());
  const receiptQueueRef = useRef<Map<string, { channelId: number; messageId: number; seen: boolean }>>(new Map());
  const receiptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readOnlyRef = useRef(false);
  readOnlyRef.current = Boolean(detail?.readOnly);
  const readInfoIdRef = useRef<number | null>(null);
  readInfoIdRef.current = readInfoId;

  const applyReceipts = useCallback(
    (receipts: Array<MessageReceipt & { messageId: number }> | undefined) => {
      if (!receipts?.length) return;
      const byId = new Map(receipts.map((r) => [r.messageId, r]));
      const patch = (m: Message): Message => {
        const next = byId.get(m.id);
        if (!next) return m;
        return {
          ...m,
          receipt: {
            state: next.state,
            readCount: next.readCount,
            recipientCount: next.recipientCount,
          },
        };
      };
      setMessages((prev) => prev.map(patch));
      setThreadReplies((prev) => prev.map(patch));
      setThreadRoot((prev) => (prev && byId.has(prev.id) ? patch(prev) : prev));
    },
    [],
  );

  const reloadReadInfo = useCallback(
    async (messageId: number) => {
      setReadInfoLoading(true);
      try {
        const data = await apiFetch(`chat/messages/${messageId}/reads`, token);
        if (readInfoIdRef.current !== messageId) return;
        setReadInfo({
          seen: Array.isArray(data?.seen) ? data.seen : [],
          pending: Array.isArray(data?.pending) ? data.pending : [],
        });
        setReadInfoError(null);
      } catch (e) {
        if (readInfoIdRef.current !== messageId) return;
        setReadInfoError(formatApiError(e, "No se pudo cargar quién lo vio"));
      } finally {
        if (readInfoIdRef.current === messageId) setReadInfoLoading(false);
      }
    },
    [token],
  );

  const flushReceipts = useCallback(() => {
    if (readOnlyRef.current) {
      receiptQueueRef.current.clear();
      return;
    }
    const queued = [...receiptQueueRef.current.values()];
    receiptQueueRef.current.clear();
    const byChannel = new Map<number, { delivered: number[]; seen: number[] }>();
    for (const item of queued) {
      const key = `${item.channelId}:${item.messageId}`;
      const bucket = byChannel.get(item.channelId) ?? { delivered: [], seen: [] };
      if (item.seen) {
        if (!seenAckRef.current.has(key)) bucket.seen.push(item.messageId);
      } else if (!deliveredAckRef.current.has(key) && !seenAckRef.current.has(key)) {
        bucket.delivered.push(item.messageId);
      }
      byChannel.set(item.channelId, bucket);
    }
    for (const [channelId, bucket] of byChannel) {
      const seen = [...new Set(bucket.seen)];
      const delivered = [...new Set(bucket.delivered)].filter((id) => !seen.includes(id));
      if (delivered.length) {
        for (const id of delivered) deliveredAckRef.current.add(`${channelId}:${id}`);
        void apiFetch(`chat/channels/${channelId}/delivered`, token, {
          method: "POST",
          body: JSON.stringify({ messageIds: delivered }),
        }).catch(() => {
          for (const id of delivered) deliveredAckRef.current.delete(`${channelId}:${id}`);
        });
      }
      if (seen.length && document.visibilityState === "visible") {
        for (const id of seen) seenAckRef.current.add(`${channelId}:${id}`);
        void apiFetch(`chat/channels/${channelId}/reads`, token, {
          method: "POST",
          body: JSON.stringify({ messageIds: seen }),
        }).catch(() => {
          for (const id of seen) seenAckRef.current.delete(`${channelId}:${id}`);
        });
      }
    }
  }, [token]);

  const queueReceipt = useCallback(
    (channelId: number, messageId: number, seen: boolean) => {
      if (readOnlyRef.current || !Number.isInteger(messageId) || messageId <= 0) return;
      const key = `${channelId}:${messageId}`;
      if (seen && seenAckRef.current.has(key)) return;
      if (!seen && (deliveredAckRef.current.has(key) || seenAckRef.current.has(key))) return;
      const prev = receiptQueueRef.current.get(key);
      receiptQueueRef.current.set(key, { channelId, messageId, seen: Boolean(prev?.seen || seen) });
      if (receiptTimerRef.current) clearTimeout(receiptTimerRef.current);
      receiptTimerRef.current = setTimeout(() => {
        receiptTimerRef.current = null;
        flushReceipts();
      }, 280);
    },
    [flushReceipts],
  );
  const queueReceiptRef = useRef(queueReceipt);
  const applyReceiptsRef = useRef(applyReceipts);
  const reloadReadInfoRef = useRef(reloadReadInfo);
  useEffect(() => {
    queueReceiptRef.current = queueReceipt;
    applyReceiptsRef.current = applyReceipts;
    reloadReadInfoRef.current = reloadReadInfo;
  }, [queueReceipt, applyReceipts, reloadReadInfo]);

  const openReadInfo = useCallback(
    (messageId: number) => {
      setReadInfoId(messageId);
      setReadInfo(null);
      setReadInfoError(null);
      void reloadReadInfo(messageId);
    },
    [reloadReadInfo],
  );

  const selectChannel = useCallback((id: number) => {
    if (activeId != null) {
      draftsRef.current[activeId] = draft;
      persistDrafts();
    }
    setActiveId(id);
    setDraft(draftsRef.current[id] ?? "");
    setSwitcherOpen(false);
    setSwitcherQ("");
    setThreadRoot(null);
    setShowMembers(false);
    setMobilePane("chat");
    deepMsgRef.current = null;
    syncChatUrl(id, null);
  }, [activeId, draft, persistDrafts, syncChatUrl]);

  const loadChannels = useCallback(async () => {
    if (!token) return;
    setLoadingChannels(true);
    setError(null);
    try {
      const data = await apiFetch("chat/channels", token);
      const list: Channel[] = (Array.isArray(data) ? data : []).filter(
        (c: Channel) => c.kind === "PUBLIC" || c.kind === "PRIVATE" || c.kind === "DIRECT",
      );
      setChannels(list);
      setActiveId((prev) => {
        const deep = deepChannelRef.current;
        if (deep && list.some((c) => c.id === deep)) {
          deepChannelRef.current = null;
          setMobilePane("chat");
          syncChatUrl(deep, deepMsgRef.current);
          return deep;
        }
        if (prev && list.some((c) => c.id === prev)) return prev;
        const general = list.find((c) => c.slug === "general");
        const next = general?.id ?? list[0]?.id ?? null;
        if (next) syncChatUrl(next, deepMsgRef.current);
        return next;
      });
    } catch (e) {
      setError(formatApiError(e, "No se pudo cargar el chat"));
    } finally {
      setLoadingChannels(false);
    }
  }, [token, syncChatUrl]);

  // keep draft restore when activeId set from loadChannels initial pick
  useEffect(() => {
    if (activeId == null) return;
    if (draftsRef.current[activeId] != null && draft === "") {
      setDraft(draftsRef.current[activeId]);
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMessages = useCallback(
    async (channelId: number, opts?: { beforeId?: number; aroundId?: number; append?: boolean }) => {
      if (!opts?.append) setLoadingMessages(true);
      try {
        const qs = new URLSearchParams({ limit: "60" });
        if (opts?.beforeId) qs.set("beforeId", String(opts.beforeId));
        const around =
          opts?.aroundId ??
          (!opts?.append && deepMsgRef.current != null ? deepMsgRef.current : undefined);
        if (around != null && !opts?.beforeId) qs.set("aroundId", String(around));
        const [msgs, ch] = await Promise.all([
          apiFetch(`chat/channels/${channelId}/messages?${qs}`, token),
          opts?.append ? Promise.resolve(null) : apiFetch(`chat/channels/${channelId}`, token),
        ]);
        const batch: Message[] = Array.isArray(msgs?.messages) ? msgs.messages : [];
        setHasMore(Boolean(msgs?.hasMore));
        setMessages((prev) => {
          if (!opts?.append) return batch;
          const ids = new Set(prev.map((m) => m.id));
          return [...batch.filter((m) => !ids.has(m.id)), ...prev];
        });
        if (ch) {
          setDetail(ch);
          const self = ch.members?.find((m: ChatUser & { lastReadAt?: string | null }) => m.id === currentUserId);
          setUnreadBoundary(self?.lastReadAt ? { channelId, before: self.lastReadAt } : null);
        }
        if (!opts?.append) {
          try {
            const pins = await apiFetch(`chat/channels/${channelId}/pins`, token);
            setPinned(Array.isArray(pins?.messages) ? pins.messages : []);
          } catch {
            setPinned([]);
          }
        }
        await apiFetch(`chat/channels/${channelId}/read`, token, { method: "PATCH" });
        setChannels((prev) =>
          prev.map((c) =>
            c.id === channelId
              ? { ...c, unread: false, unreadCount: 0, lastReadAt: new Date().toISOString() }
              : c,
          ),
        );
      } catch (e) {
        setError(formatApiError(e, "No se pudieron cargar los mensajes"));
      } finally {
        setLoadingMessages(false);
      }
    },
    [token, currentUserId],
  );

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (!activeId) return;
    setThreadRoot(null);
    setThreadReplies([]);
    setShowMembers(false);
    setSearchHits([]);
    setSearchQ("");
    setShowPins(false);
    setPinned([]);
    void loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    const target = deepMsgRef.current;
    if (target == null || loadingMessages || !activeId) return;
    if (!messages.some((m) => m.id === target)) {
      deepMsgRef.current = null;
      return;
    }
    deepMsgRef.current = null;
    skipAutoScrollRef.current = true;
    setHighlightId(target);
    syncChatUrl(activeId, target);
    nearBottomRef.current = false;
    requestAnimationFrame(() => {
      document.getElementById(`msg-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const t = window.setTimeout(() => setHighlightId((cur) => (cur === target ? null : cur)), 2800);
    return () => window.clearTimeout(t);
  }, [messages, loadingMessages, activeId, syncChatUrl]);

  useEffect(() => {
    if (skipAutoScrollRef.current || deepMsgRef.current != null) return;
    if (!nearBottomRef.current) {
      setShowJump(true);
      return;
    }
    scrollMessagesToBottom();
    setShowJump(false);
  }, [messages, activeId]);

  useEffect(() => {
    if (!token) return;
    const socket = createRealtimeSocket(getSocketBaseUrl(), {
      transports: ["polling", "websocket"],
      auth: { token },
    });
    socketRef.current = socket;
    socket.emit("chat:presence", { status: "online" });

    socket.on("chat:message", (msg: Message) => {
      const isMine = msg.authorId === currentUserId;
      const isMuted = mutedIdsRef.current.has(msg.channelId);
      if (!isMine && msg.id > 0) {
        queueReceiptRef.current(msg.channelId, msg.id, false);
        const looking =
          document.visibilityState === "visible" &&
          ((msg.channelId === activeIdRef.current && !msg.parentId && nearBottomRef.current) ||
            (msg.parentId != null && threadRootRef.current?.id === msg.parentId));
        if (looking) queueReceiptRef.current(msg.channelId, msg.id, true);
      }
      const mergeIncoming = (prev: Message[]) => {
        const existing = prev.find((m) => m.id === msg.id);
        if (existing) return prev.map((m) => (m.id === msg.id ? mergeMessage(m, msg) : m));
        const withoutOptimistic = prev.filter(
          (m) =>
            !(
              m.pending &&
              m.authorId === msg.authorId &&
              m.parentId === msg.parentId &&
              m.body === msg.body
            ),
        );
        return [...withoutOptimistic, msg];
      };
      if (msg.channelId === activeIdRef.current && !msg.parentId) {
        setMessages(mergeIncoming);
        void apiFetch(`chat/channels/${msg.channelId}/read`, token, { method: "PATCH" });
        setChannels((prev) =>
          prev.map((c) =>
            c.id === msg.channelId ? { ...c, lastReadAt: msg.createdAt || new Date().toISOString() } : c,
          ),
        );
        if (!isMine && !isMuted) {
          playPingRef.current();
          notifyRef.current(msg);
        }
      } else if (
        msg.channelId === activeIdRef.current &&
        threadRootRef.current &&
        msg.parentId === threadRootRef.current.id
      ) {
        setThreadReplies(mergeIncoming);
      } else {
        if (!isMine && !isMuted) {
          playPingRef.current();
          notifyRef.current(msg);
        }
        setChannels((prev) =>
          prev.map((c) =>
            c.id === msg.channelId
              ? {
                  ...c,
                  unread: true,
                  unreadCount: (c.unreadCount ?? 0) + 1,
                  lastMessageAt: msg.createdAt,
                  lastMessagePreview: msg.body,
                }
              : c,
          ),
        );
      }
    });

    socket.on("chat:message-updated", (msg: Message) => {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? mergeMessage(m, msg) : m)));
      setThreadReplies((prev) => prev.map((m) => (m.id === msg.id ? mergeMessage(m, msg) : m)));
      if (threadRootRef.current?.id === msg.id) {
        setThreadRoot((prev) => (prev ? mergeMessage(prev, msg) : msg));
      }
      setPinned((prev) => {
        const exists = prev.some((m) => m.id === msg.id);
        if (msg.pinnedAt) {
          return exists ? prev.map((m) => (m.id === msg.id ? msg : m)) : [msg, ...prev];
        }
        return prev.filter((m) => m.id !== msg.id);
      });
    });

    const onDeleted = (payload: DeletedPayload) => applyDeletedRef.current(payload);
    socket.on("chat:message-deleted", onDeleted);
    socket.on("chat:message:deleted", onDeleted);

    socket.on(
      "chat:channel-activity",
      (payload: { channelId: number; messageId?: number; authorId?: number; preview?: string; at?: string }) => {
      if (
        payload.messageId &&
        payload.authorId !== currentUserId &&
        payload.channelId !== activeIdRef.current
      ) {
        queueReceiptRef.current(payload.channelId, payload.messageId, false);
      }
      if (payload.channelId === activeIdRef.current) return;
      setChannels((prev) =>
        prev.map((c) =>
          c.id === payload.channelId
            ? {
                ...c,
                unread: true,
                unreadCount: (c.unreadCount ?? 0) + 1,
                lastMessageAt: payload.at ?? c.lastMessageAt,
                lastMessagePreview: payload.preview ?? c.lastMessagePreview,
              }
            : c,
        ),
      );
    });

    socket.on("chat:typing", (payload: { channelId: number; userId: number; nombre: string; at: number }) => {
      if (payload.channelId !== activeIdRef.current || payload.userId === currentUserId) return;
      setTypingUsers((prev) => ({ ...prev, [payload.userId]: { nombre: payload.nombre, at: payload.at } }));
    });

    socket.on("chat:presence", (payload: { userId: number; status: "online" | "away" }) => {
      setPresence((prev) => ({ ...prev, [payload.userId]: payload.status }));
    });

    socket.on("chat:channel-updated", (payload: { id: number; topic: string | null }) => {
      setDetail((prev) => (prev && prev.id === payload.id ? { ...prev, topic: payload.topic } : prev));
      setChannels((prev) => prev.map((c) => (c.id === payload.id ? { ...c, topic: payload.topic } : c)));
    });

    socket.on(
      "chat:receipt",
      (payload: { receipts?: Array<MessageReceipt & { messageId: number }> }) => {
        applyReceiptsRef.current(payload.receipts);
        const openId = readInfoIdRef.current;
        if (openId != null && payload.receipts?.some((r) => r.messageId === openId)) {
          void reloadReadInfoRef.current(openId);
        }
      },
    );

    socket.on("chat:members-changed", (payload: { channelId: number }) => {
      if (payload.channelId === activeIdRef.current) {
        void apiFetch(`chat/channels/${payload.channelId}`, token)
          .then((ch) => ch && setDetail(ch))
          .catch(() => {});
      }
      void loadChannels();
    });

    const gapFill = () => {
      const chId = activeIdRef.current;
      if (chId != null) void loadMessages(chId);
    };
    socket.on("connect", gapFill);
    socket.on("reconnect", gapFill);

    const onVis = () => {
      socket.emit("chat:presence", { status: document.visibilityState === "visible" ? "online" : "away" });
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      socket.off("connect", gapFill);
      socket.off("reconnect", gapFill);
      socket.emit("chat:presence", { status: "away" });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, currentUserId, loadChannels, loadMessages]);

  useEffect(() => {
    if (detail?.readOnly) return;
    const incoming = [...messages, ...threadReplies, ...(threadRoot ? [threadRoot] : [])].filter(
      (m) => m.authorId !== currentUserId && m.id > 0,
    );
    for (const m of incoming) queueReceipt(m.channelId, m.id, false);

    const markVisible = (entries: IntersectionObserverEntry[]) => {
      if (document.visibilityState !== "visible") return;
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.55) continue;
        const el = entry.target as HTMLElement;
        const id = Number(el.dataset.incomingMsg);
        const channelId = Number(el.dataset.channelId);
        if (id > 0 && channelId > 0) queueReceipt(channelId, id, true);
      }
    };
    const observer = new IntersectionObserver(markVisible, { threshold: [0.55, 1] });
    document.querySelectorAll<HTMLElement>("[data-incoming-msg]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [messages, threadReplies, threadRoot, currentUserId, detail?.readOnly, queueReceipt]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible" || detail?.readOnly) return;
      document.querySelectorAll<HTMLElement>("[data-incoming-msg]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.height > 0;
        if (!visible) return;
        const id = Number(el.dataset.incomingMsg);
        const channelId = Number(el.dataset.channelId);
        if (id > 0 && channelId > 0) queueReceipt(channelId, id, true);
      });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [detail?.readOnly, queueReceipt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSwitcherOpen(true);
        setSwitcherQ("");
        setSwitcherIndex(0);
      }
      if (e.key === "Escape") {
        setSwitcherOpen(false);
        setSearchOpen(false);
        setMentionOpen(false);
        setEmojiPickerFor(null);
        setComposerEmojiFor(null);
        setEntityPickerOpen(false);
        setShowNewChannel(false);
        setShowDm(false);
        setShowInvite(false);
        setReadInfoId(null);
        setThreadRoot(null);
        setShowMembers(false);
        setMobilePane((pane) => (pane === "panel" ? "chat" : pane));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (emojiPickerFor == null) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-emoji-picker]")) setEmojiPickerFor(null);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [emojiPickerFor]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeId) return;
    socket.emit("chat:join", { channelId: activeId });
    return () => {
      socket.emit("chat:leave", { channelId: activeId });
    };
  }, [activeId]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.at < 2800) next[Number(k)] = v;
        }
        return next;
      });
    }, 800);
    return () => clearInterval(id);
  }, []);

  const emitTyping = () => {
    if (!activeId || !socketRef.current) return;
    if (typingTimer.current) return;
    socketRef.current.emit("chat:typing", { channelId: activeId, nombre: currentUserName });
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
    }, 1200);
  };

  const openThread = async (msg: Message) => {
    setThreadRoot(msg);
    setShowMembers(false);
    setMobilePane("panel");
    syncChatUrl(msg.channelId, msg.id);
    try {
      const data = await apiFetch(
        `chat/channels/${msg.channelId}/messages?parentId=${msg.id}&limit=100`,
        token,
      );
      setThreadReplies(Array.isArray(data?.messages) ? data.messages : []);
    } catch {
      setThreadReplies([]);
    }
  };

  const uploadFile = async (file: File): Promise<Attachment | null> => {
    if (file.size > 20 * 1024 * 1024) {
      setError("El archivo excede el límite de 20 MB");
      return null;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(buildApiUrl("chat/upload"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      return (await res.json()) as Attachment;
    } catch (e) {
      setError(formatApiError(e, "No se pudo subir el archivo"));
      return null;
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = async (file: File | undefined, isThread: boolean) => {
    if (!file) return;
    const result = await uploadFile(file);
    if (!result) return;
    if (isThread) setThreadAttachment(result);
    else setAttachment(result);
  };

  /**
   * `bodyOverride` lo usa el sticker: manda su emoji de una vez sin pasar por el
   * borrador, así que tampoco lo vacía ni se lleva el adjunto que estuviera
   * esperando.
   */
  const send = async (parentId?: number | null, bodyOverride?: string) => {
    if (!activeId || sending) return;
    const suelto = bodyOverride != null;
    const text = (suelto ? bodyOverride : parentId ? threadDraft : draft).trim();
    const att = suelto ? null : parentId ? threadAttachment : attachment;
    if (!text && !att) return;
    const clientMsgId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Message = {
      id: -Math.floor(Math.random() * 1e9),
      clientMsgId,
      pending: true,
      channelId: activeId,
      authorId: currentUserId,
      parentId: parentId ?? null,
      kind: "TEXT",
      body: text || (att?.name ? `Archivo: ${att.name}` : ""),
      attachmentUrl: att?.url ?? null,
      attachmentName: att?.name ?? null,
      createdAt: new Date().toISOString(),
      author: { id: currentUserId, nombre: currentUserName, email: "" },
      replyCount: 0,
      reactions: [],
      receipt: { state: "sent", readCount: 0, recipientCount: 0 },
    };
    setSending(true);
    if (parentId) {
      if (!suelto) {
        setThreadDraft("");
        setThreadAttachment(null);
      }
      setThreadReplies((prev) => [...prev, optimistic]);
    } else {
      if (!suelto) {
        setDraft("");
        if (activeId != null) {
          draftsRef.current[activeId] = "";
          persistDrafts();
        }
        setAttachment(null);
      }
      setMentionOpen(false);
      setMessages((prev) => [...prev, optimistic]);
      nearBottomRef.current = true;
    }
    try {
      const msg = await apiFetch(`chat/channels/${activeId}/messages`, token, {
        method: "POST",
        body: JSON.stringify({
          body: text,
          parentId: parentId ?? null,
          attachmentUrl: att?.url ?? null,
          attachmentName: att?.name ?? null,
        }),
      });
      const replaceOptimistic = (prev: Message[]) => {
        const without = prev.filter((m) => m.clientMsgId !== clientMsgId && m.id !== msg.id);
        return [...without, msg];
      };
      if (parentId) {
        setThreadReplies(replaceOptimistic);
        setMessages((prev) =>
          prev.map((m) => (m.id === parentId ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m)),
        );
      } else {
        setMessages(replaceOptimistic);
      }
      setChannels((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                lastMessageAt: msg.createdAt,
                lastMessagePreview: msg.body,
                unread: false,
                unreadCount: 0,
              }
            : c,
        ),
      );
    } catch (e) {
      const markFailed = (prev: Message[]) =>
        prev.map((m) => (m.clientMsgId === clientMsgId ? { ...m, pending: false, failed: true } : m));
      if (parentId) setThreadReplies(markFailed);
      else setMessages(markFailed);
      setError(formatApiError(e, "No se pudo enviar el mensaje"));
    } finally {
      setSending(false);
    }
  };

  const react = async (messageId: number, emoji: string) => {
    try {
      const updated = await apiFetch(`chat/messages/${messageId}/reactions`, token, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      });
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setThreadReplies((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch {
      /* ignore */
    }
  };

  const saveEdit = async (messageId: number) => {
    try {
      const updated = await apiFetch(`chat/messages/${messageId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ body: editDraft }),
      });
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setThreadReplies((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditingId(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudo editar el mensaje"));
    }
  };

  const togglePin = async (messageId: number) => {
    try {
      const updated = await apiFetch(`chat/messages/${messageId}/pin`, token, { method: "POST" });
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setThreadReplies((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setPinned((prev) => {
        if (updated.pinnedAt) {
          const exists = prev.some((m) => m.id === updated.id);
          return exists ? prev.map((m) => (m.id === updated.id ? updated : m)) : [updated, ...prev];
        }
        return prev.filter((m) => m.id !== updated.id);
      });
    } catch (e) {
      setError(formatApiError(e, "No se pudo fijar el mensaje"));
    }
  };

  const askDelete = (message: Message) => {
    if (!canDeleteMessages || message.pending || message.id <= 0 || message.deleted) return;
    setConfirmAction({
      title: "Eliminar mensaje",
      message: "¿Eliminar este mensaje para todos? Desaparece del canal, de los fijados y de la búsqueda.",
      confirmLabel: "Eliminar",
      danger: true,
      fn: async () => {
        try {
          const removed = await apiFetch(`chat/messages/${message.id}`, token, { method: "DELETE" });
          applyDeletedRef.current(removed ?? { id: message.id, channelId: message.channelId, parentId: message.parentId, authorId: message.authorId, createdAt: message.createdAt });
        } catch (e) {
          setError(formatApiError(e, "No se pudo eliminar el mensaje"));
        }
      },
    });
  };

  const toggleChannelMute = async () => {
    if (!activeId || detail?.readOnly) return;
    const next = !detail?.muted;
    try {
      const ch = await apiFetch(`chat/channels/${activeId}/mute`, token, {
        method: "PATCH",
        body: JSON.stringify({ muted: next }),
      });
      setDetail(ch);
      setChannels((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, muted: ch.muted, mutedUntil: ch.mutedUntil } : c)),
      );
    } catch (e) {
      setError(formatApiError(e, "No se pudo silenciar el canal"));
    }
  };

  const jumpToMessage = (msg: { id: number }) => {
    setHighlightId(msg.id);
    setShowPins(false);
    setMobilePane("chat");
    if (activeId) syncChatUrl(activeId, msg.id);
    requestAnimationFrame(() => {
      document.getElementById(`msg-${msg.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    window.setTimeout(() => setHighlightId((cur) => (cur === msg.id ? null : cur)), 2800);
  };

  /**
   * Ir a un mensaje del canal abierto aunque no esté cargado: se piden los mensajes alrededor de él
   * (`aroundId`) y el salto ocurre cuando llegan.
   */
  const goToMessage = (id: number) => {
    if (messages.some((m) => m.id === id)) {
      jumpToMessage({ id });
      return;
    }
    if (!activeId) return;
    setShowPins(false);
    nearBottomRef.current = false;
    pendingJumpRef.current = id;
    void loadMessages(activeId, { aroundId: id });
  };

  useEffect(() => {
    const target = pendingJumpRef.current;
    if (target == null || loadingMessages) return;
    if (!messages.some((m) => m.id === target)) return;
    pendingJumpRef.current = null;
    jumpToMessage({ id: target });
  }, [messages, loadingMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFilesDropped = async (files: FileList | File[], isThread = false) => {
    const list = Array.from(files);
    if (!list.length) return;
    await onPickFile(list[0], isThread);
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || creatingChannel) return;
    setCreatingChannel(true);
    setNewChannelError(null);
    try {
      const topic = newChannelTopic.trim();
      const description = newChannelDescription.trim();
      const ch = await apiFetch("chat/channels", token, {
        method: "POST",
        body: JSON.stringify({
          name: newChannelName.trim(),
          kind: newChannelPrivate ? "PRIVATE" : "PUBLIC",
          ...(topic ? { topic } : {}),
          ...(description ? { description } : {}),
        }),
      });
      setShowNewChannel(false);
      setNewChannelName("");
      setNewChannelTopic("");
      setNewChannelDescription("");
      setNewChannelPrivate(false);
      await loadChannels();
      if (ch?.id) selectChannel(ch.id);
    } catch (e) {
      setNewChannelError(formatApiError(e, "No se pudo crear el canal"));
    } finally {
      setCreatingChannel(false);
    }
  };

  const searchColleagues = async (q: string) => {
    setColleagueQ(q);
    try {
      const data = await apiFetch(`chat/colleagues?q=${encodeURIComponent(q)}`, token);
      setColleagues(Array.isArray(data) ? data : []);
    } catch {
      setColleagues([]);
    }
  };

  const openEntityPicker = (
    kind: MentionEntity["kind"],
    target: "main" | "thread" = "main",
  ) => {
    setEntityKind(kind);
    setEntityTarget(target);
    setEntityQ("");
    setEntityResults([]);
    setEntityPickerOpen(true);
  };

  const insertEntityMention = (entity: MentionEntity) => {
    const token =
      entity.kind === "USER"
        ? userMentionToken(entity.label, entity.id)
        : entityMentionToken(entity.label, entity.href ?? "/");

    if (entityTarget === "thread") {
      setThreadDraft((prev) => insertMentionToken(prev, token).markup);
    } else {
      setDraft((prev) => {
        const next = insertMentionToken(prev, token).markup;
        if (activeId != null) {
          draftsRef.current[activeId] = next;
          persistDrafts();
        }
        return next;
      });
    }
    setEntityPickerOpen(false);
  };

  const openDm = async (userId: number) => {
    try {
      const ch = await apiFetch("chat/dm", token, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setShowDm(false);
      await loadChannels();
      if (ch?.id) selectChannel(ch.id);
    } catch (e) {
      setError(formatApiError(e, "No se pudo abrir la conversación"));
    }
  };

  const runSearch = async (q: string, scope: SearchScope = searchScope) => {
    setSearchQ(q);
    const seq = ++searchSeqRef.current;
    if (q.trim().length < 2) {
      setSearchHits([]);
      return;
    }
    try {
      const data = await apiFetch(
        `chat/search?q=${encodeURIComponent(q)}${scope === "channel" ? `&channelId=${activeId ?? ""}` : ""}`,
        token,
      );
      if (seq !== searchSeqRef.current) return;
      setSearchHits(Array.isArray(data?.messages) ? data.messages : []);
    } catch {
      if (seq !== searchSeqRef.current) return;
      setSearchHits([]);
    }
  };

  const changeSearchScope = (scope: SearchScope) => {
    setSearchScope(scope);
    void runSearch(searchQ, scope);
  };

  /** Resultado de búsqueda: abre su canal si es otro y salta al mensaje (al original, si es respuesta). */
  const openSearchHit = (hit: Message) => {
    setSearchOpen(false);
    const target = hit.parentId ?? hit.id;
    if (hit.channelId !== activeId) {
      selectChannel(hit.channelId);
      deepMsgRef.current = target;
      pendingJumpRef.current = target;
      nearBottomRef.current = false;
      syncChatUrl(hit.channelId, target);
      return;
    }
    goToMessage(target);
  };

  const saveTopic = async (next: string) => {
    if (!activeId) return;
    try {
      const ch = await apiFetch(`chat/channels/${activeId}/topic`, token, {
        method: "PATCH",
        body: JSON.stringify({ topic: next }),
      });
      setDetail(ch);
    } catch (e) {
      setError(formatApiError(e, "No se pudo actualizar el tema"));
    }
  };

  const addMemberToChannel = async (userId: number) => {
    if (!activeId) return;
    try {
      const ch = await apiFetch(`chat/channels/${activeId}/members`, token, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      setDetail(ch);
      setShowInvite(false);
      await loadChannels();
    } catch (e) {
      setError(formatApiError(e, "No se pudo invitar a la persona"));
    }
  };

  const leaveCurrentChannel = () => {
    if (!activeId || !detail) return;
    const channelId = activeId;
    setConfirmAction({
      title: "Salir del canal",
      message: `¿Salir de ${detail.name}?`,
      confirmLabel: "Salir",
      danger: true,
      fn: async () => {
        try {
          await apiFetch(`chat/channels/${channelId}/leave`, token, { method: "DELETE" });
          setActiveId(null);
          await loadChannels();
        } catch (e) {
          setError(formatApiError(e, "No se pudo salir del canal"));
        }
      },
    });
  };

  /** Baja solo la lista de mensajes: scrollIntoView también movía los contenedores de la página. */
  function scrollMessagesToBottom() {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  const onScrollMessages = () => {
    const el = messagesRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distance < 80;
    if (nearBottomRef.current) setShowJump(false);
  };

  const mentionCandidates = useMemo(() => {
    const pool = detail?.members?.length
      ? detail.members
      : colleagues.length
        ? colleagues
        : [];
    const q = mentionQ.toLowerCase();
    return pool
      .filter((u) => u.id !== currentUserId)
      .filter((u) => !q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 6);
  }, [detail?.members, colleagues, mentionQ, currentUserId]);

  /**
   * El borrador guarda markdown; el disparador `@` se busca sobre el texto
   * **visible**, que es lo que la persona está tecleando. Sobre el markdown, el
   * `@` de una pastilla ya puesta (`[@Adam](user:3)`) abriría el menú solo.
   */
  const onDraftChange = (value: string) => {
    setDraft(value);
    if (activeId != null) {
      draftsRef.current[activeId] = value;
      persistDrafts();
    }
    emitTyping();
    const { text, mentions } = toDisplay(value);
    const at = text.lastIndexOf("@");
    const dentroDePastilla = mentions.some((m) => at >= m.start && at < m.end);
    if (at >= 0 && !dentroDePastilla && (at === 0 || /\s/.test(text[at - 1] ?? ""))) {
      const partial = text.slice(at + 1);
      if (!/\s/.test(partial) && partial.length < 40) {
        setMentionOpen(true);
        setMentionQ(partial);
        setMentionIndex(0);
        if (!colleagues.length) void searchColleagues(partial);
        return;
      }
    }
    setMentionOpen(false);
  };

  /**
   * Completar con `@` deja una pastilla de verdad, no texto suelto.
   *
   * Antes escribía `@Nombre` a pelo, y la API solo avisa a quien viene en un
   * token `](user:ID)`: la mención se veía pero no notificaba a nadie.
   */
  const insertMention = (user: ChatUser) => {
    const next = insertMentionToken(draft, userMentionToken(user.nombre, user.id), {
      replaceTrigger: true,
    }).markup;
    setDraft(next);
    if (activeId != null) {
      draftsRef.current[activeId] = next;
      persistDrafts();
    }
    setMentionOpen(false);
  };

  /** Teclas del menú de `@`: si está abierto, flechas, Enter, Tab y Esc son suyas. */
  const onMentionKeys = (e: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!mentionOpen || !mentionCandidates.length) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionCandidates.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(mentionCandidates[mentionIndex]);
      return true;
    }
    if (e.key === "Escape") {
      setMentionOpen(false);
      return true;
    }
    return false;
  };

  const filteredChannels = useMemo(() => {
    const q = sidebarFilter.trim().toLowerCase();
    const match = (c: Channel) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.lastMessagePreview ?? "").toLowerCase().includes(q);
    const starredSet = new Set(starredIds);
    const publics = channels.filter((c) => (c.kind === "PUBLIC" || c.kind === "PRIVATE") && match(c));
    const dms = channels.filter((c) => c.kind === "DIRECT" && match(c));
    const starred = channels.filter((c) => starredSet.has(c.id) && match(c));
    return {
      starred,
      publics: publics.filter((c) => !starredSet.has(c.id)),
      dms,
    };
  }, [channels, sidebarFilter, starredIds]);

  const switcherItems = useMemo(() => {
    const q = switcherQ.trim().toLowerCase();
    const ranked = [...channels].sort((a, b) => {
      const au = a.unreadCount ?? 0;
      const bu = b.unreadCount ?? 0;
      if (au !== bu) return bu - au;
      return (b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0) -
        (a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0);
    });
    return ranked.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.slug ?? "").includes(q),
    ).slice(0, 12);
  }, [channels, switcherQ]);

  const typingLabel = useMemo(() => {
    const names = Object.values(typingUsers).map((t) => t.nombre);
    if (!names.length) return "";
    if (names.length === 1) return `${names[0]} está escribiendo`;
    if (names.length === 2) return `${names[0]} y ${names[1]} están escribiendo`;
    return "Varias personas están escribiendo";
  }, [typingUsers]);

  const totalUnread = useMemo(
    () => channels.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [channels],
  );

  const baseTitleRef = useRef<string>("");
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!baseTitleRef.current) baseTitleRef.current = document.title;
    const base = baseTitleRef.current;
    document.title = totalUnread > 0 ? `(${totalUnread > 99 ? "99+" : totalUnread}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [totalUnread]);

  const listCtx: MessageListCtx = {
    currentUserId,
    token,
    readOnly: Boolean(detail?.readOnly),
    canDeleteMessages,
    highlightId,
    editingId,
    editDraft,
    onEditDraft: setEditDraft,
    onStartEdit: (m) => {
      setEditingId(m.id);
      setEditDraft(m.body);
    },
    onSaveEdit: (id) => void saveEdit(id),
    onCancelEdit: () => setEditingId(null),
    onReact: (id, emoji) => void react(id, emoji),
    onOpenReactions: (id, emoji) => setReactionsDialog({ messageId: id, emoji }),
    hoveredReaction,
    onHoverReaction: setHoveredReaction,
    emojiPickerFor,
    onEmojiPickerFor: setEmojiPickerFor,
    onOpenThread: (m) => void openThread(m),
    onTogglePin: (id) => void togglePin(id),
    onOpenReadInfo: openReadInfo,
    onAskDelete: askDelete,
    openThreadId: threadRoot?.id ?? null,
  };

  const unreadBoundaryTs =
    unreadBoundary && unreadBoundary.channelId === activeId ? new Date(unreadBoundary.before).getTime() : null;

  const panelOpen = Boolean(threadRoot || showMembers);
  const shellClass = [
    styles.shell,
    styles.shellBleed,
    panelOpen ? styles.shellWithPanel : "",
    mobilePane === "list" ? styles.mobilePaneList : "",
    mobilePane === "chat" ? styles.mobilePaneChat : "",
    mobilePane === "panel" ? styles.mobilePanePanel : "",
  ]
    .filter(Boolean)
    .join(" ");

  const closeSidePanel = () => {
    setThreadRoot(null);
    setShowMembers(false);
    setMobilePane("chat");
    if (activeId) syncChatUrl(activeId, null);
  };

  const toggleMembersPanel = () => {
    setShowMembers((v) => {
      const next = !v;
      setMobilePane(next ? "panel" : "chat");
      return next;
    });
    setThreadRoot(null);
  };

  const openDmDialog = () => {
    setShowDm(true);
    void searchColleagues("");
  };

  const openNewChannelDialog = () => {
    setNewChannelError(null);
    setShowNewChannel(true);
  };

  const channelPlaceholder = `Mensaje a ${channelPrefix(detail?.kind ?? "PUBLIC")}${detail?.name ?? "canal"}`;

  return (
    <>
      <div className={styles.fill}>
      <div className={shellClass}>
        <ChatSidebar
          starred={filteredChannels.starred}
          publics={filteredChannels.publics}
          dms={filteredChannels.dms}
          activeId={activeId}
          loading={loadingChannels}
          presence={presence}
          starredIds={starredIds}
          totalUnread={totalUnread}
          filter={sidebarFilter}
          onFilterChange={setSidebarFilter}
          onSelect={selectChannel}
          onToggleStar={(id) => toggleStar(id)}
          onNewChannel={openNewChannelDialog}
          onNewDm={openDmDialog}
          onOpenSwitcher={() => setSwitcherOpen(true)}
        />

        <section className={styles.main} aria-label="Conversación">
          {!activeId ? (
            <div className={styles.emptyMain}>
              <div>
                <div className={styles.emptyMark}>N</div>
                <h3>Chat del equipo</h3>
                <p>Elige un canal a la izquierda o abre un mensaje directo para empezar.</p>
              </div>
            </div>
          ) : (
            <>
              <ChannelHeader
                detail={detail}
                starred={starredIds.includes(activeId)}
                onToggleStar={() => toggleStar(activeId)}
                showMembers={showMembers}
                onToggleMembers={toggleMembersPanel}
                soundOn={soundOn}
                onToggleSound={() => setSoundOn((v) => !v)}
                notifyOn={notifyOn}
                onToggleNotify={toggleNotify}
                onToggleMute={() => void toggleChannelMute()}
                canLeave={
                  detail?.kind !== "DIRECT" &&
                  detail?.slug !== "general" &&
                  detail?.slug !== "anuncios" &&
                  !detail?.readOnly
                }
                onLeave={leaveCurrentChannel}
                onSaveTopic={(topic) => void saveTopic(topic)}
                tab={showPins ? "pins" : "messages"}
                onTab={(tab) => setShowPins(tab === "pins")}
                pinnedCount={pinned.length}
                searchOpen={searchOpen}
                onSearchOpen={setSearchOpen}
                searchQ={searchQ}
                onSearch={(q) => void runSearch(q)}
                searchScope={searchScope}
                onSearchScope={changeSearchScope}
                searchHits={searchHits}
                onPickHit={openSearchHit}
                onMobileBack={() => setMobilePane("list")}
              />

              {showPins && (
                <div
                  className={styles.pinsPanel}
                  id={TAB_IDS.pins.panel}
                  role="tabpanel"
                  aria-labelledby={TAB_IDS.pins.tab}
                >
                  {pinned.length === 0 ? (
                    <div className={styles.pinsEmpty}>
                      Aún no hay mensajes fijados en este canal. Pasa el puntero sobre un mensaje y usa el alfiler para
                      fijarlo.
                    </div>
                  ) : (
                    pinned.map((p) => (
                      <button key={p.id} type="button" className={styles.pinItem} onClick={() => goToMessage(p.id)}>
                        <Avatar user={p.author} size="md" />
                        <span className={styles.pinItemText}>
                          <span className={styles.pinItemHead}>
                            <strong className={styles.pinItemAuthor}>{p.author.nombre}</strong>
                            <span className={styles.pinItemWhen}>
                              {p.pinnedAt
                                ? `Fijado el ${formatMexicoDateTime(p.pinnedAt)}`
                                : formatMexicoDateTime(p.createdAt)}
                            </span>
                          </span>
                          <span className={styles.pinItemBody}>
                            {p.attachmentName ? `Adjunto: ${p.attachmentName}` : readableChatPreview(p.body).slice(0, 160)}
                          </span>
                        </span>
                        <span className={styles.pinItemGo}>Ir al mensaje</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div
                className={styles.messages}
                ref={messagesRef}
                onScroll={onScrollMessages}
                hidden={showPins}
                id={TAB_IDS.messages.panel}
                role="tabpanel"
                aria-labelledby={TAB_IDS.messages.tab}
              >
                <div className={styles.messagesInner}>
                {hasMore && (
                  <button
                    type="button"
                    className={styles.loadOlder}
                    onClick={() => {
                      if (messages[0]) void loadMessages(activeId, { beforeId: messages[0].id, append: true });
                    }}
                  >
                    Cargar anteriores
                  </button>
                )}
                {loadingMessages && <div className={styles.loadingLine}>Cargando…</div>}
                {!loadingMessages && messages.length === 0 && (
                  <div className={styles.emptyMain}>
                    <div>
                      <div className={styles.emptyMark}>#</div>
                      <h3>Canal listo</h3>
                      <p>Escribe el primer mensaje. Enter envía, Shift+Enter nueva línea.</p>
                    </div>
                  </div>
                )}
                <MessageList list={messages} ctx={listCtx} unreadBoundaryTs={unreadBoundaryTs} />
                <div ref={bottomRef} />
                {showJump && (
                  <button
                    type="button"
                    className={styles.jumpLatest}
                    onClick={() => {
                      nearBottomRef.current = true;
                      scrollMessagesToBottom();
                      setShowJump(false);
                    }}
                  >
                    ↓ Recientes
                  </button>
                )}
                </div>
              </div>

              <div
                className={`${styles.composerWrap} ${dragOver ? styles.composerDragOver : ""}`}
                onDragEnter={(e) => {
                  if (detail?.readOnly) return;
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  if (detail?.readOnly) return;
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (detail?.readOnly) return;
                  void onFilesDropped(e.dataTransfer.files, false);
                }}
              >
                {detail?.readOnly ? (
                  <div className={styles.superviseBanner} role="status">
                    Vista de supervisión — puedes leer esta conversación, pero no publicar ni editar.
                  </div>
                ) : (
                  <>
                {dragOver && (
                  <div className={styles.dropOverlay} aria-hidden>
                    Suelta el archivo para adjuntarlo
                  </div>
                )}
                <div className={styles.typingLine} aria-live="polite">
                  {typingLabel ? (
                    <>
                      <span className={styles.typingDots}>
                        <span /><span /><span />
                      </span>
                      {typingLabel}…
                    </>
                  ) : null}
                </div>
                {error && (
                  <div style={{ marginBottom: 8 }}>
                    <InlineAlert variant="danger" dense message={error} onDismiss={() => setError(null)} />
                  </div>
                )}
                <Composer
                  variant="main"
                  textareaRef={composerRef}
                  value={draft}
                  onChange={onDraftChange}
                  placeholder={channelPlaceholder}
                  ariaLabel={channelPlaceholder}
                  attachment={attachment}
                  uploading={uploading}
                  onRemoveAttachment={() => setAttachment(null)}
                  onPickFile={(file) => void onPickFile(file, false)}
                  onSend={() => void send()}
                  onSticker={(emoji) => {
                    setComposerEmojiFor(null);
                    void send(null, emoji);
                  }}
                  sendDisabled={sending || uploading || (!draft.trim() && !attachment)}
                  sendLabel="Enviar"
                  emojiOpen={composerEmojiFor === "main"}
                  onToggleEmoji={() => setComposerEmojiFor((cur) => (cur === "main" ? null : "main"))}
                  onCloseEmoji={() => setComposerEmojiFor(null)}
                  onOpenEntityPicker={(kind) => openEntityPicker(kind)}
                  onKeyDownBefore={onMentionKeys}
                  hint="Enter envía · Shift + Enter salto de línea"
                  menu={
                    mentionOpen && mentionCandidates.length > 0 ? (
                      <div className={styles.mentionMenu} role="listbox" aria-label="Personas para mencionar">
                        {mentionCandidates.map((u, i) => (
                          <button
                            key={u.id}
                            type="button"
                            role="option"
                            aria-selected={i === mentionIndex}
                            className={`${styles.mentionItem} ${i === mentionIndex ? styles.mentionItemActive : ""}`}
                            onClick={() => insertMention(u)}
                          >
                            <Avatar user={u} size="sm" />
                            <span>
                              <strong>{u.nombre}</strong>
                              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{u.email}</div>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null
                  }
                />
                  </>
                )}
              </div>
            </>
          )}
        </section>

        {panelOpen && (
          <aside className={styles.sidePanel} aria-label={threadRoot ? "Hilo" : "Miembros"}>
            {showMembers && (
              <MembersPanel
                detail={detail}
                currentUserId={currentUserId}
                presence={presence}
                onClose={closeSidePanel}
                onInvite={() => {
                  setShowInvite(true);
                  void searchColleagues("");
                }}
                onOpenDm={(userId) => void openDm(userId)}
              />
            )}

            {threadRoot && (
              <ThreadPanel
                detail={detail}
                root={threadRoot}
                replies={threadReplies}
                ctx={listCtx}
                onClose={closeSidePanel}
                composer={
                  <Composer
                    variant="thread"
                    textareaRef={threadComposerRef}
                    value={threadDraft}
                    onChange={setThreadDraft}
                    placeholder="Responder en el hilo…"
                    ariaLabel="Responder en el hilo"
                    attachment={threadAttachment}
                    uploading={uploading}
                    onRemoveAttachment={() => setThreadAttachment(null)}
                    onPickFile={(file) => void onPickFile(file, true)}
                    onSend={() => void send(threadRoot.id)}
                    onSticker={(emoji) => {
                      setComposerEmojiFor(null);
                      void send(threadRoot.id, emoji);
                    }}
                    sendDisabled={sending || uploading || (!threadDraft.trim() && !threadAttachment)}
                    sendLabel="Responder"
                    emojiOpen={composerEmojiFor === "thread"}
                    onToggleEmoji={() => setComposerEmojiFor((cur) => (cur === "thread" ? null : "thread"))}
                    onCloseEmoji={() => setComposerEmojiFor(null)}
                    onOpenEntityPicker={(kind) => openEntityPicker(kind, "thread")}
                    hint="Respuesta al hilo"
                  />
                }
              />
            )}
          </aside>
        )}
      </div>
      </div>

      {showNewChannel && (
        <NewChannelDialog
          name={newChannelName}
          onName={(v) => {
            setNewChannelName(v);
            setNewChannelError(null);
          }}
          topic={newChannelTopic}
          onTopic={setNewChannelTopic}
          description={newChannelDescription}
          onDescription={setNewChannelDescription}
          isPrivate={newChannelPrivate}
          onPrivate={setNewChannelPrivate}
          error={newChannelError}
          creating={creatingChannel}
          onCreate={() => void createChannel()}
          onClose={() => setShowNewChannel(false)}
        />
      )}

      {showDm && (
        <ColleaguesDialog
          id="chat-modal-dm"
          title="Mensaje directo"
          query={colleagueQ}
          onQuery={(q) => void searchColleagues(q)}
          colleagues={colleagues}
          presence={presence}
          onPick={(userId) => void openDm(userId)}
          onClose={() => setShowDm(false)}
        />
      )}

      {showInvite && (
        <ColleaguesDialog
          id="chat-modal-invite"
          title={`Invitar a ${detail?.name ?? "el canal"}`}
          query={colleagueQ}
          onQuery={(q) => void searchColleagues(q)}
          colleagues={colleagues.filter((u) => !(detail?.members ?? []).some((m) => m.id === u.id))}
          presence={presence}
          onPick={(userId) => void addMemberToChannel(userId)}
          onClose={() => setShowInvite(false)}
        />
      )}

      {entityPickerOpen && (
        <EntityPickerDialog
          kind={entityKind}
          onKind={(kind) => {
            setEntityKind(kind);
            setEntityQ("");
            setEntityResults([]);
          }}
          query={entityQ}
          onQuery={setEntityQ}
          results={entityResults}
          loading={entityLoading}
          onPick={insertEntityMention}
          onClose={() => setEntityPickerOpen(false)}
        />
      )}

      {switcherOpen && (
        <SwitcherDialog
          query={switcherQ}
          onQuery={(q) => {
            setSwitcherQ(q);
            setSwitcherIndex(0);
          }}
          items={switcherItems}
          index={switcherIndex}
          onIndex={setSwitcherIndex}
          onPick={selectChannel}
          onClose={() => setSwitcherOpen(false)}
        />
      )}

      {readInfoId != null && (
        <ReadInfoDialog
          loading={readInfoLoading}
          error={readInfoError}
          info={readInfo}
          onClose={() => setReadInfoId(null)}
        />
      )}

      {reactionsDialog && (
        <ReactionsDialog
          target={findMessageInLists(reactionsDialog.messageId, [messages, threadRoot, threadReplies])}
          emoji={reactionsDialog.emoji}
          onEmoji={(emoji) => setReactionsDialog({ messageId: reactionsDialog.messageId, emoji })}
          onClose={() => setReactionsDialog(null)}
        />
      )}
      <ConfirmDialog state={confirmAction} onClose={() => setConfirmAction(null)} />
    </>
  );
}
