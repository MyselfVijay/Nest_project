import { Injectable } from '@nestjs/common';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
  private razorpay: Razorpay;

  constructor() {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  async createOrder(amount: number, currency: string = 'INR') {
    try {
      const options = {
        amount: amount * 100, // amount in smallest currency unit (paise)
        currency,
        receipt: `receipt_${Date.now()}`,
      };

      const order = await this.razorpay.orders.create(options);
      return {
        status: 200,
        message: 'Order created successfully',
        data: order
      };
    } catch (error) {
      console.error('Razorpay order creation error:', error);
      return {
        status: 500,
        message: 'Failed to create order',
        error: error.message
      };
    }
  }

  async verifyPayment(orderId: string, paymentId: string, signature: string) {
    try {
      const secretKey = process.env.RAZORPAY_KEY_SECRET;
      if (!secretKey) {
        throw new Error('RAZORPAY_KEY_SECRET is not configured');
      }

      const body = orderId + "|" + paymentId;
      const expectedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(body.toString())
        .digest('hex');

      if (expectedSignature === signature) {
        return {
          status: 200,
          message: 'Payment verified successfully'
        };
      } else {
        return {
          status: 400,
          message: 'Invalid payment signature'
        };
      }
    } catch (error) {
      console.error('Payment verification error:', error);
      return {
        status: 500,
        message: 'Payment verification failed',
        error: error.message
      };
    }
  }
}