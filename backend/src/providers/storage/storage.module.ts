import { Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service.js';
import { STORAGE_SERVICE } from './storage.interface.js';

@Module({
  providers: [{ provide: STORAGE_SERVICE, useClass: LocalStorageService }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
