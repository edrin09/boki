import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SysConfig } from '@core/entities/sys-config.entity'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'

@Module({
  imports: [TypeOrmModule.forFeature([SysConfig])],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
