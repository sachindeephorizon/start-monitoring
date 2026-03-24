import { post } from "./config"


export interface CreateUserDeviceInput {
    token: string;
    tokenType: string;
    platform: string;
    deviceModel?: string | null;
    osVersion?: string | null;
    isActive: boolean;
}

export const createUserDevice = async (input: CreateUserDeviceInput) => {
    const res = await post("/user-devices", input);
    return res.data;
}


export const unregisterDevice = async (token: string) => {
    const res = await post("/user-devices/unregister", { token });
    return res.data;
}