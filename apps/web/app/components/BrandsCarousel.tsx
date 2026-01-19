'use client';

import { useRef } from 'react';
import Image from 'next/image';
import styles from '../page.module.css';

export default function BrandsCarousel() {
  const trackRef1 = useRef<HTMLDivElement>(null);
  const trackRef2 = useRef<HTMLDivElement>(null);

  // Primera fila: marcas 1-18
  const brandsRow1 = Array.from({ length: 18 }, (_, i) => i + 1);
  const duplicatedRow1 = [...brandsRow1, ...brandsRow1];

  // Segunda fila: marcas 19-36
  const brandsRow2 = Array.from({ length: 18 }, (_, i) => i + 19);
  const duplicatedRow2 = [...brandsRow2, ...brandsRow2];

  return (
    <section className={styles.brandsSection}>
      <div className={styles.brandsHeader}>
        <div className={styles.brandsBadge}>NUESTROS ALIADOS</div>
        <h2 className={styles.brandsTitle}>Marcas Líderes</h2>
        <p className={styles.brandsDescription}>
          Trabajamos con las marcas más reconocidas a nivel mundial para ofrecerte productos de la más alta calidad y confiabilidad.
        </p>
      </div>

      {/* Primera fila */}
      <div className={styles.brandsCarouselContainer}>
        <div className={styles.brandsCarouselTrack} ref={trackRef1}>
          {duplicatedRow1.map((num, idx) => (
            <div key={`row1-${num}-${idx}`} className={styles.brandsCarouselSlide}>
              <Image
                src={`/marcas/marcas-${String(num).padStart(2, '0')}.png`}
                alt={`Marca ${num}`}
                width={180}
                height={120}
                className={styles.brandImage}
                priority={num <= 9}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Segunda fila */}
      <div className={styles.brandsCarouselContainer}>
        <div className={`${styles.brandsCarouselTrack} ${styles.brandsCarouselTrackReverse}`} ref={trackRef2}>
          {duplicatedRow2.map((num, idx) => (
            <div key={`row2-${num}-${idx}`} className={styles.brandsCarouselSlide}>
              <Image
                src={`/marcas/marcas-${String(num).padStart(2, '0')}.png`}
                alt={`Marca ${num}`}
                width={180}
                height={120}
                className={styles.brandImage}
                priority={num <= 27}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
