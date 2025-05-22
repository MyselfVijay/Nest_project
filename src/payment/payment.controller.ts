import { Controller, Post, Body, HttpCode, HttpStatus, Headers } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { CreateOrderDto, VerifyPaymentDto } from './dto/payment.dto';
import crypto from 'crypto';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() createOrderDto: CreateOrderDto) {
    return this.paymentService.createOrder(
      createOrderDto.amount,
      createOrderDto.userId, // Add userId parameter
      createOrderDto.currency || 'INR' // Provide default value for currency
    );
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyPayment(@Body() verifyPaymentDto: VerifyPaymentDto) {
    return this.paymentService.verifyPayment(
      verifyPaymentDto.orderId,
      verifyPaymentDto.paymentId,
      verifyPaymentDto.signature
    );
  }

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() webhookData: any,
    @Headers('x-razorpay-signature') signature: string
  ) {
    try {
      // Verify webhook signature
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        throw new Error('Webhook secret is not configured');
      }
      const shasum = crypto.createHmac('sha256', webhookSecret);
      shasum.update(JSON.stringify(webhookData));
      const digest = shasum.digest('hex');
  
      if (digest === signature) {
        // Process the webhook event
        switch (webhookData.event) {
          case 'payment.captured':
            await this.paymentService.handlePaymentSuccess(webhookData.payload.payment.entity);
            break;
          case 'payment.failed':
            await this.paymentService.handlePaymentFailure(webhookData.payload.payment.entity);
            break;
          // Add more event handlers as needed
        }
        return { status: 'success' };
      }
      
      return { status: 'invalid signature' };
    } catch (error) {
      console.error('Webhook error:', error);
      return { status: 'error', message: error.message };
    }
  }
}