import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HealthRecordDocument = HealthRecord & Document;

@Schema()
export class HealthRecord {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  patientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  doctorId: Types.ObjectId;

  @Prop({ required: true })
  diagnosis: string;

  @Prop({ required: true })
  prescription: string;

  @Prop({ required: true })
  notes: string;

  @Prop({ required: true })
  visitDate: Date;

  @Prop({ required: true })
  hospitalId: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const HealthRecordSchema = SchemaFactory.createForClass(HealthRecord);