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

/**
 * Imagen editorial: bordes suaves + composición armónica con texto.
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
}: EditorialImageProps) {
  if (!desktopUrl?.trim()) return null;

  const desktop = resolvePageMediaUrl(desktopUrl);
  const mobile = resolvePageMediaUrl(mobileUrl || desktopUrl);
  const layoutClass = LAYOUT_CLASS[layout] || styles.framedWide;
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
      className={`${styles.figure} ${layoutClass} ${posClass} ${showSplit ? styles.composeSplit : ""} ${showBar ? styles.composeBar : ""} ${className || ""}`}
      data-layout={layout}
      data-compose={autoCompose}
      data-reveal="up"
    >
      {showSplit ? (
        <div className={styles.copyCol}>
          {kicker ? <p className={styles.kicker}>{kicker}</p> : null}
          {title ? <h3 className={styles.copyTitle}>{title}</h3> : null}
          {caption ? <p className={styles.copyText}>{caption}</p> : null}
        </div>
      ) : null}

      <div className={styles.frame}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.img} ${styles.imgDesktop}`}
          src={desktop}
          alt={alt}
          loading="lazy"
          decoding="async"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`${styles.img} ${styles.imgMobile}`}
          src={mobile}
          alt={alt}
          loading="lazy"
          decoding="async"
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
