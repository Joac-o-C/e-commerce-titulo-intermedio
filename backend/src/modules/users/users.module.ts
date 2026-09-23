import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from './entities/address.entity.js';
import { User } from './entities/user.entity.js';
import { AddressesController } from './addresses.controller.js';
import { AddressesService } from './addresses.service.js';
import { UsersService } from './users.service.js';

@Module({
  // PassportModule habilita JwtAuthGuard sobre AddressesController: la
  // estrategia 'jwt' ya quedó registrada globalmente por AuthModule, acá
  // solo hace falta que este módulo pueda resolver las dependencias del guard.
  imports: [
    TypeOrmModule.forFeature([User, Address]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AddressesController],
  providers: [UsersService, AddressesService],
  // AddressesService: `orders` lo usa para validar la dirección del checkout (CU-03).
  exports: [UsersService, AddressesService],
})
export class UsersModule {}
