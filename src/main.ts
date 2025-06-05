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
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  app.enableCors();
  
  // Set global prefix
  app.setGlobalPrefix('api');
  
  // Configure global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Configure body parser with sanitization
  app.use(bodyParser.json({
    limit: '10mb',
    verify: (req: any, res: any, buf: Buffer) => {
      try {
        // Clean the input by removing invisible characters and normalizing whitespace
        const content = buf.toString()
          .replace(/[\u00A0\u1680\u180e\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ')  // Replace invisible spaces
          .replace(/\r\n/g, '\n')  // Normalize line endings
          .trim();  // Remove leading/trailing whitespace

        console.log('Processing JSON request:', {
          originalLength: buf.length,
          cleanedLength: content.length,
          content: content
        });

        // Try to parse the cleaned JSON
        JSON.parse(content);
      } catch (e) {
        console.error('JSON Parse Error:', {
          error: e.message,
          details: 'Please ensure your JSON is properly formatted with correct commas and quotes'
        });
        throw new Error('Invalid JSON format. Please check your request body formatting.');
      }
    }
  }));

  // Configure Swagger
  const config = new DocumentBuilder()
    .setTitle('Hospital Management API')
    .setDescription('API documentation for Hospital Management System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

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

  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
}
bootstrap();
