export class UpdateEmployeePaymentDto {
  userId?: number;
  periodFrom?: string;
  periodTo?: string;
  totalMinutes?: number;
  amount?: string | number;
  note?: string;
  concepto?: string;
  status?: string;
}
