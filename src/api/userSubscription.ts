import { apiClient, get, post } from './config';
import type { UserSubscription } from './auth';

export interface InitiateUserSubscriptionRequest {
  userId: string;
  planId: string;
  type: 'FREE' | 'PAID';
  gatewayType: 'RAZORPAY' | 'IOS' | 'GOOGLE_PLAY';
  offerCode?: string;
}

export interface PaymentGatewayPayload {
  gatewayType: 'RAZORPAY' | 'IOS' | 'GOOGLE_PLAY';
  keyId?: string;
  subscriptionId?: string;
  localSubscriptionId?: string;
  productId?: string;
  planId?: string;
  amount: number;
  currency: string;
}

export interface InitiatedUserSubscription extends UserSubscription {
  paymentRequired?: boolean;
  paymentGatewayPayload?: PaymentGatewayPayload;
}

interface ApiEnvelope<T> {
  status: number;
  message: string;
  data: T;
}

// IMPORTANT: Backend route currently uses /intiate (not /initiate).
export const initiateUserSubscription = async (
  payload: InitiateUserSubscriptionRequest
): Promise<InitiatedUserSubscription> => {
  const res = await post('/user-subscriptions/intiate', payload);
  const maybeEnvelope = res as ApiEnvelope<InitiatedUserSubscription> | InitiatedUserSubscription;

  if (maybeEnvelope && typeof maybeEnvelope === 'object' && 'data' in maybeEnvelope) {
    return (maybeEnvelope as ApiEnvelope<InitiatedUserSubscription>).data;
  }

  return maybeEnvelope as InitiatedUserSubscription;
};

export const getMyActiveSubscription = async (): Promise<UserSubscription[]> => {
  const res = await get('/user-subscriptions/my-active-subscription');
  return (res || []) as UserSubscription[];
};

export interface ConfirmIosSubscriptionRequest {
  // userId: string;
  planId: string;
  localSubscriptionId: string;
  receiptData: string;
  signedTransactionInfo?: string;
}

export const confirmIosSubscription = async (
  payload: ConfirmIosSubscriptionRequest
): Promise<UserSubscription> => {
  const res = await post('/user-subscriptions/ios/confirm', payload);
  return res as UserSubscription;
};

export interface LatestInvoiceDownloadResult {
  arrayBuffer: ArrayBuffer;
  bytes: Uint8Array;
  filename: string;
  contentType?: string;
}

const getFilenameFromContentDisposition = (
  contentDisposition?: string,
  fallback = `invoice-${Date.now()}.pdf`
): string => {
  if (!contentDisposition) return fallback;

  const match = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(contentDisposition);
  const raw = match?.[1] || match?.[2];
  if (!raw) return fallback;

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export const downloadLatestInvoice = async (): Promise<LatestInvoiceDownloadResult> => {
  const response = await apiClient.get('/user-subscriptions/latest-invoice/download', {
    headers: {
      Accept: 'application/pdf',
    },
    responseType: 'arraybuffer',
  });

  const contentDisposition =
    (response.headers?.['content-disposition'] as string | undefined) ||
    (response.headers?.['Content-Disposition'] as string | undefined);
  const filename = getFilenameFromContentDisposition(contentDisposition);

  const rawArrayBuffer = (response.data || new ArrayBuffer(0)) as ArrayBuffer;
  const bytes = new Uint8Array(rawArrayBuffer);
  const stableBytes = new Uint8Array(bytes.length);
  stableBytes.set(bytes);
  const arrayBuffer: ArrayBuffer = stableBytes.buffer;
  const hasPdfSignature =
    stableBytes.length >= 4 &&
    stableBytes[0] === 0x25 &&
    stableBytes[1] === 0x50 &&
    stableBytes[2] === 0x44 &&
    stableBytes[3] === 0x46;

  console.log('[InvoiceDownload][API] Response received', {
    status: response.status,
    contentType: (response.headers?.['content-type'] as string | undefined) || 'application/pdf',
    contentDisposition,
    filename,
    payloadType: typeof response.data,
    bytesLength: stableBytes.length,
    hasPdfSignature,
  });

  return {
    arrayBuffer,
    bytes: stableBytes,
    filename,
    contentType: (response.headers?.['content-type'] as string | undefined) || 'application/pdf',
  };
};
