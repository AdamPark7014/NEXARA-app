"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@/components/UserContext";

type ConsentEventDetail = { enabled?: boolean };

export default function GpsBackgroundTracker() {
  const { user } = useUser();
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const consentEnabledRef = useRef<boolean>(false);
  const tokenRef = useRef<string | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;

  const stopTracking = () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const sendLocation = async (payload: { latitud: number; longitud: number; velocidadKmh?: number | null }) => {
    if (!tokenRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < 4000) return;
    lastSentRef.current = now;

    await fetch(buildApiUrl("gps"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({
        ...payload,
        estaActivo: true,
        ultimaActualizacion: new Date().toISOString(),
      }),
    });
  };

  const startTracking = () => {
    if (!consentEnabledRef.current) return;
    if (!navigator.geolocation) return;
    if (watchIdRef.current !== null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const payload = {
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          velocidadKmh: pos.coords.speed ? pos.coords.speed * 3.6 : null,
        };
        try {
          await sendLocation(payload);
        } catch {
          // Silent: this tracker is background-only.
        }
      },
      () => {
        stopTracking();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  useEffect(() => {
    tokenRef.current = user?.token || null;
    if (!user?.token) {
      consentEnabledRef.current = false;
      stopTracking();
      return;
    }

    const fetchConsent = async () => {
      try {
        const res = await fetch(buildApiUrl("gps/me"), {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (!res.ok) {
          consentEnabledRef.current = false;
          stopTracking();
          return;
        }
        const data = await res.json().catch(() => ({}));
        const enabled = Boolean(data?.consent);
        consentEnabledRef.current = enabled;
        if (enabled) {
          startTracking();
        } else {
          stopTracking();
        }
      } catch {
        consentEnabledRef.current = false;
        stopTracking();
      }
    };

    fetchConsent();
  }, [user?.token]);

  useEffect(() => {
    const onConsentChange = (event: Event) => {
      const detail = (event as CustomEvent<ConsentEventDetail>).detail;
      if (typeof detail?.enabled !== "boolean") return;
      consentEnabledRef.current = detail.enabled;
      if (detail.enabled) {
        startTracking();
      } else {
        stopTracking();
      }
    };

    window.addEventListener("gps:consent", onConsentChange as EventListener);
    return () => {
      window.removeEventListener("gps:consent", onConsentChange as EventListener);
    };
  }, []);

  useEffect(() => () => stopTracking(), []);

  return null;
}
