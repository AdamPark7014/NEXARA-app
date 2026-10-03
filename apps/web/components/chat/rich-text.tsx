import type { ReactNode } from "react";
import styles from "../WorkspaceChat.module.css";

/**
 * Formato en línea del mensaje: menciones `[@Nombre](user:ID)`, pastillas de entidad
 * `[AN-0015 · …](/erp/…)`, enlaces `[texto](https://…)`, `**negrita**`, `*negrita*`, `_cursiva_`,
 * `~~tachado~~`, `` `código` ``, direcciones sueltas y `@palabra`.
 */
export function renderRichText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /(\[[^\]\n]+\]\((?:\/[^)\s]*|user:\d+|https?:\/\/[^)\s]+)\)|`[^`]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|~~[^~\n]+~~|_[^_\s][^_\n]*_|https?:\/\/[^\s]+|@[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9._-]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const entityLink = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (entityLink) {
      const [, label, href] = entityLink;
      if (href.startsWith("user:")) {
        nodes.push(
          <span key={key++} className={styles.mention}>
            {label}
          </span>,
        );
      } else if (/^https?:\/\//.test(href)) {
        nodes.push(
          <a key={key++} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>,
        );
      } else if (/^\/(?![/\\])/.test(href)) {
        nodes.push(
          <a key={key++} href={href} className={`${styles.mention} ${styles.entityMention}`}>
            {label}
          </a>,
        );
      } else {
        nodes.push(label);
      }
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      nodes.push(<s key={key++}>{token.slice(2, -2)}</s>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<strong key={key++}>{token.slice(1, -1)}</strong>);
    } else if (token.startsWith("_") && token.endsWith("_")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("http")) {
      nodes.push(
        <a key={key++} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>,
      );
    } else {
      nodes.push(
        <span key={key++} className={styles.mention}>
          {token}
        </span>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BLOQUE = /(^|\n)(```|> ?|[-*•] |\d+[.)] )/;
const CITA = /^> ?/;
const VIÑETA = /^[-*•] /;
const NUMERO = /^(\d+)[.)] /;

/**
 * Cuerpo del mensaje con bloques: listas, citas y bloques de código, además del formato en línea.
 * Un mensaje sin bloques se pinta exactamente como antes (`renderRichText` sobre el texto).
 */
export function renderMessageBody(text: string): ReactNode[] {
  if (!BLOQUE.test(text)) return renderRichText(text);
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let parrafo: string[] = [];
  let key = 0;

  const cerrarParrafo = () => {
    if (!parrafo.length) return;
    out.push(
      <span key={key++} className={styles.mdPara}>
        {renderRichText(parrafo.join("\n"))}
      </span>,
    );
    parrafo = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trimStart().startsWith("```")) {
      cerrarParrafo();
      const codigo: string[] = [];
      const resto = line.trimStart().slice(3);
      if (resto.trim() && !resto.trim().endsWith("```")) codigo.push(resto);
      let j = i + 1;
      while (j < lines.length && !lines[j]!.trimStart().startsWith("```")) {
        codigo.push(lines[j]!);
        j++;
      }
      out.push(
        <pre key={key++} className={styles.mdCodeBlock}>
          <code>{codigo.join("\n")}</code>
        </pre>,
      );
      i = j;
      continue;
    }
    if (CITA.test(line)) {
      cerrarParrafo();
      const cita: string[] = [];
      while (i < lines.length && CITA.test(lines[i]!)) {
        cita.push(lines[i]!.replace(CITA, ""));
        i++;
      }
      i--;
      out.push(
        <blockquote key={key++} className={styles.mdQuote}>
          {renderRichText(cita.join("\n"))}
        </blockquote>,
      );
      continue;
    }
    if (VIÑETA.test(line)) {
      cerrarParrafo();
      const items: string[] = [];
      while (i < lines.length && VIÑETA.test(lines[i]!)) {
        items.push(lines[i]!.replace(VIÑETA, ""));
        i++;
      }
      i--;
      out.push(
        <ul key={key++} className={styles.mdList}>
          {items.map((it, n) => (
            <li key={n}>{renderRichText(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    const num = line.match(NUMERO);
    if (num) {
      cerrarParrafo();
      const items: string[] = [];
      while (i < lines.length && NUMERO.test(lines[i]!)) {
        items.push(lines[i]!.replace(NUMERO, ""));
        i++;
      }
      i--;
      out.push(
        <ol key={key++} className={styles.mdList} start={Number(num[1]) || 1}>
          {items.map((it, n) => (
            <li key={n}>{renderRichText(it)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    parrafo.push(line);
  }
  cerrarParrafo();
  return out;
}

/** Resalta cada aparición de `q` (sin distinguir mayúsculas ni acentos) con `<mark>`. */
export function highlightMatches(text: string, q: string): ReactNode[] {
  const needle = q.trim();
  if (!needle) return [text];
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Plegar acentos con NFD conserva la longitud por carácter base solo si se pliega carácter a
  // carácter; así los índices del texto plegado sirven para cortar el original.
  const folded = Array.from(text, (ch) => fold(ch) || ch).join("");
  const target = fold(needle);
  const out: ReactNode[] = [];
  let from = 0;
  let key = 0;
  if (folded.length !== text.length) return [text];
  for (;;) {
    const at = folded.indexOf(target, from);
    if (at < 0) break;
    if (at > from) out.push(text.slice(from, at));
    out.push(
      <mark key={key++} className={styles.searchMark}>
        {text.slice(at, at + target.length)}
      </mark>,
    );
    from = at + target.length;
  }
  if (from < text.length) out.push(text.slice(from));
  return out.length ? out : [text];
}
