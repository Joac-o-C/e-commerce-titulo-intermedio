import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StorageService, UploadedFileResult } from './storage.interface.js';

/**
 * Implementación mínima del provider `storage` para desarrollo/entrega del
 * TP: guarda el archivo en disco, bajo `backend/uploads/<folder>/`, servido
 * como estático por Nest (ver `main.ts`). No se dockeriza ni se sube a un
 * servicio cloud — alcanza para este alcance y aísla la interfaz para poder
 * reemplazarla después sin tocar quien la consume.
 */
@Injectable()
export class LocalStorageService implements StorageService {
  private readonly logger = new Logger(LocalStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  async upload(file: Express.Multer.File, folder: string): Promise<UploadedFileResult> {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileName = `${randomUUID()}-${safeName}`;
    const dir = join(process.cwd(), 'uploads', folder);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), file.buffer);

    const baseUrl = this.configService.get<string>('PUBLIC_ASSETS_URL');
    return { url: `${baseUrl}/uploads/${folder}/${fileName}` };
  }

  async remove(url: string): Promise<void> {
    const marker = '/uploads/';
    const index = url.indexOf(marker);
    if (index === -1) return;
    const relativePath = url.slice(index + marker.length);
    try {
      await unlink(join(process.cwd(), 'uploads', relativePath));
    } catch (err) {
      // Best-effort: no bloquea el flujo principal por un archivo que ya no estaba.
      this.logger.warn(`No se pudo borrar el archivo huérfano ${relativePath}: ${(err as Error).message}`);
    }
  }
}
