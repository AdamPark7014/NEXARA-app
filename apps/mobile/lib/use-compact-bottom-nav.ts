"use client";

import { useEffect, useState } from "react";

/** Por debajo de este ancho se muestra la barra inferior tipo WhatsApp; por encima los accesos van al sidebar / drawer. */
export const COMPACT_BOTTOM_NAV_MAX_WIDTH_PX = 640;

export function useCompactBottomNav(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const update = () => setCompact(window.innerWidth <= COMPACT_BOTTOM_NAV_MAX_WIDTH_PX);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return compact;
}
