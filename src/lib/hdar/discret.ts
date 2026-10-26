import { useEffect, useState } from "react";
import { myDiscreet } from "./live";
import { useHdar } from "./store";

let cached: string | null = null;
/** Mon nom affiché : pseudo du profil, sinon « Discret N » (numéro stable donné par le serveur). */
export function useMyName(fallback = "Discret") {
  const me = useHdar((s) => s.me);
  const [d, setD] = useState<string | null>(cached);
  useEffect(() => {
    if (me.onboarded || cached) return;
    void myDiscreet().then((n) => { if (n) { cached = n; setD(n); } }).catch(() => undefined);
  }, [me.onboarded]);
  return me.onboarded && me.pseudo ? me.pseudo : d ?? fallback;
}
