import { Injectable } from '@nestjs/common';
import pino from 'pino';

@Injectable()
export class PinoLoggerService {
  private readonly logger: pino.Logger;

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
    });
  }

  log(message: string, context?: unknown) {
    this.logger.info(context, message);
  }

  error(message: string, trace?: string, context?: unknown) {
    this.logger.error({ trace, ...(context as object) }, message);
  }

  warn(message: string, context?: unknown) {
    this.logger.warn(context, message);
  }

  debug(message: string, context?: unknown) {
    this.logger.debug(context, message);
  }

  verbose(message: string, context?: unknown) {
    this.logger.trace(context, message);
  }
}