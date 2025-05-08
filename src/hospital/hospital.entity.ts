import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Hospital extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  hospitalId: string;  // Changed from 'id' to 'hospitalId' to avoid Document conflict
}

export const HospitalSchema = SchemaFactory.createForClass(Hospital);