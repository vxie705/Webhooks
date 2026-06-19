import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLoggerService } from '../logger/pino-logger.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    this.logger.error(
      `HTTP ${status} - ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : undefined,
      {
        status,
        path: request.url,
        method: request.method,
        message:
          status >= 500 && process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : message,
      },
    );

    response.status(status).json({
      statusCode: status,
      message:
        status >= 500 && process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}