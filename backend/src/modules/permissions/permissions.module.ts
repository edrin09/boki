import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Permission } from '../../entities/permission.entity'
import { Role } from '../../entities/role.entity'
import { PermissionsService } from './permissions.service'
import { PermissionsController } from './permissions.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Permission, Role])],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}