import { Request } from 'express';
import { RequestUser } from './request-user.interface';

export interface ExpressRequest extends Request {
  user?: RequestUser;
} 