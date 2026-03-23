import { UserProfile } from "@/core/profile";
import { get, post } from "./config";

export interface LoginSendOtpResponse {
  success: boolean;
  message: string;
  isNewUser: boolean;
}


export interface VerifyOtpResponse {
    accessToken: string;
    refreshToken: string;
    userId: string;
    isNewUser: boolean;
    user: UserProfile
}

export const loginSendOtp = async (phone: string): Promise<LoginSendOtpResponse> => {
  const res = await post("/auth/login-send-otp", {
    phone,
  });

  return res.data;
};


export const verifyOtp = async (phone: string, otp: string): Promise<VerifyOtpResponse> => {
  const res = await post("/auth/login-with-otp", {
    phone,
    otp,
  });

  return res.data;
}


export const refreshToken = async (refreshToken: string): Promise<VerifyOtpResponse> => {
  const res = await post("/auth/refresh", {
    refreshToken,
  });

  return res.data;
}

export const logout = async (): Promise<void> => {
  await post("/auth/logout");
}


export const getUserProfile = async () => {
  const res = await get("/users/me");
  return res;
}



export interface UserSubscription {
    id: string;
    userId: string;
    planId: string;
    type: SubscriptionType;
    gatewayType: GatewayType;
    gatewaySubscriptionId?: string;
    status: SubscriptionStatus;
    amount: number;
    offerCode?: string;
    offerAmount?: number;
    billedAmount: number;
    isPaid: boolean;
    paymentReference?: string;
    isLatest: boolean;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    createdAt: Date;
    updatedAt: Date;
}

export enum SubscriptionType {
    FREE = "FREE",
    PAID = "PAID",
}

export enum GatewayType {
    RAZORPAY = "RAZORPAY",
    IOS = "IOS",
    GOOGLE_PLAY = "GOOGLE_PLAY",
}

export enum SubscriptionStatus {
    ACTIVE = "ACTIVE",
    INACTIVE = "INACTIVE",
}


export const getUserSubscriptions = async (): Promise<UserSubscription[]> => {
  const res = await get("/user-subscriptions/my-active-subscription");
  return res;
}