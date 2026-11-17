export function esNombreDeRelleno(nombre?: string | null): boolean {
  const limpio = String(nombre || '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/gu, ' ')
    .trim();

  if (!limpio || limpio.length < 2) {
    return true;
  }

  const setRelleno = new Set([
    'na', 'n a', 'no aplica', 'ninguno', 'ninguna', 'nada', 'varios', 'varias', 
    'general', 'otro', 'otros', 'cliente', 'cliente nuevo', 'sin cliente', 
    'sin nombre', 'pendiente', 'por definir', 'por confirmar', 'desconocido', 
    'prueba', 'test', 'x', 'xx', 'xxx', 'nn', 's n', 'sn', 'a quien corresponda', 
    'quien corresponda', 'aqc', 'publico en general', 'cliente general'
  ]);

  return setRelleno.has(limpio);
}

export function mensajeAlertaClienteRelleno(texto: string): string {
  return 'No se puede poner "' + texto.trim() + '": escribe el nombre real del cliente (o "Administración de <empresa>" si no sabes el contacto).';
}

export function atencionPorOmision(cliente: string): string {
  const textoLimpio = cliente.trim();
  if (!textoLimpio) {
    return '';
  }
  return 'Administración de ' + textoLimpio;
}