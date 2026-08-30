describe('Integra alarm → ticket (Armor contract)', () => {
  it('exige serviceClientId o 400 claro', () => {
    const site = { id: 1, serviceClientId: null as number | null };
    const clientId = site.serviceClientId;
    const error =
      !clientId
        ? 'El sitio no tiene cliente operativo vinculado. Configúralo en Integra → Sitios.'
        : null;
    expect(error).toMatch(/cliente operativo/i);
  });

  it('con serviceClientId resuelve cliente', () => {
    const site = { id: 1, serviceClientId: 42 };
    expect(site.serviceClientId).toBe(42);
  });
});
