import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserType {
  DOCTOR = 'doctor',
  PATIENT = 'patient'
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, enum: UserType })
  userType: UserType;

  @Prop({ required: true })
  hospitalId: string;

  @Prop()
  mobileNo?: string;

  @Prop()
  dob?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);