"use client";

/**
 * Link que respeta subdominios canónicos: mismo panel → Next `<Link>`;
 * otro panel → `<a>` con `buildCrossPanelUrl` + handoff de sesión.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type AnchorHTMLAttributes,
  type ReactNode,
  useMemo,
} from "react";
import { useUser } from "@/components/UserContext";
import {
  detectCurrentPanelId,
  isCrossPanelHref,
  panelIdFromInternalPath,
  resolveCrossPanelHref,
} from "@/lib/cross-panel-handoff";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
  /** Forzar panel actual (p.ej. desde AppShell). Si omite, se detecta. */
  currentPanel?: string | null;
};

export default function CrossPanelLink({
  href,
  children,
  currentPanel: currentPanelProp,
  ...rest
}: Props) {
  const { user } = useUser();
  const pathname = usePathname();

  const resolved = useMemo(() => {
    const current =
      (currentPanelProp as ReturnType<typeof detectCurrentPanelId>) ??
      detectCurrentPanelId(pathname);
    const userJson = user ? JSON.stringify(user) : null;
    const cross = isCrossPanelHref(href, current);
    const url = cross
      ? resolveCrossPanelHref(href, userJson, current)
      : href.startsWith("/") && panelIdFromInternalPath(href)
        ? resolveCrossPanelHref(href, null, current)
        : href;
    return { cross, url };
  }, [href, user, pathname, currentPanelProp]);

  if (resolved.cross || resolved.url.startsWith("http")) {
    return (
      <a href={resolved.url} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <Link href={resolved.url} {...rest}>
      {children}
    </Link>
  );
}
