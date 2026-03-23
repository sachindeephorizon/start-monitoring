import { Alert } from "react-native";
import { clearApiSession } from "../session/session";

interface HandleApiErrorOptions {
  showAlert?: boolean;
  logoutOn401?: boolean;
}

export const handleApiError = async (
  error: any,
  options: HandleApiErrorOptions = {}
) => {
  const { showAlert = true, logoutOn401 = false } = options;

  let message = "Something went wrong. Please try again.";

  // 🔹 Axios error (server responded)
  if (error?.response) {
    const status = error.response.status;
    const data = error.response.data;

    // Try extracting backend message
    if (data?.message) {
      message = data.message;
    } else if (data?.error) {
      message = data.error;
    }

    // 🔥 Handle 401 (unauthorized)
    if (status === 401 && logoutOn401) {
      await clearApiSession();
      message = "Session expired. Please login again.";
    }

    // 🔥 Handle 403
    if (status === 403) {
      message = "You are not allowed to perform this action.";
    }

    // 🔥 Handle 500
    if (status >= 500) {
      message = "Server error. Please try again later.";
    }
  }

  // 🔹 Network error (no response)
  else if (error?.request) {
    message = "Network error. Please check your internet connection.";
  }

  // 🔹 Timeout
  if (error?.code === "ECONNABORTED") {
    message = "Request timed out. Please try again.";
  }

  // 🔹 Manual error
  if (error?.message && !error?.response) {
    message = error.message;
  }

  // 🔥 Show alert (optional)
  if (showAlert) {
    Alert.alert("Error", message);
  }

  // Always return message for flexibility
  return {
    message,
    originalError: error,
  };
};