import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  paymentDate: Date;

  @Prop({ required: true, enum: ['pending', 'completed', 'failed', 'refunded'] })
  status: string;

  @Prop({ required: true, enum: ['credit_card', 'debit_card', 'cash', 'online_transfer'] })
  paymentMethod: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  patientId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  doctorId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  hospitalId: string;

  @Prop()
  description: string;

  @Prop()
  transactionId: string;

  @Prop()
  notes: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);