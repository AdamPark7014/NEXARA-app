'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import styles from '../page.module.css';

export default function BrandsCarousel() {
  const trackRef1 = useRef<HTMLDivElement>(null);
  const trackRef2 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const createMarquee = (
      track: HTMLDivElement | null,
      duplicatedGroups: number,
      speedPxPerSecond: number,
      direction: 1 | -1,
      initialOffset = 0,
    ) => {
      if (!track) return () => undefined;

      let frameId = 0;
      let loopWidth = 0;
      let position = initialOffset;
      let lastTimestamp = performance.now();

      const updateLoopWidth = () => {
        loopWidth = track.scrollWidth / duplicatedGroups;
        if (loopWidth > 0) {
          position = ((position % loopWidth) + loopWidth) % loopWidth;
        }
      };

      updateLoopWidth();

      const resizeObserver = new ResizeObserver(() => {
        updateLoopWidth();
      });
      resizeObserver.observe(track);

      const animate = (timestamp: number) => {
        const deltaSeconds = (timestamp - lastTimestamp) / 1000;
        lastTimestamp = timestamp;

        if (loopWidth > 0) {
          position += direction * speedPxPerSecond * deltaSeconds;
          position = ((position % loopWidth) + loopWidth) % loopWidth;
          track.style.transform = `translate3d(${-position}px, 0, 0)`;
        }

        frameId = window.requestAnimationFrame(animate);
      };

      frameId = window.requestAnimationFrame(animate);

      return () => {
        window.cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
        track.style.transform = '';
      };
    };

    const stopRow1 = createMarquee(trackRef1.current, 2, 34, 1, 0);
    const stopRow2 = createMarquee(trackRef2.current, 2, 34, -1, 180);

    return () => {
      stopRow1();
      stopRow2();
    };
  }, []);

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
        <div className={styles.brandsCarouselTrack} ref={trackRef1} style={{ animation: 'none' }}>
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
        <div className={`${styles.brandsCarouselTrack} ${styles.brandsCarouselTrackReverse}`} ref={trackRef2} style={{ animation: 'none' }}>
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
