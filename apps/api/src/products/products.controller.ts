import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Controller('products')
export class ProductsController {
    // Endpoint minimal para sitemap
    @Get('minimal')
    async getMinimalProducts(@Query('updatedSince') updatedSince?: string) {
      return this.productsService.findMinimal(updatedSince);
    }
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('brand') brand?: string,
    @Query('category') category?: string,
    @Query('supplier') supplier?: string,
    @Query('active') active?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {};
    if (typeof search === 'string') filters.search = search;
    if (typeof brand === 'string') filters.brand = brand;
    if (typeof category === 'string') filters.category = category;
    if (typeof supplier === 'string') filters.supplier = supplier;
    if (active === 'true') filters.active = true;
    else if (active === 'false') filters.active = false;
    if (page) filters.page = parseInt(page, 10);
    if (limit) filters.limit = parseInt(limit, 10);
    return this.productsService.findAll(filters);
  }

  @Get('sync')
  async syncCatalog() {
    return this.productsService.syncFromCTOnline();
  }

  @Post('enrich/:sku')
  async enrichProduct(@Param('sku') sku: string) {
    return this.productsService.enrichWithIcecat(sku);
  }

  @Post('enrich-batch')
  async enrichBatch(
    @Query('limit') limit?: string,
    @Query('onlyWithoutDescription') onlyWithoutDescription?: string,
    @Query('onlyWithEAN') onlyWithEAN?: string,
    @Query('brand') brand?: string,
  ) {
    const options: any = {};
    if (limit) options.limit = parseInt(limit, 10);
    if (onlyWithoutDescription !== undefined) options.onlyWithoutDescription = onlyWithoutDescription !== 'false';
    if (onlyWithEAN !== undefined) options.onlyWithEAN = onlyWithEAN !== 'false';
    if (typeof brand === 'string') options.brand = brand;
    return this.productsService.enrichBatch(options);
  }

  @Get('brands')
  async getBrands() {
    return this.productsService.getBrands();
  }

  @Get('categories')
  async getCategories() {
    return this.productsService.getCategories();
  }

  @Get('suppliers')
  async getSuppliers() {
    return this.productsService.getSuppliers();
  }

  @Get(':sku/detail')
  async getProductDetail(@Param('sku') id: string) {
    const product = await this.productsService.findByAnyId(id);
    if (!product) {
      throw new NotFoundException(`Producto con identificador ${id} no encontrado`);
    }
    // Transforma sources en formato legible para el frontend
    const suppliers = (product.sources || []).map((src: any) => ({
      supplier: src.supplier,
      externalSku: src.externalSku,
      price: src.price,
      currency: src.currency,
      stock: src.stock,
      createdAt: src.createdAt,
    }));
    return {
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        brand: product.brand,
        category: product.category,
        imageUrl: product.imageUrl,
        thumbnailUrl: product.thumbnailUrl,
        specifications: product.specifications,
        icecatId: product.icecatId,
        ean: product.ean,
        upc: product.upc,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
      suppliers,
    };
  }


  @Get(':sku')
  findOne(@Param('sku') sku: string) {
    return this.productsService.findOne(sku);
  }

  @Patch(':sku')
  update(@Param('sku') sku: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(sku, updateProductDto);
  }

  @Delete(':sku')
  remove(@Param('sku') sku: string) {
    return this.productsService.remove(sku);
  }
}
