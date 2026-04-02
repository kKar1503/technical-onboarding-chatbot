import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Intercept requests to attach userId from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const userId = localStorage.getItem("onboarding-user-id");
    if (userId) {
      config.headers["X-User-Id"] = userId;
    }
  }
  return config;
});
