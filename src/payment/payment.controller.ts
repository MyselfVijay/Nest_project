import { Controller, Post, Body } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-order')
  async createOrder(@Body() body: { amount: number; currency?: string }) {
    return this.paymentService.createOrder(body.amount, body.currency);
  }

  @Post('verify')
  async verifyPayment(
    @Body() body: { orderId: string; paymentId: string; signature: string },
  ) {
    return this.paymentService.verifyPayment(
      body.orderId,
      body.paymentId,
      body.signature,
    );
  }
}