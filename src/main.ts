import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TokenBlockGuard } from './token/token-block.guard';
import { TokenBlockFilter } from './token/token-block.filter';
import { TokenBlockService } from './token/token-block.service';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AuthService } from './auth/auth.service';
import { APP_GUARD } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors();
  
  // Set global prefix
  app.setGlobalPrefix('api');
  
  // Apply global pipes
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  // Get required services
  const tokenBlockService = app.get(TokenBlockService);
  const reflector = app.get(Reflector);
  const authService = app.get(AuthService);

  // Apply global guards
  app.useGlobalGuards(
    new TokenBlockGuard(tokenBlockService, reflector)
  );

  // Apply global filters
  app.useGlobalFilters(new TokenBlockFilter(tokenBlockService));

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Hospital Management API')
    .setDescription('API documentation for Hospital Management System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
}
bootstrap();
