import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { join, basename, extname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export type UploadCategory = 'setups' | 'kyc';

@Injectable()
export class UploadStorageService {
  private readonly logger = new Logger(UploadStorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string | null;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    const bucket = config.get<string>('S3_BUCKET')?.trim();
    const accessKey = config.get<string>('S3_ACCESS_KEY')?.trim();
    const secretKey = config.get<string>('S3_SECRET_KEY')?.trim();

    if (bucket && accessKey && secretKey) {
      this.bucket = bucket;
      const endpoint = config.get<string>('S3_ENDPOINT')?.trim();
      const region = config.get<string>('S3_REGION')?.trim() || 'us-east-1';
      this.s3 = new S3Client({
        region,
        endpoint: endpoint || undefined,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: Boolean(endpoint),
      });
      this.logger.log('S3 upload storage enabled');
    } else {
      this.s3 = null;
      this.bucket = null;
    }
  }

  validateFilename(filename: string): string {
    const safeName = basename(filename);
    if (!/^[a-f0-9]+\.(jpe?g|png|webp)$/i.test(safeName)) {
      throw new BadRequestException('Invalid filename');
    }
    return safeName;
  }

  localPath(category: UploadCategory, filename: string): string {
    return join(process.cwd(), 'uploads', category, this.validateFilename(filename));
  }

  private s3Key(category: UploadCategory, filename: string): string {
    return `uploads/${category}/${this.validateFilename(filename)}`;
  }

  mimeFromFilename(filename: string): string {
    const ext = extname(filename).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
  }

  ensureLocalDir(category: UploadCategory) {
    const dir = join(process.cwd(), 'uploads', category);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /** Write buffer to disk, DB, and optional S3 — used for single-request ingest. */
  async persistFromBuffer(
    category: UploadCategory,
    filename: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const safeName = this.validateFilename(filename);
    this.ensureLocalDir(category);
    writeFileSync(this.localPath(category, safeName), buffer);

    await this.prisma.uploadBlob.upsert({
      where: { filename: safeName },
      create: {
        filename: safeName,
        category,
        data: Buffer.from(buffer),
        contentType,
        size: buffer.length,
      },
      update: {
        category,
        data: Buffer.from(buffer),
        contentType,
        size: buffer.length,
      },
    });

    if (this.s3 && this.bucket) {
      try {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: this.s3Key(category, safeName),
            Body: buffer,
            ContentType: contentType,
          }),
        );
      } catch (err) {
        this.logger.warn(
          `S3 upload failed for ${category}/${safeName}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  /** Persist a file already written to local disk into DB (+ optional S3). */
  async persistLocalFile(
    category: UploadCategory,
    filename: string,
    contentType?: string,
  ): Promise<void> {
    const safeName = this.validateFilename(filename);
    const filePath = this.localPath(category, safeName);
    if (!existsSync(filePath)) {
      return;
    }

    const buffer = readFileSync(filePath);
    const mime = contentType ?? this.mimeFromFilename(safeName);

    await this.prisma.uploadBlob.upsert({
      where: { filename: safeName },
      create: {
        filename: safeName,
        category,
        data: buffer,
        contentType: mime,
        size: buffer.length,
      },
      update: {
        category,
        data: buffer,
        contentType: mime,
        size: buffer.length,
      },
    });

    if (this.s3 && this.bucket) {
      try {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: this.s3Key(category, safeName),
            Body: buffer,
            ContentType: mime,
          }),
        );
      } catch (err) {
        this.logger.warn(
          `S3 upload failed for ${category}/${safeName}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  async readFile(
    category: UploadCategory,
    filename: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const safeName = this.validateFilename(filename);
    const localPath = this.localPath(category, safeName);

    if (existsSync(localPath)) {
      return {
        buffer: readFileSync(localPath),
        contentType: this.mimeFromFilename(safeName),
      };
    }

    const blob = await this.prisma.uploadBlob.findUnique({
      where: { filename: safeName },
    });
    if (blob && blob.category === category) {
      return {
        buffer: Buffer.from(blob.data),
        contentType: blob.contentType,
      };
    }

    if (this.s3 && this.bucket) {
      try {
        const res = await this.s3.send(
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: this.s3Key(category, safeName),
          }),
        );
        const bytes = await res.Body?.transformToByteArray();
        if (bytes?.length) {
          const buffer = Buffer.from(bytes);
          const contentType =
            res.ContentType ?? this.mimeFromFilename(safeName);
          await this.prisma.uploadBlob.upsert({
            where: { filename: safeName },
            create: {
              filename: safeName,
              category,
              data: buffer,
              contentType,
              size: buffer.length,
            },
            update: {
              category,
              data: buffer,
              contentType,
              size: buffer.length,
            },
          });
          return { buffer, contentType };
        }
      } catch {
        /* fall through */
      }
    }

    return null;
  }

  async sendFile(
    category: UploadCategory,
    filename: string,
    res: Response,
  ): Promise<void> {
    const file = await this.readFile(category, filename);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    res.type(file.contentType);
    res.send(file.buffer);
  }
}
