import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  password: string;

  @Prop({ required: true })
  mobileNo: string;

  @Prop()
  hospitalId: string;

  @Prop({ required: true, enum: ['doctor', 'patient'] })
  userType: string;

  @Prop({ type: Date })
  dob: Date;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  lastLogin: Date;

  @Prop()
  resetPasswordOtp?: string;

  @Prop()
  resetPasswordOtpExpiry?: Date;

  @Prop()
  age?: number;

  @Prop()
  gender?: string;

  @Prop()
  identifier?: string;

  @Prop({ enum: ['pending', 'active', 'inactive', 'registered'], default: 'pending' })
  status: string;

  @Prop()
  address?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
