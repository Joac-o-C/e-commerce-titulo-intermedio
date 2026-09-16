import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/entities/user.entity.js';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { QueryAdminProductsDto } from './dto/query-admin-products.dto.js';
import { SetPublishedDto } from './dto/set-published.dto.js';

const IMAGE_UPLOAD_OPTIONS = {
  limits: { fileSize: 5 * 1024 * 1024 },
  // CU-16 (flujo 6b): sólo se aceptan imágenes en estos formatos. Se usa
  // BadRequestException (no un Error genérico) para que el filtro de
  // excepciones de Nest devuelva 400 en vez de un 500 sin manejar.
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new BadRequestException('Formato de imagen no soportado (usar JPEG, PNG o WEBP)'), false);
      return;
    }
    callback(null, true);
  },
};

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRADOR)
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /** @usecase CU-16 ABM de productos (paso 2: listado) */
  @Get()
  findAll(@Query() query: QueryAdminProductsDto) {
    return this.productsService.findAllForAdmin(query);
  }

  /** @usecase CU-16 ABM de productos */
  @Post()
  @UseInterceptors(FilesInterceptor('images', 8, IMAGE_UPLOAD_OPTIONS))
  create(@Body() dto: CreateProductDto, @UploadedFiles() images: Express.Multer.File[]) {
    return this.productsService.create(dto, images);
  }

  /** @usecase CU-16 ABM de productos (flujo 3a: editar) */
  @Patch(':id')
  @UseInterceptors(FilesInterceptor('images', 8, IMAGE_UPLOAD_OPTIONS))
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @UploadedFiles() images: Express.Multer.File[]) {
    return this.productsService.update(id, dto, images);
  }

  /** @usecase CU-16 ABM de productos (flujo 3b: publicar/despublicar) */
  @Patch(':id/publish')
  setPublished(@Param('id') id: string, @Body() dto: SetPublishedDto) {
    return this.productsService.setPublished(id, dto.isPublished);
  }

  /** @usecase CU-16 ABM de productos (flujo 3c: baja) */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
