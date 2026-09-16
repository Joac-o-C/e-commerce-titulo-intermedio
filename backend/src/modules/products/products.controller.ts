import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { QueryProductsDto } from './dto/query-products.dto.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /** @usecase CU-04 Filtrar productos */
  @Get()
  findPublished(@Query() query: QueryProductsDto) {
    return this.productsService.findPublished(query);
  }

  /** @usecase CU-09 Ver detalle de producto */
  @Get(':id')
  findPublicDetail(@Param('id') id: string) {
    return this.productsService.findPublicDetail(id);
  }
}
