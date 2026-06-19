import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  sub?: string;
  email?: string;
  exp?: number;
  iss?: string;
  aud?: string | string[];
  scope?: string;
  scopes?: string;
}

@Injectable()
export class OAuth2Guard implements CanActivate {
  private readonly logger = new Logger(OAuth2Guard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Bearer token is required');
    }

    try {
      // Decodificar sin verificar para obtener claims básicos
      const decoded = jwt.decode(token, { complete: true }) as { payload: JwtPayload } | null;

      if (!decoded || !decoded.payload) {
        throw new UnauthorizedException('Invalid JWT token');
      }

      const payload = decoded.payload;

      // Validar expiración
      if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
        throw new UnauthorizedException('Token expired');
      }

      // Validar emisor si está configurado
      const issuer = process.env.OAUTH2_ISSUER;
      if (issuer && payload.iss !== issuer) {
        throw new UnauthorizedException('Invalid token issuer');
      }

      // Validar audiencia si está configurada
      const audience = process.env.OAUTH2_AUDIENCE;
      if (audience && payload.aud) {
        const tokenAud = payload.aud;
        const matches = Array.isArray(tokenAud) 
          ? tokenAud.includes(audience)
          : tokenAud === audience;
        if (!matches) {
          throw new UnauthorizedException('Invalid token audience');
        }
      }

      // Validar scope si existe
      const scope = payload.scope || payload.scopes;
      if (scope && typeof scope === 'string') {
        const scopes = scope.split(' ');
        if (!scopes.includes('webhook:send')) {
          throw new ForbiddenException('Insufficient permissions: webhook:send scope required');
        }
      }

      // Adjuntar usuario al request para downstream
      request.user = {
        sub: payload.sub,
        email: payload.email,
        scope: scope,
      };

      return true;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('Invalid token signature');
      }
      throw error;
    }
  }
}
