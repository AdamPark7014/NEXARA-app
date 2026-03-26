"use client";

import { usePathname } from "next/navigation";
import styles from "./PageTransition.module.css";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className={styles.pageTransition}>
      {children}
    </div>
  );
}
