import { apiRequest } from "@/lib/apiClient";
import type { OfficerDirectoryEntry, PoliceRank, RankOption, User, UserRole } from "@/types";

export interface AccountProvisionRequest {
  full_name: string;
  badge_number: string;
  email: string;
  password: string;
  role: UserRole;
  rank: PoliceRank;
  station?: string | null;
  is_view_only?: boolean;
}

export function listUsers(): Promise<User[]> {
  return apiRequest<User[]>("/users");
}

/**
 * The ranks the CURRENT officer is allowed to provision. The backend decides
 * this, so the form can never offer a rank the server would reject — and a
 * junior officer simply receives an empty list.
 */
export function listProvisionableRanks(): Promise<RankOption[]> {
  return apiRequest<RankOption[]>("/users/ranks");
}

export function provisionAccount(data: AccountProvisionRequest): Promise<User> {
  return apiRequest<User>("/users", { method: "POST", body: data });
}

export function deactivateAccount(userId: string): Promise<User> {
  return apiRequest<User>(`/users/${userId}/deactivate`, { method: "POST" });
}

/** PII-free roster for colleague pickers (witnessing officer, etc.). Any rank may call it. */
export function listOfficerDirectory(): Promise<OfficerDirectoryEntry[]> {
  return apiRequest<OfficerDirectoryEntry[]>("/users/directory");
}
