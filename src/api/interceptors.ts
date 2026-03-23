import { apiClient } from "./config";
import { refreshToken } from "./auth";
import { clearApiSession, getApiSession, setApiSession } from "@/session/session";


let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

export const setupInterceptors = () => {
  // ✅ Request interceptor
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

  // 🔥 Response interceptor (AUTO REFRESH)
  apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      if (error.response?.status !== 401) {
        return Promise.reject(error);
      }

      if (originalRequest._retry) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      const { refresh } = await getApiSession();

      if (!refresh) {
        await clearApiSession();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject,
          });
        });
      }

      isRefreshing = true;

      try {
        const res = await refreshToken(refresh);

        const newToken = res.accessToken;
        const newRefresh = res.refreshToken;

        await setApiSession(newToken, newRefresh);

        processQueue(null, newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        return apiClient(originalRequest);
      } catch (err) {
        processQueue(err, null);
        await clearApiSession();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
  );
};