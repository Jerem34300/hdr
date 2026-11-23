import { useEffect, useRef, useState } from "react";
import { Check, Clock, Globe, Loader2, MapPin, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { GoButton } from "./go-sheet";
import { useOpenAtTop } from "@/lib/hdar/scroll-end";
import { readImage } from "@/lib/hdar/media";
import { ensureSession } from "@/lib/hdar/session";
import { useHdar } from "@/lib/hdar/store";
import {
  DEMO_METHODS, DEMO_VERIFY_CODE, defaultCover, discoverConfirmCode, discoverDemoActive,
  discoverDemoCard, discoverMethods, discoverOwnerSave, discoverRequestManual, discoverSendCode,
  emailMatchesWebsite, kindIcon, kindNoun, listingLabel, type DiscoverCard, type DiscoverMethods, type MapListing,
  publicDescription,
} from "@/lib/hdar/discover";
import type { PlaceKind } from "@/lib/hdar/live";

const field = "w-full rounded-2xl border border-line bg-night px-4 py-3 text-ink outline-none focus:border-signal";

export function toDiscoverCard(p: {
  id: string; kind: PlaceKind; name: string; description?: string; lat: number; lng: number;
  city?: string | null; address?: string | null; hours?: string | null; tags?: string[] | null;
  website?: string | null; listing?: MapListing; verified?: boolean; cover_credit?: string | null;
  photos?: string[]; partner?: boolean; country?: string | null;
}): DiscoverCard {
  const listing: MapListing = p.listing ?? (p.partner ? "partner" : "discover");
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    description: publicDescription(p.description, p.country),
    lat: p.lat,
    lng: p.lng,
    city: p.city ?? null,
    address: p.address ?? null,
    hours: p.hours ?? null,
    tags: p.tags ?? [],
    website: p.website ?? null,
    listing,
    verified: !!p.verified,
    cover_credit: p.cover_credit ?? null,
    photos: p.photos ?? [],
    partner: listing === "partner",
    country: p.country ?? null,
  };
}

function coverOf(p: DiscoverCard): string {
  return p.photos[0] || defaultCover(p.kind);
}

export function DiscoverFiche({
  place, onClose, onClaim, risk = false,
}: {
  place: DiscoverCard;
  onClose: () => void;
  onClaim?: () => void;
  risk?: boolean;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useOpenAtTop(sheetRef, place.id);
  const badge = listingLabel(place.listing, place.verified);
  const noun = kindNoun(place.kind, risk);
  const gallery = place.photos.length > 1 ? place.photos : place.photos.length === 1 ? place.photos : [];
  const claimable = place.listing === "discover" && !place.verified && onClaim;
  return (
    <div ref={sheetRef} data-sheet-root data-testid="discover-fiche" className="hdar-sheet-up absolute inset-x-0 bottom-0 z-40 max-h-[88%] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface shadow-2xl">
      <div className="relative h-52 w-full overflow-hidden rounded-t-3xl bg-night">
        <img src={coverOf(place)} alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
        <button type="button" aria-label="Fermer" className="absolute top-3 end-3 flex size-10 items-center justify-center rounded-full bg-night/70" onClick={onClose}>
          <X className="size-5" />
        </button>
        <div className="absolute bottom-3 start-4 end-14">
          <p className="inline-flex items-center gap-1 rounded-full bg-night/80 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[#fde68a] uppercase">
            {kindIcon(place.kind)} {badge}
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold leading-tight">{place.name}</h2>
        </div>
      </div>
      <div className="space-y-3 px-5 pb-8 pt-2">
        <p className="text-sm text-muted">
          {noun}
          {place.city ? ` · ${place.city}` : ""}
          {place.address ? ` · ${place.address}` : ""}
        </p>
        {place.verified && (
          <p className="inline-flex items-center gap-1.5 rounded-full border border-online/40 bg-online/10 px-3 py-1 text-xs font-bold text-online">
            <ShieldCheck className="size-3.5" /> Vérifié
          </p>
        )}
        {place.description && <p className="whitespace-pre-line text-sm leading-relaxed">{place.description}</p>}
        {place.hours && (
          <p className="flex items-start gap-2 text-sm">
            <Clock className="mt-0.5 size-4 shrink-0 text-[#fbbf24]" />
            <span>{place.hours}</span>
          </p>
        )}
        {place.website && (
          <a href={place.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-signal underline" onClick={() => undefined}>
            <Globe className="size-4 shrink-0" /> Site web
          </a>
        )}
        {place.tags.length > 0 && !risk && (
          <div className="flex flex-wrap gap-1.5">
            {place.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-line bg-night px-2.5 py-0.5 text-[11px] text-muted">{tag}</span>
            ))}
          </div>
        )}
        {gallery.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pt-1">
            {gallery.map((src, i) => (
              <img key={i} src={src} alt="" className="h-28 w-40 shrink-0 rounded-2xl object-cover" />
            ))}
          </div>
        )}
        {place.cover_credit && <p className="text-[11px] text-muted">Photo : {place.cover_credit}</p>}
        <GoButton lat={place.lat} lng={place.lng} label="Itinéraire" />
        {claimable && (
          <button type="button" data-testid="claim-cta" onClick={onClaim} className="flex h-12 w-full items-center justify-center rounded-full bg-signal font-display font-extrabold text-night">
            C'est votre lieu ?
          </button>
        )}
        <p className="text-[11px] leading-relaxed text-muted">
          Infos publiques uniquement (nom, type, ville, site). Réservé aux personnes majeures. Si c'est votre établissement, vous pouvez réclamer la fiche et la compléter après preuve.
        </p>
      </div>
    </div>
  );
}

type ClaimStep = "intro" | "methods" | "code" | "manual" | "edit" | "done";

export function DiscoverClaimFlow({
  place, methods, onClose, demo = false, startAt,
}: {
  place: DiscoverCard;
  methods?: DiscoverMethods | null;
  onClose: () => void;
  demo?: boolean;
  startAt?: ClaimStep;
}) {
  const [step, setStep] = useState<ClaimStep>(startAt ?? "intro");
  const [info, setInfo] = useState<DiscoverMethods | null | undefined>(methods ?? undefined);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [masked, setMasked] = useState<string | null>(methods?.official_masked ?? null);
  const [justif, setJustif] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    description: place.description, hours: place.hours ?? "", address: place.address ?? "",
    website: place.website ?? "", tags: place.tags.join(", "), photos: [] as string[],
  });

  useEffect(() => {
    if (methods) { setInfo(methods); return; }
    if (demo) { setInfo(DEMO_METHODS); return; }
    let cancel = false;
    void discoverMethods(place.id)
      .then((r) => { if (!cancel) setInfo(r); })
      .catch((e: Error) => { if (!cancel) { toast(e.message); setInfo(null); } });
    return () => { cancel = true; };
  }, [place.id, methods, demo]);

  const send = async (method: "email_official" | "email_domain") => {
    if (method === "email_domain") {
      const site = info?.website || place.website || "";
      if (!emailMatchesWebsite(email, site)) return toast("L'e-mail doit être sur le même domaine que le site du lieu.");
    }
    setBusy(true);
    try {
      if (demo) {
        setMasked(method === "email_official" ? DEMO_METHODS.official_masked : `${email[0]}***@${email.split("@")[1]}`);
        toast("Aucun e-mail envoyé (mode démo).");
        setStep("code");
        return;
      }
      await ensureSession();
      const r = await discoverSendCode(place.id, method, method === "email_domain" ? email : undefined);
      setMasked(r.masked);
      toast(r.sent ? "Code envoyé." : "Code préparé. Aucun e-mail n'est envoyé tant que l'envoi n'est pas validé.");
      setStep("code");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Impossible d'envoyer le code");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      if (demo) {
        if (code.trim() !== DEMO_VERIFY_CODE) return toast("Code incorrect.");
        toast("Fiche vérifiée. Vous pouvez la modifier.");
        setStep("edit");
        return;
      }
      await discoverConfirmCode(place.id, code.trim());
      toast("Fiche vérifiée. Vous pouvez la modifier.");
      setStep("edit");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Code incorrect");
    } finally {
      setBusy(false);
    }
  };

  const submitManual = async () => {
    if (justif.trim().length < 20) return toast("Explique en quelques phrases pourquoi tu représentes ce lieu.");
    setBusy(true);
    try {
      if (demo) {
        toast("Demande envoyée. Un administrateur la vérifiera.");
        setStep("done");
        return;
      }
      await ensureSession();
      await discoverRequestManual(place.id, email, justif.trim(), proof);
      toast("Demande envoyée. Un administrateur la vérifiera.");
      setStep("done");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      if (!demo) {
        await discoverOwnerSave({
          id: place.id,
          description: draft.description,
          hours: draft.hours,
          address: draft.address,
          website: draft.website,
          tags: draft.tags.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8),
          photos: draft.photos,
        });
      }
      toast(draft.photos.length ? "Enregistré. Les photos seront visibles après validation." : "Modifications enregistrées.");
      setStep("done");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid={`discover-claim-${step}`} className="hdar-sheet-up absolute inset-x-0 bottom-0 z-40 max-h-[92%] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface p-5 pb-8 shadow-2xl">
      <button type="button" aria-label="Fermer" className="absolute top-3 end-3 flex size-10 items-center justify-center" onClick={onClose}>
        <X className="size-5" />
      </button>

      {step === "intro" && (
        <section className="space-y-4">
          <p className="text-xs font-bold tracking-wide text-online uppercase">C'est votre lieu ?</p>
          <h2 className="pe-10 font-display text-2xl font-extrabold">Vous êtes le propriétaire de « {place.name} » ?</h2>
          <p className="text-sm text-muted">
            Pour modifier la fiche, nous devons d'abord vérifier que vous représentez bien l'établissement. Ensuite seulement, la fiche porte le badge « Vérifié ».
          </p>
          <ol className="list-decimal space-y-1 ps-5 text-sm text-muted">
            <li>Code envoyé à l'e-mail officiel du lieu déjà en base.</li>
            <li>Ou un e-mail sur le même domaine que le site du lieu.</li>
            <li>Sinon, une demande manuelle, validée par un administrateur, avec un justificatif.</li>
          </ol>
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-online" />
            Réservé aux personnes majeures. Tes justificatifs servent uniquement à cette vérification, et sont effacés après décision.
          </p>
          <button type="button" onClick={() => setStep("methods")} className="flex h-12 w-full items-center justify-center rounded-full bg-signal font-bold text-night">
            Continuer
          </button>
        </section>
      )}

      {step === "methods" && (
        <section className="space-y-4">
          <p className="text-xs font-bold tracking-wide text-online uppercase">Choisir une preuve</p>
          <h2 className="pe-10 font-display text-xl font-extrabold">Comment prouver que c'est votre lieu ?</h2>
          {info === undefined && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Chargement…</p>}
          {info && (
            <>
              <button type="button" disabled={busy || !info.has_official} onClick={() => void send("email_official")}
                className="w-full rounded-3xl border border-line bg-night p-4 text-start disabled:opacity-50">
                <p className="font-bold">E-mail officiel du lieu</p>
                <p className="mt-1 text-sm text-muted">
                  {info.has_official ? `Un code sera préparé pour ${info.official_masked}.` : "Aucun e-mail officiel n'est enregistré pour ce lieu."}
                </p>
              </button>
              <div className="rounded-3xl border border-line bg-night p-4">
                <p className="font-bold">E-mail sur le domaine du site</p>
                <p className="mt-1 text-sm text-muted">
                  {info.website_domain ? `Exemple : toi@${info.website_domain}` : "Ce lieu n'a pas de site web en base."}
                </p>
                <input className={field + " mt-3"} placeholder="e-mail professionnel" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!info.has_website || busy} />
                <button type="button" disabled={busy || !info.has_website || !email.includes("@")} onClick={() => void send("email_domain")}
                  className="mt-3 h-11 w-full rounded-full bg-signal font-bold text-night disabled:opacity-50">
                  Recevoir un code
                </button>
              </div>
              <button type="button" onClick={() => setStep("manual")} className="w-full rounded-3xl border border-line p-4 text-start">
                <p className="font-bold">Demande manuelle</p>
                <p className="mt-1 text-sm text-muted">Envoie un justificatif. Un administrateur vérifiera avant d'accorder le badge « Vérifié ».</p>
              </button>
            </>
          )}
          <button type="button" className="h-11 w-full rounded-full border border-line" onClick={() => setStep("intro")}>Retour</button>
        </section>
      )}

      {step === "code" && (
        <section className="space-y-4">
          <p className="text-xs font-bold tracking-wide text-online uppercase">Code de vérification</p>
          <h2 className="pe-10 font-display text-xl font-extrabold">Entre le code reçu</h2>
          <p className="text-sm text-muted">
            {masked ? `Code prévu pour ${masked}. ` : ""}Valable 15 minutes. {demo ? "Aucun e-mail n'est envoyé en mode démo." : "Aucun e-mail n'est envoyé tant que l'envoi n'est pas validé."}
          </p>
          {demo && (
            <p className="rounded-2xl border border-[#fbbf24]/40 bg-night px-3 py-2 text-sm text-[#fbbf24]">
              Mode démo · code de test : {DEMO_VERIFY_CODE}
            </p>
          )}
          <input className={field + " tracking-[0.4em] text-center text-xl"} inputMode="numeric" maxLength={6} placeholder="______" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          <div className="flex gap-2">
            <button type="button" className="h-12 flex-1 rounded-full border border-line" onClick={() => setStep("methods")}>Retour</button>
            <button type="button" disabled={busy || code.length !== 6} onClick={() => void confirm()} className="h-12 flex-[2] rounded-full bg-signal font-bold text-night disabled:opacity-50">
              {busy ? "Vérification…" : "Vérifier"}
            </button>
          </div>
        </section>
      )}

      {step === "manual" && (
        <section className="space-y-4">
          <p className="text-xs font-bold tracking-wide text-online uppercase">Demande manuelle</p>
          <h2 className="pe-10 font-display text-xl font-extrabold">Justifie que tu représentes « {place.name} »</h2>
          <input className={field} placeholder="Ton e-mail professionnel" value={email} onChange={(e) => setEmail(e.target.value)} />
          <textarea className={field + " min-h-28"} placeholder="Explique ton rôle (gérant, responsable…) et comment te joindre." maxLength={1000} value={justif} onChange={(e) => setJustif(e.target.value)} />
          <label className="block rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
            Justificatif (photo, facultatif)
            <input type="file" accept="image/*" className="mt-2 block text-xs" onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void readImage(f).then(setProof).catch((err: Error) => toast(err.message));
            }} />
            {proof && <p className="mt-2 text-xs text-online">Photo jointe.</p>}
          </label>
          <p className="text-xs text-muted">Un administrateur validera la demande. Le badge « Vérifié » n'apparaît qu'après cette validation.</p>
          <div className="flex gap-2">
            <button type="button" className="h-12 flex-1 rounded-full border border-line" onClick={() => setStep("methods")}>Retour</button>
            <button type="button" disabled={busy} onClick={() => void submitManual()} className="h-12 flex-[2] rounded-full bg-signal font-bold text-night disabled:opacity-50">
              {busy ? "Envoi…" : "Envoyer la demande"}
            </button>
          </div>
        </section>
      )}

      {step === "edit" && (
        <section className="space-y-4">
          <p className="text-xs font-bold tracking-wide text-online uppercase">Modifier la fiche</p>
          <h2 className="pe-10 font-display text-xl font-extrabold">Ta fiche « {place.name} »</h2>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-online"><Check className="size-3.5" /> Vérifié · tu peux maintenant compléter la fiche.</p>
          <textarea className={field + " min-h-24"} placeholder="Description publique" maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <input className={field} placeholder="Horaires (ex. Tous les jours, 18 h – 2 h)" maxLength={200} value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} />
          <input className={field} placeholder="Adresse ou quartier" maxLength={200} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
          <input className={field} placeholder="Site web" maxLength={200} value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
          <input className={field} placeholder="Mots-clés, séparés par une virgule" maxLength={200} value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
          <label className="block cursor-pointer rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
            Photos (visibles après validation)
            <span className="mt-2 block text-xs text-signal underline">Ajouter des photos</span>
            <input type="file" accept="image/*" multiple className="absolute size-px overflow-hidden opacity-0" onChange={(e) => {
              const files = [...(e.target.files ?? [])].slice(0, 8);
              void Promise.all(files.map((f) => readImage(f)))
                .then((photos) => setDraft((d) => ({ ...d, photos })))
                .catch((err: Error) => toast(err.message));
            }} />
            {draft.photos.length > 0 && <p className="mt-2 text-xs text-online">{draft.photos.length} photo{draft.photos.length > 1 ? "s" : ""} prête{draft.photos.length > 1 ? "s" : ""} pour la modération.</p>}
          </label>
          <button type="button" disabled={busy} onClick={() => void saveEdit()} className="h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-50">
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </section>
      )}

      {step === "done" && (
        <section className="space-y-4">
          <p className="text-xs font-bold tracking-wide text-online uppercase">C'est noté</p>
          <h2 className="pe-10 font-display text-xl font-extrabold">Merci</h2>
          <p className="text-sm text-muted">
            {place.verified || step === "done" ? "Ta fiche est à jour. Les nouvelles photos apparaissent après validation par un administrateur." : "Nous avons bien reçu ta demande."}
          </p>
          <button type="button" onClick={onClose} className="h-12 w-full rounded-full bg-signal font-bold text-night">Fermer</button>
        </section>
      )}
    </div>
  );
}

/** Écrans isolés pour les captures (fond nuit, pas de carte). */
export function DiscoverStandalone({ mode }: { mode: string }) {
  const place = discoverDemoCard(mode === "verified" ? "demo-comptoir" : "demo-comptoir")!;
  const verified = mode === "verified" ? { ...place, verified: true, photos: [defaultCover("bar"), defaultCover("club")] } : place;
  const [open, setOpen] = useState(true);
  if (!open) return <div className="flex h-dvh items-center justify-center bg-night text-muted">Fermé</div>;
  if (mode === "fiche" || mode === "verified") {
    return (
      <main className="relative h-dvh overflow-hidden bg-night text-ink">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#2a1020,transparent_45%)]" />
        <DiscoverFiche place={verified} onClose={() => setOpen(false)} onClaim={mode === "fiche" ? () => undefined : undefined} />
      </main>
    );
  }
  const start: Record<string, ClaimStep> = { claim: "intro", code: "code", edit: "edit", methods: "methods" };
  return (
    <main className="relative h-dvh overflow-hidden bg-night text-ink">
      <DiscoverClaimFlow place={place} methods={DEMO_METHODS} demo startAt={start[mode] ?? "intro"} onClose={() => setOpen(false)} />
    </main>
  );
}

/** Utilisé par le bouton de la fiche démo sur la carte. */
export function DiscoverClaimFromStore({ place, onClose }: { place: DiscoverCard; onClose: () => void }) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const openGate = useHdar((s) => s.openGate);
  if (!onboarded && !discoverDemoActive()) {
    return (
      <div className="hdar-sheet-up absolute inset-x-0 bottom-0 z-40 rounded-t-3xl border border-b-0 border-line bg-surface p-5 pb-8">
        <h2 className="font-display text-xl font-extrabold">C'est votre lieu ?</h2>
        <p className="mt-2 text-sm text-muted">Crée d'abord un profil, réservé aux personnes majeures.</p>
        <button type="button" className="mt-4 h-12 w-full rounded-full bg-signal font-bold text-night" onClick={openGate}>Créer mon profil</button>
        <button type="button" className="mt-2 h-11 w-full rounded-full border border-line" onClick={onClose}>Retour</button>
      </div>
    );
  }
  return <DiscoverClaimFlow place={place} demo={discoverDemoActive()} methods={discoverDemoActive() ? DEMO_METHODS : undefined} onClose={onClose} />;
}

export function DiscoverMapPinHint({ listing, verified }: { listing?: MapListing; verified?: boolean }) {
  if (listing === "partner") return null;
  if (verified) return <MapPin className="size-3 text-online" />;
  return null;
}
