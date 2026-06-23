'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import styles from '../page.module.css';

export default function CertificationsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    let frameId = 0;
    let loopWidth = 0;
    let position = 0;
    let lastTimestamp = performance.now();
    const speedPxPerSecond = 34;

    const updateLoopWidth = () => {
      loopWidth = track.scrollWidth / 3;
    };

    updateLoopWidth();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        updateLoopWidth();
        if (loopWidth > 0) {
          position = position % loopWidth;
        }
      });
      resizeObserver.observe(track);
    }

    const animate = (timestamp: number) => {
      const deltaSeconds = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      if (loopWidth > 0) {
        position = (position + speedPxPerSecond * deltaSeconds) % loopWidth;
        track.style.transform = `translate3d(${-position}px, 0, 0)`;
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      track.style.transform = '';
    };
  }, []);

  const certifications = [
    { id: 1, file: 'certificaciones-01.png', alt: 'Linksys' },
    { id: 2, file: 'certificaciones-02.png', alt: 'Belden' },
    { id: 3, file: 'certificaciones-03.png', alt: 'Intellinet' },
    { id: 4, file: 'certificaciones-04.png', alt: 'Lenovo SEG Silver Partner' },
    { id: 5, file: 'certificaciones-04.1.png.webp', alt: 'Lenovo SEG Authorized Solutions' },
    { id: 6, file: 'certificaciones-05.png.jpeg', alt: 'Grandstream' },
    { id: 7, file: 'certificaciones-06.png', alt: 'HikVision' },
    { id: 8, file: 'certificaciones-07.png', alt: 'Sophos' },
    { id: 9, file: 'certificaciones-08.png', alt: 'Mimosa' },
    { id: 10, file: 'certificaciones-09.png.jpeg', alt: 'Jalala' },
  ];
  const duplicatedCerts = [...certifications, ...certifications, ...certifications];

  return (
    <section className={styles.certificationsSection}>
      <div className={styles.certificationsHeader}>
        <div className={styles.certificationsBadge}>NUESTRAS CREDENCIALES</div>
        <h2 className={styles.certificationsTitle}>Certificaciones y Acreditaciones</h2>
        <p className={styles.certificationsDescription}>
          Contamos con las más rigurosas certificaciones y acreditaciones que avalan nuestra excelencia en el servicio.
        </p>
      </div>

      <div className={styles.carouselContainer}>
        <div className={styles.carouselTrack} ref={trackRef} style={{ animation: 'none' }}>
          {duplicatedCerts.map((cert, idx) => (
            <div key={`${cert.id}-${idx}`} className={styles.carouselSlide}>
              <Image
                src={`/certificaciones/${cert.file}`}
                alt={cert.alt}
                width={200}
                height={200}
                className={styles.certificationImage}
                priority={cert.id <= 4}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
