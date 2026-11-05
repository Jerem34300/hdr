import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeOutreachStats,
  emailDomain,
  filterOutreachRows,
  outreachToCsv,
  sanitizeOutreachRow,
  type OutreachRow,
} from "./prospection-admin.ts";

const base = (over: Partial<OutreachRow> = {}): OutreachRow => ({
  id: "1",
  place_id: "p1",
  kind: "bar",
  name: "Le Test",
  city: "Paris",
  country: "FR",
  lot: "lot-171",
  email: "secret@exemple.fr",
  claim_token: "SUPERSECRETTOKEN",
  claim_url: "/pro?claim=SUPERSECRETTOKEN",
  status: "sent",
  sent_at: "2026-11-05T19:19:00Z",
  claimed_at: null,
  suppressed_at: null,
  note: null,
  created_at: "2026-11-05T18:00:00Z",
  ...over,
});

describe("prospection admin helpers", () => {
  it("masque e-mail et jetons", () => {
    const s = sanitizeOutreachRow(base());
    assert.equal(s.email_domain, "exemple.fr");
    assert.equal(s.email, undefined);
    assert.equal(s.claim_token, undefined);
    assert.equal(s.claim_url, undefined);
    assert.equal(emailDomain("a@B.CoM"), "b.com");
  });

  it("calcule les compteurs", () => {
    const rows = [
      sanitizeOutreachRow(base({ id: "a", status: "sent" })),
      sanitizeOutreachRow(base({ id: "b", status: "ready", sent_at: null })),
      sanitizeOutreachRow(base({ id: "c", status: "suppressed", suppressed_at: "2026-11-05T20:00:00Z" })),
      sanitizeOutreachRow(base({ id: "d", status: "claimed", claimed_at: "2026-11-05T21:00:00Z", place_claimed: true })),
      sanitizeOutreachRow(base({ id: "e", status: "bounced" })),
    ];
    const st = computeOutreachStats(rows);
    assert.equal(st.envoyes, 4); // ready without sent_at not counted? ready has sent_at null and status ready -> not sent. claimed/bounced/suppressed/sent = 4
    assert.equal(st.desinscrits, 1);
    assert.equal(st.inscrits, 1);
    assert.equal(st.bounces, 1);
    assert.equal(st.en_attente, 2); // ready + sent
  });

  it("filtre et exporte CSV sans secret", () => {
    const rows = [
      sanitizeOutreachRow(base({ id: "a", name: "Alpha", city: "Lyon", lot: "lot-500" })),
      sanitizeOutreachRow(base({ id: "b", name: "Beta", status: "ready", sent_at: null })),
    ];
    const f = filterOutreachRows(rows, { city: "Lyon" });
    assert.equal(f.length, 1);
    assert.equal(f[0].name, "Alpha");
    const csv = outreachToCsv(rows);
    assert.match(csv, /domaine_email/);
    assert.doesNotMatch(csv, /secret@/);
    assert.doesNotMatch(csv, /SUPERSECRET/);
    assert.doesNotMatch(csv, /claim=/);
    assert.match(csv, /exemple\.fr/);
  });
});
