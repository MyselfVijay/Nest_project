import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum UserType {
  DOCTOR = 'doctor',
  PATIENT = 'patient'
}

@Schema({ timestamps: true })
export class User extends Document {
  // The _id will still be available and typed as Types.ObjectId

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

  @Prop({ required: true, match: /^[6-9]\d{9}$/ })
  mobileNo: string;

  @Prop()
  dob?: Date;

  @Prop()
  refreshToken?: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLogin?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);