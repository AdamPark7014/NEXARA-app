import type { PlayerState } from "./_LivePlayer";

/**
 * Control de admisión del muro: **quién puede negociar ahora**.
 *
 * Esto es lo que arregló `8bf4451c` y no se toca a la ligera. El tope no es de
 * cámaras vivas —`cc59543` topaba a 4 vivas y por eso nunca se veían las
 * nueve— sino de *handshakes simultáneos*: con RTT de 87 ms cada apertura RTSP
 * tarda entre 0,7 y 2,5 s, y nueve decodificadores negociando a la vez dejaban
 * media rejilla colgada. En cuanto un mosaico se asienta, entra el siguiente.
 *
 * ## Lo único que cambia respecto a la versión anterior: los que no se ven
 *
 * Medido leyendo el propio reproductor: un mosaico fuera de pantalla se queda
 * en `queued` —su `IntersectionObserver` no lo deja arrancar— pero el bucle de
 * admisión lo contaba como «conectando» porque no estaba asentado. Resultado:
 * un cuadro invisible ocupaba uno de los tres turnos y no lo soltaba hasta que
 * el operador hiciera scroll. En un 4×4 en portátil, donde las dos últimas
 * filas caen bajo el pliegue, eso es exactamente «los que se ven arrancan los
 * últimos».
 *
 * La corrección es la mínima posible: **lo que no se ve no ocupa turno ni se
 * admite**. No consume nada mientras está fuera de pantalla, y cuando entra en
 * el viewport vuelve a la cola normal y respeta el tope como cualquier otro
 * —así que tampoco hay estampida al hacer scroll—.
 */
export const WALL_CONNECT_CONCURRENCY = 3;

/** Un mosaico que ya no está negociando nada: imagen, respaldo o rendición. */
function asentado(st: PlayerState | undefined): boolean {
  return st === "live" || st === "snapshot" || st === "error";
}

/**
 * Ids admitidos a conectar, recorriendo las celdas en orden.
 *
 * `cells` puede traer huecos (`null`): el muro los conserva para no reordenar
 * la rejilla cuando el operador quita una cámara.
 */
export function admitirMosaicos(
  cells: Array<{ id: string } | null>,
  tileState: Record<string, PlayerState | undefined>,
  concurrency: number = WALL_CONNECT_CONCURRENCY,
): Set<string> {
  const ids = new Set<string>();
  let connecting = 0;
  for (const s of cells) {
    if (!s) continue;
    const st = tileState[s.id];
    // Fuera de pantalla: ni se admite ni ocupa turno. Cuando entre en el
    // viewport pasará a `queued` y competirá por su turno como los demás.
    if (st === "offscreen") continue;
    if (!asentado(st)) {
      if (connecting >= concurrency) continue;
      connecting += 1;
    }
    ids.add(s.id);
  }
  return ids;
}
