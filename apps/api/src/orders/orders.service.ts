
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/index.js';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return await this.prisma['order'].findMany({
      include: { items: true },
    });
  }

  async create(createOrderDto: CreateOrderDto) {
    // Validar items y existencia en BD
    const items = createOrderDto.items.map((item: { productId: number; quantity: number; price: number; supplierId: number }, idx: number) => {
      if (!item.productId) {
        throw new Error(`Falta productId en el item #${idx + 1}`);
      }
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        supplierId: item.supplierId ?? 1 // Valor por defecto para pruebas
      };
    });

    // Validar existencia de productos y proveedores
    const productIds: number[] = items.map((i: { productId: number }) => i.productId);
    const supplierIds: number[] = items.map((i: { supplierId: number }) => i.supplierId);

    const productosExistentes = await this.prisma['product'].findMany({
      where: { id: { in: productIds } },
      select: { id: true }
    });
    const proveedoresExistentes = await this.prisma['supplier'].findMany({
      where: { id: { in: supplierIds } },
      select: { id: true }
    });

    const productosNoEncontrados = productIds.filter((id: number) => !productosExistentes.some((p: { id: number }) => p.id === id));
    const proveedoresNoEncontrados = supplierIds.filter((id: number) => !proveedoresExistentes.some((s: { id: number }) => s.id === id));

    if (productosNoEncontrados.length > 0) {
      throw new Error(`No existen los siguientes productId: ${productosNoEncontrados.join(', ')}`);
    }
    if (proveedoresNoEncontrados.length > 0) {
      throw new Error(`No existen los siguientes supplierId: ${proveedoresNoEncontrados.join(', ')}`);
    }

    // Construir el objeto de datos, omitiendo userId si es undefined
    const orderData: Omit<CreateOrderDto, 'items'> & { items: { create: typeof items } } = {
      status: createOrderDto.status ?? 'PENDING',
      email: createOrderDto.email,
      total: createOrderDto.total,
      items: { create: items }
    };
    // Solo agregar userId si existe y es válido (mayor a 0)
    if (createOrderDto.userId && createOrderDto.userId > 0) {
      (orderData as any).userId = createOrderDto.userId;
    }

    return await this.prisma['order'].create({
      data: orderData,
      include: { items: true },
    });
  }

  async findOne(id: number) {
    return await this.prisma['order'].findUnique({
      where: { id },
      include: { items: true },
    });
  }

  async updateStatus(id: number, updateOrderStatusDto: UpdateOrderStatusDto) {
    return await this.prisma['order'].update({
      where: { id },
      data: { status: updateOrderStatusDto.status },
    });
  }
}
