import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DestinationRepository } from '@webhook-hub/database';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly destinationRepository: DestinationRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API Key is required');
    }

    const destination = await this.destinationRepository.findByApiKey(apiKey);
    if (!destination || !destination.isActive) {
      throw new UnauthorizedException('Invalid or inactive API Key');
    }

    // Attach destination to request for downstream guards/services
    request.destination = destination;
    return true;
  }
}
