/**
 * NEXARA · Base de la interfaz de paneles (sistema visual v2).
 *
 * Tokens: `app/ui-tokens.scss` (`--ui-*`, claro y `body.dark`).
 * Piezas: encabezado de página, pestañas, botones, insignias y estado, tipo de trabajo,
 * avance, tarjeta, cifras, control segmentado, barra de filtros, buscador, campos de
 * formulario, sección y pie de formulario, vacío, esqueletos, aviso, avatar, ventanita
 * de ayuda y las clases de la tabla de datos (`tabla`).
 *
 * Plantillas de página (Etapa 4): `ModulePage` (lista de un módulo), `FormPage`
 * (alta / edición) y `RecordPage` (ficha de un registro), con sus piezas, y la
 * `DataTable` v2 con acciones por fila, selección y celdas de persona, avance,
 * estado y hora. Cada plantilla trae su ejemplo de uso en el comentario de cabecera.
 */
export {
  FilterButton,
  FilterChip,
  FilterChips,
  ListFooter,
  ModulePage,
  ModuleToolbar,
  Pager,
  ViewSwitch,
  type ModuleEmpty,
  type ModulePageProps,
  type ViewId,
} from "./ModulePage";
export { FormPage, PendingList, RequiredMark, SavedStatus, focusField, type FormPageProps, type PendingItem } from "./FormPage";
export {
  AsideCard,
  EvidenceGallery,
  EvidencePhoto,
  EvidenceSlot,
  KeyFacts,
  RecordPage,
  RecordSection,
  Stepper,
  Timeline,
  TimelineItem,
  type RecordFact,
  type RecordMetaItem,
  type RecordPageProps,
  type RecordPerson,
  type RecordStep,
  type RecordStepState,
  type TimelineState,
} from "./RecordPage";
export {
  default as DataTable,
  PersonCell,
  ProgressCell,
  SelectionBar,
  StatusCell,
  WhenCell,
  type Column,
  type RowKey,
  type SelectionContext,
} from "../ui/DataTable";
export { PageHead, Tabs, type PageHeadCrumb, type TabItem } from "./PageHead";
export { Button, ButtonLink, Kbd, LinkButton, buttonClass, type ButtonProps, type ButtonSize, type ButtonVariant } from "./Button";
export {
  Badge,
  Card,
  CardHead,
  Kind,
  Progress,
  Segmented,
  Stat,
  StatRow,
  StatusBadge,
  TONE_COLOR,
  type KindId,
  type SegmentItem,
  type Semaforo,
  type StatMeterSegment,
  type StatTone,
  type StatTrend,
  type Tone,
} from "./piezas";
export { STATUS_TONE_RULES, statusTone } from "./estado-tono";
export {
  Alert,
  Avatar,
  EmptyState,
  InfoPopover,
  SearchInput,
  Skeleton,
  SkeletonRows,
  Toolbar,
  fieldClass,
  type AlertTone,
  type EmptyStateTone,
  type Presence,
} from "./estados";
export {
  Checkbox,
  DateInput,
  Field,
  FieldGrid,
  FormFooter,
  FormSection,
  Input,
  Select,
  Switch,
  Textarea,
  type ControlSize,
  type InputProps,
  type SelectProps,
  type TextareaProps,
} from "./campos";
export { default as tabla } from "./tabla.module.css";
