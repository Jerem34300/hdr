import { useEffect, useState } from "react";
import { Building2, Check, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { locale } from "@/lib/hdar/i18n";
import {
  placeClaim, placeClaimInfo, placePublish, partnerSave,
  type PlaceClaimInfo, type PlaceClaimResult, type PartnerInput, type PlaceKind,
} from "@/lib/hdar/live";
import { readImage } from "@/lib/hdar/media";
import { ensureSession } from "@/lib/hdar/session";
import { PLACE_KINDS } from "./places-layer";

const field = "w-full rounded-2xl border border-line bg-night px-4 py-3 text-ink outline-none focus:border-signal";
const KIND_LABEL: Record<string, string> = {
  bar: "Bar", club: "Club", sauna: "Sauna", other: "Autre établissement",
};

type Step = "preview" | "profile" | "edit" | "publish" | "done";

/** Parcours /pro?claim=… : aperçu → profil pro → rattachement → édition → validation explicite. */
export function ClaimFlow({ token, onFinished }: { token: string; onFinished: () => void }) {
  const [step, setStep] = useState<Step>("preview");
  const [info, setInfo] = useState<PlaceClaimInfo | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [manager, setManager] = useState("");
  const [contact, setContact] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<PlaceClaimResult | null>(null);
  const [draft, setDraft] = useState<PartnerInput | null>(null);

  useEffect(() => {
    let cancel = false;
    setInfo(undefined);
    setError(null);
    void placeClaimInfo(token)
      .then((r) => { if (!cancel) { if (!r) setError("Ce lien est invalide ou déjà utilisé."); setInfo(r); } })
      .catch((e: Error) => { if (!cancel) { setError(e.message); setInfo(null); } });
    return () => { cancel = true; };
  }, [token]);

  const startProfile = () => setStep("profile");

  const submitProfile = async () => {
    if (!confirm) return toast("Confirmez que vous représentez cet établissement.");
    if (manager.trim().length < 2) return toast("Indiquez votre nom (gérant ou représentant).");
    if (contact.trim().length < 5) return toast("Indiquez un e-mail ou un téléphone professionnel.");
    setBusy(true);
    try {
      await ensureSession();
      const r = await placeClaim(token, contact.trim(), manager.trim());
      setClaimed(r);
      setDraft({
        id: r.id,
        kind: (r.kind in KIND_LABEL ? r.kind : "bar") as PlaceKind,
        name: r.name,
        description: r.description || "",
        lat: r.lat,
        lng: r.lng,
        website: r.website || "",
        contact: r.contact || contact.trim(),
        photos: r.photos || [],
        ratings_on: r.ratings_on,
        comments_on: r.comments_on,
        comments_public: r.comments_public,
      });
      toast(`Fiche « ${r.name} » rattachée à votre espace pro. Modifiez-la, puis validez pour la publier.`);
      setStep("edit");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Impossible de rattacher la fiche");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (next?: PartnerInput) => {
    const d = next ?? draft;
    if (!d?.id) return;
    if (d.name.trim().length < 2) return toast("Indiquez le nom de l'établissement.");
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return toast("Indiquez la position (ex. 43.6108, 3.8767).");
    setBusy(true);
    try {
      await partnerSave(d);
      setDraft(d);
      toast("Modifications enregistrées.");
      setStep("publish");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setBusy(false);
    }
  };

  const doPublish = async () => {
    if (!draft?.id) return;
    setBusy(true);
    try {
      const r = await placePublish(draft.id);
      const until = new Date(r.until).toLocaleDateString(locale(), { dateStyle: "long" });
      toast(`Fiche « ${r.name} » publiée. Offre de lancement : en ligne jusqu'au ${until}.`, { duration: 9000 });
      setStep("done");
      onFinished();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Publication impossible");
    } finally {
      setBusy(false);
    }
  };

  if (info === undefined) {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Chargement de la fiche…
      </div>
    );
  }

  if (error || !info) {
    return (
      <section className="mt-6 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-display text-xl font-extrabold">Lien indisponible</h2>
        <p className="mt-2 text-sm text-muted">{error || "Cette fiche a déjà été réclamée ou le lien a expiré."}</p>
        <a href="/pro" className="mt-4 inline-flex h-11 items-center rounded-full bg-signal px-5 text-sm font-bold text-night">Aller à l'espace pro</a>
      </section>
    );
  }

  if (step === "preview") {
    return (
      <section className="mt-6 space-y-4">
        <p className="text-xs font-bold tracking-wide text-online uppercase">Étape 1 sur 4 · Aperçu</p>
        <div className="rounded-3xl border border-line bg-surface p-5">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Building2 className="size-4 text-signal" />
            {KIND_LABEL[info.kind] || PLACE_KINDS[info.kind as PlaceKind]?.label || info.kind}
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">{info.name}</h2>
          {info.description ? <p className="mt-3 text-sm whitespace-pre-wrap text-muted">{info.description}</p> : (
            <p className="mt-3 text-sm text-muted">Aucune description pour le moment : vous pourrez la compléter après avoir créé votre profil pro.</p>
          )}
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <MapPin className="size-3.5" />
            Position approximative · {info.lat.toFixed(3)}, {info.lng.toFixed(3)}
          </p>
          {info.website && (
            <a href={info.website} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-signal underline">
              Site web de l'établissement
            </a>
          )}
          {info.promo && (
            <p className="mt-3 rounded-2xl border border-[#fbbf24]/50 bg-night px-3 py-2 text-sm text-[#fbbf24]">
              Offre associée : {info.promo}
            </p>
          )}
          {info.photos?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {info.photos.slice(0, 4).map((src, i) => (
                <img key={i} src={src} alt="" className="size-20 rounded-xl object-cover" />
              ))}
            </div>
          )}
        </div>
        <div className="rounded-3xl border border-line bg-night p-4 text-sm">
          <p className="font-bold">Ce que vous allez faire</p>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-muted">
            <li>Créer votre profil pro (nom du gérant, contact professionnel).</li>
            <li>Rattacher cette fiche à votre compte : vous en devenez l'administrateur.</li>
            <li>Modifier les informations, photos et horaires.</li>
            <li>Valider explicitement pour publier la fiche sur la carte.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">
            Pendant le lancement : {info.free_days} jours offerts après validation. Aucun rattachement n'est fait tant que vous n'avez pas confirmé.
          </p>
        </div>
        <button type="button" onClick={startProfile} className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-signal font-display text-lg font-extrabold text-night">
          Continuer · créer mon profil pro
        </button>
      </section>
    );
  }

  if (step === "profile") {
    return (
      <section className="mt-6 space-y-4">
        <p className="text-xs font-bold tracking-wide text-online uppercase">Étape 2 sur 4 · Profil pro</p>
        <div className="rounded-3xl border border-line bg-surface p-5 space-y-3">
          <h2 className="font-display text-xl font-extrabold">Votre profil professionnel</h2>
          <p className="text-sm text-muted">
            Ces informations servent à administrer la fiche « {info.name} ». Elles restent discrètes : les membres ne voient que ce que vous choisissez d'afficher sur la fiche.
          </p>
          <input className={field} placeholder="Votre nom (gérant ou représentant)" maxLength={80} value={manager} onChange={(e) => setManager(e.target.value)} />
          <input className={field} placeholder="E-mail ou téléphone professionnel" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-night p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>Je confirme être le gérant ou le représentant autorisé de « {info.name} », et je souhaite rattacher cette fiche à mon compte hdar pro.</span>
          </label>
          <p className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-3.5 text-online" />
            Réservé aux personnes majeures. Contenu modéré selon les CGU.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="h-12 flex-1 rounded-full border border-line" onClick={() => setStep("preview")}>Retour</button>
          <button type="button" disabled={busy} onClick={() => void submitProfile()} className="h-12 flex-[2] rounded-full bg-signal font-bold text-night disabled:opacity-50">
            {busy ? "Rattachement…" : "Rattacher la fiche à mon compte"}
          </button>
        </div>
      </section>
    );
  }

  if (step === "edit" && draft) {
    return (
      <ClaimEdit
        draft={draft}
        setDraft={setDraft}
        busy={busy}
        onBack={() => setStep("profile")}
        onSave={(d) => void saveEdit(d)}
        placeName={claimed?.name || info.name}
      />
    );
  }

  if (step === "publish" && draft) {
    return (
      <section className="mt-6 space-y-4">
        <p className="text-xs font-bold tracking-wide text-online uppercase">Étape 4 sur 4 · Validation</p>
        <div className="rounded-3xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl font-extrabold">Publier « {draft.name} » ?</h2>
          <p className="mt-2 text-sm text-muted">
            En validant, votre fiche devient visible sur la carte hdar, vous restez administrateur, et vous pourrez gérer photos, horaires, offres et fonctions partenaires depuis votre espace pro.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-2"><Check className="size-4 text-online" /> Catégorie : {KIND_LABEL[draft.kind] || draft.kind}</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-online" /> Position : {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-online" /> Photos : {draft.photos.length} / 4</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-online" /> Offre de lancement : 90 jours en ligne sans paiement</li>
          </ul>
        </div>
        <div className="flex gap-2">
          <button type="button" className="h-12 flex-1 rounded-full border border-line" onClick={() => setStep("edit")}>Modifier encore</button>
          <button type="button" disabled={busy} onClick={() => void doPublish()} className="h-12 flex-[2] rounded-full bg-signal font-display font-extrabold text-night disabled:opacity-50">
            {busy ? "Publication…" : "Valider et publier la fiche"}
          </button>
        </div>
      </section>
    );
  }

  return null;
}

function ClaimEdit({
  draft, setDraft, busy, onBack, onSave, placeName,
}: {
  draft: PartnerInput;
  setDraft: (p: PartnerInput) => void;
  busy: boolean;
  onBack: () => void;
  onSave: (d: PartnerInput) => void;
  placeName: string;
}) {
  const [pos, setPos] = useState(
    Number.isFinite(draft.lat) && Number.isFinite(draft.lng) ? `${draft.lat}, ${draft.lng}` : "",
  );
  const set = (x: Partial<PartnerInput>) => setDraft({ ...draft, ...x });
  const parsed = pos.match(/(-?\d{1,2}(?:\.\d+)?)[,\s/]+(-?\d{1,3}(?:\.\d+)?)/);
  const withPos = (): PartnerInput | null => {
    if (!parsed) { toast("Indiquez la position (ex. 43.6108, 3.8767) ou utilisez votre position."); return null; }
    const next = { ...draft, lat: Number(parsed[1]), lng: Number(parsed[2]) };
    setDraft(next);
    return next;
  };
  return (
    <section className="mt-6 space-y-3">
      <p className="text-xs font-bold tracking-wide text-online uppercase">Étape 3 sur 4 · Modifier la fiche</p>
      <h2 className="font-display text-xl font-extrabold">Compléter « {placeName} »</h2>
      <p className="text-sm text-muted">Vous êtes désormais administrateur de cette fiche. Enregistrez vos modifications, puis validez pour la publier.</p>
      <div className="flex flex-wrap gap-2">
        {(["bar", "club", "sauna", "other"] as PlaceKind[]).map((k) => (
          <button key={k} type="button" onClick={() => set({ kind: k })}
            className={"h-10 rounded-full border px-3 text-sm " + (draft.kind === k ? "border-signal bg-signal text-night" : "border-line")}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <input className={field} placeholder="Nom de l'établissement" maxLength={80} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
      <textarea className={field + " min-h-24"} placeholder="Description, horaires, ambiance…" maxLength={600} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      <div className="flex gap-2">
        <input className={field} placeholder="Position : 43.6108, 3.8767" value={pos}
          onChange={(e) => setPos(e.target.value)}
          onBlur={() => { void withPos(); }} />
        <button type="button" className="shrink-0 rounded-2xl border border-line px-3 text-sm"
          onClick={() => navigator.geolocation.getCurrentPosition(
            (g) => { const v = `${g.coords.latitude.toFixed(5)}, ${g.coords.longitude.toFixed(5)}`; setPos(v); set({ lat: g.coords.latitude, lng: g.coords.longitude }); },
            () => toast("Position indisponible"),
          )}>
          Ma position
        </button>
      </div>
      <input className={field} placeholder="Site web (https://…)" maxLength={200} value={draft.website ?? ""} onChange={(e) => set({ website: e.target.value })} />
      <input className={field} placeholder="Contact affiché (téléphone, Instagram…)" maxLength={200} value={draft.contact ?? ""} onChange={(e) => set({ contact: e.target.value })} />
      <div>
        <p className="text-sm font-bold">Photos ({draft.photos.length}/4)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {draft.photos.map((src, i) => (
            <button key={i} type="button" title="Retirer" onClick={() => set({ photos: draft.photos.filter((_, j) => j !== i) })}>
              <img src={src} alt="" className="size-20 rounded-xl object-cover" />
            </button>
          ))}
          {draft.photos.length < 4 && (
            <label className="flex size-20 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line text-2xl text-muted">
              +
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readImage(f, 900).then((d) => set({ photos: [...draft.photos, d].slice(0, 4) }));
                e.target.value = "";
              }} />
            </label>
          )}
        </div>
      </div>
      <fieldset className="space-y-2 rounded-2xl border border-line p-4 text-sm">
        <legend className="px-1 font-bold">Avis des utilisateurs</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.ratings_on} onChange={(e) => set({ ratings_on: e.target.checked })} /> Accepter les notes (étoiles)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.comments_on} onChange={(e) => set({ comments_on: e.target.checked })} /> Accepter les commentaires</label>
        {draft.comments_on && (
          <div className="ms-6 space-y-1">
            <label className="flex items-center gap-2"><input type="radio" checked={draft.comments_public} onChange={() => set({ comments_public: true })} /> Publics, affichés sur la fiche</label>
            <label className="flex items-center gap-2"><input type="radio" checked={!draft.comments_public} onChange={() => set({ comments_public: false })} /> Privés, visibles seulement par moi</label>
          </div>
        )}
      </fieldset>
      <div className="flex gap-2">
        <button type="button" className="h-12 flex-1 rounded-full border border-line" onClick={onBack} disabled={busy}>Retour</button>
        <button type="button" disabled={busy || draft.name.trim().length < 2} onClick={() => { const n = withPos(); if (n) onSave(n); }}
          className="h-12 flex-[2] rounded-full bg-signal font-bold text-night disabled:opacity-50">
          {busy ? "Enregistrement…" : "Enregistrer et continuer"}
        </button>
      </div>
    </section>
  );
}
