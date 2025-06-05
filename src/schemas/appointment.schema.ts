import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from './user.schema';

export type AppointmentDocument = Appointment & Document;

@Schema({ timestamps: true })
export class Appointment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  patientId: User;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  doctorId: User;

  @Prop({ required: true })
  appointmentDate: Date;

  @Prop({ required: true, default: 30 })
  duration: number;

  @Prop({ required: true, enum: ['scheduled', 'confirmed', 'completed', 'cancelled'], default: 'confirmed' })
  status: string;

  @Prop()
  reason: string;

  @Prop()
  notes: string;

  @Prop({ required: true })
  hospitalId: string;

  @Prop({ default: false })
  reminderSent: boolean;

  @Prop({ default: false })
  dayBeforeReminderSent: boolean;

  @Prop({ default: false })
  weeklyReminderSent: boolean;

  @Prop()
  location: string;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);