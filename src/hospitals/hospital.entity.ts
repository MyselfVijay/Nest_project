import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Hospital extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  code: string;

  @Prop()
  address: string;

  @Prop()
  contactNo: string;
}

export const HospitalSchema = SchemaFactory.createForClass(Hospital);