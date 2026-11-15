import { useEffect } from "react";
import { detectCdnCountry, useCountry } from "./country";
import { deviceId } from "./device";
import { goDark } from "./live";
import { devOverride, isRiskCountry, locatedInRiskCountry } from "./safe-countries";

export function isSafeModeNow() {
  const s = useCountry.getState();
  return locatedInRiskCountry(s.auto, s.cdn) || isRiskCountry(devOverride());
}

export function useSafeCountry() {
  const geo = useCountry((s) => s.auto);
  const cdn = useCountry((s) => s.cdn);
  useEffect(() => { void detectCdnCountry(); }, []);
  return locatedInRiskCountry(geo, cdn) || isRiskCountry(devOverride());
}

/** Cache la présence puis remplace l'historique par une page neutre (Google). Pas de retour arrière vers l'app. */
export function quickExit() {
  try { void goDark({ data: deviceId() }); } catch { /* on quitte quand même */ }
  location.replace("https://www.google.com");
}
