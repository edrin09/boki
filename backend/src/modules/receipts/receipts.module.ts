import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Receipt } from '../../entities/receipt.entity'
import { ClassifyRule } from '../../entities/classify-rule.entity'
import { Partner } from '../../entities/partner.entity'
import { Account } from '../../entities/account.entity'
import { Department } from '../../entities/department.entity'
import { Voucher } from '../../entities/voucher.entity'
import { VoucherEntry } from '../../entities/voucher-entry.entity'
import { OcrModule } from '../ocr/ocr.module'
import { VouchersModule } from '../vouchers/vouchers.module'
import { ReceiptsController } from './receipts.controller'
import { ReceiptsService } from './receipts.service'
import { DocumentParseService } from './document-parse.service'
import { ClassifyService } from './classify.service'
import { ClassifyRulesService } from './classify-rules.service'
import { ReceiptWorkbenchService } from './workbench.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Receipt,
      ClassifyRule,
      Partner,
      Account,
      Department,
      Voucher,
      VoucherEntry,
    ]),
    OcrModule,
    VouchersModule,
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptsService, DocumentParseService, ClassifyService, ClassifyRulesService, ReceiptWorkbenchService],
  exports: [DocumentParseService, ClassifyService],
})
export class ReceiptsModule {}