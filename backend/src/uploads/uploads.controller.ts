import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards';
import { randomBytes } from 'crypto';
import { VisionService } from '../ai/vision.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadStorageService } from './upload-storage.service';

const SETUP_DIR = join(process.cwd(), 'uploads', 'setups');
const KYC_DIR = join(process.cwd(), 'uploads', 'kyc');

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

@Controller('uploads')
export class UploadsController {
  constructor(
    private vision: VisionService,
    private prisma: PrismaService,
    private storage: UploadStorageService,
  ) {}

  @Post('setup/analyze')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPEG, PNG, and WebP images allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async analyzeSetup(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Setup image is required');
    }

    const analysis = await this.vision.analyzeChartSetup(file.buffer, file.mimetype);
    return { analysis };
  }

  @Post('setup')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureDir(SETUP_DIR);
          cb(null, SETUP_DIR);
        },
        filename: (_req, file, cb) => {
          const unique = randomBytes(8).toString('hex');
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPEG, PNG, and WebP images allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadSetup(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) {
      throw new BadRequestException('Setup image is required');
    }

    await this.storage.persistLocalFile('setups', file.filename, file.mimetype);

    const baseUrl =
      process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;

    return {
      url: `${baseUrl}/uploads/setups/${file.filename}`,
      filename: file.filename,
      size: file.size,
      uploadedBy: req.user.id,
    };
  }

  @Get('setups/:filename')
  async getSetupFile(@Param('filename') filename: string, @Res() res: Response) {
    return this.storage.sendFile('setups', filename, res);
  }

  @Post('kyc')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureDir(KYC_DIR);
          cb(null, KYC_DIR);
        },
        filename: (_req, file, cb) => {
          const unique = randomBytes(8).toString('hex');
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          cb(new BadRequestException('Only JPEG, PNG, and WebP images allowed'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadKyc(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) {
      throw new BadRequestException('KYC document image is required');
    }

    await this.storage.persistLocalFile('kyc', file.filename, file.mimetype);

    const baseUrl =
      process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;

    return {
      url: `${baseUrl}/api/v1/uploads/kyc/${file.filename}`,
      filename: file.filename,
      size: file.size,
      uploadedBy: req.user.id,
    };
  }

  @Get('kyc/:filename')
  @UseGuards(JwtAuthGuard)
  async getKycFile(
    @Param('filename') filename: string,
    @Request() req: { user: { id: string; role: string } },
    @Res() res: Response,
  ) {
    const safeName = this.storage.validateFilename(filename);

    const isStaff =
      req.user.role === 'ADMIN' || req.user.role === 'MODERATOR';
    if (!isStaff) {
      const kyc = await this.prisma.kycVerification.findUnique({
        where: { userId: req.user.id },
      });
      const owned = [kyc?.documentFrontUrl, kyc?.documentBackUrl, kyc?.selfieUrl]
        .filter(Boolean)
        .some((url) => url?.includes(safeName));
      if (!owned) {
        throw new ForbiddenException('Access denied');
      }
    }

    return this.storage.sendFile('kyc', safeName, res);
  }
}
