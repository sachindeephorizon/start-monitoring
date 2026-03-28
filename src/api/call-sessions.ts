import { post } from "./config"



export enum CallPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum CallType {
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
}

export enum CallServiceType {
  DIRECT_VIDEO_CALL = 'DIRECT_VIDEO_CALL',
  EMERGENCY_VIDEO_CALL = 'EMERGENCY_VIDEO_CALL',
  AUDIT_CALL = 'AUDIT_CALL',
}

export enum CallStatus {
  INITIATED = 'INITIATED',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
  MISSED = 'MISSED',
}

export interface CreateCallSessionDto {
  callType: CallType;
  serviceType: CallServiceType;
  priority: CallPriority;
  callId: string;
}

export const callSessionTokenGenerate = async () : Promise<string> => {
    const res = await post(`/call-sessions/token`)
    return res.data;
}


export const initiateCallSession = async (data: CreateCallSessionDto) => {
    const res = await post(`/call-sessions/initiate`, {
        callType: data.callType,
        priority: data.priority,
        serviceType: data.serviceType,
        callId: data.callId
    })
  return res.data;
}


export const updateCallSessionStatus = async (callId: string, status: CallStatus) => {
    const res = await post(`/call-sessions/update-status`, {
        callId,
        status
    })
  return res.data;
}

export const endCallSession = async (callId: string) => {
    const res = await post(`/call-sessions/end`, {
        callId
    })
  return res.data;
}