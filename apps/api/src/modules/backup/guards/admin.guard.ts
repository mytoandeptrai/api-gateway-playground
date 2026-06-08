import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    const adminEmail =
      this.configService.getOrThrow<string>('backup.adminEmail');

    let email: string | undefined;
    if (method === 'GET') {
      email = req.query['email'] as string;
    } else {
      email = (req.body as Record<string, unknown>)?.['email'] as string;
    }

    if (!email || email !== adminEmail) {
      throw new ForbiddenException('Access denied');
    }
    return true;
  }
}
