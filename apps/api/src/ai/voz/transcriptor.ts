/**
 * Voz a texto con nuestro propio servidor (whisper.cpp en el contenedor `transcriptor`).
 *
 * Nada sale de nuestra red: el audio va del API al transcriptor por la red interna de
 * Docker y no hay proveedor ni clave de por medio. Aquí solo va la lógica pura; la llamada
 * HTTP vive en `TranscriptorService`.
 */

/** Marcas que whisper escribe sobre ruido o música: `[Noticias]`, `[BLANK_AUDIO]`, `(música)`… */
const MARCAS_SIN_VOZ =
  /\[[^\]\n]{1,40}\]|\((?:m[uú]sica|silencio|inaudible|ruido|aplausos|risas?|sonido|tos)[^)]{0,30}\)|\*(?:m[uú]sica|silencio|ruido)[^*]{0,30}\*/gi;

/**
 * Frases que whisper inventa sobre silencio o ruido: vienen de los subtítulos de videos con que se
 * entrenó («nos vemos en el próximo vídeo», «suscríbete», «subtítulos por…»). Se quita la oración.
 */
const ORACION_INVENTADA =
  /pr[oó]ximo v[ií]deo|suscr[ií]b|subt[ií]tul|amara\.org|gracias por (?:ver|mirar)|dale (?:like|me gusta)|campanita|^¡?hasta la pr[oó]xima[.!¡]*$/i;

/** Una parte que solo dice esto es ruido (whisper lo pone en silencios). */
const SOLO_RUIDO = new Set(['gracias', 'muchas gracias', 'gracias a todos', 'eh', 'mmm']);

const ES = new Set(
  'de la que el en y a los se del las un por con no una su para es al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros vamos pues bueno aqui ahi entonces tenemos tiene ver hacer'.split(
    ' ',
  ),
);
const EN = new Set(
  'the of and to in is you that it for on with this was are be as at have what we i they he she not but or from by his her them their there were been has had will would can could about which when your our one an all if so do'.split(
    ' ',
  ),
);

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const palabrasDe = (s: string) => sinAcentos(s.toLowerCase()).match(/[a-zñ0-9]+/g) ?? [];

/** ¿La oración está en inglés? (whisper a veces cambia de idioma con audio malo). */
export function esIngles(oracion: string): boolean {
  const p = palabrasDe(oracion);
  if (p.length < 4) return false;
  const en = p.filter((w) => EN.has(w)).length;
  const es = p.filter((w) => ES.has(w)).length;
  return en >= 2 && en > es;
}

/**
 * Quita los bucles: una frase de 3 a 15 palabras repetida 3 veces o más seguidas (o una o dos
 * palabras repetidas 4 veces) se queda una vez. Opera sobre palabras conservando la puntuación.
 */
export function quitarBucles(texto: string): string {
  let tokens = texto.split(/(\s+)/).filter((t) => t !== '');
  const palabras = () => tokens.map((t, i) => ({ t, i })).filter((x) => !/^\s+$/.test(x.t));
  let cambio = true;
  let vueltas = 0;
  while (cambio && vueltas++ < 20) {
    cambio = false;
    const ps = palabras();
    const norm = ps.map((x) => sinAcentos(x.t.toLowerCase()).replace(/[^a-zñ0-9]/g, ''));
    for (let k = 1; k <= 15 && !cambio; k++) {
      const minimo = k <= 2 ? 4 : 3;
      for (let i = 0; i + k * minimo <= ps.length; i++) {
        let veces = 1;
        while (i + (veces + 1) * k <= ps.length) {
          let igual = true;
          for (let j = 0; j < k; j++) {
            if (!norm[i + j] || norm[i + j] !== norm[i + veces * k + j]) {
              igual = false;
              break;
            }
          }
          if (!igual) break;
          veces++;
        }
        if (veces >= minimo) {
          // Se borra desde la segunda repetición hasta el final de la última (con sus espacios).
          const desde = ps[i + k - 1].i + 1;
          const hasta = ps[i + veces * k - 1].i;
          tokens = [...tokens.slice(0, desde), ...tokens.slice(hasta + 1)];
          cambio = true;
          break;
        }
      }
    }
  }
  return tokens.join('');
}

/** n-gramas de 5 palabras de una oración. */
function ngramas(oracion: string, n = 5): string[] {
  const p = palabrasDe(oracion);
  const salida: string[] = [];
  for (let i = 0; i + n <= p.length; i++) salida.push(p.slice(i, i + n).join(' '));
  return salida;
}

/** Deja solo lo dicho: sin marcas, frases inventadas, bucles, líneas en otro idioma ni espacios de sobra. */
export function limpiarTextoWhisper(texto: string): string {
  const crudo = String(texto ?? '').replace(MARCAS_SIN_VOZ, ' ');
  const lineas: string[] = [];
  const vistos = new Map<string, number>();
  let ultima = '';
  for (const linea of crudo.split(/\n+/)) {
    // Oraciones (se conserva la puntuación final).
    const oraciones = linea
      .split(/(?<=[.!?])\s+/)
      .map((o) => o.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .filter((o) => !ORACION_INVENTADA.test(o) && !esIngles(o))
      .filter((o) => {
        // La misma idea repetida con variaciones (bucle): una oración que repite un 5-grama ya
        // visto dos veces en esta parte se descarta.
        const g = ngramas(o);
        const repetida = g.some((x) => (vistos.get(x) ?? 0) >= 2);
        for (const x of new Set(g)) vistos.set(x, (vistos.get(x) ?? 0) + 1);
        return !repetida;
      });
    const limpia = quitarBucles(oraciones.join(' ')).trim();
    const clave = palabrasDe(limpia).join(' ');
    if (!limpia || clave === ultima) continue; // línea vacía o igual a la anterior
    ultima = clave;
    lineas.push(limpia);
  }
  const salida = lineas.join('\n').trim();
  return SOLO_RUIDO.has(palabrasDe(salida).join(' ')) ? '' : salida;
}

/**
 * Vocabulario de la empresa para whisper: con él escribe bien marcas, siglas y clientes que
 * sin contexto confunde («Hikvision», «NVR», «IPADE»). Corto a propósito: un prompt largo
 * hace que whisper lo repita sobre los silencios. `TRANSCRIPTOR_PROMPT` lo reemplaza.
 */
export const PROMPT_TRANSCRIPTOR =
  'Junta de trabajo de NEXARA, integrador de seguridad en México. Se habla de actividades, ' +
  'cotizaciones, clientes y sucursales: CCTV, cámaras Hikvision, NVR, DVR, control de acceso, ' +
  'cableado, fibra, Syscom, Banorte, IPADE, Integra.';

/** whisper admite ~224 tokens de prompt; en español ~3.2 caracteres por token. */
const MAX_PROMPT = 700;
const MAX_NOMBRES = 240;
const PALABRAS_ANTERIOR = 30;

/**
 * Prompt de whisper: vocabulario fijo, nombres de la empresa (personas y clientes, para que los
 * escriba bien) y, en una grabación, el final de lo que se dijo en la parte anterior (continuidad
 * entre partes de 30 s). Recortado para no pasar del límite de whisper.
 */
export function promptTranscriptor(
  env: NodeJS.ProcessEnv = process.env,
  extra: { nombres?: string[]; anterior?: string | null } = {},
): string {
  const base = (env.TRANSCRIPTOR_PROMPT || '').trim() || PROMPT_TRANSCRIPTOR;
  const partes = [base];
  const nombres: string[] = [];
  let largo = 0;
  for (const n of [...new Set((extra.nombres ?? []).map((x) => x.trim()).filter(Boolean))]) {
    if (largo + n.length + 2 > MAX_NOMBRES) break;
    nombres.push(n);
    largo += n.length + 2;
  }
  if (nombres.length) partes.push(`${nombres.join(', ')}.`);
  const anterior = (extra.anterior ?? '').split(/\s+/).filter(Boolean).slice(-PALABRAS_ANTERIOR).join(' ');
  let prompt = partes.join(' ');
  if (anterior) {
    const cabe = MAX_PROMPT - prompt.length - 1;
    if (cabe > 20) prompt += ` ${anterior.length > cabe ? anterior.slice(anterior.length - cabe).replace(/^\S*\s/, '') : anterior}`;
  }
  return prompt.slice(0, MAX_PROMPT);
}

/** Formatos que graban los navegadores (Chrome/Edge/Firefox: webm u ogg; Safari: mp4). */
const EXTENSIONES: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'video/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

/** Extensión segura para guardar el audio, o null si el formato no es de audio. */
export function extensionAudio(mime: string | null | undefined): string | null {
  const base = String(mime ?? '').split(';')[0].trim().toLowerCase();
  return EXTENSIONES[base] ?? null;
}

export const EXTENSIONES_AUDIO = [...new Set(Object.values(EXTENSIONES))];
