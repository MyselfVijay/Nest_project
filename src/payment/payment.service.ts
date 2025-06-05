import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { RedisService } from './redis.service';
import { Payment } from '../schemas/payment.schema';

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  amount_due: number;
  amount_paid: number;
  attempts: number;
  created_at: number;
  currency: string;
  entity: string;
  notes: any[];
  offer_id: string | null;
  receipt: string;
  status: string;
}

@Injectable()
export class PaymentService {
  private readonly razorpay: Razorpay;
  private readonly lockTTL = 300; // 5 minutes lock timeout
  private readonly maxPaymentAttempts = 5;
  private readonly paymentLockDuration = 3600; // 1 hour in seconds

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    private readonly redisService: RedisService
  ) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    
    if (!keyId || !keySecret) {
      console.error('Razorpay credentials are missing in environment variables');
      throw new Error('Payment gateway configuration is missing');
    }

    try {
      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
      console.log('Razorpay instance initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Razorpay:', error);
      throw new Error('Failed to initialize payment gateway');
    }
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
      console.log('Verifying payment:', { orderId, paymentId });

      // Find the payment in our database
      const payment = await this.paymentModel.findOne({ orderId });
      if (!payment) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      // Generate the expected signature
      const text = orderId + "|" + paymentId;
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(text)
        .digest("hex");

      // Verify signature
      const isValid = expectedSignature === signature;
      if (!isValid) {
        console.error('Invalid signature:', {
          expected: expectedSignature,
          received: signature
        });
        throw new HttpException('Invalid payment signature', HttpStatus.BAD_REQUEST);
      }

      // Update payment status in database
      payment.status = 'verified';
      payment.paymentDetails = {
        ...payment.paymentDetails,
        paymentId,
        signature,
        verifiedAt: new Date()
      };
      payment.updatedAt = new Date();

      await payment.save();
      console.log('Payment verified successfully:', { orderId, paymentId });

      return {
        message: "Payment verified successfully",
        data: {
          orderId: payment.orderId,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency
        }
      };
    } catch (error) {
      console.error('Payment verification error:', {
        error: error.message,
        orderId,
        paymentId
      });

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Payment verification failed',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async createOrder(amount: number, userId: string, currency: string = 'INR') {
    try {
      console.log('Starting order creation with:', { amount, userId, currency });
      
      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.error('Razorpay credentials are not configured');
        throw new HttpException('Payment gateway configuration is missing', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      await this.checkPaymentAttempts(userId);
      console.log('Payment attempts check passed');

      // Generate a very short receipt ID (max 40 chars)
      const timestamp = Math.floor(Date.now() / 1000).toString(36); // Convert timestamp to base36
      const userIdShort = userId.slice(-4); // Take last 4 chars of userId
      const receipt = `r_${timestamp}_${userIdShort}`; // Format: r_<timestamp_base36>_<last4>

      const options = {
        amount: amount * 100, // Amount in paise
        currency,
        receipt,
        notes: [],
        payment_capture: 1
      } as any; // Type assertion to avoid Razorpay types issue
      
      console.log('Creating Razorpay order with options:', options);

      try {
        const order = await this.razorpay.orders.create(options) as unknown as RazorpayOrderResponse;
        console.log('Razorpay order created successfully:', { orderId: order.id });

        // Save the order in our database with the exact format needed
        const payment = new this.paymentModel({
          orderId: order.id,
          userId: userId,
          amount: amount,
          currency: currency,
          status: 'created',
          paymentDetails: {
            amount: order.amount,
            amount_due: order.amount_due,
            amount_paid: order.amount_paid,
            attempts: order.attempts,
            created_at: order.created_at,
            currency: order.currency,
            entity: order.entity,
            id: order.id,
            notes: order.notes || [],
            offer_id: order.offer_id,
            receipt: order.receipt,
            status: order.status
          },
          createdAt: new Date(),
          updatedAt: new Date()
        });

        const savedPayment = await payment.save();
        console.log('Payment record saved to database:', { paymentId: savedPayment._id });

        // Return the exact format requested
        return {
          _id: savedPayment._id,
          orderId: savedPayment.orderId,
          userId: savedPayment.userId,
          amount: savedPayment.amount,
          currency: savedPayment.currency,
          status: savedPayment.status,
          paymentDetails: savedPayment.paymentDetails,
          createdAt: savedPayment.createdAt,
          updatedAt: savedPayment.updatedAt,
          __v: savedPayment.__v
        };
      } catch (razorpayError: any) {
        console.error('Razorpay API Error:', {
          error: razorpayError.error,
          stack: razorpayError.stack,
          statusCode: razorpayError.statusCode,
          error_description: razorpayError.description
        });

        // Throw appropriate HTTP exception based on the error
        if (razorpayError.statusCode === 400) {
          throw new HttpException(
            razorpayError.error?.description || 'Invalid payment request',
            HttpStatus.BAD_REQUEST
          );
        }
        throw new HttpException(
          'Failed to create payment order',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    } catch (error) {
      console.error('Detailed payment creation error:', {
        error: error.message,
        stack: error.stack,
        userId,
        amount,
        currency,
        errorType: error.constructor.name
      });

      // If it's already an HTTP exception, rethrow it
      if (error instanceof HttpException) {
        throw error;
      }

      // Otherwise, throw a generic 500 error
      throw new HttpException(
        'Failed to create payment order',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async handlePaymentSuccess(paymentEntity: any) {
    try {
      // Update payment status in database
      await this.updatePaymentStatus(paymentEntity.order_id, 'success', paymentEntity);
      
      // You can add additional success handling here
      // For example: send confirmation email, update inventory, etc.
      
      return { status: 'success', message: 'Payment processed successfully' };
    } catch (error) {
      console.error('Payment success handling error:', error);
      throw error;
    }
  }
  
  async handlePaymentFailure(paymentEntity: any) {
    try {
      // Update payment status in database
      await this.updatePaymentStatus(paymentEntity.order_id, 'failed', paymentEntity);
      
      // You can add additional failure handling here
      // For example: notify user, release held inventory, etc.
      
      return { status: 'failed', message: 'Payment failed' };
    } catch (error) {
      console.error('Payment failure handling error:', error);
      throw error;
    }
  }
  
  private async updatePaymentStatus(orderId: string, status: 'success' | 'failed', paymentDetails: any) {
    // Implement your database update logic here
    // This is just a placeholder - adjust according to your database schema
    return this.paymentModel.findOneAndUpdate(
      { orderId },
      {
        status,
        paymentDetails,
        updatedAt: new Date()
      },
      { new: true }
    );
  }
}