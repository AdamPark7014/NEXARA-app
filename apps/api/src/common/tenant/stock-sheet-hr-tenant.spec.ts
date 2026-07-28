import { TENANT_SCOPED_MODELS } from './tenant-models.js';

describe('stock / service-sheet / warehouse location tenant stamps', () => {
  it('registers ServiceSheet, WarehouseLocation, StockLevel as tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('ServiceSheet')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('WarehouseLocation')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('StockLevel')).toBe(true);
  });
});
