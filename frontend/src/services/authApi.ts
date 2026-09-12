import { apiRequest } from "@/lib/apiClient";
import type { TokenResponse, User } from "@/types";

export function login(email: string, password: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

export function fetchCurrentUser(): Promise<User> {
  return apiRequest<User>("/users/me");
}

export function logout(): Promise<void> {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}
