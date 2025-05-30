import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Identifier extends Document {
  @Prop({ required: true, unique: true })
  identifier: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  mobileNo: string;

  @Prop({ enum: ['pending', 'active', 'inactive', 'registered'], default: 'pending' })
  status: string;

  @Prop({ enum: ['patient', 'user'], default: 'patient' })
  userType: string;

  @Prop()
  otp?: string;

  @Prop()
  otpExpiresAt?: Date;
}

export const IdentifierSchema = SchemaFactory.createForClass(Identifier); 