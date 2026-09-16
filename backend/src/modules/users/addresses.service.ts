import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from './entities/address.entity.js';
import { CreateAddressDto } from './dto/create-address.dto.js';
import { UpdateAddressDto } from './dto/update-address.dto.js';

/**
 * CU-12 Gestionar direcciones. Bajas siempre lógicas (isActive) para
 * preservar el snapshot de las direcciones ya usadas en pedidos históricos.
 */
@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
  ) {}

  findAllForUser(userId: string): Promise<Address[]> {
    return this.addressRepo.find({ where: { userId, isActive: true } });
  }

  /**
   * @usecase CU-12 Gestionar direcciones
   */
  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    const existing = await this.findAllForUser(userId);

    // CU-12 (flujo 8): la primera dirección se marca predeterminada
    // automáticamente; si el cliente pidió marcar esta, se quita la marca
    // de la anterior predeterminada.
    const shouldBeDefault = existing.length === 0 || dto.isDefault === true;
    if (shouldBeDefault && existing.length > 0) {
      await this.clearDefault(userId);
    }

    const address = this.addressRepo.create();
    Object.assign(address, dto, { userId, isDefault: shouldBeDefault });
    return this.addressRepo.save(address);
  }

  /**
   * CU-12 (flujo 3a): edición con los mismos datos precargados.
   * @usecase CU-12 Gestionar direcciones
   */
  async update(userId: string, addressId: string, dto: UpdateAddressDto): Promise<Address> {
    const address = await this.findOwnedOrFail(userId, addressId);

    if (dto.isDefault === true && !address.isDefault) {
      await this.clearDefault(userId);
    }

    Object.assign(address, dto);
    return this.addressRepo.save(address);
  }

  /**
   * CU-12 (flujo 3b): eliminar la única dirección está permitido y deja la
   * libreta vacía. Si la eliminada era la predeterminada y quedan otras,
   * el llamador debe haber indicado `newDefaultId` para elegir la siguiente.
   * @usecase CU-12 Gestionar direcciones
   */
  async remove(userId: string, addressId: string, newDefaultId?: string): Promise<void> {
    const address = await this.findOwnedOrFail(userId, addressId);

    if (address.isDefault) {
      const remaining = (await this.findAllForUser(userId)).filter((a) => a.id !== addressId);
      if (remaining.length > 0) {
        if (!newDefaultId) {
          throw new BadRequestException(
            'Debe indicar qué dirección pasa a ser la predeterminada',
          );
        }
        const nextDefault = remaining.find((a) => a.id === newDefaultId);
        if (!nextDefault) {
          throw new NotFoundException('La dirección elegida como predeterminada no existe');
        }
        await this.addressRepo.update(nextDefault.id, { isDefault: true });
      }
    }

    address.isActive = false;
    address.isDefault = false;
    await this.addressRepo.save(address);
  }

  /**
   * CU-12 (flujo 3c): marca una dirección existente como predeterminada.
   * @usecase CU-12 Gestionar direcciones
   */
  async markDefault(userId: string, addressId: string): Promise<Address> {
    const address = await this.findOwnedOrFail(userId, addressId);
    await this.clearDefault(userId);
    address.isDefault = true;
    return this.addressRepo.save(address);
  }

  private async clearDefault(userId: string): Promise<void> {
    await this.addressRepo.update({ userId, isDefault: true }, { isDefault: false });
  }

  private async findOwnedOrFail(userId: string, addressId: string): Promise<Address> {
    // CU-12 (flujo 7a): la dirección referenciada ya no existe (o no es del usuario).
    const address = await this.addressRepo.findOne({
      where: { id: addressId, userId, isActive: true },
    });
    if (!address) throw new NotFoundException('La dirección no existe');
    return address;
  }
}
