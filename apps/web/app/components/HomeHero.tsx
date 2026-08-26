"use client";

/**
 * HomeHero — presupuesto estricto:
 * video/carrusel full-bleed + titular + una línea + CTAs.
 * Sin feature bar en el primer viewport.
 *
 * Media: usa variantes desktop / móvil desde Studio.
 * `imageUrl` / `videoUrl` = desktop; `*Mobile` = móvil (fallback a desktop).
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./HomeHero.module.css";
import { buildApiUrl } from "@/lib/api-base";
import { fetchPublicHeroSlides, resolveHeroImageUrl } from "@/lib/hero-slides-api";
import { fetchPublicHeroVideo, resolveHeroVideoUrl } from "@/lib/hero-video-api";
import type { HeroMediaConfig } from "@/lib/page-content-api";

const SLIDE_INTERVAL_MS = 7000;
const MOBILE_MQ = "(max-width: 768px)";

type Slide = { key: string; src: string; alt: string };

type RawSlide = {
  id: number;
  imageUrl: string;
  imageUrlMobile: string | null;
  altText: string | null;
};

type RawVideo = {
  videoUrl: string;
  videoUrlMobile: string | null;
  isActive: boolean;
};

function pickUrl(desktop: string, mobile: string | null | undefined, isMobile: boolean) {
  if (isMobile && mobile) return mobile;
  return desktop;
}

export default function HomeHero() {
  const [rawSlides, setRawSlides] = useState<RawSlide[]>([]);
  const [rawVideo, setRawVideo] = useState<RawVideo | null>(null);
  const [preferVideo, setPreferVideo] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [mediaRes, publicVideo] = await Promise.all([
          fetch(buildApiUrl("studio/page-content/home_hero"), { cache: "no-store" }).catch(() => null),
          fetchPublicHeroVideo().catch(() => null),
        ]);

        let mediaType: HeroMediaConfig["mediaType"] = "carousel";
        if (mediaRes?.ok) {
          const json = await mediaRes.json().catch(() => null);
          if (json?.content?.mediaType === "video") mediaType = "video";
        }

        const hasVideo = Boolean(publicVideo?.videoUrl && publicVideo.isActive);
        const useVideo = mediaType === "video" || hasVideo;

        if (useVideo && publicVideo?.videoUrl) {
          if (cancelled) return;
          setPreferVideo(true);
          setRawVideo({
            videoUrl: publicVideo.videoUrl,
            videoUrlMobile: publicVideo.videoUrlMobile ?? null,
            isActive: publicVideo.isActive,
          });
          setVideoFailed(false);
          return;
        }

        setPreferVideo(false);
        const slides = await fetchPublicHeroSlides().catch(() => []);
        if (cancelled) return;
        setRawSlides(
          slides.map((s) => ({
            id: s.id,
            imageUrl: s.imageUrl,
            imageUrlMobile: s.imageUrlMobile ?? null,
            altText: s.altText,
          })),
        );
      } catch {
        /* atmósfera */
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const videoUrl =
    preferVideo && rawVideo?.videoUrl
      ? resolveHeroVideoUrl(pickUrl(rawVideo.videoUrl, rawVideo.videoUrlMobile, isMobile))
      : null;

  const dynamicSlides: Slide[] = rawSlides.map((s) => ({
    key: `db-${s.id}`,
    src: resolveHeroImageUrl(pickUrl(s.imageUrl, s.imageUrlMobile, isMobile)),
    alt: s.altText || "Nexara",
  }));

  const showVideo = Boolean(videoUrl) && !videoFailed;
  const hasMedia = showVideo || dynamicSlides.length > 0;

  useEffect(() => {
    const el = videoRef.current;
    if (!showVideo || !el) return;
    void el.play().catch(() => undefined);
  }, [showVideo, videoUrl]);

  const stopAutoPlay = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startAutoPlay = useCallback(() => {
    if (dynamicSlides.length <= 1) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % dynamicSlides.length);
    }, SLIDE_INTERVAL_MS);
  }, [dynamicSlides.length]);

  const goTo = useCallback(
    (next: number) => {
      if (dynamicSlides.length === 0) return;
      setIndex(((next % dynamicSlides.length) + dynamicSlides.length) % dynamicSlides.length);
    },
    [dynamicSlides.length],
  );

  useEffect(() => {
    if (showVideo) {
      stopAutoPlay();
      return;
    }
    startAutoPlay();
    return stopAutoPlay;
  }, [showVideo, startAutoPlay, stopAutoPlay]);

  useEffect(() => {
    if (index >= dynamicSlides.length && dynamicSlides.length > 0) setIndex(0);
  }, [dynamicSlides.length, index]);

  return (
    <section
      className={`${styles.hero} ${hasMedia ? styles.heroMedia : styles.heroFallback}`}
      aria-label="Bienvenido a Nexara"
      data-home-hero="true"
      onMouseEnter={stopAutoPlay}
      onMouseLeave={() => {
        if (!showVideo) startAutoPlay();
      }}
    >
      {showVideo ? (
        <video
          key={videoUrl ?? "video"}
          ref={videoRef}
          className={styles.bgVideo}
          src={videoUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => {
            setVideoFailed(true);
          }}
          aria-hidden
        />
      ) : dynamicSlides.length > 0 ? (
        <div className={styles.slides} aria-hidden>
          {dynamicSlides.map((slide, i) => (
            <div
              key={`${slide.key}-${slide.src}`}
              className={`${styles.slide} ${i === index ? styles.slideActive : ""}`}
              style={{ backgroundImage: `url("${slide.src}")` }}
              role="img"
              aria-label={slide.alt}
            />
          ))}
        </div>
      ) : (
        <>
          <div className={styles.atmosphere} aria-hidden />
          <div className={styles.gridGlow} aria-hidden />
        </>
      )}

      <div className={styles.mediaScrim} aria-hidden />

      <div className={styles.stage}>
        <p className={styles.kicker}>Conectamos tecnología, impulsamos el futuro</p>
        <h1 className={styles.title}>
          Soluciones inteligentes para un{" "}
          <span className={styles.titleAccent}>mundo conectado</span>
        </h1>
        <p className={styles.lead}>
          CCTV, redes, cómputo y soporte — una sola firma responsable de tu operación.
        </p>
        <div className={styles.actions}>
          <Link href="/contacto" className={styles.ctaPrimary} data-track-conversion="home_hero_contact_cta">
            Cotiza tu proyecto
            <span aria-hidden className={styles.ctaArrow}>→</span>
          </Link>
          <Link href="/servicios" className={styles.ctaGhost} data-track-conversion="home_hero_primary_cta">
            Ver capacidades
          </Link>
        </div>
        <p className={styles.tertiaryLink}>
          <Link href="/proyectos">Ver casos de campo →</Link>
        </p>
      </div>

      {!showVideo && dynamicSlides.length > 1 && (
        <ul className={styles.dots} role="tablist" aria-label="Selector de slide">
          {dynamicSlides.map((slide, i) => (
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
