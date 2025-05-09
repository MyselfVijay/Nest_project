import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema()
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  mobileNo: string;

  @Prop({ required: true })
  hospitalId: string;

  @Prop({ required: true, enum: ['doctor', 'patient'] })
  userType: string;

  @Prop({ type: Date })
  dob: Date;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  lastLogin: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);