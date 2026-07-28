import { TENANT_SCOPED_MODELS } from './tenant-models.js';

describe('SystemSetting dual-scope contract', () => {
  it('is intentionally NOT middleware-scoped (platform rows must remain visible)', () => {
    expect(TENANT_SCOPED_MODELS.has('SystemSetting')).toBe(false);
  });

  it('tenant override wins merge semantics', () => {
    const rows = [
      { key: 'rfc', companyId: null as number | null, value: 'PLATFORM' },
      { key: 'rfc', companyId: 5, value: 'TENANT' },
      { key: 'cp', companyId: null, value: '00000' },
    ];
    const byKey = new Map<string, (typeof rows)[0]>();
    for (const row of rows) {
      if (row.companyId == null) {
        if (!byKey.has(row.key)) byKey.set(row.key, row);
      } else if (row.companyId === 5) {
        byKey.set(row.key, row);
      }
    }
    expect(byKey.get('rfc')?.value).toBe('TENANT');
    expect(byKey.get('cp')?.value).toBe('00000');
  });
});
