export function formatearRangoHorario(entrada: string, salida: string): string {
  return `${entrada}–${salida}`;
}

export function etiqFuenteHorario(fuente?: string | null): string {
  if (!fuente) return 'Horario';
  switch (fuente) {
    case 'horario_dia':
      return 'Del día';
    case 'plantilla':
      return 'Plantilla';
    case 'turno':
      return 'Turno';
    default:
      return fuente;
  }
}
