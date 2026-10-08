import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../../entities/user.entity'
import { Company } from '../../entities/company.entity'
import { UserCompany } from '../../entities/user-company.entity'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './jwt.strategy'
import { getJwtExpiresIn, getJwtSecret } from '../../config/jwt.config'

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Company, UserCompany]),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || getJwtSecret(),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') || getJwtExpiresIn()) as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}