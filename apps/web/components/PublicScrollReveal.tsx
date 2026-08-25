"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type RevealEl = HTMLElement & {
  dataset: {
    reveal?: string;
    revealOnce?: string;
    revealDelay?: string;
    revealSkip?: string;
  };
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export default function PublicScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    let io: IntersectionObserver | null = null;
    let mo: MutationObserver | null = null;
    let cancelled = false;

    const setup = () => {
      if (cancelled) return;
      const elements = Array.from(document.querySelectorAll<RevealEl>("[data-reveal]"));

      if (prefersReduced) {
        // Keep everything visible and skip transitions.
        for (const el of elements) el.classList.add("reveal-visible");
        // Contenido que llegue después (páginas async) también queda visible.
        mo = new MutationObserver(() => {
          for (const el of document.querySelectorAll<RevealEl>("[data-reveal]:not(.reveal-visible)")) {
            el.classList.add("reveal-visible");
          }
        });
        mo.observe(document.body, { childList: true, subtree: true });
        return;
      }

      // Mark above-the-fold elements as visible and skip their reveal transitions,
      // so initial viewport content is crisp (no blur/opacity 0 flash).
      const vh = window.innerHeight || 0;
      const vw = window.innerWidth || 0;
      const isInViewportNow = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return r.bottom >= 0 && r.right >= 0 && r.top <= vh && r.left <= vw;
      };

      for (const el of elements) {
        if (isInViewportNow(el)) {
          el.classList.add("reveal-visible");
          el.dataset.revealSkip = "true";
        }
      }

      document.documentElement.classList.add("reveal-ready");
      window.requestAnimationFrame(() => {
        for (const el of elements) {
          if (el.dataset.revealSkip) delete el.dataset.revealSkip;
        }
      });

      for (const group of Array.from(document.querySelectorAll<HTMLElement>("[data-reveal-stagger]"))) {
        const groupItems = Array.from(group.querySelectorAll<RevealEl>("[data-reveal]"));
        groupItems.forEach((el, idx) => {
          if (el.dataset.revealDelay) return;
          const delay = clamp(idx * 45, 0, 240);
          el.style.setProperty("--reveal-delay", `${delay}ms`);
        });
      }

      io?.disconnect();
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const el = entry.target as RevealEl;
            if (!entry.isIntersecting) continue;
            el.classList.add("reveal-visible");
            const once = (el.dataset.revealOnce ?? "true") !== "false";
            if (once) io?.unobserve(el);
          }
        },
        { threshold: 0.05, rootMargin: "0px 0px -5% 0px" }
      );

      for (const el of elements) {
        io.observe(el);
      }

      // Las páginas públicas son async (fetch de Studio en el server): en
      // navegación cliente sus nodos [data-reveal] montan DESPUÉS de este
      // setup y quedarían invisibles hasta un refresh. Observamos el DOM y
      // registramos lo que vaya llegando.
      const observeLate = (root: ParentNode) => {
        for (const el of Array.from(root.querySelectorAll<RevealEl>("[data-reveal]:not(.reveal-visible)"))) {
          io?.observe(el);
        }
      };
      mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.matches?.("[data-reveal]") && !node.classList.contains("reveal-visible")) {
              io?.observe(node);
            }
            observeLate(node);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    };

    // Delay setup so route content is in the DOM.
    let raf2: number | null = null;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(setup);
    });

    return () => {
      cancelled = true;
      io?.disconnect();
      mo?.disconnect();
      window.cancelAnimationFrame(raf1);
      if (typeof raf2 === "number") window.cancelAnimationFrame(raf2);
    };
  }, [pathname]);

  return null;
}

