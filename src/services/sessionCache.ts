/**
 * Session cache utility
 * Simple in-memory cache for user session
 */

let cachedUser: any = null;

export function getCachedUser(): any {
  return cachedUser;
}

export function setCachedUser(user: any): void {
  cachedUser = user;
}

export function clearCachedUser(): void {
  cachedUser = null;
}

