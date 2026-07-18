"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { buildApiUrl, getApiAssetOrigin, getSocketBaseUrl } from "@/lib/api-base";
import styles from "./WorkspaceChat.module.css";

type Attachment = { url: string; name: string; mime: string; size: number };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

function isImageAttachment(name: string) {
  return IMAGE_EXT.test(name);
}

function attachmentHref(url: string) {
  return `${getApiAssetOrigin()}${url}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EMOJI_PICKER_LIST = [
  "👍", "👎", "❤️", "🔥", "🎉", "😀", "😂", "😅", "😮", "😢",
  "😡", "🙏", "👏", "🙌", "💯", "✅", "❌", "👀", "🚀", "🤔",
  "😍", "🥳", "😴", "🤝", "💡", "⚠️", "📌", "⭐", "🎯", "☕",
];

type ChannelKind = "PUBLIC" | "PRIVATE" | "DIRECT";

type ChatUser = { id: number; nombre: string; email: string };

type Channel = {
  id: number;
  kind: ChannelKind;
  slug: string | null;
  name: string;
  topic?: string | null;
  description?: string | null;
  peer?: ChatUser | null;
  members?: Array<ChatUser & { role?: string; lastReadAt?: string | null }>;
  memberCount: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  unread?: boolean;
  unreadCount?: number;
  muted?: boolean;
  mutedUntil?: string | null;
  /** Vista por jerarquía (dueño / supervisor), no membresía propia */
  supervised?: boolean;
  readOnly?: boolean;
};

type Reaction = { emoji: string; count: number; userIds: number[] };

type MentionEntity = {
  kind: "USER" | "ACTIVITY" | "EVIDENCE";
  id: number;
  label: string;
  subtitle: string;
  href?: string;
};

type Message = {
  id: number;
  channelId: number;
  authorId: number;
  parentId: number | null;
  kind: string;
  body: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  pinnedAt?: string | null;
  editedAt?: string | null;
  createdAt: string;
  author: ChatUser;
  replyCount: number;
  reactions: Reaction[];
  channel?: { id: number; name: string; kind: ChannelKind; slug: string | null };
  /** Optimistic client id until server ack */
  clientMsgId?: string;
  pending?: boolean;
  failed?: boolean;
};

const FAVORITES_KEY = "nexara.chat.favorites";
const DRAFTS_KEY = "nexara.chat.drafts";

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

async function apiFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  if (res.status === 204) return null;
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function avatarHue(id: number) {
  return styles[`avatarHue${id % 6}` as keyof typeof styles] ?? styles.avatarHue0;
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Hoy";
  if (dayKey(iso) === dayKey(yest.toISOString())) return "Ayer";
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

function channelPrefix(kind: ChannelKind) {
  if (kind === "DIRECT") return "";
  if (kind === "PRIVATE") return "🔒";
  return "#";
}

function renderRichText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\[[^\]\n]+\]\((?:\/[^)\s]*|user:\d+)\)|`[^`]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_|https?:\/\/[^\s]+|@[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9._-]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const entityLink = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (entityLink) {
      const [, label, href] = entityLink;
      if (href.startsWith("user:")) {
        nodes.push(
          <span key={key++} className={styles.mention}>
            {label}
          </span>,
        );
      } else {
        nodes.push(
          <a key={key++} href={href} className={`${styles.mention} ${styles.entityMention}`}>
            {label}
          </a>,
        );
      }
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<strong key={key++}>{token.slice(1, -1)}</strong>);
    } else if (token.startsWith("_") && token.endsWith("_")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("http")) {
      nodes.push(
        <a key={key++} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>,
      );
    } else {
      nodes.push(
        <span key={key++} className={styles.mention}>
          {token}
        </span>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

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
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [colleagueQ, setColleagueQ] = useState("");
  const [colleagues, setColleagues] = useState<ChatUser[]>([]);
  const [sidebarFilter, setSidebarFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<Message[]>([]);
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
  const [showInvite, setShowInvite] = useState(false);
  const [unreadBoundary, setUnreadBoundary] = useState<{ channelId: number; before: string } | null>(null);
  const [notifyOn, setNotifyOn] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("nexara.chat.notify") === "1";
  });
  const [starredIds, setStarredIds] = useState<number[]>(() => loadJson<number[]>(FAVORITES_KEY, []));
  const [pinned, setPinned] = useState<Message[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);
  const [entityKind, setEntityKind] = useState<MentionEntity["kind"]>("ACTIVITY");
  const [entityTarget, setEntityTarget] = useState<"main" | "thread">("main");
  const [entityQ, setEntityQ] = useState("");
  const [entityResults, setEntityResults] = useState<MentionEntity[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const threadFileInputRef = useRef<HTMLInputElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const threadRootRef = useRef<Message | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearBottomRef = useRef(true);
  const draftsRef = useRef<Record<number, string>>(loadJson<Record<number, string>>(DRAFTS_KEY, {}));
  const mutedIdsRef = useRef<Set<number>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    threadRootRef.current = threadRoot;
  }, [threadRoot]);

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
          body: msg.attachmentName ? `📎 ${msg.attachmentName}` : msg.body.slice(0, 140),
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

  const selectChannel = useCallback((id: number) => {
    if (activeId != null) {
      draftsRef.current[activeId] = draft;
      persistDrafts();
    }
    setActiveId(id);
    setDraft(draftsRef.current[id] ?? "");
    setSwitcherOpen(false);
    setSwitcherQ("");
  }, [activeId, draft, persistDrafts]);

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
        if (prev && list.some((c) => c.id === prev)) return prev;
        const general = list.find((c) => c.slug === "general");
        return general?.id ?? list[0]?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el chat");
    } finally {
      setLoadingChannels(false);
    }
  }, [token]);

  // keep draft restore when activeId set from loadChannels initial pick
  useEffect(() => {
    if (activeId == null) return;
    if (draftsRef.current[activeId] != null && draft === "") {
      setDraft(draftsRef.current[activeId]);
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMessages = useCallback(
    async (channelId: number, opts?: { beforeId?: number; append?: boolean }) => {
      if (!opts?.append) setLoadingMessages(true);
      try {
        const qs = new URLSearchParams({ limit: "60" });
        if (opts?.beforeId) qs.set("beforeId", String(opts.beforeId));
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
          prev.map((c) => (c.id === channelId ? { ...c, unread: false, unreadCount: 0 } : c)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron cargar mensajes");
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
    if (!nearBottomRef.current) {
      setShowJump(true);
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowJump(false);
  }, [messages, activeId]);

  useEffect(() => {
    if (!token) return;
    const socket = io(getSocketBaseUrl(), {
      transports: ["polling", "websocket"],
      auth: { token },
    });
    socketRef.current = socket;
    socket.emit("chat:presence", { status: "online" });

    socket.on("chat:message", (msg: Message) => {
      const isMine = msg.authorId === currentUserId;
      const isMuted = mutedIdsRef.current.has(msg.channelId);
      const mergeIncoming = (prev: Message[]) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
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
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      setThreadReplies((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      if (threadRootRef.current?.id === msg.id) setThreadRoot(msg);
      setPinned((prev) => {
        const exists = prev.some((m) => m.id === msg.id);
        if (msg.pinnedAt) {
          return exists ? prev.map((m) => (m.id === msg.id ? msg : m)) : [msg, ...prev];
        }
        return prev.filter((m) => m.id !== msg.id);
      });
    });

    socket.on("chat:message-deleted", (payload: { id: number; channelId: number; parentId: number | null }) => {
      if (payload.parentId) {
        setThreadReplies((prev) => prev.filter((m) => m.id !== payload.id));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== payload.id));
      }
      setPinned((prev) => prev.filter((m) => m.id !== payload.id));
    });

    socket.on("chat:channel-activity", (payload: { channelId: number; preview?: string; at?: string }) => {
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
        setEntityPickerOpen(false);
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
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo");
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

  const send = async (parentId?: number | null) => {
    if (!activeId || sending) return;
    const text = (parentId ? threadDraft : draft).trim();
    const att = parentId ? threadAttachment : attachment;
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
    };
    setSending(true);
    if (parentId) {
      setThreadDraft("");
      setThreadAttachment(null);
      setThreadReplies((prev) => [...prev, optimistic]);
    } else {
      setDraft("");
      if (activeId != null) {
        draftsRef.current[activeId] = "";
        persistDrafts();
      }
      setAttachment(null);
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
      setError(e instanceof Error ? e.message : "No se pudo enviar");
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
      setError(e instanceof Error ? e.message : "No se pudo editar");
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
      setError(e instanceof Error ? e.message : "No se pudo fijar el mensaje");
    }
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
      setError(e instanceof Error ? e.message : "No se pudo silenciar el canal");
    }
  };

  const jumpToMessage = (msg: Message) => {
    setHighlightId(msg.id);
    setShowPins(false);
    requestAnimationFrame(() => {
      document.getElementById(`msg-${msg.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const onFilesDropped = async (files: FileList | File[], isThread = false) => {
    const list = Array.from(files);
    if (!list.length) return;
    await onPickFile(list[0], isThread);
  };

  const createChannel = async () => {
    if (!newChannelName.trim()) return;
    try {
      const ch = await apiFetch("chat/channels", token, {
        method: "POST",
        body: JSON.stringify({
          name: newChannelName.trim(),
          kind: newChannelPrivate ? "PRIVATE" : "PUBLIC",
        }),
      });
      setShowNewChannel(false);
      setNewChannelName("");
      setNewChannelPrivate(false);
      await loadChannels();
      if (ch?.id) setActiveId(ch.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el canal");
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
    const cleanLabel = entity.label.replace(/[\[\]\(\)]/g, "").trim();
    const token =
      entity.kind === "USER"
        ? `[@${cleanLabel}](user:${entity.id})`
        : `[${entity.kind === "ACTIVITY" ? "📋" : "📷"} ${cleanLabel}](${entity.href ?? "/"})`;

    if (entityTarget === "thread") {
      setThreadDraft((prev) => `${prev}${prev && !/\s$/.test(prev) ? " " : ""}${token} `);
    } else {
      setDraft((prev) => {
        const next = `${prev}${prev && !/\s$/.test(prev) ? " " : ""}${token} `;
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
      if (ch?.id) setActiveId(ch.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el DM");
    }
  };

  const runSearch = async (q: string) => {
    setSearchQ(q);
    if (q.trim().length < 2) {
      setSearchHits([]);
      return;
    }
    try {
      const data = await apiFetch(
        `chat/search?q=${encodeURIComponent(q)}&channelId=${activeId ?? ""}`,
        token,
      );
      setSearchHits(Array.isArray(data?.messages) ? data.messages : []);
    } catch {
      setSearchHits([]);
    }
  };

  const editTopic = async () => {
    if (!activeId) return;
    const next = window.prompt("Tema del canal", detail?.topic ?? "");
    if (next === null) return;
    try {
      const ch = await apiFetch(`chat/channels/${activeId}/topic`, token, {
        method: "PATCH",
        body: JSON.stringify({ topic: next }),
      });
      setDetail(ch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el tema");
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
      setError(e instanceof Error ? e.message : "No se pudo invitar al usuario");
    }
  };

  const leaveCurrentChannel = async () => {
    if (!activeId || !detail) return;
    if (!window.confirm(`¿Salir de ${detail.name}?`)) return;
    try {
      await apiFetch(`chat/channels/${activeId}/leave`, token, { method: "DELETE" });
      setActiveId(null);
      await loadChannels();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo salir del canal");
    }
  };

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

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (activeId != null) {
      draftsRef.current[activeId] = value;
      persistDrafts();
    }
    emitTyping();
    const at = value.lastIndexOf("@");
    if (at >= 0 && (at === 0 || /\s/.test(value[at - 1] ?? ""))) {
      const partial = value.slice(at + 1);
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

  const insertMention = (user: ChatUser) => {
    const at = draft.lastIndexOf("@");
    const next = `${draft.slice(0, at)}@${user.nombre.split(" ")[0]} `;
    setDraft(next);
    if (activeId != null) {
      draftsRef.current[activeId] = next;
      persistDrafts();
    }
    setMentionOpen(false);
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

  const renderMessageList = (
    list: Message[],
    opts?: { compactStart?: boolean; showUnreadDivider?: boolean },
  ) => {
    let lastAuthor: number | null = null;
    let lastDay: string | null = null;
    let lastTs = 0;
    let dividerShown = false;
    const boundaryTs =
      opts?.showUnreadDivider && unreadBoundary && unreadBoundary.channelId === activeId
        ? new Date(unreadBoundary.before).getTime()
        : null;
    return list.map((m) => {
      const dk = dayKey(m.createdAt);
      const showDay = dk !== lastDay;
      lastDay = dk;
      const ts = new Date(m.createdAt).getTime();
      const showUnreadDivider =
        boundaryTs != null && !dividerShown && ts > boundaryTs && m.authorId !== currentUserId;
      if (showUnreadDivider) dividerShown = true;
      const compact =
        !showDay &&
        lastAuthor === m.authorId &&
        ts - lastTs < 5 * 60 * 1000 &&
        !opts?.compactStart;
      lastAuthor = m.authorId;
      lastTs = ts;
      const mine = m.authorId === currentUserId;
      const canEdit = mine && Date.now() - ts <= 60 * 60 * 1000;
      const mineReaction = (emoji: string) =>
        m.reactions.some((r) => r.emoji === emoji && r.userIds.includes(currentUserId));

      return (
        <div key={m.id}>
          {showDay && <div className={styles.dayDivider}>{dayLabel(m.createdAt)}</div>}
          {showUnreadDivider && (
            <div className={styles.newDivider}>
              <span>Mensajes nuevos</span>
            </div>
          )}
          <div
            className={`${styles.msg} ${compact ? styles.msgCompact : ""} ${
              highlightId === m.id ? styles.msgHighlight : ""
            } ${mine ? styles.msgMine : ""}`}
            id={`msg-${m.id}`}
          >
            {compact ? (
              <>
                <span className={styles.msgTimeHover}>{formatClock(m.createdAt)}</span>
                <div className={styles.avatarSpacer} />
              </>
            ) : (
              <div className={`${styles.avatar} ${avatarHue(m.authorId)}`}>{initials(m.author.nombre)}</div>
            )}
            <div>
              {!compact && (
                <div className={styles.msgMeta}>
                  <span className={styles.msgAuthor}>{m.author.nombre}</span>
                  <span className={styles.msgTime} style={{ opacity: 1 }}>
                    {formatClock(m.createdAt)}
                  </span>
                  {m.pinnedAt && <span className={styles.pinnedBadge} title="Fijado">📌</span>}
                  {m.editedAt && <span className={styles.edited}>(editado)</span>}
                </div>
              )}

              {editingId === m.id ? (
                <div className={styles.editBox}>
                  <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} />
                  <div className={styles.editActions}>
                    <button type="button" className={styles.sendBtn} onClick={() => void saveEdit(m.id)}>
                      Guardar
                    </button>
                    <button type="button" className={styles.actionBtn} onClick={() => setEditingId(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                m.body && m.body !== `Archivo: ${m.attachmentName}` && (
                  <div className={styles.msgBody}>{renderRichText(m.body)}</div>
                )
              )}

              {m.attachmentUrl && editingId !== m.id && (
                isImageAttachment(m.attachmentName ?? "") ? (
                  <a
                    href={attachmentHref(m.attachmentUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.msgAttachmentImageLink}
                  >
                    <img
                      src={attachmentHref(m.attachmentUrl)}
                      alt={m.attachmentName ?? "Adjunto"}
                      className={styles.msgAttachmentImage}
                    />
                  </a>
                ) : (
                  <a
                    href={attachmentHref(m.attachmentUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.msgAttachmentFile}
                  >
                    <span className={styles.attachChipIcon}>📄</span>
                    <span className={styles.attachChipName}>{m.attachmentName ?? "Archivo"}</span>
                    <span className={styles.msgAttachmentDownload}>Descargar</span>
                  </a>
                )
              )}

              {m.reactions?.length > 0 && (
                <div className={styles.reactions}>
                  {m.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`${styles.reaction} ${mineReaction(r.emoji) ? styles.reactionMine : ""}`}
                      onClick={() => {
                        if (detail?.readOnly) return;
                        void react(m.id, r.emoji);
                      }}
                      disabled={detail?.readOnly}
                      style={detail?.readOnly ? { cursor: "default" } : undefined}
                    >
                      <span>{r.emoji}</span>
                      <span>{r.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {!detail?.readOnly && (
              <div className={styles.msgActions} data-emoji-picker>
                <button type="button" className={styles.actionBtn} onClick={() => void react(m.id, "👍")}>
                  👍
                </button>
                <button type="button" className={styles.actionBtn} onClick={() => void react(m.id, "✅")}>
                  ✅
                </button>
                <button type="button" className={styles.actionBtn} onClick={() => void react(m.id, "👀")}>
                  👀
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  title="Más emojis"
                  onClick={() => setEmojiPickerFor((cur) => (cur === m.id ? null : m.id))}
                >
                  +
                </button>
                {emojiPickerFor === m.id && (
                  <div className={styles.emojiPicker} data-emoji-picker>
                    {EMOJI_PICKER_LIST.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className={styles.emojiPickerItem}
                        onClick={() => {
                          void react(m.id, e);
                          setEmojiPickerFor(null);
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
                {!m.parentId && (
                  <button type="button" className={styles.actionBtn} onClick={() => void openThread(m)}>
                    Responder
                  </button>
                )}
                <button
                  type="button"
                  className={styles.actionBtn}
                  title={m.pinnedAt ? "Quitar pin" : "Fijar mensaje"}
                  onClick={() => void togglePin(m.id)}
                >
                  {m.pinnedAt ? "📌" : "Pin"}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    title="Disponible durante 1 hora después de enviar"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditDraft(m.body);
                    }}
                  >
                    Editar
                  </button>
                )}
              </div>
              )}

              {!m.parentId && m.replyCount > 0 && (
                <button type="button" className={styles.threadHint} onClick={() => void openThread(m)}>
                  <span>{m.replyCount}</span>
                  <span>{m.replyCount === 1 ? "respuesta" : "respuestas"} · Ver hilo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    });
  };

  const panelOpen = Boolean(threadRoot || showMembers);
  const shellClass = [
    styles.shell,
    styles.shellBleed,
    panelOpen ? styles.shellWithPanel : "",
  ]
    .filter(Boolean)
    .join(" ");

  const channelRow = (c: Channel) => (
    <button
      key={c.id}
      type="button"
      className={`${styles.channelBtn} ${activeId === c.id ? styles.channelBtnActive : ""} ${
        c.unread && activeId !== c.id ? styles.channelBtnUnread : ""
      }`}
      onClick={() => selectChannel(c.id)}
      title={c.lastMessagePreview ?? c.topic ?? c.name}
    >
      {c.kind === "DIRECT" ? (
        <span className={styles.presenceWrap}>
          <span className={`${styles.avatar} ${styles.avatarSm} ${avatarHue(c.peer?.id ?? c.id)}`}>
            {initials(c.name)}
          </span>
          <span
            className={`${styles.presenceDot} ${
              c.peer && presence[c.peer.id] === "online" ? styles.presenceOnline : ""
            }`}
          />
        </span>
      ) : (
        <span className={styles.channelPrefix}>{channelPrefix(c.kind)}</span>
      )}
      <span className={styles.channelLabel}>
        {c.name}
        {c.muted ? <span className={styles.muteTag} title="Silenciado">🔇</span> : null}
        {c.supervised ? <span className={styles.superviseTag}>Sup</span> : null}
      </span>
      <span className={styles.channelMeta}>
        <span
          role="button"
          tabIndex={0}
          className={`${styles.starBtn} ${starredIds.includes(c.id) ? styles.starBtnOn : ""}`}
          title={starredIds.includes(c.id) ? "Quitar de favoritos" : "Añadir a favoritos"}
          onClick={(e) => toggleStar(c.id, e)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleStar(c.id);
            }
          }}
        >
          {starredIds.includes(c.id) ? "★" : "☆"}
        </span>
        {(c.unreadCount ?? 0) > 0 && activeId !== c.id && (
          <span className={styles.unreadBadge}>{c.unreadCount! > 99 ? "99+" : c.unreadCount}</span>
        )}
      </span>
      {c.lastMessagePreview && activeId !== c.id && (
        <span className={styles.previewLine}>{c.lastMessagePreview}</span>
      )}
    </button>
  );

  return (
    <>
      <div className={styles.fill}>
      <div className={shellClass}>
        <aside className={styles.sidebar}>
          <div className={styles.workspaceHead}>
            <div className={styles.workspaceName}>
              <span className={styles.liveDot} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                NEXARA
              </span>
              {totalUnread > 0 && (
                <span className={styles.unreadBadge}>{totalUnread > 99 ? "99+" : totalUnread}</span>
              )}
            </div>
            <div className={styles.headActions}>
              <button
                type="button"
                className={styles.headIcon}
                title="Buscar canal (Ctrl+K)"
                onClick={() => setSwitcherOpen(true)}
              >
                Buscar
              </button>
              <button
                type="button"
                className={styles.headIcon}
                title="Nuevo mensaje"
                onClick={() => {
                  setShowDm(true);
                  void searchColleagues("");
                }}
              >
                DM
              </button>
            </div>
          </div>

          <div className={styles.sidebarSearch}>
            <input
              placeholder="Filtrar canales…"
              value={sidebarFilter}
              onChange={(e) => setSidebarFilter(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                  e.preventDefault();
                  setSwitcherOpen(true);
                }
              }}
            />
            <span className={styles.kbd}>Ctrl+K</span>
          </div>

          <div className={styles.sidebarScroll}>
            {filteredChannels.starred.length > 0 && (
              <>
                <div className={styles.sectionLabel}>
                  <span>Favoritos</span>
                </div>
                {filteredChannels.starred.map(channelRow)}
              </>
            )}
            <div className={styles.sectionLabel}>
              <span>Canales</span>
              <button type="button" className={styles.sectionAction} title="Nuevo canal" onClick={() => setShowNewChannel(true)}>
                +
              </button>
            </div>
            {loadingChannels && <div className={styles.loadingLine}>Cargando…</div>}
            {filteredChannels.publics.map(channelRow)}

            <div className={styles.sectionLabel}>
              <span>Mensajes directos</span>
              <button
                type="button"
                className={styles.sectionAction}
                title="Nuevo mensaje"
                onClick={() => {
                  setShowDm(true);
                  void searchColleagues("");
                }}
              >
                +
              </button>
            </div>
            {filteredChannels.dms.map(channelRow)}
          </div>
        </aside>

        <section className={styles.main}>
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
              <header className={styles.channelHeader}>
                <div className={styles.channelTitleBlock}>
                  <div className={styles.channelTitle}>
                    <span>{channelPrefix(detail?.kind ?? "PUBLIC")}</span>
                    <span>{detail?.name ?? "…"}</span>
                    {detail?.supervised ? (
                      <span className={styles.supervisePill} title="Vista de supervisión (solo lectura)">
                        Supervisión
                      </span>
                    ) : null}
                  </div>
                  <div
                    className={styles.channelTopic}
                    onClick={() => {
                      if (detail?.readOnly) return;
                      void editTopic();
                    }}
                    title={detail?.readOnly ? "Solo lectura" : "Editar tema"}
                    style={detail?.readOnly ? { cursor: "default" } : undefined}
                  >
                    {detail?.topic || (detail?.readOnly ? "Sin tema" : "Añadir tema…")}
                  </div>
                  {detail?.description ? (
                    <div className={styles.channelDescription}>{detail.description}</div>
                  ) : null}
                </div>
                <div className={styles.headerMeta}>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${soundOn ? styles.iconBtnActive : ""}`}
                    title={soundOn ? "Sonido activado" : "Sonido desactivado"}
                    onClick={() => setSoundOn((v) => !v)}
                  >
                    {soundOn ? "Sonido" : "Sin sonido"}
                  </button>
                  {!detail?.readOnly && (
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${detail?.muted ? styles.iconBtnActive : ""}`}
                      title={detail?.muted ? "Reactivar notificaciones del canal" : "Silenciar canal"}
                      onClick={() => void toggleChannelMute()}
                    >
                      {detail?.muted ? "🔇" : "Silenciar"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${notifyOn ? styles.iconBtnActive : ""}`}
                    title={notifyOn ? "Notificaciones activadas" : "Activar notificaciones del navegador"}
                    onClick={toggleNotify}
                  >
                    {notifyOn ? "🔔" : "🔕"}
                  </button>
                  {pinned.length > 0 && (
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${showPins ? styles.iconBtnActive : ""}`}
                      title="Mensajes fijados"
                      onClick={() => setShowPins((v) => !v)}
                    >
                      📌 {pinned.length}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${searchOpen ? styles.iconBtnActive : ""}`}
                    title="Buscar en canal"
                    onClick={() => setSearchOpen((v) => !v)}
                  >
                    Buscar
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${showMembers ? styles.iconBtnActive : ""}`}
                    title="Miembros"
                    onClick={() => {
                      setShowMembers((v) => !v);
                      setThreadRoot(null);
                    }}
                  >
                    Miembros
                  </button>
                  {typeof detail?.memberCount === "number" && (
                    <span className={styles.pill}>{detail.memberCount}</span>
                  )}
                  {detail?.kind !== "DIRECT" &&
                    detail?.slug !== "general" &&
                    detail?.slug !== "anuncios" &&
                    !detail?.readOnly && (
                      <button
                        type="button"
                        className={styles.iconBtn}
                        title="Salir del canal"
                        onClick={() => void leaveCurrentChannel()}
                      >
                        Salir
                      </button>
                    )}
                </div>
              </header>

              {showPins && pinned.length > 0 && (
                <div className={styles.pinsBar}>
                  <div className={styles.pinsBarHead}>
                    <strong>Fijados</strong>
                    <button type="button" className={styles.actionBtn} onClick={() => setShowPins(false)}>
                      Cerrar
                    </button>
                  </div>
                  {pinned.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={styles.pinItem}
                      onClick={() => jumpToMessage(p)}
                    >
                      <span className={styles.pinItemAuthor}>{p.author.nombre}</span>
                      <span className={styles.pinItemBody}>
                        {p.attachmentName ? `📎 ${p.attachmentName}` : p.body.slice(0, 120)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searchOpen && (
                <>
                  <div className={styles.searchBar}>
                    <input
                      autoFocus
                      placeholder="Buscar mensajes en este canal…"
                      value={searchQ}
                      onChange={(e) => void runSearch(e.target.value)}
                    />
                    <button type="button" className={styles.actionBtn} onClick={() => { setSearchOpen(false); setSearchHits([]); }}>
                      Cerrar
                    </button>
                  </div>
                  {searchHits.length > 0 && (
                    <div className={styles.searchHits}>
                      {searchHits.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          className={styles.searchHit}
                          onClick={() => {
                            setHighlightId(h.id);
                            setSearchOpen(false);
                            requestAnimationFrame(() => {
                              document.getElementById(`msg-${h.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                            });
                          }}
                        >
                          <div className={styles.searchHitMeta}>
                            {h.author.nombre} · {formatClock(h.createdAt)}
                          </div>
                          <div className={styles.searchHitBody}>{h.body}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className={styles.messages} ref={messagesRef} onScroll={onScrollMessages}>
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
                {renderMessageList(messages, { showUnreadDivider: true })}
                <div ref={bottomRef} />
                {showJump && (
                  <button
                    type="button"
                    className={styles.jumpLatest}
                    onClick={() => {
                      nearBottomRef.current = true;
                      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
                <div className={styles.typingLine}>
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
                  <div role="alert" style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>
                    {error}
                  </div>
                )}
                <div className={styles.composer}>
                  {mentionOpen && mentionCandidates.length > 0 && (
                    <div className={styles.mentionMenu}>
                      {mentionCandidates.map((u, i) => (
                        <button
                          key={u.id}
                          type="button"
                          className={`${styles.mentionItem} ${i === mentionIndex ? styles.mentionItemActive : ""}`}
                          onClick={() => insertMention(u)}
                        >
                          <span className={`${styles.avatar} ${avatarHue(u.id)}`} style={{ width: 26, height: 26, fontSize: 10, marginTop: 0 }}>
                            {initials(u.nombre)}
                          </span>
                          <span>
                            <strong>{u.nombre}</strong>
                            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{u.email}</div>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {(attachment || uploading) && (
                    <div className={styles.attachChip}>
                      {uploading && !attachment ? (
                        <span className={styles.attachChipName}>Subiendo…</span>
                      ) : attachment ? (
                        <>
                          {isImageAttachment(attachment.name) ? (
                            <img
                              src={attachmentHref(attachment.url)}
                              alt={attachment.name}
                              className={styles.attachChipThumb}
                            />
                          ) : (
                            <span className={styles.attachChipIcon}>📎</span>
                          )}
                          <span className={styles.attachChipName}>{attachment.name}</span>
                          <span className={styles.attachChipSize}>{formatFileSize(attachment.size)}</span>
                          <button
                            type="button"
                            className={styles.attachChipRemove}
                            onClick={() => setAttachment(null)}
                          >
                            ×
                          </button>
                        </>
                      ) : null}
                    </div>
                  )}
                  <textarea
                    className={styles.composerTextarea}
                    placeholder={`Mensaje a ${channelPrefix(detail?.kind ?? "PUBLIC")}${detail?.name ?? "canal"}`}
                    value={draft}
                    rows={2}
                    onChange={(e) => onDraftChange(e.target.value)}
                    onPaste={(e) => {
                      const file = Array.from(e.clipboardData?.files ?? [])[0];
                      if (file) void onPickFile(file, false);
                    }}
                    onKeyDown={(e) => {
                      if (mentionOpen && mentionCandidates.length) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setMentionIndex((i) => (i + 1) % mentionCandidates.length);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
                          return;
                        }
                        if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          insertMention(mentionCandidates[mentionIndex]);
                          return;
                        }
                        if (e.key === "Escape") {
                          setMentionOpen(false);
                          return;
                        }
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className={styles.composerBar}>
                    <div className={styles.composerBarLeft}>
                      <button
                        type="button"
                        className={styles.attachBtn}
                        title="Adjuntar archivo"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📎
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        hidden
                        onChange={(e) => {
                          void onPickFile(e.target.files?.[0], false);
                          e.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        className={styles.mentionToolBtn}
                        title="Mencionar persona"
                        onClick={() => openEntityPicker("USER")}
                      >
                        👤
                      </button>
                      <button
                        type="button"
                        className={styles.mentionToolBtn}
                        title="Mencionar actividad"
                        onClick={() => openEntityPicker("ACTIVITY")}
                      >
                        📋
                      </button>
                      <button
                        type="button"
                        className={styles.mentionToolBtn}
                        title="Mencionar evidencia"
                        onClick={() => openEntityPicker("EVIDENCE")}
                      >
                        📷
                      </button>
                      <span className={styles.composerHint}>Enter envía · @ menciona</span>
                    </div>
                    <button
                      type="button"
                      className={styles.sendBtn}
                      disabled={sending || uploading || (!draft.trim() && !attachment)}
                      onClick={() => void send()}
                    >
                      Enviar
                    </button>
                  </div>
                </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>

        {panelOpen && (
          <aside className={styles.sidePanel}>
            {showMembers && (
              <>
                <div className={styles.panelHead}>
                  <div className={styles.panelTitle}>Miembros</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {detail?.kind !== "DIRECT" && !detail?.readOnly && (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => {
                          setShowInvite(true);
                          void searchColleagues("");
                        }}
                      >
                        + Invitar
                      </button>
                    )}
                    <button type="button" className={styles.panelClose} onClick={() => setShowMembers(false)}>
                      ×
                    </button>
                  </div>
                </div>
                <div className={styles.panelBody}>
                  {(detail?.members ?? []).map((m) => (
                    <div key={m.id} className={styles.memberRow}>
                      <span className={styles.presenceWrap}>
                        <span className={`${styles.avatar} ${avatarHue(m.id)}`}>
                          {initials(m.nombre)}
                        </span>
                        <span
                          className={`${styles.presenceDot} ${
                            presence[m.id] === "online" ? styles.presenceOnline : ""
                          }`}
                          style={{ borderColor: "var(--surface)" }}
                        />
                      </span>
                      <div className={styles.memberMeta}>
                        <div className={styles.memberName}>
                          {m.nombre}
                          {m.role === "owner" ? (
                            <span className={styles.roleBadge}>Owner</span>
                          ) : null}
                        </div>
                        <div className={styles.memberEmail}>{m.email}</div>
                      </div>
                      {m.id !== currentUserId && (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          style={{ marginLeft: "auto" }}
                          onClick={() => void openDm(m.id)}
                        >
                          DM
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {threadRoot && (
              <>
                <div className={styles.panelHead}>
                  <div className={styles.panelTitle}>Hilo</div>
                  <button type="button" className={styles.panelClose} onClick={() => setThreadRoot(null)}>
                    ×
                  </button>
                </div>
                <div className={styles.panelBody}>
                  {renderMessageList([threadRoot], { compactStart: true })}
                  {threadReplies.length > 0 && (
                    <div className={styles.dayDivider}>{threadReplies.length} respuestas</div>
                  )}
                  {renderMessageList(threadReplies)}
                </div>
                <div className={styles.composerWrap}>
                  {detail?.readOnly ? (
                    <div className={styles.superviseBanner} role="status">
                      Solo lectura en supervisión
                    </div>
                  ) : (
                  <div className={styles.composer}>
                    {(threadAttachment || uploading) && (
                      <div className={styles.attachChip}>
                        {threadAttachment ? (
                          <>
                            {isImageAttachment(threadAttachment.name) ? (
                              <img
                                src={attachmentHref(threadAttachment.url)}
                                alt={threadAttachment.name}
                                className={styles.attachChipThumb}
                              />
                            ) : (
                              <span className={styles.attachChipIcon}>📎</span>
                            )}
                            <span className={styles.attachChipName}>{threadAttachment.name}</span>
                            <span className={styles.attachChipSize}>{formatFileSize(threadAttachment.size)}</span>
                            <button
                              type="button"
                              className={styles.attachChipRemove}
                              onClick={() => setThreadAttachment(null)}
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <span className={styles.attachChipName}>Subiendo…</span>
                        )}
                      </div>
                    )}
                    <textarea
                      className={styles.composerTextarea}
                      placeholder="Responder en el hilo…"
                      value={threadDraft}
                      rows={2}
                      onChange={(e) => setThreadDraft(e.target.value)}
                      onPaste={(e) => {
                        const file = Array.from(e.clipboardData?.files ?? [])[0];
                        if (file) void onPickFile(file, true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send(threadRoot.id);
                        }
                      }}
                    />
                    <div className={styles.composerBar}>
                      <div className={styles.composerBarLeft}>
                        <button
                          type="button"
                          className={styles.attachBtn}
                          title="Adjuntar archivo"
                          disabled={uploading}
                          onClick={() => threadFileInputRef.current?.click()}
                        >
                          📎
                        </button>
                        <input
                          ref={threadFileInputRef}
                          type="file"
                          hidden
                          onChange={(e) => {
                            void onPickFile(e.target.files?.[0], true);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          className={styles.mentionToolBtn}
                          title="Mencionar persona"
                          onClick={() => openEntityPicker("USER", "thread")}
                        >
                          👤
                        </button>
                        <button
                          type="button"
                          className={styles.mentionToolBtn}
                          title="Mencionar actividad"
                          onClick={() => openEntityPicker("ACTIVITY", "thread")}
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          className={styles.mentionToolBtn}
                          title="Mencionar evidencia"
                          onClick={() => openEntityPicker("EVIDENCE", "thread")}
                        >
                          📷
                        </button>
                        <span className={styles.composerHint}>Respuesta al hilo</span>
                      </div>
                      <button
                        type="button"
                        className={styles.sendBtn}
                        disabled={sending || uploading || (!threadDraft.trim() && !threadAttachment)}
                        onClick={() => void send(threadRoot.id)}
                      >
                        Responder
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              </>
            )}
          </aside>
        )}
      </div>
      </div>

      {showNewChannel && (
        <div className={styles.modalBackdrop} onClick={() => setShowNewChannel(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Crear canal</div>
            <input
              className={styles.modalInput}
              placeholder="nombre-del-canal"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              autoFocus
            />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={newChannelPrivate}
                onChange={(e) => setNewChannelPrivate(e.target.checked)}
              />
              Canal privado
            </label>
            <div className={styles.modalActions}>
              <button type="button" className={styles.actionBtn} onClick={() => setShowNewChannel(false)}>
                Cancelar
              </button>
              <button type="button" className={styles.sendBtn} onClick={() => void createChannel()}>
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {showDm && (
        <div className={styles.modalBackdrop} onClick={() => setShowDm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Mensaje directo</div>
            <input
              className={styles.modalInput}
              placeholder="Buscar compañero…"
              value={colleagueQ}
              onChange={(e) => void searchColleagues(e.target.value)}
              autoFocus
            />
            <div className={styles.colleagueList}>
              {colleagues.map((u) => (
                <button key={u.id} type="button" className={styles.colleagueBtn} onClick={() => void openDm(u.id)}>
                  <span className={styles.presenceWrap}>
                    <div className={`${styles.avatar} ${avatarHue(u.id)}`} style={{ width: 32, height: 32, fontSize: 11, marginTop: 0 }}>
                      {initials(u.nombre)}
                    </div>
                    <span
                      className={`${styles.presenceDot} ${presence[u.id] === "online" ? styles.presenceOnline : ""}`}
                      style={{ borderColor: "var(--surface)" }}
                    />
                  </span>
                  <div className={styles.colleagueMeta}>
                    <div className={styles.colleagueName}>{u.nombre}</div>
                    <div className={styles.colleagueEmail}>{u.email}</div>
                  </div>
                </button>
              ))}
              {colleagues.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: 8 }}>Sin resultados</div>
              )}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.actionBtn} onClick={() => setShowDm(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showInvite && (
        <div className={styles.modalBackdrop} onClick={() => setShowInvite(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Invitar a {detail?.name ?? "el canal"}</div>
            <input
              className={styles.modalInput}
              placeholder="Buscar compañero…"
              value={colleagueQ}
              onChange={(e) => void searchColleagues(e.target.value)}
              autoFocus
            />
            <div className={styles.colleagueList}>
              {colleagues
                .filter((u) => !(detail?.members ?? []).some((m) => m.id === u.id))
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={styles.colleagueBtn}
                    onClick={() => void addMemberToChannel(u.id)}
                  >
                    <span className={styles.presenceWrap}>
                      <div className={`${styles.avatar} ${avatarHue(u.id)}`} style={{ width: 32, height: 32, fontSize: 11, marginTop: 0 }}>
                        {initials(u.nombre)}
                      </div>
                      <span
                        className={`${styles.presenceDot} ${presence[u.id] === "online" ? styles.presenceOnline : ""}`}
                        style={{ borderColor: "var(--surface)" }}
                      />
                    </span>
                    <div className={styles.colleagueMeta}>
                      <div className={styles.colleagueName}>{u.nombre}</div>
                      <div className={styles.colleagueEmail}>{u.email}</div>
                    </div>
                  </button>
                ))}
              {colleagues.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: 8 }}>Sin resultados</div>
              )}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.actionBtn} onClick={() => setShowInvite(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {entityPickerOpen && (
        <div className={styles.modalBackdrop} onClick={() => setEntityPickerOpen(false)}>
          <div className={`${styles.modal} ${styles.entityPickerModal}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Mencionar en el mensaje</div>
            <div className={styles.entityTabs}>
              {(
                [
                  ["USER", "👤 Personas"],
                  ["ACTIVITY", "📋 Actividades"],
                  ["EVIDENCE", "📷 Evidencias"],
                ] as Array<[MentionEntity["kind"], string]>
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  className={`${styles.entityTab} ${entityKind === kind ? styles.entityTabActive : ""}`}
                  onClick={() => {
                    setEntityKind(kind);
                    setEntityQ("");
                    setEntityResults([]);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className={styles.modalInput}
              placeholder={
                entityKind === "USER"
                  ? "Buscar por nombre o correo…"
                  : entityKind === "ACTIVITY"
                    ? "Buscar por AN, título o estado…"
                    : "Buscar evidencia, actividad o comentario…"
              }
              value={entityQ}
              onChange={(e) => setEntityQ(e.target.value)}
              autoFocus
            />
            <div className={styles.entityResults}>
              {entityLoading && <div className={styles.loadingLine}>Buscando…</div>}
              {!entityLoading &&
                entityResults.map((entity) => (
                  <button
                    key={`${entity.kind}-${entity.id}`}
                    type="button"
                    className={styles.entityResult}
                    onClick={() => insertEntityMention(entity)}
                  >
                    <span className={styles.entityResultIcon}>
                      {entity.kind === "USER" ? "👤" : entity.kind === "ACTIVITY" ? "📋" : "📷"}
                    </span>
                    <span className={styles.entityResultText}>
                      <strong>{entity.label}</strong>
                      <small>{entity.subtitle}</small>
                    </span>
                    <span className={styles.entityResultAdd}>Mencionar</span>
                  </button>
                ))}
              {!entityLoading && entityResults.length === 0 && (
                <div className={styles.entityEmpty}>No hay resultados disponibles.</div>
              )}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.actionBtn} onClick={() => setEntityPickerOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {switcherOpen && (
        <div className={styles.modalBackdrop} onClick={() => setSwitcherOpen(false)}>
          <div className={`${styles.modal} ${styles.switcher}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Ir a canal</div>
            <input
              className={styles.modalInput}
              placeholder="Escribe para filtrar…"
              value={switcherQ}
              onChange={(e) => {
                setSwitcherQ(e.target.value);
                setSwitcherIndex(0);
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSwitcherIndex((i) => Math.min(i + 1, Math.max(switcherItems.length - 1, 0)));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSwitcherIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && switcherItems[switcherIndex]) {
                  e.preventDefault();
                  selectChannel(switcherItems[switcherIndex].id);
                }
              }}
            />
            <div className={styles.switcherList}>
              {switcherItems.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.switcherItem} ${i === switcherIndex ? styles.switcherItemActive : ""}`}
                  onMouseEnter={() => setSwitcherIndex(i)}
                  onClick={() => selectChannel(c.id)}
                >
                  <span className={styles.channelPrefix}>{channelPrefix(c.kind) || "·"}</span>
                  <span className={styles.channelLabel}>{c.name}</span>
                  {(c.unreadCount ?? 0) > 0 && (
                    <span className={styles.unreadBadge}>{c.unreadCount}</span>
                  )}
                </button>
              ))}
              {switcherItems.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", padding: 10 }}>Sin coincidencias</div>
              )}
            </div>
            <div className={styles.switcherHint}>↑↓ navegar · Enter abrir · Esc cerrar</div>
          </div>
        </div>
      )}
    </>
  );
}
