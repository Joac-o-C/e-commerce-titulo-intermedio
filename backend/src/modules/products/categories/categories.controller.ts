import { Controller, Get } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /** @usecase CU-04 Filtrar productos (árbol de categorías visibles) */
  @Get()
  findPublicTree() {
    return this.categoriesService.findPublicTree();
  }
}
