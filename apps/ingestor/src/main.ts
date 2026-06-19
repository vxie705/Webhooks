import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PinoLoggerService } from './common/logger/pino-logger.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // Middleware para capturar rawBody como string (HMAC con bytes exactos)
  app.use(
    express.json({
      limit: '256kb', // Límite de tamaño de payload para prevenir DoS
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString();
      },
    }),
  );

  app.useLogger(app.get(PinoLoggerService));
  app.setGlobalPrefix('api/v1');

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter(app.get(PinoLoggerService)));

  const port = process.env.INGESTOR_PORT || 3000;
  await app.listen(port);
  console.log(`Ingestor running on port ${port}`);
}
bootstrap();
