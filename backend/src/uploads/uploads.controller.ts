import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname, join, basename } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards';
import { randomBytes } from 'crypto';
import { VisionService } from '../ai/vision.service';
import { PrismaService } from '../prisma/prisma.service';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'setups');
const KYC_UPLOAD_DIR = join(process.cwd(), 'uploads', 'kyc');

function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function ensureKycUploadDir() {
  if (!existsSync(KYC_UPLOAD_DIR)) {
    mkdirSync(KYC_UPLOAD_DIR, { recursive: true });
  }
}

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(
    private vision: VisionService,
    private prisma: PrismaService,
  ) {}

  @Post('setup/analyze')
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
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureUploadDir();
          cb(null, UPLOAD_DIR);
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
  uploadSetup(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) {
      throw new BadRequestException('Setup image is required');
    }

    const baseUrl =
      process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;

    return {
      url: `${baseUrl}/uploads/setups/${file.filename}`,
      filename: file.filename,
      size: file.size,
      uploadedBy: req.user.id,
    };
  }

  @Post('kyc')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureKycUploadDir();
          cb(null, KYC_UPLOAD_DIR);
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
  uploadKyc(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string } },
  ) {
    if (!file) {
      throw new BadRequestException('KYC document image is required');
    }

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
  async getKycFile(
    @Param('filename') filename: string,
    @Request() req: { user: { id: string; role: string } },
    @Res() res: Response,
  ) {
    const safeName = basename(filename);
    if (!/^[a-f0-9]+\.(jpe?g|png|webp)$/i.test(safeName)) {
      throw new BadRequestException('Invalid filename');
    }

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

    const filePath = join(KYC_UPLOAD_DIR, safeName);
    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found');
    }

    return res.sendFile(filePath);
  }
}
