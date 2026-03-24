import { get, post } from "./config";

export interface EmergencyContact {
  id: string;
  emergencyContact: string;
  emergencyContactPhone: string;
  emergencyContactEmail?: string;
  emergencyContactRelation: string;
  createdAt: Date;
  updatedAt: Date;
}


export interface AddEmergencyContactInput {
  emergencyContact: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
}

export const getEmergencyContacts = async () : Promise<EmergencyContact[]> => {
  const res = await get("/emergency-contacts");
  return res;
};


export const updateEmergencyContact = async (input: AddEmergencyContactInput[]) => {
  const res = await post(`/emergency-contacts`, {
    emergencyContacts: input
  });
  return res.data;
}


export const deleteEmergencyContact = async (id: string) => {
  const res = await post(`/emergency-contacts/delete`, {
    id
  });
  return res.data;
}


