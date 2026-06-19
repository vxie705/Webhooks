import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PinoLoggerService } from './common/logger/pino-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(PinoLoggerService));

  await app.listen(process.env.WORKER_PORT || 3001);
  console.log(`Worker running on port ${process.env.WORKER_PORT || 3001}`);
}
bootstrap();
