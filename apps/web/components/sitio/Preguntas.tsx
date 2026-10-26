import s from "./sitio.module.css";

export type Pregunta = { p: string; r: string };

/** Preguntas frecuentes en acordeón nativo (`details`): funciona sin JavaScript y con teclado. */
export default function Preguntas({ preguntas }: { preguntas: Pregunta[] }) {
  return (
    <div className={s.preguntas}>
      {preguntas.map((q, i) => (
        <details key={q.p} className={s.pregunta} open={i === 0}>
          <summary>
            {q.p}
            <svg className={s.preguntaMas} viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2v12M2 8h12" />
            </svg>
          </summary>
          <p>{q.r}</p>
        </details>
      ))}
    </div>
  );
}
