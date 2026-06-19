import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class HmacGuard implements CanActivate {
  private readonly logger = new Logger(HmacGuard.name);
  private readonly MIN_KEY_LENGTH = 32; // 256 bits mínimo para SHA-256

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-signature'];
    const rawBody = request.rawBody;
    const destination = request.destination;

    if (!signature || !rawBody) {
      throw new UnauthorizedException('Missing signature or body');
    }

    if (!destination) {
      throw new UnauthorizedException('Destination not authenticated');
    }

    // Validar longitud mínima de clave HMAC
    if (destination.apiKey.length < this.MIN_KEY_LENGTH) {
      this.logger.warn(`API Key too short for HMAC: ${destination.apiKey.length} chars`);
      throw new UnauthorizedException('Invalid API Key length for HMAC');
    }

    // Forzar SHA-256 (no permitir algoritmos débiles)
    const expected = crypto
      .createHmac('sha256', destination.apiKey)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  }
}
