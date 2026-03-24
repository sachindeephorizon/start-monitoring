import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

export const setApiSession = async (token: string, refresh: string) => {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
};

export const getApiSession = async () => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);

  return { token, refresh };
};

export const clearApiSession = async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
};