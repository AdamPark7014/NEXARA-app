export class CreateEmployeePaymentDto {
  userId!: number;
  periodFrom!: string;
  periodTo!: string;
  totalMinutes?: number;
  amount!: string | number;
  note?: string;
  concepto?: string;
  /** Borrador | Pagado */
  status?: string;
}
