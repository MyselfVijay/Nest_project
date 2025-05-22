import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Payment extends Document {
  @Prop({ required: true })
  orderId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ enum: ['created', 'success', 'failed'], default: 'created' })
  status: string;

  @Prop({ type: Object })
  paymentDetails: Record<string, any>;

  @Prop()
  razorpayPaymentId: string;

  @Prop()
  razorpaySignature: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);