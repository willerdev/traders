import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  UpdateProfileDto,
  UpdateAddressDto,
  SubmitKycDto,
  UpdatePaymentDetailsDto,
  UpdateTradingAccountDto,
  LinkMt5AccountDto,
  UpdateDisplayCurrencyDto,
} from '../common/dto';
import { JwtAuthGuard } from '../auth/guards';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('dashboard')
  getDashboard(@Request() req: { user: { id: string } }) {
    return this.usersService.getDashboard(req.user.id);
  }

  @Get('profile')
  getProfile(@Request() req: { user: { id: string } }) {
    return this.usersService.getProfile(req.user.id);
  }

  @Get('settings')
  getSettings(@Request() req: { user: { id: string } }) {
    return this.usersService.getSettings(req.user.id);
  }

  @Patch('profile')
  updateProfile(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Patch('address')
  updateAddress(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(req.user.id, dto);
  }

  @Patch('currency')
  updateCurrency(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateDisplayCurrencyDto,
  ) {
    return this.usersService.updateDisplayCurrency(req.user.id, dto);
  }

  @Patch('payment-details')
  updatePaymentDetails(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdatePaymentDetailsDto,
  ) {
    return this.usersService.updatePaymentDetails(req.user.id, dto);
  }

  @Patch('trading-account')
  updateTradingAccount(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateTradingAccountDto,
  ) {
    return this.usersService.updateTradingAccount(req.user.id, dto);
  }

  @Post('trading-account/claim')
  claimTradingAccount(
    @Request() req: { user: { id: string } },
    @Body() dto: LinkMt5AccountDto,
  ) {
    return this.usersService.claimTradingAccount(req.user.id, dto);
  }

  @Get('kyc')
  getKyc(@Request() req: { user: { id: string } }) {
    return this.usersService.getKyc(req.user.id);
  }

  @Post('kyc/submit')
  submitKyc(
    @Request() req: { user: { id: string } },
    @Body() dto: SubmitKycDto,
  ) {
    return this.usersService.submitKyc(req.user.id, dto);
  }

  @Post('kyc/retry')
  retryKyc(@Request() req: { user: { id: string } }) {
    return this.usersService.retryKyc(req.user.id);
  }
}
