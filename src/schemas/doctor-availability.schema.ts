const { Schema, Prop, SchemaFactory } = require('@nestjs/mongoose');
import { Document } from 'mongoose';

export type DoctorAvailabilityDocument = DoctorAvailability & Document;

@Schema()
export class DoctorAvailability {
  @Prop({ required: true, ref: 'User' })
  doctorId: string;

  @Prop({ required: true })
  hospitalId: string;

  @Prop({ required: true })
  slotDate: Date;

  @Prop({ required: true })
  slotTime: string; // Format: "10:00-10:15"

  @Prop({ required: true })
  fromTime: Date;

  @Prop({ required: true })
  toTime: Date;

  @Prop({ default: true })
  isAvailable: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const DoctorAvailabilitySchema = SchemaFactory.createForClass(DoctorAvailability);