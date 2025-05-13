const { Schema, Prop, SchemaFactory } = require('@nestjs/mongoose');
import { Document } from 'mongoose';

export type AppointmentDocument = Appointment & Document;

@Schema()
export class Appointment {
  @Prop({ required: true, ref: 'User' })
  doctorId: string;

  @Prop({ required: true, ref: 'User' })
  patientId: string;

  @Prop({ required: true })
  hospitalId: string;

  @Prop({ required: true })
  appointmentTime: Date;

  @Prop({ default: 'scheduled', enum: ['scheduled', 'completed', 'cancelled'] })
  status: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);