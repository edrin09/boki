import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { buildDatabaseOptions } from '../config/database.config'
import { GlobalAuthGuard } from '../common/guards/global-auth.guard'
import { PermissionsGuard } from '../common/guards/permissions.guard'
import { SeedService } from '../db/seed.service'
import { Permission } from '../entities/permission.entity'
import { Role } from '../entities/role.entity'
import { User } from '../entities/user.entity'
import { Account } from '../entities/account.entity'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { RolesModule } from './roles/roles.module'
import { PermissionsModule } from './permissions/permissions.module'
import { AccountsModule } from './accounts/accounts.module'
import { PartnersModule } from './partners/partners.module'
import { BanksModule } from './banks/banks.module'
import { DepartmentsModule } from './departments/departments.module'
import { ProjectsModule } from './projects/projects.module'
import { VouchersModule } from './vouchers/vouchers.module'
import { InitialBalanceModule } from './initial-balance/initial-balance.module'
import { BooksModule } from './books/books.module'
import { ReportsModule } from './reports/reports.module'
import { CashBankModule } from './cash-bank/cash-bank.module'
import { ArApModule } from './ar-ap/ar-ap.module'
import { IncomeExpenseModule } from './income-expense/income-expense.module'
import { SystemModule } from './system/system.module'
import { EmployeesModule } from './employees/employees.module'
import { ExpenseClaimsModule } from './expense-claims/expense-claims.module'
import { PayrollModule } from './payroll/payroll.module'
import { OcrModule } from './ocr/ocr.module'
import { ReceiptsModule } from './receipts/receipts.module'
import { ExtractModule } from './extract/extract.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile: false,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => buildDatabaseOptions(),
    }),
    TypeOrmModule.forFeature([Permission, Role, User, Account]),
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    AccountsModule,
    PartnersModule,
    BanksModule,
    DepartmentsModule,
    ProjectsModule,
    VouchersModule,
    InitialBalanceModule,
    BooksModule,
    ReportsModule,
    CashBankModule,
    ArApModule,
    IncomeExpenseModule,
    SystemModule,
    EmployeesModule,
    ExpenseClaimsModule,
    PayrollModule,
    OcrModule,
    ReceiptsModule,
    ExtractModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: GlobalAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    SeedService,
  ],
})
export class AppModule {}