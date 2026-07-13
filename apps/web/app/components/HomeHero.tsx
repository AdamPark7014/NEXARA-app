"use client";

/**
 * HomeHero — hero principal de la home pública (`/`).
 * Carrusel/video full-bleed + copy + CTAs. Capacidad shortcuts
 * viven en la sección “Qué hacemos”, no en el primer viewport.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./HomeHero.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { fetchPublicHeroSlides, resolveHeroImageUrl } from "@/lib/hero-slides-api";
import { fetchPublicHeroVideo, resolveHeroVideoUrl } from "@/lib/hero-video-api";
import type { HeroMediaConfig } from "@/lib/page-content-api";

const SLIDE_INTERVAL_MS = 7000;

type Slide = {
  key: string;
  src: string;
  alt: string;
};

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

export default function HomeHero() {
  const [dynamicSlides, setDynamicSlides] = useState<Slide[] | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        // fallback estático
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
    if (videoUrl) return;
    startAutoPlay();
    return stopAutoPlay;
  }, [startAutoPlay, stopAutoPlay, videoUrl]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopAutoPlay();
      else if (!videoUrl) startAutoPlay();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [startAutoPlay, stopAutoPlay, videoUrl]);

  return (
    <section
      className={styles.hero}
      aria-label="Bienvenido a Nexara"
      data-home-hero="true"
      onMouseEnter={stopAutoPlay}
      onMouseLeave={() => {
        if (!videoUrl) startAutoPlay();
      }}
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
        <p className={styles.brand}>NEXARA</p>
        <p className={styles.kicker}>Integración tecnológica · México</p>
        <h1 className={styles.title}>
          Tecnología que <span className={styles.titleAccent}>sostiene tu operación</span>
        </h1>
        <p className={styles.lead}>
          CCTV, redes, cómputo y soporte con disciplina de campo. Una firma
          responsable de que todo funcione el lunes por la mañana.
        </p>
        <div className={styles.actions}>
          <Link
            href="/contacto"
            className={styles.ctaPrimary}
            data-track-conversion="home_hero_primary_cta"
          >
            Cotiza tu proyecto
            <span aria-hidden className={styles.ctaArrow}>
              →
            </span>
          </Link>
          <Link
            href="/servicios"
            className={styles.ctaSecondary}
            data-track-conversion="home_hero_projects_cta"
          >
            Ver capacidades
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
    </section>
  );
}
