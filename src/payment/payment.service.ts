import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { RedisService } from './redis.service';

@Injectable()
export class PaymentService {
  private razorpay: Razorpay;
  private readonly lockTTL = 300; // 5 minutes lock timeout
  private readonly maxPaymentAttempts = 5;
  private readonly paymentLockDuration = 3600; // 1 hour in seconds

  constructor(private readonly redisService: RedisService) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  private async checkPaymentAttempts(userId: string): Promise<void> {
    const attemptsKey = `payment_attempts:${userId}`;
    const lockedKey = `payment_locked:${userId}`;

    // Check if user is locked
    const isLocked = await this.redisService.get(lockedKey);
    if (isLocked) {
      throw new HttpException(
        'Payment is temporarily locked. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Get current attempts
    const attempts = await this.redisService.get(attemptsKey);
    const currentAttempts = attempts ? parseInt(attempts, 10) + 1 : 1;

    // Update attempts
    await this.redisService.set(attemptsKey, currentAttempts.toString(), this.paymentLockDuration);

    // Lock payments if max attempts exceeded
    if (currentAttempts >= this.maxPaymentAttempts) {
      await this.redisService.set(lockedKey, 'true', this.paymentLockDuration);
      throw new HttpException(
        'Too many payment attempts. Payments are locked for 1 hour.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private async setPaymentState(orderId: string, state: string, data?: any): Promise<void> {
    const stateKey = `payment_state:${orderId}`;
    const stateData = {
      state,
      data,
      timestamp: Date.now(),
      attempts: await this.getPaymentAttempts(data?.userId)
    };
    
    await this.redisService.set(
      stateKey,
      JSON.stringify(stateData),
      86400 // 24 hours TTL
    );

    // Also store in a user-specific list
    if (data?.userId) {
      const userPaymentsKey = `user_payments:${data.userId}`;
      const userPayments = await this.redisService.get(userPaymentsKey) || '[]';
      const payments = JSON.parse(userPayments);
      payments.push({
        orderId,
        amount: data.amount,
        status: state,
        timestamp: Date.now()
      });
      await this.redisService.set(userPaymentsKey, JSON.stringify(payments), 86400);
    }
  }

  private async getPaymentAttempts(userId: string): Promise<number> {
    const attemptsKey = `payment_attempts:${userId}`;
    const attempts = await this.redisService.get(attemptsKey);
    return attempts ? parseInt(attempts, 10) : 0;
  }

  private async acquireLock(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    try {
      await this.redisService.set(lockKey, 'true', this.lockTTL);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async releaseLock(key: string): Promise<void> {
    const lockKey = `lock:${key}`;
    await this.redisService.del(lockKey);
  }

  async verifyPayment(orderId: string, paymentId: string, signature: string) {
    try {
      const text = orderId + "|" + paymentId;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(text)
        .digest("hex");

      const isValid = expectedSignature === signature;

      if (!isValid) {
        return {
          status: 400,
          message: "Invalid payment signature"
        };
      }

      await this.setPaymentState(orderId, 'verified', { paymentId, signature });

      return {
        status: 200,
        message: "Payment verified successfully"
      };
    } catch (error) {
      console.error('Payment verification error:', error);
      return {
        status: 500,
        message: "Payment verification failed",
        error: error.message
      };
    }
  }

  async createOrder(amount: number, userId: string, currency: string = 'INR') {
    try {
      await this.checkPaymentAttempts(userId);

      const options = {
        amount: amount * 100,
        currency,
        receipt: `receipt_${Date.now()}_${userId}`,
      };

      const lockAcquired = await this.acquireLock(options.receipt);
      if (!lockAcquired) {
        return {
          status: 429,
          message: 'Another payment request is in progress. Please try again later.'
        };
      }

      try {
        const order = await this.razorpay.orders.create(options);
        await this.setPaymentState(order.id, 'created', { ...order, userId, amount });

        return {
          status: 200,
          message: 'Order created successfully',
          data: order
        };
      } finally {
        await this.releaseLock(options.receipt);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Razorpay order creation error:', error);
      return {
        status: 500,
        message: 'Failed to create order',
        error: error.message
      };
    }
  }
}