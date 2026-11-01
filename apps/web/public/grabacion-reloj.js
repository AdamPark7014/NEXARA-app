// Reloj de la grabación de reuniones. En una pestaña oculta el navegador frena los timers de la
// página hasta a uno por minuto; los de un worker siguen a tiempo, así que el audio se sigue
// partiendo y subiendo igual aunque estés en otra pestaña. Ver `lib/use-grabadora.ts`.
let timer = null;
self.onmessage = (e) => {
  if (timer) clearInterval(timer);
  timer = setInterval(() => self.postMessage(0), Number(e.data) || 500);
};
