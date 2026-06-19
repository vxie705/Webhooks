import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class IpWhitelistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress;
    const destination = request.destination;

    // If no destination found (e.g., auth failed upstream), block
    if (!destination) {
      throw new UnauthorizedException('Destination not authenticated');
    }

    // If destination has no allowed IPs configured, allow all (backward compatibility)
    const allowedIps = destination.allowedIps as string[];
    if (!allowedIps || allowedIps.length === 0) {
      return true;
    }

    // Check if the request IP is in the whitelist
    if (!allowedIps.includes(ip)) {
      throw new UnauthorizedException(`IP ${ip} not whitelisted for destination ${destination.name}`);
    }

    return true;
  }
}
