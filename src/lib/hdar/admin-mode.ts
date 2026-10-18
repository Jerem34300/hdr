import { useEffect, useState } from "react";
import { amAdmin } from "./live";

/** Vrai si le compte connecté est admin (modération dans l'appli). */
export function useAmAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    void amAdmin().then((v) => alive && setAdmin(v));
    return () => {
      alive = false;
    };
  }, []);
  return admin;
}
