import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { SoloTradingAdminGuard } from '../auth/guards/solo-trading-admin.guard';
import { AuthRateLimitGuard } from '../auth/auth-rate-limit.guard';
import { DerivService } from './deriv.service';
import { DerivTransferDto, SaveDerivCryptoWalletDto, SaveDerivTokenDto } from './deriv.dto';

@Controller('deriv')
@UseGuards(JwtAuthGuard)
export class DerivController {
  constructor(private deriv: DerivService) {}

  @Get('status')
  status(@Request() req: { user: { id: string } }) {
    return this.deriv.status(req.user.id);
  }

  @Put('token')
  @UseGuards(AuthRateLimitGuard)
  saveToken(
    @Request() req: { user: { id: string } },
    @Body() dto: SaveDerivTokenDto,
  ) {
    return this.deriv.saveToken(req.user.id, dto.token);
  }

  @Delete('token')
  disconnect(@Request() req: { user: { id: string } }) {
    return this.deriv.disconnect(req.user.id);
  }

  @Get('accounts')
  accounts(@Request() req: { user: { id: string } }) {
    return this.deriv.accounts(req.user.id);
  }

  @Get('trades')
  trades(@Request() req: { user: { id: string } }) {
    return this.deriv.trades(req.user.id);
  }

  @Get('crypto-wallets')
  cryptoWallets(@Request() req: { user: { id: string } }) {
    return this.deriv.cryptoWallets(req.user.id);
  }

  @Put('crypto-wallets')
  @UseGuards(AuthRateLimitGuard)
  saveCryptoWallet(
    @Request() req: { user: { id: string } },
    @Body() dto: SaveDerivCryptoWalletDto,
  ) {
    return this.deriv.saveCryptoWallet(req.user.id, dto);
  }

  @Delete('crypto-wallets/:purpose')
  deleteCryptoWallet(
    @Request() req: { user: { id: string } },
    @Param('purpose') purpose: string,
  ) {
    return this.deriv.deleteCryptoWallet(req.user.id, purpose);
  }

  @Post('transfer')
  @UseGuards(AuthRateLimitGuard)
  transfer(
    @Request() req: { user: { id: string } },
    @Body() dto: DerivTransferDto,
  ) {
    return this.deriv.transfer(req.user.id, dto);
  }

  @Post('contracts/:id/sell')
  @UseGuards(AuthRateLimitGuard, SoloTradingAdminGuard)
  sell(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.deriv.sellContract(req.user.id, id);
  }
}
