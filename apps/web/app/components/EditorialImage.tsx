"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./EditorialImage.module.css";
import {
  resolvePageMediaUrl,
  type PageImageLayout,
  type PageImagePosition,
} from "@/lib/page-content-api";

type EditorialImageProps = {
  desktopUrl: string;
  mobileUrl?: string;
  alt: string;
  caption?: string;
  layout?: PageImageLayout;
  objectPosition?: PageImagePosition;
  className?: string;
  /** Eyebrow corto encima / al lado (armonía con copy). */
  kicker?: string;
  /** Título corto de acompañamiento editorial. */
  title?: string;
  /** Compose: how text and image sit together. */
  compose?: "solo" | "split" | "caption-bar";
  /** En compose split: lado de la foto (default "right"). */
  mediaSide?: "left" | "right";
};

const LAYOUT_CLASS: Record<PageImageLayout, string> = {
  bleed_cinema: styles.bleedCinema,
  bleed_landscape: styles.bleedLandscape,
  framed_wide: styles.framedWide,
  framed_square: styles.framedSquare,
  portrait_featured: styles.portraitFeatured,
  aside_compact: styles.asideCompact,
  inset_offset: styles.insetOffset,
};

const POSITION_CLASS: Record<PageImagePosition, string> = {
  center: styles.posCenter,
  left: styles.posLeft,
  right: styles.posRight,
  top: styles.posTop,
  bottom: styles.posBottom,
};

/** Bandas full-bleed: el marco manda (altura fija) y la foto se acomoda. */
const FIXED_FRAME_LAYOUTS: ReadonlySet<PageImageLayout> = new Set([
  "bleed_cinema",
  "bleed_landscape",
]);

/** Recorte máximo tolerable antes de pasar a modo letterbox (contain + blur). */
const MAX_CROP = 0.18;

const cropBetween = (a: number, b: number) =>
  1 - Math.min(a, b) / Math.max(a, b);

const clampNum = (min: number, value: number, max: number) =>
  Math.min(Math.max(value, min), max);

/**
 * Altura de banda en modo cover. Espejo de las fórmulas clamp() de
 * EditorialImage.module.css (.bleedCinema/.bleedLandscape .frame): la
 * decisión cover/contain debe calcularse siempre contra la geometría cover
 * para no oscilar cuando el modo contain cambia la altura de la banda.
 */
const bleedCoverHeight = (layout: PageImageLayout, vw: number, isMobile: boolean) => {
  if (layout === "bleed_cinema") {
    return isMobile ? clampNum(180, vw * 0.44, 260) : clampNum(200, vw * 0.22, 320);
  }
  return isMobile ? clampNum(200, vw * 0.52, 300) : clampNum(240, vw * 0.3, 420);
};

const readVarNumber = (el: HTMLElement, name: string): number | null => {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Imagen editorial adaptativa.
 *
 * Las fotos del Studio llegan en cualquier proporción (campo, WhatsApp,
 * verticales). Antes el marco imponía proporciones cinema fijas y las fotos
 * perdían hasta un 80% de su contenido. Ahora:
 *
 * 1. Se mide la proporción real de la foto al cargar.
 * 2. Marcos "framed" adoptan esa proporción dentro de una ventana permitida
 *    por layout (definida en CSS vía --ei-min-ar / --ei-max-ar).
 * 3. Si aun así el recorte superaría MAX_CROP (foto vertical en banda ancha),
 *    la foto se muestra completa (contain) sobre un fondo de sí misma
 *    difuminado — nunca se corta.
 */
export default function EditorialImage({
  desktopUrl,
  mobileUrl,
  alt,
  caption,
  layout = "framed_wide",
  objectPosition = "center",
  className,
  kicker,
  title,
  compose,
  mediaSide = "right",
}: EditorialImageProps) {
  const figureRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const arRef = useRef<{ d: number | null; m: number | null }>({ d: null, m: null });
  const [errors, setErrors] = useState<{ d: boolean; m: boolean }>({ d: false, m: false });
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [frameAr, setFrameAr] = useState<number | null>(null);
  // Las bandas full-bleed solo funcionan con fotos panorámicas. Una foto
  // cuadrada o vertical se "demota" a marco editorial (framed) donde luce
  // a su proporción natural en vez de flotar perdida en una banda.
  const [effLayout, setEffLayout] = useState<PageImageLayout>(layout);

  const hasDesktop = Boolean(desktopUrl?.trim());
  const desktop = hasDesktop ? resolvePageMediaUrl(desktopUrl) : "";
  const mobile = resolvePageMediaUrl(mobileUrl || desktopUrl || "");
  const sameSource = mobile === desktop;

  const applyFit = useCallback(() => {
    const figure = figureRef.current;
    const frame = frameRef.current;
    if (!figure || !frame) return;

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const photoAr = isMobile
      ? arRef.current.m ?? arRef.current.d
      : arRef.current.d ?? arRef.current.m;
    if (!photoAr) return;

    // Democión de bandas: cuadradas/verticales pasan a marco editorial.
    let target: PageImageLayout = layout;
    if (FIXED_FRAME_LAYOUTS.has(layout)) {
      if (photoAr < 0.95) target = "framed_square";
      else if (photoAr < 1.55) target = "framed_wide";
    }
    if (target !== effLayout) {
      // El resto se recalcula en el segundo pase, ya con la clase nueva
      // aplicada (las ventanas AR viven en el CSS de cada layout).
      setEffLayout(target);
      return;
    }

    let effectiveAr: number;
    if (FIXED_FRAME_LAYOUTS.has(target)) {
      const rect = frame.getBoundingClientRect();
      if (!rect.width) return;
      effectiveAr = rect.width / bleedCoverHeight(target, window.innerWidth, isMobile);
    } else {
      const minAr = readVarNumber(figure, "--ei-min-ar") ?? 1.2;
      const maxAr = readVarNumber(figure, "--ei-max-ar") ?? 1.9;
      effectiveAr = Math.min(Math.max(photoAr, minAr), maxAr);
      setFrameAr(effectiveAr);
    }

    setFit(cropBetween(photoAr, effectiveAr) > MAX_CROP ? "contain" : "cover");
  }, [layout, effLayout]);

  useEffect(() => {
    // Imágenes servidas desde caché pueden completarse antes de que React
    // enganche onLoad: primar las proporciones al montar.
    const frame = frameRef.current;
    if (frame) {
      const mains = frame.querySelectorAll<HTMLImageElement>("img:not([aria-hidden])");
      mains.forEach((img, i) => {
        if (img.complete && img.naturalWidth && img.naturalHeight) {
          arRef.current[i === 0 ? "d" : "m"] = img.naturalWidth / img.naturalHeight;
        }
      });
      applyFit();
    }

    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => applyFit();
    mq.addEventListener("change", onChange);

    let ro: ResizeObserver | null = null;
    if (FIXED_FRAME_LAYOUTS.has(effLayout) && frameRef.current) {
      let raf = 0;
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(applyFit);
      });
      ro.observe(frameRef.current);
    }
    return () => {
      mq.removeEventListener("change", onChange);
      ro?.disconnect();
    };
  }, [applyFit, effLayout]);

  const handleLoad = useCallback(
    (variant: "d" | "m") => (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      if (!img.naturalWidth || !img.naturalHeight) return;
      arRef.current[variant] = img.naturalWidth / img.naturalHeight;
      applyFit();
    },
    [applyFit],
  );

  const handleError = useCallback(
    (variant: "d" | "m") => () => {
      setErrors((prev) => (prev[variant] ? prev : { ...prev, [variant]: true }));
    },
    [],
  );

  if (!hasDesktop) return null;

  // Ambas fuentes rotas (o la única fuente rota): mejor nada que un marco vacío.
  if (errors.d && (sameSource || errors.m)) return null;

  // Si solo una fuente falla, la otra cubre ambos breakpoints.
  const desktopSrc = errors.d ? mobile : desktop;
  const mobileSrc = errors.m ? desktop : mobile;

  const layoutClass = LAYOUT_CLASS[effLayout] || styles.framedWide;
  const posClass = POSITION_CLASS[objectPosition] || styles.posCenter;

  const autoCompose: NonNullable<EditorialImageProps["compose"]> =
    compose ||
    (layout === "portrait_featured" || layout === "aside_compact"
      ? "solo"
      : layout === "inset_offset" || layout === "framed_wide"
        ? "split"
        : caption || kicker || title
          ? "caption-bar"
          : "solo");

  const hasCopy = Boolean(kicker || title || caption);
  const showSplit = autoCompose === "split" && hasCopy;
  const showBar = autoCompose === "caption-bar" && hasCopy;

  return (
    <figure
      ref={figureRef}
      className={`${styles.figure} ${layoutClass} ${posClass} ${showSplit ? styles.composeSplit : ""} ${showSplit && mediaSide === "left" ? styles.mediaLeft : ""} ${showBar ? styles.composeBar : ""} ${className || ""}`}
      style={frameAr ? ({ "--ei-ar": String(frameAr) } as React.CSSProperties) : undefined}
      data-layout={effLayout}
      data-compose={autoCompose}
      data-fit={fit}
      data-reveal="up"
    >
      {showSplit ? (
        <div className={styles.copyCol}>
          {kicker ? <p className={styles.kicker}>{kicker}</p> : null}
          {title ? <h3 className={styles.copyTitle}>{title}</h3> : null}
          {caption ? <p className={styles.copyText}>{caption}</p> : null}
        </div>
      ) : null}

      <div ref={frameRef} className={styles.frame}>
        {/* Fondo difuminado para modo letterbox (misma imagen, cache hit) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.fill} ${styles.imgDesktop}`}
          src={desktopSrc}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.fill} ${styles.imgMobile}`}
          src={mobileSrc}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.img} ${styles.imgDesktop}`}
          src={desktopSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad("d")}
          onError={handleError("d")}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.img} ${styles.imgMobile}`}
          src={mobileSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad("m")}
          onError={handleError("m")}
        />
        <span className={styles.veil} aria-hidden />
      </div>

      {showBar ? (
        <figcaption className={styles.bar}>
          {kicker ? <span className={styles.kicker}>{kicker}</span> : null}
          {title ? <span className={styles.barTitle}>{title}</span> : null}
          {caption ? <span className={styles.caption}>{caption}</span> : null}
        </figcaption>
      ) : null}

      {!showSplit && !showBar && caption?.trim() ? (
        <figcaption className={styles.caption}>{caption}</figcaption>
      ) : null}
    </figure>
  );
}
