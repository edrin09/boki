import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Role } from '@core/entities/role.entity'
import { Permission } from '@core/entities/permission.entity'
import { RolesService } from './roles.service'
import { RolesController } from './roles.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission])],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}