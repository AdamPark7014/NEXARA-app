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
    label: "Desarrollo de Software",
    href: "/servicios#software",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="8 18 2 12 8 6" />
        <polyline points="16 6 22 12 16 18" />
      </svg>
    ),
  },
  {
    label: "Soluciones en la Nube",
    href: "/servicios#cloud",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 18a4 4 0 0 0 0-8 6 6 0 0 0-11.6-1.5A4.5 4.5 0 0 0 6.5 18z" />
      </svg>
    ),
  },
  {
    label: "Ciberseguridad Avanzada",
    href: "/servicios#ciberseguridad",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Data & IA Inteligente",
    href: "/servicios#data-ai",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="20" x2="4" y2="10" />
        <line x1="10" y1="20" x2="10" y2="4" />
        <line x1="16" y1="20" x2="16" y2="13" />
        <line x1="22" y1="20" x2="2" y2="20" />
      </svg>
    ),
  },
  {
    label: "Transformación Digital",
    href: "/servicios#transformacion",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
        <line x1="12" y1="22" x2="12" y2="12" />
        <line x1="22" y1="8.5" x2="12" y2="12" />
        <line x1="2" y1="8.5" x2="12" y2="12" />
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
        <p className={styles.kicker}>Tecnología que impulsa ideas</p>
        <h1 className={styles.title}>
          Transformamos tecnología en{" "}
          <em className={styles.titleAccent}>soluciones reales</em>
        </h1>
        <p className={styles.lead}>
          En Nexara ayudamos a empresas a innovar, optimizar procesos y escalar con
          tecnología inteligente.
        </p>
        <div className={styles.actions}>
          <Link
            href="/servicios"
            className={styles.ctaPrimary}
            data-track-conversion="home_hero_primary_cta"
          >
            Conoce nuestros servicios
            <span aria-hidden className={styles.ctaArrow}>→</span>
          </Link>
          <Link
            href="/proyectos"
            className={styles.ctaSecondary}
            data-track-conversion="home_hero_projects_cta"
          >
            Ver proyectos
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
