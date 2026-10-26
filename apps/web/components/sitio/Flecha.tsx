import s from "./sitio.module.css";

/** Chevrón que se vuelve flecha al pasar el cursor sobre el botón, enlace o tarjeta que lo contiene. */
export default function Flecha() {
  return (
    <svg className={s.flecha} viewBox="0 0 10 10" aria-hidden="true">
      <path className={s.flechaLinea} d="M0 5h8" />
      <path className={s.flechaPunta} d="M2 1l4 4-4 4" />
    </svg>
  );
}
