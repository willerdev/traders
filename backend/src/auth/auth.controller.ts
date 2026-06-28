import { Controller, Post, Body, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  WalletLoginDto,
  VerifyLoginOtpDto,
  ResendLoginOtpDto,
} from '../common/dto';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import type { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip);
  }

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip);
  }

  @Post('login/verify-otp')
  @UseGuards(AuthRateLimitGuard)
  verifyLoginOtp(@Body() dto: VerifyLoginOtpDto) {
    return this.authService.verifyLoginOtp(dto);
  }

  @Post('login/resend-otp')
  @UseGuards(AuthRateLimitGuard)
  resendLoginOtp(@Body() dto: ResendLoginOtpDto) {
    return this.authService.resendLoginOtp(dto);
  }

  @Post('wallet')
  @UseGuards(AuthRateLimitGuard)
  walletLogin(@Body() dto: WalletLoginDto, @Req() req: Request) {
    return this.authService.walletLogin(dto, req.ip);
  }

  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }
}
