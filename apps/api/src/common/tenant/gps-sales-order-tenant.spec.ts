import { TENANT_SCOPED_MODELS } from './tenant-models.js';

describe('LocationTracking + SalesProjectOrder tenant scope', () => {
  it('keeps LocationTracking tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('LocationTracking')).toBe(true);
  });

  it('keeps SalesProjectOrder tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('SalesProjectOrder')).toBe(true);
  });
});
