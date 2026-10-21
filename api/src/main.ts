import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { repairNullableRoots, tidyOpenApi } from './common/http/openapi';
import { loadEnv } from './config/env';

async function bootstrap() {
  try {
    process.loadEnvFile();
  } catch {
    // no .env file — rely on the real environment
  }
  const env = loadEnv();
  const openApiOnly = Boolean(process.env.OPENAPI_ONLY);

  const adapter = new FastifyAdapter({
    trustProxy: true,
    bodyLimit: 1024 * 1024,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    logger: env.NODE_ENV === 'production' ? { level: 'info' } : false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    rawBody: true,
  });

  app.enableCors({ origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (request, reply) => {
      reply.header('x-request-id', request.id);
    });

  const document = tidyOpenApi(
    cleanupOpenApiDoc(
      repairNullableRoots(
        SwaggerModule.createDocument(
          app,
          new DocumentBuilder()
            .setTitle('Bocardo API')
            .setDescription(
              'Customer, restaurant-partner, rider and admin endpoints. Money is in paise.',
            )
            .setVersion('1.0.0')
            .addBearerAuth()
            .build(),
          {
            operationIdFactory: (controller, method) =>
              `${controller.replace(/Controller$/, '')}_${method}`,
          },
        ),
      ),
      // keep JSON-Schema output here; tidyOpenApi downgrades it to 3.0 consistently
      { version: '3.1' },
    ),
  );

  if (openApiOnly) {
    const out = join(__dirname, '..', 'openapi.json');
    writeFileSync(out, JSON.stringify(document, null, 2));
    new Logger('OpenAPI').log(`wrote ${out}`);
    await app.close();
    return;
  }

  SwaggerModule.setup('docs', app, document);
  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`Bocardo API listening on :${env.PORT} (docs at /docs)`);
}

void bootstrap();
