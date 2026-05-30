import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from '@/app.module';
import { HttpExceptionFilter } from '@/shared/filters/http-exception.filter';
import { TransformInterceptor } from '@/shared/interceptors/transform.interceptor';

/**
 * Bootstrap the NestJS application
 * Configures security, validation, documentation, and starts the HTTP server
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Create NestJS application instance
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Get configuration service
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const corsEnabled = configService.get<boolean>('CORS_ENABLED', true);
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '*').split(',');

  // Set global prefix for all routes
  app.setGlobalPrefix(apiPrefix);

  // Security middleware
  app.use(helmet());
  app.use(compression());

  // Enable CORS
  if (corsEnabled) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
  }

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response transformation interceptor
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger documentation
  const swaggerEnabled = configService.get<boolean>('SWAGGER_ENABLED', true);
  if (swaggerEnabled && process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle(
        configService.get<string>('SWAGGER_TITLE', 'Kafka Playground API'),
      )
      .setDescription(
        configService.get<string>(
          'SWAGGER_DESCRIPTION',
          'API documentation for Kafka Playground',
        ),
      )
      .setVersion(configService.get<string>('SWAGGER_VERSION', '1.0'))
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    const swaggerPath = configService.get<string>('SWAGGER_PATH', 'api/docs');
    SwaggerModule.setup(swaggerPath, app, document);
    logger.log(`Swagger documentation available at: /${swaggerPath}`);
  }

  // Graceful shutdown
  app.enableShutdownHooks();

  // Start the server
  await app.listen(port);
  logger.log(
    `Application is running on: http://localhost:${port}/${apiPrefix}`,
  );
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

bootstrap();
