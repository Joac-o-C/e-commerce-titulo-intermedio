export interface UploadedFileResult {
  url: string;
}

/**
 * Abstracción del Servicio de Almacenamiento (actor secundario de CU-16).
 * `LocalStorageService` es la única implementación de esta fase (disco
 * local); el token permite swapear a un provider cloud real sin tocar
 * `ProductsService`.
 */
export interface StorageService {
  upload(file: Express.Multer.File, folder: string): Promise<UploadedFileResult>;
  /** Borrado best-effort (ej. limpiar archivos huérfanos si una transacción falla después del upload). */
  remove(url: string): Promise<void>;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
