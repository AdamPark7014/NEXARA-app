"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import styles from "./WorkspaceChat.module.css";

type ChannelKind = "PUBLIC" | "PRIVATE" | "DIRECT" | "DOCUMENT";

type ChatUser = { id: number; nombre: string; email: string };

type Channel = {
  id: number;
  kind: ChannelKind;
  slug: string | null;
  name: string;
  topic?: string | null;
  description?: string | null;
  documentId?: number | null;
  document?: {
    id: number;
    title: string;
    documentNumber: string;
    fileUrl?: string | null;
    status?: string;
  } | null;
  peer?: ChatUser | null;
  members?: Array<ChatUser & { role?: string }>;
  memberCount: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  unread?: boolean;
  unreadCount?: number;
};

type Reaction = { emoji: string; count: number; userIds: number[] };

type Message = {
  id: number;
  channelId: number;
  authorId: number;
  parentId: number | null;
  kind: string;
  body: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  editedAt?: string | null;
  createdAt: string;
  author: ChatUser;
  replyCount: number;
  reactions: Reaction[];
  channel?: { id: number; name: string; kind: ChannelKind; slug: string | null };
};

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
  if (kind === "DOCUMENT") return "📄";
  return "#";
}

function renderRichText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|https?:\/\/[^\s]+|@[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9._-]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
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
  openDocumentId?: number | null;
};

export default function WorkspaceChat({
  token,
  currentUserId,
  currentUserName = "Tú",
  openDocumentId,
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
  const [starred, setStarred] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("nexara.chat.starred");
      return raw ? (JSON.parse(raw) as number[]) : [];
    } catch {
      return [];
    }
  });
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("nexara.chat.sound") !== "0";
  });

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef<number | null>(null);
  const threadRootRef = useRef<Message | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearBottomRef = useRef(true);
  const draftsRef = useRef<Record<number, string>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    threadRootRef.current = threadRoot;
  }, [threadRoot]);

  useEffect(() => {
    localStorage.setItem("nexara.chat.starred", JSON.stringify(starred));
  }, [starred]);

  useEffect(() => {
    localStorage.setItem("nexara.chat.sound", soundOn ? "1" : "0");
  }, [soundOn]);

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

  const selectChannel = useCallback((id: number) => {
    if (activeId != null) draftsRef.current[activeId] = draft;
    setActiveId(id);
    setDraft(draftsRef.current[id] ?? "");
    setSwitcherOpen(false);
    setSwitcherQ("");
  }, [activeId, draft]);

  const loadChannels = useCallback(async () => {
    if (!token) return;
    setLoadingChannels(true);
    setError(null);
    try {
      const data = await apiFetch("chat/channels", token);
      const list: Channel[] = Array.isArray(data) ? data : [];
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
        if (ch) setDetail(ch);
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
    [token],
  );

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (!openDocumentId || !token) return;
    void (async () => {
      try {
        const ch = await apiFetch(`chat/documents/${openDocumentId}/channel`, token, { method: "POST" });
        await loadChannels();
        if (ch?.id) setActiveId(ch.id);
      } catch {
        /* optional */
      }
    })();
  }, [openDocumentId, token, loadChannels]);

  useEffect(() => {
    if (!activeId) return;
    setThreadRoot(null);
    setThreadReplies([]);
    setShowMembers(false);
    setSearchHits([]);
    setSearchQ("");
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
      if (msg.channelId === activeIdRef.current && !msg.parentId) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        void apiFetch(`chat/channels/${msg.channelId}/read`, token, { method: "PATCH" });
      } else if (
        msg.channelId === activeIdRef.current &&
        threadRootRef.current &&
        msg.parentId === threadRootRef.current.id
      ) {
        setThreadReplies((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      } else {
        playPing();
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
    });

    socket.on("chat:message-deleted", (payload: { id: number; channelId: number; parentId: number | null }) => {
      if (payload.parentId) {
        setThreadReplies((prev) => prev.filter((m) => m.id !== payload.id));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== payload.id));
      }
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

    const onVis = () => {
      socket.emit("chat:presence", { status: document.visibilityState === "visible" ? "online" : "away" });
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      socket.emit("chat:presence", { status: "away" });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, currentUserId, playPing]);

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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const send = async (parentId?: number | null) => {
    if (!activeId || sending) return;
    const text = (parentId ? threadDraft : draft).trim();
    if (!text) return;
    setSending(true);
    try {
      const msg = await apiFetch(`chat/channels/${activeId}/messages`, token, {
        method: "POST",
        body: JSON.stringify({ body: text, parentId: parentId ?? null }),
      });
      if (parentId) {
        setThreadDraft("");
        setThreadReplies((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        setMessages((prev) =>
          prev.map((m) => (m.id === parentId ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m)),
        );
      } else {
        setDraft("");
        setMentionOpen(false);
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        nearBottomRef.current = true;
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

  const removeMessage = async (messageId: number) => {
    if (!window.confirm("¿Eliminar este mensaje?")) return;
    try {
      await apiFetch(`chat/messages/${messageId}`, token, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setThreadReplies((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
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
    setMentionOpen(false);
  };

  const filteredChannels = useMemo(() => {
    const q = sidebarFilter.trim().toLowerCase();
    const match = (c: Channel) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.document?.documentNumber ?? "").toLowerCase().includes(q) ||
      (c.lastMessagePreview ?? "").toLowerCase().includes(q);
    const publics = channels.filter((c) => (c.kind === "PUBLIC" || c.kind === "PRIVATE") && match(c));
    const docs = channels.filter((c) => c.kind === "DOCUMENT" && match(c));
    const dms = channels.filter((c) => c.kind === "DIRECT" && match(c));
    const stars = channels.filter((c) => starred.includes(c.id) && match(c));
    return { publics, docs, dms, stars };
  }, [channels, sidebarFilter, starred]);

  const switcherItems = useMemo(() => {
    const q = switcherQ.trim().toLowerCase();
    const ranked = [...channels].sort((a, b) => {
      const as = starred.includes(a.id) ? 1 : 0;
      const bs = starred.includes(b.id) ? 1 : 0;
      if (as !== bs) return bs - as;
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
        (c.slug ?? "").includes(q) ||
        (c.document?.documentNumber ?? "").toLowerCase().includes(q),
    ).slice(0, 12);
  }, [channels, switcherQ, starred]);

  const toggleStar = (id: number) => {
    setStarred((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

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

  const renderMessageList = (list: Message[], opts?: { compactStart?: boolean }) => {
    let lastAuthor: number | null = null;
    let lastDay: string | null = null;
    let lastTs = 0;
    return list.map((m) => {
      const dk = dayKey(m.createdAt);
      const showDay = dk !== lastDay;
      lastDay = dk;
      const ts = new Date(m.createdAt).getTime();
      const compact =
        !showDay &&
        lastAuthor === m.authorId &&
        ts - lastTs < 5 * 60 * 1000 &&
        !opts?.compactStart;
      lastAuthor = m.authorId;
      lastTs = ts;
      const mine = m.authorId === currentUserId;
      const mineReaction = (emoji: string) =>
        m.reactions.some((r) => r.emoji === emoji && r.userIds.includes(currentUserId));

      return (
        <div key={m.id}>
          {showDay && <div className={styles.dayDivider}>{dayLabel(m.createdAt)}</div>}
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
                <div className={styles.msgBody}>{renderRichText(m.body)}</div>
              )}

              {m.reactions?.length > 0 && (
                <div className={styles.reactions}>
                  {m.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`${styles.reaction} ${mineReaction(r.emoji) ? styles.reactionMine : ""}`}
                      onClick={() => void react(m.id, r.emoji)}
                    >
                      <span>{r.emoji}</span>
                      <span>{r.count}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.msgActions}>
                <button type="button" className={styles.actionBtn} onClick={() => void react(m.id, "👍")}>
                  👍
                </button>
                <button type="button" className={styles.actionBtn} onClick={() => void react(m.id, "✅")}>
                  ✅
                </button>
                <button type="button" className={styles.actionBtn} onClick={() => void react(m.id, "👀")}>
                  👀
                </button>
                {!m.parentId && (
                  <button type="button" className={styles.actionBtn} onClick={() => void openThread(m)}>
                    Responder
                  </button>
                )}
                {mine && (
                  <>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => {
                        setEditingId(m.id);
                        setEditDraft(m.body);
                      }}
                    >
                      Editar
                    </button>
                    <button type="button" className={styles.actionBtn} onClick={() => void removeMessage(m.id)}>
                      Eliminar
                    </button>
                  </>
                )}
              </div>

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

  const panelOpen = Boolean(threadRoot || showMembers || detail?.document);
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
        {c.kind === "DOCUMENT" ? c.document?.documentNumber ?? c.name : c.name}
      </span>
      <span className={styles.channelMeta}>
        {starred.includes(c.id) && <span aria-hidden style={{ opacity: 0.55, fontSize: 10 }}>★</span>}
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
                ⌕
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
                ✎
              </button>
            </div>
          </div>

          <div className={styles.sidebarSearch}>
            <span aria-hidden>⌕</span>
            <input
              placeholder="Filtrar…"
              value={sidebarFilter}
              onChange={(e) => setSidebarFilter(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                  e.preventDefault();
                  setSwitcherOpen(true);
                }
              }}
            />
            <span className={styles.kbd}>⌘K</span>
          </div>

          <div className={styles.sidebarScroll}>
            {filteredChannels.stars.length > 0 && (
              <>
                <div className={styles.sectionLabel}>
                  <span>Favoritos</span>
                </div>
                {filteredChannels.stars.map(channelRow)}
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

            {filteredChannels.docs.length > 0 && (
              <>
                <div className={styles.sectionLabel}>
                  <span>Documentos</span>
                </div>
                {filteredChannels.docs.map(channelRow)}
              </>
            )}

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
              <h3>Chat NEXARA</h3>
              <p>Selecciona un canal o abre un DM. Ctrl+K para saltar al instante.</p>
            </div>
          ) : (
            <>
              <header className={styles.channelHeader}>
                <div className={styles.channelTitleBlock}>
                  <div className={styles.channelTitle}>
                    <span>{channelPrefix(detail?.kind ?? "PUBLIC")}</span>
                    <span>{detail?.name ?? "…"}</span>
                  </div>
                  <div className={styles.channelTopic} onClick={() => void editTopic()} title="Editar tema">
                    {detail?.topic || "Añadir tema…"}
                  </div>
                </div>
                <div className={styles.headerMeta}>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${starred.includes(activeId) ? styles.iconBtnActive : ""}`}
                    title={starred.includes(activeId) ? "Quitar de favoritos" : "Marcar favorito"}
                    onClick={() => toggleStar(activeId)}
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${soundOn ? styles.iconBtnActive : ""}`}
                    title={soundOn ? "Sonido activado" : "Sonido desactivado"}
                    onClick={() => setSoundOn((v) => !v)}
                  >
                    {soundOn ? "🔔" : "🔕"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${searchOpen ? styles.iconBtnActive : ""}`}
                    title="Buscar en canal"
                    onClick={() => setSearchOpen((v) => !v)}
                  >
                    ⌕
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
                    👤
                  </button>
                  {typeof detail?.memberCount === "number" && (
                    <span className={styles.pill}>{detail.memberCount}</span>
                  )}
                </div>
              </header>

              {searchOpen && (
                <>
                  <div className={styles.searchBar}>
                    <span>⌕</span>
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
                    <h3>Canal listo</h3>
                    <p>Escribe el primer mensaje. Enter envía · @ menciona · `código`.</p>
                  </div>
                )}
                {renderMessageList(messages)}
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

              <div className={styles.composerWrap}>
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
                  <textarea
                    className={styles.composerTextarea}
                    placeholder={`Mensaje a ${channelPrefix(detail?.kind ?? "PUBLIC")}${detail?.name ?? "canal"}`}
                    value={draft}
                    rows={2}
                    onChange={(e) => onDraftChange(e.target.value)}
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
                    <span className={styles.composerHint}>Enter · Shift+Enter · @ · `code`</span>
                    <button
                      type="button"
                      className={styles.sendBtn}
                      disabled={sending || !draft.trim()}
                      onClick={() => void send()}
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {panelOpen && (
          <aside className={styles.sidePanel}>
            {detail?.document && (
              <div className={styles.docCard}>
                <div className={styles.docCardLabel}>Documento vinculado</div>
                <div className={styles.docCardTitle}>{detail.document.title}</div>
                <div className={styles.docCardMeta}>
                  {detail.document.documentNumber}
                  {detail.document.status ? ` · ${detail.document.status}` : ""}
                </div>
                {detail.document.fileUrl && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    style={{ marginTop: 8, opacity: 1, border: "1px solid var(--border)" }}
                    onClick={() => window.open(buildApiUrl(detail.document!.fileUrl!), "_blank")}
                  >
                    Abrir archivo
                  </button>
                )}
              </div>
            )}

            {showMembers && (
              <>
                <div className={styles.panelHead}>
                  <div className={styles.panelTitle}>Miembros</div>
                  <button type="button" className={styles.panelClose} onClick={() => setShowMembers(false)}>
                    ×
                  </button>
                </div>
                <div className={styles.panelBody}>
                  {(detail?.members ?? []).map((m) => (
                    <div key={m.id} className={styles.memberRow}>
                      <span className={styles.presenceWrap}>
                        <span className={`${styles.avatar} ${avatarHue(m.id)}`} style={{ marginTop: 0 }}>
                          {initials(m.nombre)}
                        </span>
                        <span
                          className={`${styles.presenceDot} ${
                            presence[m.id] === "online" ? styles.presenceOnline : ""
                          }`}
                          style={{ borderColor: "var(--surface)" }}
                        />
                      </span>
                      <div>
                        <div className={styles.memberName}>{m.nombre}</div>
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
                  <div className={styles.composer}>
                    <textarea
                      className={styles.composerTextarea}
                      placeholder="Responder en el hilo…"
                      value={threadDraft}
                      rows={2}
                      onChange={(e) => setThreadDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send(threadRoot.id);
                        }
                      }}
                    />
                    <div className={styles.composerBar}>
                      <span className={styles.composerHint}>Respuesta al hilo</span>
                      <button
                        type="button"
                        className={styles.sendBtn}
                        disabled={sending || !threadDraft.trim()}
                        onClick={() => void send(threadRoot.id)}
                      >
                        Responder
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </aside>
        )}
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
                  {starred.includes(c.id) && <span style={{ opacity: 0.6 }}>★</span>}
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
