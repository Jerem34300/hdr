/** Nombre de personnes dans le Live : un seul relevé partagé par la carte et la page Autour (40-50 s). */
import { liveCount } from "./live";
import { sharedPoll } from "./shared-poll";

const shared = sharedPoll(() => liveCount().then((c) => Number(c) || 0), 0, 45_000);
export const useLiveCount = shared.use;
