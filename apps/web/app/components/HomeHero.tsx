"use client";

/**
 * HomeHero — hero principal de la home pública (`/`).
 * ============================================================
 * Carrusel full-bleed con crossfade automático cada 6 s entre
 * 8 imágenes oficiales del banco NEXARA (cobertura, equipo,
 * instalaciones y NOC). Overlay verde teal sobre cada foto y
 * copy fijo a la izquierda.
 *
 * Si quieres editar el orden / añadir / quitar slides desde
 * el admin sin tocar código, usa la página `/studio/hero` que
 * persiste todo en la tabla `hero_slides` de Postgres. Este
 * componente sólo sirve como fallback estático (no requiere
 * API ni conexión a BD para renderizar la home).
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./HomeHero.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { fetchPublicHeroSlides, resolveHeroImageUrl } from "@/lib/hero-slides-api";
import { fetchPublicHeroVideo, resolveHeroVideoUrl } from "@/lib/hero-video-api";
import type { HeroMediaConfig } from "@/lib/page-content-api";

const SLIDE_INTERVAL_MS = 6000;

type Slide = {
  key: string;
  src: string;
  alt: string;
};

/** Slides oficiales — imágenes en `apps/web/public/images/hero/`. */
const SLIDES: Slide[] = [
  { key: "s1", src: "/images/hero/hero-01.png", alt: "Antena de telecomunicaciones Nexara con vista a la ciudad" },
  { key: "s2", src: "/images/hero/hero-02.png", alt: "Cobertura tecnológica metropolitana con vista al skyline" },
  { key: "s3", src: "/images/hero/hero-03.png", alt: "Técnico Nexara realizando instalación en campo" },
  { key: "s4", src: "/images/hero/hero-04.png", alt: "Equipo Nexara — identidad de marca en uniforme" },
  { key: "s5", src: "/images/hero/hero-05.png", alt: "Equipo Nexara comprometido con cada proyecto" },
  { key: "s6", src: "/images/hero/hero-06.png", alt: "Ingeniero Nexara en gabinete de telecomunicaciones" },
  { key: "s7", src: "/images/hero/hero-07.png", alt: "Instalación profesional de racks e infraestructura" },
  { key: "s8", src: "/images/hero/hero-08.png", alt: "Centro de monitoreo NOC Nexara 24/7" },
];

type ServiceItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const SERVICES: ServiceItem[] = [
  {
    label: "Videovigilancia",
    href: "/servicios#cctv",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    ),
  },
  {
    label: "Redes y Wi‑Fi",
    href: "/servicios#redes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <circle cx="12" cy="20" r="1" />
      </svg>
    ),
  },
  {
    label: "Cómputo",
    href: "/servicios#computo",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    label: "Soporte TI",
    href: "/servicios#soporte",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

export default function HomeHero() {
  const [dynamicSlides, setDynamicSlides] = useState<Slide[] | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carga la config del hero desde la BD (Studio → /studio/hero). Si la API
  // falla o no hay nada configurado, el componente cae a SLIDES hardcodeado.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(buildApiUrl("studio/page-content/home_hero"), {
          cache: "no-store",
        });
        const mediaType: HeroMediaConfig["mediaType"] = res.ok
          ? ((await res.json())?.content?.mediaType === "video" ? "video" : "carousel")
          : "carousel";

        if (mediaType === "video") {
          const video = await fetchPublicHeroVideo().catch(() => null);
          if (cancelled) return;
          if (video) {
            setVideoUrl(resolveHeroVideoUrl(video.videoUrl));
            return;
          }
        }

        const publicSlides = await fetchPublicHeroSlides().catch(() => []);
        if (cancelled) return;
        if (publicSlides.length > 0) {
          setDynamicSlides(
            publicSlides.map((s) => ({
              key: `db-${s.id}`,
              src: resolveHeroImageUrl(s.imageUrl),
              alt: s.altText || "Nexara",
            })),
          );
        }
      } catch {
        // silencioso: se mantiene el fallback estático
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const slides = dynamicSlides ?? SLIDES;

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % slides.length) + slides.length) % slides.length);
    },
    [slides.length],
  );

  const startAutoPlay = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);
  }, [slides.length]);

  const stopAutoPlay = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoPlay();
    return stopAutoPlay;
  }, [startAutoPlay, stopAutoPlay]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopAutoPlay();
      else startAutoPlay();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [startAutoPlay, stopAutoPlay]);

  return (
    <section
      className={styles.hero}
      aria-label="Bienvenido a Nexara"
      data-home-hero="true"
      onMouseEnter={stopAutoPlay}
      onMouseLeave={startAutoPlay}
    >
      {videoUrl ? (
        <video
          className={styles.bgVideo}
          src={videoUrl}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
      ) : (
        <div className={styles.slides} aria-hidden>
          {slides.map((slide, i) => (
            <div
              key={slide.key}
              className={`${styles.slide} ${i === index ? styles.slideActive : ""}`}
              style={{ backgroundImage: `url("${slide.src}")` }}
              role="img"
              aria-label={slide.alt}
            />
          ))}
        </div>
      )}

      <div className={styles.overlay} aria-hidden />

      <div className={styles.content}>
        <p className={styles.kicker}>Integración tecnológica en México</p>
        <h1 className={styles.title}>
          Tecnología que <em className={styles.titleAccent}>sostiene tu operación</em>
        </h1>
        <p className={styles.lead}>
          CCTV, redes, cómputo y soporte con disciplina de campo. Una sola firma
          responsable de que todo funcione el lunes por la mañana.
        </p>
        <div className={styles.actions}>
          <Link
            href="/contacto"
            className={styles.ctaPrimary}
            data-track-conversion="home_hero_primary_cta"
          >
            Cotiza tu proyecto
            <span aria-hidden className={styles.ctaArrow}>→</span>
          </Link>
          <Link
            href="/servicios"
            className={styles.ctaSecondary}
            data-track-conversion="home_hero_projects_cta"
          >
            Ver capacidades
            <span aria-hidden className={styles.ctaArrow}>→</span>
          </Link>
        </div>
      </div>

      {!videoUrl && (
        <ul className={styles.dots} role="tablist" aria-label="Selector de slide">
          {slides.map((slide, i) => (
            <li key={slide.key}>
              <button
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Mostrar slide ${i + 1}`}
                className={`${styles.dot} ${i === index ? styles.dotActive : ""}`}
                onClick={() => goTo(i)}
              />
            </li>
          ))}
        </ul>
      )}

      <nav className={styles.services} aria-label="Servicios principales">
        {SERVICES.map((service) => (
          <Link key={service.label} href={service.href} className={styles.serviceItem}>
            <span className={styles.serviceIcon} aria-hidden>
              {service.icon}
            </span>
            <span className={styles.serviceLabel}>{service.label}</span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
