export class CreateOrderDto {
  userId?: number;
  status?: 'PENDING' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  email!: string;
  total!: number;
  items!: Array<{ productId: number; quantity: number; price: number; supplierId: number }>;
}
