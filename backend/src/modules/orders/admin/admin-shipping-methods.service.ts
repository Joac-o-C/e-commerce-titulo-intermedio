import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShippingMethod } from '../entities/shipping-method.entity.js';
import { CreateShippingMethodDto, UpdateShippingMethodDto } from './dto/shipping-method.dto.js';

/**
 * ABM de métodos de envío (alcance extra de la Fase 6, no lo pide ninguna
 * ficha). CU-03 fija que el costo "lo configura el Administrador". Los
 * pedidos guardan un snapshot del método (`shippingMethodSnapshot`), así
 * que editar o desactivar uno nunca cambia pedidos existentes.
 */
@Injectable()
export class AdminShippingMethodsService {
  constructor(
    @InjectRepository(ShippingMethod)
    private readonly repo: Repository<ShippingMethod>,
  ) {}

  list(): Promise<ShippingMethod[]> {
    return this.repo.find({ order: { isActive: 'DESC', cost: 'ASC', name: 'ASC' } });
  }

  async create(dto: CreateShippingMethodDto): Promise<ShippingMethod> {
    return this.saveUnique(
      this.repo.create({ name: dto.name, description: dto.description || null, cost: dto.cost.toFixed(2), type: dto.type, isActive: true }),
    );
  }

  async update(id: string, dto: UpdateShippingMethodDto): Promise<ShippingMethod> {
    const method = await this.findOrFail(id);
    if (dto.name !== undefined) method.name = dto.name;
    if (dto.description !== undefined) method.description = dto.description || null;
    if (dto.type !== undefined) method.type = dto.type;
    if (dto.cost !== undefined) method.cost = dto.cost.toFixed(2);
    return this.saveUnique(method);
  }

  /**
   * Baja lógica (regla transversal: bajas siempre lógicas). Desactivar el
   * último método activo está permitido, con advertencia (decisión de la
   * Fase 6): `lastActiveDisabled` le avisa al frontend que el checkout
   * queda sin métodos de envío.
   */
  async setActive(id: string, isActive: boolean): Promise<{ method: ShippingMethod; lastActiveDisabled: boolean }> {
    const method = await this.findOrFail(id);
    method.isActive = isActive;
    await this.repo.save(method);
    const lastActiveDisabled = !isActive && (await this.repo.countBy({ isActive: true })) === 0;
    return { method, lastActiveDisabled };
  }

  private async findOrFail(id: string): Promise<ShippingMethod> {
    const method = await this.repo.findOneBy({ id });
    if (!method) throw new NotFoundException('El método de envío no existe');
    return method;
  }

  /** Nombre único sin distinguir mayúsculas: lo garantiza `UX_shipping_methods_name_lower`. */
  private async saveUnique(method: ShippingMethod): Promise<ShippingMethod> {
    try {
      return await this.repo.save(method);
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
        throw new ConflictException(`Ya existe un método de envío llamado "${method.name}"`);
      }
      throw err;
    }
  }
}
