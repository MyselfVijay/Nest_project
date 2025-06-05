import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ required: true })
  orderId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true, min: 1 })
  amount: number;

  @Prop({ required: true, default: 'INR' })
  currency: string;

  @Prop({ 
    required: true, 
    enum: ['created', 'authorized', 'captured', 'refunded', 'failed'],
    default: 'created'
  })
  status: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  paymentDetails: any;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);