export class UpdateOrderStatusDto {
  status!: 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
}
