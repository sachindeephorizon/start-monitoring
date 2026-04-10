import { get, post } from './config';

export type BodyguardBookingStatus = 'PENDING' | 'COMPLETED';

export interface BodyguardBookingDto {
  id: string;
  userId: string;
  city: string;
  bookingDate: string;
  reason: string;
  numberOfBodyguards: number;
  status: BodyguardBookingStatus;
  agentRemarks?: string | null;
  updatedByAgentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBodyguardBookingPayload {
  city: string;
  date: string;
  reason: string;
  numberOfBodyguards: number;
}

export interface CommandResponse<T> {
  status: number;
  message: string;
  data: T;
}

// POST /v1/bodyguard-booking
export const createBodyguardBooking = async (
  payload: CreateBodyguardBookingPayload,
): Promise<CommandResponse<BodyguardBookingDto>> => {
  return post('/bodyguard-booking', payload);
};

// GET /v1/bodyguard-booking/my
export const getMyBodyguardBookings = async (): Promise<BodyguardBookingDto[]> => {
  return get('/bodyguard-booking/my');
};
