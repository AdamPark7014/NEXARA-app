"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BottomNav.module.css";
import type { HapticIntent } from "@/lib/haptics";
import { hapticTap } from "@/lib/haptics";

export interface BottomNavItem {
  icon: string;
  label: string;
  href?: string;
  onPress?: () => void;
  matchPrefix?: string;
  hapticIntent?: HapticIntent;
  active?: boolean;
}

interface BottomNavProps {
  items: BottomNavItem[];
}

export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname();

  const handlePress = async (intent: HapticIntent = "light", cb?: () => void) => {
    await hapticTap(intent);
    cb?.();
  };

  const isActive = (item: BottomNavItem) => {
    if (typeof item.active === "boolean") return item.active;
    if (!item.href || !pathname) return false;
    const match = item.matchPrefix || item.href;
    return pathname === match || pathname.startsWith(`${match}/`);
  };

  return (
    <nav className={styles.bottomNav} aria-label="Navegación principal">
      {items.map((item) => {
        const active = isActive(item);

        if (item.onPress) {
          return (
            <button
              key={item.label}
              type="button"
              className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              onClick={() => {
                void handlePress(item.hapticIntent || "medium", item.onPress);
              }}
              aria-label={item.label}
            >
              <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href!}
            className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              void handlePress(item.hapticIntent || "selection");
            }}
          >
            <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
