/**
 * Core type definitions for DeepHorizon Security App
 * 
 * This file contains all shared TypeScript types and interfaces
 * used throughout the application.
 */

// User & Authentication Types
export interface User {
  id: string;
  email: string;
  phone: string;
  name: string;
  created_at: string;
  updated_at: string;
  profile_photo_url?: string;
  passkey_hash?: string;
  subscription_status?: 'active' | 'inactive' | 'expired' | 'trial';
  subscription_plan?: SubscriptionPlan;
  subscription_expires_at?: string;
  family_plan_id?: string;
  is_family_primary?: boolean;
}

export interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  profile_photo_url?: string;
  emergency_contacts?: EmergencyContact[];
  medical_info?: MedicalInfo;
  created_at: string;
  updated_at: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  user_id: string;
}

export interface MedicalInfo {
  blood_type?: string;
  allergies?: string[];
  medications?: string[];
  medical_conditions?: string[];
  emergency_medical_notes?: string;
}

// Subscription Types
export type SubscriptionPlan = 
  | 'individual_monthly'
  | 'individual_yearly'
  | 'family_monthly'
  | 'family_yearly';

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: SubscriptionPlan;
  status: 'active' | 'inactive' | 'expired' | 'cancelled';
  started_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: string;
  family_plan_id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  added_at: string;
  is_primary: boolean;
}

// Location Tracking Types
export type TrackingInterval = 
  | 15 
  | 30 
  | 60 
  | 120 
  | 240 
  | 480 
  | 1440; // minutes

export interface TrackingSession {
  id: string;
  user_id: string;
  status: 'active' | 'completed' | 'ended';
  interval_minutes: TrackingInterval;
  started_at: string;
  ended_at?: string;
  scheduled_end_at: string;
  created_at: string;
  updated_at: string;
}

export interface TrackingLocation {
  id: string;
  tracking_session_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  network_type?: 'wifi' | 'cellular' | 'none';
  timestamp: string;
  created_at: string;
}

// Emergency Types
export interface Emergency {
  id: string;
  user_id: string;
  status: 'active' | 'in_progress' | 'resolved' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  location_latitude?: number;
  location_longitude?: number;
  location_accuracy?: number;
  assigned_agent_id?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}

// Check-in Types
export type CheckInStatus = 
  | 'pending' 
  | 'active' 
  | 'completed' 
  | 'missed' 
  | 'overdue';

export interface ScheduledCheckIn {
  id: string;
  user_id: string;
  scheduled_time: string;
  status: CheckInStatus;
  message?: string;
  location_latitude?: number;
  location_longitude?: number;
  completed_at?: string;
  passkey_verified: boolean;
  created_at: string;
  updated_at: string;
}

// Video/Audio Call Types
export type CallType = 'video' | 'audio';
export type CallStatus = 
  | 'initiating' 
  | 'connecting' 
  | 'active' 
  | 'ended' 
  | 'failed';

export interface CallSession {
  id: string;
  user_id: string;
  agent_id?: string;
  call_type: CallType;
  status: CallStatus;
  room_code: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  created_at: string;
  updated_at: string;
}

// Chat Types
export type ChatPriority = 'low' | 'medium' | 'high' | 'emergency';
export type ChatStatus = 
  | 'pending' 
  | 'assigned' 
  | 'active' 
  | 'closed';

export interface ChatRequest {
  id: string;
  user_id: string;
  agent_id?: string;
  status: ChatStatus;
  priority: ChatPriority;
  category?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_request_id: string;
  sender_id: string;
  sender_type: 'user' | 'agent';
  content: string;
  read: boolean;
  created_at: string;
  updated_at: string;
}

// Bodyguard Booking Types
export type BookingStatus = 
  | 'pending' 
  | 'confirmed' 
  | 'active' 
  | 'completed' 
  | 'cancelled';

export interface BodyguardBooking {
  id: string;
  user_id: string;
  number_of_guards: number;
  service_date: string;
  service_start_time: string;
  service_end_time: string;
  city: string;
  pickup_location: string;
  drop_location: string;
  reason: string;
  special_requirements?: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
}

export interface BodyguardAssignment {
  id: string;
  booking_id: string;
  bodyguard_id: string;
  status: 'assigned' | 'active' | 'completed' | 'cancelled';
  pickup_location: string;
  drop_location: string;
  start_time: string;
  end_time: string;
  special_instructions?: string;
  created_at: string;
  updated_at: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Home: undefined;
  Profile: undefined;
  History: undefined;
  Subscription: undefined;
  SubscriptionPlans: undefined;
  Family: undefined;
  Emergency: { emergencyId?: string };
  CheckIn: { checkInId?: string };
  Chat: { chatRequestId: string };
  EmergencyContacts: undefined;
  TrialExpired: undefined;
  Policies: undefined;
  // TODO: Add these when screens are implemented
  // Tracking: { sessionId?: string };
  // VideoCall: { sessionId: string; roomCode: string };
  // AudioCall: { sessionId: string; roomCode: string };
  // Booking: { bookingId?: string };
};

// Environment Types
export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  streamApiKey: string;
  streamTokenUrl: string;
  streamAppId: string;
  agentDashboardUrl: string;
  env: 'development' | 'production';
}

// Utility Types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

