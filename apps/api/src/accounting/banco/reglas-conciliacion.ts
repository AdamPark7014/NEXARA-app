export type ReglaConciliacion = { id?: number; contiene: string; cuentaCodigo: string; activa?: boolean }
export type CandidatoMatch = { id: number; kind: 'INVOICE'|'PAYMENT'|'JOURNAL'; folio: string; date: string; amount: number; reference?: string|null; rfc?: string|null; description?: string|null }
export type MovimientoBanco = { id: number; date: string; amount: number; isDebit: boolean; description?: string|null; reference?: string|null; counterpartyRfc?: string|null }
export type PropuestaMatch = { candidate: CandidatoMatch; score: number; reasons: string[] }

/**
 * Aplica reglas de conciliación buscando la primera regla activa cuyo patrón aparece en la descripción.
 */
export function aplicarReglaConcepto(descripcion: string, reglas: ReglaConciliacion[]): ReglaConciliacion | null {
  const descripcionNormalizada = descripcion.toLowerCase().trim();
  
  for (const regla of reglas) {
    if (regla.activa === false) continue; // Solo considerar reglas activas
    
    const patronNormalizado = regla.contiene.toLowerCase().trim();
    
    if (descripcionNormalizada.includes(patronNormalizado)) {
      return regla;
    }
  }
  
  return null;
}

/**
 * Genera una propuesta de coincidencia puntuando un candidato contra un movimiento bancario.
 */
export function puntuarCandidato(mov: MovimientoBanco, cand: CandidatoMatch, ventanaDias?: number): PropuestaMatch {
  const reasons: string[] = [];
  let score = 0;
  
  // Factor monto exacto: +40 puntos
  const diferenciaMonto = Math.abs(mov.amount - cand.amount);
  if (diferenciaMonto === 0) {
    score += 40;
    reasons.push('Monto exacto');
  } else {
    // Factor monto +/-1%: +25 puntos
    const toleranciaMonto = mov.amount * 0.01;
    if (diferenciaMonto <= toleranciaMonto) {
      score += 25;
      reasons.push(`Monto casi exacto (diff: ${((diferenciaMonto / Math.abs(mov.amount)) * 100).toFixed(2)}%)`);
    } else {
      reasons.push('Diferencia de monto significativa');
    }
  }
  
  // Factor fecha mismo día: +30 puntos
  const diffFechaCand = Date.parse(cand.date) - Date.parse(mov.date);
  if (diffFechaCand === 0) {
    score += 30;
    reasons.push('Fecha coincide');
  } else {
    // Factor fecha dentro de ventana: proporcional
    const diasDiferencia = Math.abs((mov.date.length > cand.date.length ? Date.parse(mov.date) - Date.parse(cand.date) : Date.parse(cand.date) - Date.parse(mov.date))) / (1000 * 60 * 60 * 24);
    const ventanaDefault = ventanaDias ?? 3;
    
    if (diasDiferencia <= ventanaDefault) {
      // Puntuación proporcional: max +30, min 0 en ventana
      const porcentajeVentana = Math.min(diasDiferencia / ventanaDefault, 1);
      const puntajeFecha = Math.round(30 * (1 - porcentajeVentana));
      
      if (puntajeFecha > 0) {
        score += puntajeFecha;
        reasons.push(`Fecha cercana (${diasDiferencia.toFixed(2)} días)`);
      } else {
        reasons.push('Fuera de ventana temporal');
      }
    } else {
      reasons.push('Fuera de ventana temporal');
    }
  }
  
  // Factor referencia/folio en description o reference: +20 puntos
  const textoMov = (mov.description || '') + ' ' + (mov.reference || '');
  if (textoMov.toLowerCase().includes(cand.folio)) {
    score += 20;
    reasons.push('Folio coincide');
  } else {
    // Verificar si la referencia del candidato esta en el texto del movimiento (relajado)
    if (textoMov.toLowerCase().includes(cand.reference || '')) {
      score += 15; // Puntos menores si solo hay coincidencia de reference libre
      reasons.push('Referencia parcial coincide');
    }
  }
  
  // Factor RFC coincide: +10 puntos
  if (mov.counterpartyRfc && cand.rfc) {
    if (mov.counterpartyRfc === cand.rfc) {
      score += 10;
      reasons.push('RFC coincide');
    } else {
      reasons.push('RFC no coincide');
    }
  } else if (cand.rfc) {
    // Si el candidato tiene RFC y el movimiento no, o viceversa, penalizar ligeramente implícitamente por no coincidir todo
    if (mov.counterpartyRfc && !mov.counterpartyRfc.startsWith(cand.rfc)) {
      reasons.push('RFC inconsistente');
    }
  }
  
  // Cap a 100
  score = Math.min(score, 100);
  
  return { candidate: cand, score, reasons };
}

/**
 * Obtiene las top k propuestas ordenadas por score descendente, filtrando solo aquellas con score > 0.
 */
export function topPropuestas(mov: MovimientoBanco, candidatos: CandidatoMatch[], k?: number): PropuestaMatch[] {
  const kLimit = k ?? 3;
  
  // Generar propuestas para todos los candidatos
  const propuestasBrutas: PropuestaMatch[] = candidatos.map(cand => puntuarCandidato(mov, cand));
  
  // Filtrar score > 0
  const propuestasViables = propuestasBrutas.filter(p => p.score > 0);
  
  // Ordenar descendente por score
  const ordenadas = propuestasViables.sort((a, b) => b.score - a.score);
  
  // Tomar top k
  return ordenadas.slice(0, kLimit);
}