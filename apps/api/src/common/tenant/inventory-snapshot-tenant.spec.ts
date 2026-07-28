import { TENANT_SCOPED_MODELS } from './tenant-models.js';

describe('InventorySnapshot tenant scope', () => {
  it('keeps InventorySnapshot tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('InventorySnapshot')).toBe(true);
  });
});
