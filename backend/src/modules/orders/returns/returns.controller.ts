import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import type { JwtAccessPayload } from '../../auth/strategies/jwt.strategy.js';
import { CreateReturnRequestDto } from './dto/create-return-request.dto.js';
import { MAX_RETURN_PHOTOS, ReturnsService } from './returns.service.js';

const PHOTO_UPLOAD_OPTIONS = {
  limits: { fileSize: 5 * 1024 * 1024, files: MAX_RETURN_PHOTOS },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new BadRequestException('Formato de foto no soportado (usar JPEG, PNG o WEBP)'), false);
      return;
    }
    callback(null, true);
  },
};

/** CU-15 Solicitar cambio o devolución (Cliente). La bandeja del Administrador es CU-22. */
@Controller('orders/:orderId/returns')
@UseGuards(JwtAuthGuard)
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  /** @usecase CU-15 Solicitar cambio o devolución (pasos 2-9, flujos 2a/2b/3a/5a/6a) */
  @Post()
  @UseInterceptors(FilesInterceptor('photos', MAX_RETURN_PHOTOS, PHOTO_UPLOAD_OPTIONS))
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateReturnRequestDto,
    @UploadedFiles() photos: Express.Multer.File[],
  ) {
    return this.returnsService.create(user.sub, orderId, dto, photos ?? []);
  }
}
