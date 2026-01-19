'use client';

import { useRef } from 'react';
import Image from 'next/image';
import styles from '../page.module.css';

export default function CertificationsCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  const certifications = [1, 2, 3, 4, 5, 6, 7, 8];
  const duplicatedCerts = [...certifications, ...certifications];

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
        <div className={styles.carouselTrack} ref={trackRef}>
          {duplicatedCerts.map((num, idx) => (
            <div key={`${num}-${idx}`} className={styles.carouselSlide}>
              <Image
                src={`/certificaciones/certificaciones-0${num}.png`}
                alt={`Certificación ${num}`}
                width={200}
                height={200}
                className={styles.certificationImage}
                priority={num <= 4}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
