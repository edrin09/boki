import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Project } from '@core/entities/project.entity'
import { VoucherEntry } from '@core/entities/voucher-entry.entity'
import { InitialBalance } from '@core/entities/initial-balance.entity'
import { companyRepoProviders } from '@core/common/company/company-repo.decorator'
import { OcrModule } from '@plugin/ocr/server/modules/ocr'
import { ProjectsService } from './projects.service'
import { ProjectsController } from './projects.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, VoucherEntry, InitialBalance]),
    OcrModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ...companyRepoProviders(Project, VoucherEntry, InitialBalance)],
  exports: [ProjectsService],
})
export class ProjectsModule {}
