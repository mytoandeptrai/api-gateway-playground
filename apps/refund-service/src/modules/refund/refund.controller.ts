import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { RefundService } from './refund.service';

const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

@ApiTags('refund')
@Controller('refund')
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a refund request with files' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 3))
  async createRefund(
    @UploadedFiles() files: Express.Multer.File[],
    @Body()
    body: {
      orderId: string;
      userId: string;
      userEmail: string;
      reason: string;
      deliveredAt: string;
    },
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Cần ít nhất 1 file đính kèm');
    }

    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.mimetype)) {
        throw new BadRequestException(
          `File ${file.originalname}: chỉ chấp nhận jpg, jpeg, png`,
        );
      }
      if (file.size > MAX_SIZE_BYTES) {
        throw new BadRequestException(`File ${file.originalname}: tối đa 5MB`);
      }
    }

    return this.refundService.createRefund({ ...body, files });
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get refund request by orderId' })
  getByOrderId(@Param('orderId') orderId: string) {
    return this.refundService.getByOrderId(orderId);
  }

  @Post(':orderId/simulate-reject')
  @ApiOperation({ summary: 'Dev only: simulate refund rejection for an order' })
  simulateReject(@Param('orderId') orderId: string) {
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException('Only available in development');
    }
    return this.refundService.simulateReject(orderId);
  }
}
