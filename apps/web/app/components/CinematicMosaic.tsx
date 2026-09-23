import styles from "./CinematicMosaic.module.css";

type Tile = {
  src: string;
  alt: string;
  badge?: string;
};

type Props = {
  left: Tile;
  topRight: Tile;
  bottomRight: Tile;
  className?: string;
};

export default function CinematicMosaic({ left, topRight, bottomRight, className }: Props) {
  return (
    <div className={`${styles.mosaic} ${className || ""}`} data-reveal="up">
      <div className={styles.grid}>
        <figure className={styles.leftTall}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.img} src={left.src} alt={left.alt} loading="lazy" decoding="async" />
          {left.badge ? <figcaption className={styles.badge}>{left.badge}</figcaption> : null}
        </figure>
        <div className={styles.rightCol}>
          <figure className={`${styles.tile} ${styles.tileWide}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.img} src={topRight.src} alt={topRight.alt} loading="lazy" decoding="async" />
            {topRight.badge ? <figcaption className={styles.badge}>{topRight.badge}</figcaption> : null}
          </figure>
          <figure className={`${styles.tile} ${styles.tileSquare}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.img} src={bottomRight.src} alt={bottomRight.alt} loading="lazy" decoding="async" />
            {bottomRight.badge ? <figcaption className={styles.badge}>{bottomRight.badge}</figcaption> : null}
          </figure>
        </div>
      </div>
    </div>
  );
}

