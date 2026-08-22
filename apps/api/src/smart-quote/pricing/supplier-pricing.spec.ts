import { sellFromCost, marginOnSell, resolveQuoteLinePricing } from './supplier-pricing.js';

describe('supplier-pricing', () => {
  it('calculates sell from cost with margin on sell', () => {
    expect(sellFromCost(100, 30)).toBeCloseTo(142.86, 1);
    expect(marginOnSell(100, 142.86)).toBeCloseTo(30, 0);
  });

  it('fixes line when unitPrice equals cost', () => {
    const r = resolveQuoteLinePricing({
      unitCost: 1000,
      unitPrice: 1000,
      supplierCode: 'CT',
      marginPercent: 25,
    });
    expect(r.unitPrice).toBeGreaterThan(1000);
    expect(r.marginPercent).toBe(25);
    expect(r.taxPercent).toBe(16);
  });
});
