/**
 * NexaraMark — isotipo hexagonal neón del sitio público.
 * SVG original: hexágono de circuito en trazo cian con una "N" en cinta
 * naranja→morado atravesándolo. Se usa en el Header y como favicon-hero
 * decorativo; el wordmark "NEXARA" se compone aparte en texto.
 */
export default function NexaraMark({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="nxMarkHex" x1="4" y1="6" x2="60" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2dd8f2" />
          <stop offset="100%" stopColor="#12b6d4" />
        </linearGradient>
        <linearGradient id="nxMarkRibbon" x1="14" y1="46" x2="50" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff9d3c" />
          <stop offset="55%" stopColor="#ff5fa2" />
          <stop offset="100%" stopColor="#b06bff" />
        </linearGradient>
        <filter id="nxMarkGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <polygon
        points="32,3 58,17.5 58,46.5 32,61 6,46.5 6,17.5"
        fill="rgba(45,216,242,0.06)"
        stroke="url(#nxMarkHex)"
        strokeWidth="2.4"
        filter="url(#nxMarkGlow)"
      />

      <path
        d="M19 42 L19 22 L27 22 L38 38 L38 22 L45 22 L45 42 L37 42 L26 26 L26 42 Z"
        fill="url(#nxMarkRibbon)"
        filter="url(#nxMarkGlow)"
      />
    </svg>
  );
}
