const KEY = "hdar-device";

export function deviceId() {
  if (typeof localStorage === "undefined") return "local";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
