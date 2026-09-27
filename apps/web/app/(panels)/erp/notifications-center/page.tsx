"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import { Tag } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import PanelTabs from "@/components/ui/PanelTabs";
import MetricStrip from "@/components/ui/MetricStrip";
import EmptyState from "@/components/ui/EmptyState";
import InlineAlert from "@/components/ui/InlineAlert";
import { IconLabel } from "@/components/ui/IconBadge";
import NotificationKindIcon from "@/components/ui/NotificationKindIcon";
import { stripLeadingEmoji } from "@/lib/notification-kind";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import { useUser } from "@/components/UserContext";
import { buildApiUrl, getSocketBaseUrl } from "@/lib/api-base";
import { formatApiError } from "@/lib/erp-api";
import { normalizeLegacyRelatedUrl } from "@/lib/legacy-path-remap";
import { toast } from "@/components/Toast";
import { fetchActivityFeed, type ActivityFeedItem } from "@/lib/activity-feed-api";
import { createRealtimeSocket } from "@/lib/realtime-socket";
import {
  detectCurrentPanelId,
  isCrossPanelHref,
  resolveCrossPanelHref,
} from "@/lib/cross-panel-handoff";
import s from "./notifications.module.css";

interface Notif {
  id: number;
  title: string;
  message: string;
  category: string;
  priority: string | null;
  isRead: boolean;
  createdAt: string;
  relatedUrl?: string | null;
}

type ViewMode = "action" | "notifications" | "feed";
type CategoryFilter = "all" | "ops" | "attendance" | "chat" | "other";

const VIEW_PARAM: Record<ViewMode, string | null> = { action: null, notifications: "all", feed: "feed" };

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const res = await fetch(buildApiUrl(path), {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const shortDate = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "Hace un momento";
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Ayer";
  if (d < 7) return `Hace ${d} días`;
  return shortDate.format(t);
}

function bucketCategory(category: string): CategoryFilter {
  const c = category.toLowerCase();
  if (c.includes("sla") || c.startsWith("activit") || c.startsWith("evidence") || c === "approval" || c === "confirmations" || c === "erp") return "ops";
  if (c === "attendance" || c.startsWith("lunch")) return "attendance";
  if (c === "chat") return "chat";
  return "other";
}

function isActionable(n: Notif): boolean {
  if (n.isRead) return false;
  if (n.priority === "high") return true;
  const b = bucketCategory(n.category);
  return b === "ops" || b === "attendance";
}

const CATEGORY_LABEL: Record<string, string> = {
  attendance: "Asistencia",
  lunch_break: "Comida",
  lunch_breaks: "Comida",
  activity: "Actividad",
  activities: "Actividad",
  approval: "Aprobación",
  evidence: "Evidencias",
  evidences: "Evidencias",
  "sla-alert": "Atraso",
  "sla-breach": "Atraso",
  chat: "Chat",
  profile: "Perfil",
  confirmations: "Confirmación",
  celebraciones: "Celebración",
};

const FEED_KIND_LABEL: Record<ActivityFeedItem["kind"], string> = {
  notification: "Aviso",
  audit: "Cambio",
  sales: "Ventas",
  ops: "Operación",
  crm: "Clientes",
  procurement: "Compras",
};

const byPriorityThenDate = (a: Notif, b: Notif) => {
  const pa = a.priority === "high" ? 0 : a.isRead ? 2 : 1;
  const pb = b.priority === "high" ? 0 : b.isRead ? 2 : 1;
  if (pa !== pb) return pa - pb;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
};

function SkeletonList() {
  return (
    <div className={s.list} aria-busy="true" aria-label="Cargando">
      {[0, 1, 2, 3].map((i) => <div key={i} className={s.skeleton} />)}
    </div>
  );
}

export default function NotificationsCenterPage() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const router = useRouter();

  const [view, setView] = useState<ViewMode>("action");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [feed, setFeed] = useState<ActivityFeedItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "feed") setView("feed");
    else if (v === "all") setView("notifications");
  }, []);

  const changeView = useCallback((next: ViewMode) => {
    setView(next);
    const url = new URL(window.location.href);
    const param = VIEW_PARAM[next];
    if (param) url.searchParams.set("view", param);
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url.toString());
  }, []);

  const loadNotifs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("notifications?limit=80", token);
      setNotifs(Array.isArray(data) ? data : (data.data ?? []));
    } catch (e: unknown) {
      setError(formatApiError(e, "No pudimos cargar tus notificaciones."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadFeed = useCallback(async () => {
    if (!token) return;
    setFeedLoading(true);
    setFeedError(null);
    try {
      const data = await fetchActivityFeed(token, 60);
      setFeed(data.items);
    } catch (e: unknown) {
      setFeedError(formatApiError(e, "No pudimos cargar la actividad reciente."));
    } finally {
      setFeedLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadNotifs();
  }, [loadNotifs]);

  useEffect(() => {
    if (view === "feed" && feed === null) void loadFeed();
  }, [view, feed, loadFeed]);

  useEffect(() => {
    if (!token) return;
    const socket = createRealtimeSocket(getSocketBaseUrl(), { auth: { token } });
    socket.on("notification:new", (payload: Notif) => {
      setNotifs((prev) => [payload, ...(prev ?? []).filter((n) => n.id !== payload.id)]);
    });
    socket.on("notification:read", (payload: { id: number }) => {
      setNotifs((prev) => prev?.map((n) => (n.id === payload.id ? { ...n, isRead: true } : n)) ?? prev);
    });
    socket.on("notifications:read-all", () => {
      setNotifs((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? prev);
    });
    return () => {
      socket.disconnect();
    };
  }, [token]);

  const markRead = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`notifications/${id}/read`, token, { method: "PATCH" });
      setNotifs((prev) => prev?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? prev);
    } catch (e: unknown) {
      toast.error(`No se pudo marcar como leída. ${formatApiError(e, "")}`.trim());
    }
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await apiFetch("notifications/read/all", token, { method: "PATCH" });
      setNotifs((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? prev);
    } catch (e: unknown) {
      toast.error(`No se pudieron marcar todas como leídas. ${formatApiError(e, "")}`.trim());
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    try {
      await apiFetch(`notifications/${id}`, token, { method: "DELETE" });
      setNotifs((prev) => prev?.filter((n) => n.id !== id) ?? prev);
    } catch (e: unknown) {
      toast.error(`No se pudo eliminar. ${formatApiError(e, "")}`.trim());
    }
  };

  const openPath = (path: string) => {
    const normalized = normalizeLegacyRelatedUrl(path);
    const current = detectCurrentPanelId();
    if (isCrossPanelHref(normalized, current)) {
      window.location.assign(resolveCrossPanelHref(normalized, user ? JSON.stringify(user) : null, current));
      return;
    }
    router.push(resolveCrossPanelHref(normalized, null, current));
  };

  const openNotif = (n: Notif) => {
    if (!n.isRead) void markRead(n.id);
    if (n.relatedUrl) openPath(n.relatedUrl);
  };

  const list = useMemo(() => notifs ?? [], [notifs]);
  const stats = useMemo(() => {
    let unread = 0;
    let high = 0;
    for (const n of list) {
      if (!n.isRead) {
        unread++;
        if (n.priority === "high") high++;
      }
    }
    return { unread, high };
  }, [list]);
  const actionable = useMemo(() => list.filter(isActionable), [list]);

  const sortedNotifs = useMemo(() => {
    const base =
      view === "action"
        ? actionable
        : category === "all"
          ? list
          : list.filter((n) => bucketCategory(n.category) === category);
    return [...base].sort(byPriorityThenDate);
  }, [view, actionable, list, category]);

  const firstLoad = notifs === null && loading;

  return (
    <>
      <PageHeader
        eyebrow="Hoy"
        title="Notificaciones"
        subtitle="Lo que necesita tu atención primero, y todo lo demás en orden."
        actions={
          <>
            <Button variant="ghost" iconLeft="↻" onClick={() => void (view === "feed" ? loadFeed() : loadNotifs())} loading={view === "feed" ? feedLoading : loading && notifs !== null} disabled={view === "feed" ? feedLoading : loading}>
              Actualizar
            </Button>
            {stats.unread > 0 && (
              <Button variant="secondary" iconLeft="✓" onClick={() => void markAllRead()}>
                Marcar todas como leídas
              </Button>
            )}
          </>
        }
      />

      {notifs !== null && (
        <div className={s.metrics}>
          <MetricStrip
            ariaLabel="Resumen de notificaciones"
            metrics={[
              { label: "sin leer", value: stats.unread, onClick: () => changeView("notifications") },
              { label: "para atender ahora", value: actionable.length, tone: actionable.length ? "warning" : "default", onClick: () => changeView("action") },
              { label: "prioridad alta", value: stats.high, tone: stats.high ? "danger" : "default" },
            ]}
          />
        </div>
      )}

      <PanelTabs
        ariaLabel="Vistas de notificaciones"
        value={view}
        onChange={changeView}
        tabs={[
          { key: "action", label: <IconLabel icon={TaskAltIcon} size={16}>Para atender</IconLabel>, badge: actionable.length || undefined },
          { key: "notifications", label: <IconLabel icon={InboxOutlinedIcon} size={16}>Todas</IconLabel>, badge: stats.unread || undefined },
          { key: "feed", label: <IconLabel icon={InsightsOutlinedIcon} size={16}>Actividad reciente</IconLabel> },
        ]}
      />

      {view === "notifications" && (
        <PanelTabs
          ariaLabel="Filtrar por tema"
          value={category}
          onChange={setCategory}
          tabs={[
            { key: "all", label: <IconLabel icon={NotificationsNoneOutlinedIcon} size={16}>Todos los temas</IconLabel> },
            { key: "ops", label: <IconLabel icon={AssignmentOutlinedIcon} size={16}>Actividades</IconLabel> },
            { key: "attendance", label: <IconLabel icon={EventAvailableOutlinedIcon} size={16}>Asistencia</IconLabel> },
            { key: "chat", label: <IconLabel icon={ChatBubbleOutlineIcon} size={16}>Chat</IconLabel> },
            { key: "other", label: <IconLabel icon={MoreHorizIcon} size={16}>Otras</IconLabel> },
          ]}
        />
      )}

      {view !== "feed" && (
        <Section
          title={
            notifs === null
              ? view === "action" ? "Para atender" : "Todas"
              : view === "action"
                ? actionable.length === 1 ? "1 necesita tu atención" : `${actionable.length} necesitan tu atención`
                : stats.unread === 1 ? "1 sin leer" : `${stats.unread} sin leer`
          }
        >
          {error && (
            <InlineAlert
              variant={notifs ? "warning" : "danger"}
              message={notifs ? `No pudimos actualizar; mostramos lo último que cargó. ${error}` : error}
              action={<Button size="sm" variant="secondary" onClick={() => void loadNotifs()}>Reintentar</Button>}
            />
          )}
          {firstLoad ? (
            <SkeletonList />
          ) : notifs !== null && sortedNotifs.length === 0 ? (
            <EmptyState
              icon="🔔"
              title={view === "action" ? "Nada urgente" : "Sin notificaciones"}
              description={
                view === "action"
                  ? "No tienes pendientes que requieran acción inmediata."
                  : category === "all"
                    ? "Cuando pase algo importante te avisaremos aquí."
                    : "No hay notificaciones de este tema."
              }
              action={view === "action" && list.length > 0 ? (
                <Button variant="secondary" onClick={() => changeView("notifications")}>Ver todas</Button>
              ) : undefined}
            />
          ) : (
            <ul className={s.list}>
              {sortedNotifs.map((n) => {
                const content = (
                  <>
                    <span className={s.head}>
                      <span className={s.title}>{stripLeadingEmoji(n.title)}</span>
                      {n.priority === "high" && <Tag variant="danger">Prioridad alta</Tag>}
                      <Tag variant="neutral">
                        <NotificationKindIcon category={n.category} variant="inline" size={14} muted />
                        {CATEGORY_LABEL[n.category] ?? "Aviso"}
                      </Tag>
                    </span>
                    <span className={s.message}>{stripLeadingEmoji(n.message)}</span>
                    <span className={s.meta}>
                      <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
                      {!n.isRead && " · Sin leer"}
                      {n.relatedUrl && <span className={s.open}> · Abrir →</span>}
                    </span>
                  </>
                );
                return (
                  <li
                    key={n.id}
                    className={`${s.item} ${!n.isRead ? s.itemUnread : ""} ${n.priority === "high" ? s.itemHigh : ""}`}
                  >
                    <span className={s.kindIcon}>
                      <NotificationKindIcon category={n.category} title={n.title} size={34} muted={n.isRead} />
                    </span>
                    {n.relatedUrl ? (
                      <button type="button" className={s.body} onClick={() => openNotif(n)}>
                        {content}
                      </button>
                    ) : (
                      <div className={s.body}>{content}</div>
                    )}
                    <div className={s.actions}>
                      {!n.isRead && (
                        <button type="button" className={s.iconBtn} onClick={() => void markRead(n.id)} title="Marcar como leída" aria-label="Marcar como leída">
                          <CheckIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                        </button>
                      )}
                      <button type="button" className={s.iconBtn} onClick={() => void remove(n.id)} title="Eliminar" aria-label="Eliminar notificación">
                        <CloseIcon aria-hidden="true" sx={{ fontSize: 18 }} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {view === "feed" && (
        <Section title="Actividad reciente" subtitle="Movimientos del negocio que puedes ver: órdenes, tickets, cotizaciones y compras.">
          {feedError && (
            <InlineAlert
              variant={feed ? "warning" : "danger"}
              message={feedError}
              action={<Button size="sm" variant="secondary" onClick={() => void loadFeed()}>Reintentar</Button>}
            />
          )}
          {feed === null && feedLoading ? (
            <SkeletonList />
          ) : feed !== null && feed.length === 0 ? (
            <EmptyState icon="📡" title="Sin actividad reciente" description="Aún no hay movimientos del negocio en tu alcance." />
          ) : (
            <ul className={s.list}>
              {(feed ?? []).map((item) => {
                const content = (
                  <>
                    <span className={s.head}>
                      <span className={s.title}>{stripLeadingEmoji(item.title)}</span>
                      {item.priority === "high" && <Tag variant="danger">Prioridad alta</Tag>}
                      <Tag variant="neutral">{FEED_KIND_LABEL[item.kind] ?? "Aviso"}</Tag>
                    </span>
                    {item.subtitle && <span className={s.message}>{item.subtitle}</span>}
                    <span className={s.meta}>
                      <time dateTime={item.at}>{timeAgo(item.at)}</time>
                      {item.actorName && <> · {item.actorName}</>}
                      {item.deepLink && <span className={s.open}> · Abrir →</span>}
                    </span>
                  </>
                );
                return (
                  <li key={item.id} className={`${s.item} ${s.itemFeed} ${item.priority === "high" ? s.itemHigh : ""}`}>
                    {item.deepLink ? (
                      <button type="button" className={s.body} onClick={() => openPath(item.deepLink!)}>
                        {content}
                      </button>
                    ) : (
                      <div className={s.body}>{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}
