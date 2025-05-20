import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { RedisService } from './redis.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, RedisService],
  exports: [PaymentService]
})
export class PaymentModule {}