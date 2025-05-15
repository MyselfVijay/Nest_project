import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
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

// Add indexes for frequently queried fields
DoctorAvailabilitySchema.index({ doctorId: 1, hospitalId: 1 });
DoctorAvailabilitySchema.index({ fromTime: 1, toTime: 1 });
DoctorAvailabilitySchema.index({ slotTime: 1 });
DoctorAvailabilitySchema.index({ isAvailable: 1 });