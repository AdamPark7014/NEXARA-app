/**
 * NEXARA · Base de la interfaz de paneles (dirección «Minimalista»).
 *
 * Tokens: `app/ui-tokens.scss` (`--ui-*`, claro y `body.dark`).
 * Piezas: encabezado de página, pestañas, botones, insignias, tarjeta, cifras,
 * control segmentado, barra de filtros, buscador, vacío, esqueletos, aviso, avatar,
 * ventanita de ayuda y las clases de la tabla de datos (`tabla`).
 */
export { PageHead, Tabs, type TabItem } from "./PageHead";
export { Button, ButtonLink, Kbd, LinkButton, buttonClass, type ButtonVariant } from "./Button";
export { Badge, Card, CardHead, Segmented, Stat, StatRow, TONE_COLOR, type SegmentItem, type Tone } from "./piezas";
export { Alert, Avatar, EmptyState, InfoPopover, SearchInput, Skeleton, SkeletonRows, Toolbar, fieldClass } from "./estados";
export { default as tabla } from "./tabla.module.css";
