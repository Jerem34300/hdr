// True when hdar runs inside the Google Play app (Trusted Web Activity).
// The store version hides content that Play review rejects (cruising spots).
const KEY = "hdar.storeApp";
export function isStoreApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (document.referrer.startsWith("android-app://chat.hdar.app")) localStorage.setItem(KEY, "1");
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
