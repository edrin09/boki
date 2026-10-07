import { BadRequestException, Controller, Get, Query } from '@nestjs/common'
import { BooksService } from './books.service'
import { BooksQueryDto, LedgerQueryDto } from './dto/books.dto'
import { RequirePermissions } from '../../common/decorators/permissions.decorator'
import { Operation } from '../../common/decorators/operation.decorator'

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get('ledger')
  @RequirePermissions('books:ledger')
  @Operation('查询总账')
  ledger(@Query() query: LedgerQueryDto, @Query('accountId') accountId?: string) {
    return this.booksService.ledger({ ...query, accountId: this.resolveAccountId(accountId, query) })
  }

  @Get('sub-ledger')
  @RequirePermissions('books:sub-ledger')
  @Operation('查询明细账')
  subLedger(@Query() query: LedgerQueryDto, @Query('accountId') accountId?: string) {
    return this.booksService.subLedger({ ...query, accountId: this.resolveAccountId(accountId, query) })
  }

  @Get('balance')
  @RequirePermissions('books:balance')
  @Operation('查询科目余额表')
  balance(@Query() query: BooksQueryDto) {
    return this.booksService.balanceTable(query)
  }

  @Get('trial-balance')
  @RequirePermissions('books:trial-balance')
  @Operation('查询试算平衡表')
  trialBalance(@Query() query: BooksQueryDto) {
    return this.booksService.trialBalance(query)
  }

  /** 科目必填校验：支持 accountId 或 accountIds 两种传参方式 */
  private resolveAccountId(accountId: string | undefined, query: LedgerQueryDto): string {
    const id = accountId || query.accountIds?.[0]
    if (!id) throw new BadRequestException('请选择会计科目')
    return id
  }
}