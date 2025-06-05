import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  mobileNo: string;

  @Prop({ required: true, enum: ['admin', 'doctor', 'patient'] })
  userType: string;

  @Prop()
  dob: Date;

  @Prop()
  gender: string;

  @Prop()
  address: string;

  @Prop()
  hospitalId: string;

  @Prop({ default: 'active' })
  status: string;

  @Prop()
  lastLogin: Date;

  @Prop({ type: String, required: function() { return this.userType === 'doctor'; } })
  specialization: string;

  @Prop()
  identifier: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  resetPasswordOtp?: string;

  @Prop()
  resetPasswordOtpExpiry?: Date;

  @Prop()
  age?: number;

  @Prop()
  state?: string;

  @Prop()
  country?: string;

  @Prop()
  pincode?: string;

  @Prop({ type: Date })
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
