"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  src: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  width?: number;
  height?: number;
};

function isProtectedUpload(src: string): boolean {
  return src.startsWith("/uploads/") || src.startsWith("/api/uploads/");
}

export default function SessionImage({ src, alt = "", className, style, width, height }: Props) {
  const [displaySrc, setDisplaySrc] = useState(() => (isProtectedUpload(src) ? "" : src));
  const blobRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const revoke = () => {
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };

    if (!src) {
      revoke();
      setDisplaySrc("");
      return;
    }

    if (!isProtectedUpload(src)) {
      revoke();
      setDisplaySrc(src);
      return;
    }

    setDisplaySrc("");
    void (async () => {
      try {
        const res = await fetch(src, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        revoke();
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setDisplaySrc(url);
      } catch {
        if (!cancelled) setDisplaySrc("");
      }
    })();

    return () => {
      cancelled = true;
      revoke();
    };
  }, [src]);

  if (!displaySrc) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={displaySrc} alt={alt} className={className} style={style} width={width} height={height} />
  );
}