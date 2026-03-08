import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { envs } from './config/envs';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Gateway');
  const app = await NestFactory.create<NestExpressApplication>(AppModule,{
    rawBody: true,
    logger
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  )

  app.useBodyParser('json',{limit: '10mb'})

  await app.listen(envs.port);

  logger.log(`runing on port ${envs.port}`)
}
bootstrap();
