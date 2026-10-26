import s from "./sitio.module.css";

/** Degradado vivo con los colores del isotipo (manchas desenfocadas que derivan despacio). */
export default function Aurora({ className }: { className?: string }) {
  return (
    <div className={`${s.aurora} ${className ?? ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
