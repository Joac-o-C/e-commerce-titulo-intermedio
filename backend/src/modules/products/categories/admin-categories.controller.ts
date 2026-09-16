import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { UserRole } from '../../users/entities/user.entity.js';
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRADOR)
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /** @usecase CU-17 ABM de categorías */
  @Get()
  findTree() {
    return this.categoriesService.findTreeForAdmin();
  }

  /** @usecase CU-17 ABM de categorías */
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  /** @usecase CU-17 ABM de categorías (flujo 3a: editar / 3b: reubicar) */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  /** @usecase CU-17 ABM de categorías (flujo 3c: baja) */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
