import axios, { AxiosRequestConfig } from "axios";
import { getApiSession } from "../session/session";

let baseURL = process.env.EXPO_PUBLIC_BACKEND_URL;

const apiVersion = process.env.EXPO_PUBLIC_BACKEND_VERSION;

if (apiVersion) {
  baseURL = `${baseURL}/api/${apiVersion}`;
}

export const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});


apiClient.interceptors.request.use(async (config) => {
  const { token, refresh } = await getApiSession();

  config.headers = config.headers ?? {};

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (refresh) {
    config.headers["x-refresh-token"] = refresh;
  }

  return config;
});

export const get = async (
  url: string,
  config?: AxiosRequestConfig,
) => {
  const response = await apiClient.get(url, config);
  return response.data;
};

export const post = async (
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
) => {
  const response = await apiClient.post(url, body, config);
  return response.data;
};

export const patch = async (
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
) => {
  const response = await apiClient.patch(url, body, config);
  return response.data;
};

export const remove = async (
  url: string,
  config?: AxiosRequestConfig,
) => {
  const response = await apiClient.delete(url, config);
  return response.data;
};

export const request = {
  get,
  post,
  patch,
  delete: remove,
};

export { remove as delete };