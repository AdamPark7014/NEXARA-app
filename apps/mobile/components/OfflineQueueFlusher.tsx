"use client";

import { useEffect } from "react";
import { useUser } from "./UserContext";
import { flushOfflineQueue, getOfflineQueueLength } from "@/lib/offline-queue";
import { revalidateHotApiCache } from "@/lib/offline-api-cache";
import { getNativeFetch } from "@/lib/native-fetch";

function portalSessionBearer(): string | undefined {
  try {
    const raw =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("clientSession") || window.sessionStorage.getItem("branchSession")
        : null;
    if (!raw) return undefined;
    const p = JSON.parse(raw) as { token?: string };
    return p?.token ? `Bearer ${p.token}` : undefined;
  } catch {
    return undefined;
  }
}

/** When connectivity returns, replay queued writes (see `enqueueOfflineFetch`). */
export default function OfflineQueueFlusher() {
  const { user } = useUser();

  useEffect(() => {
    const resolveAuth = () => {
      if (user?.token) return `Bearer ${user.token}`;
      return portalSessionBearer();
    };

    const run = () => {
      void flushOfflineQueue(resolveAuth).then(() => {
        if (resolveAuth()) void revalidateHotApiCache(getNativeFetch(), resolveAuth, 72);
      });
    };

    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        run();
      }
    };

    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);

    run();

    const intervalId = window.setInterval(() => {
      if (getOfflineQueueLength() > 0) run();
    }, 5000);

    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalId);
    };
  }, [user?.token]);

  return null;
}
