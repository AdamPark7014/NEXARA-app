import { TENANT_SCOPED_MODELS } from './tenant-models.js';

describe('VehicleControl + MaintenanceContractVisit tenant scope', () => {
  it('keeps VehicleControl tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('VehicleControl')).toBe(true);
  });

  it('keeps MaintenanceContractVisit tenant-scoped', () => {
    expect(TENANT_SCOPED_MODELS.has('MaintenanceContractVisit')).toBe(true);
  });
});
