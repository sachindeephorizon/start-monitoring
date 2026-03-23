import { post } from "./config";


export interface UpdateUserProfileInput {
    name?: string;
  email?: string;
  dateOfBirth?: string;
  homeAddress?: string;
  homeAddressState?: string;
  homeAddressCity?: string;
  workAddress?: string;
  workAddressState?: string;
  workAddressCity?: string;
  bloodGroup?: string;
  allergies?: string;
  emergencyContact?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
}

export const updateUserProfile = async (input: UpdateUserProfileInput) => {
  const res = await post("/users/update-profile", input);

  return res.data;
};


export const updatePasskey = async (passkey: string) => {
  const res = await post("/users/update-passkey", { passkey });

  return res.data;
}


export const skipPasskeySetup = async () => {
  const res = await post("/users/skip-passkey-setup");

  return res.data;
}