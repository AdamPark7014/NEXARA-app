describe('Evidence close-gate (Armor)', () => {
  function missingFor(types: string[]) {
    const set = new Set(types);
    const hasEntry = [...set].some((t) => /llegada|entrada|entry/i.test(t));
    const hasExit = [...set].some((t) => /salida|exit/i.test(t));
    const hasSheet = [...set].some((t) => /hoja|servicio|sheet/i.test(t));
    const missing: string[] = [];
    if (!hasEntry) missing.push('Foto de llegada/entrada');
    if (!hasExit && !hasSheet) missing.push('Foto de salida o Hoja de servicio');
    return missing;
  }

  it('sad: sin evidencias', () => {
    expect(missingFor([])).toEqual([
      'Foto de llegada/entrada',
      'Foto de salida o Hoja de servicio',
    ]);
  });

  it('happy: llegada + salida', () => {
    expect(missingFor(['Foto llegada', 'Foto salida'])).toEqual([]);
  });

  it('happy: llegada + hoja', () => {
    expect(missingFor(['Foto de llegada', 'Hoja de Servicio'])).toEqual([]);
  });
});
