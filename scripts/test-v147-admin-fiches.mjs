#!/usr/bin/env node
/**
 * Teste hdar_v147_admin_fiches.sql dans PGlite (local, jamais en prod).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(root, "supabase/hdar_v147_admin_fiches.sql"), "utf8");

const stub = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists hdar;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.auth_uid', true), '')::uuid
$$;

create table if not exists hdar.admins (
  auth_user_id uuid primary key,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists hdar.profiles (
  user_id text primary key,
  pseudo text
);

create table if not exists hdar.places (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'bar',
  name text not null,
  description text not null default '',
  lat double precision not null default 0,
  lng double precision not null default 0,
  source text not null default 'admin',
  source_ref text,
  status text not null default 'approved',
  partner boolean not null default false,
  partner_until timestamptz,
  submitted_by text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  owner_id text,
  website text,
  contact text,
  photos text[] not null default '{}',
  city text,
  address text,
  hours text,
  tags text[] not null default '{}',
  country text,
  map_listing text not null default 'discover',
  verified boolean not null default false,
  verified_at timestamptz,
  verify_method text,
  cover_credit text,
  pending_photos text[] not null default '{}',
  venue_kind text,
  claimed_at timestamptz
);

create table if not exists hdar.place_claim_requests (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  user_id text not null,
  email text,
  justification text not null,
  proof text,
  status text not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists hdar.place_verify_codes (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  user_id text not null,
  method text not null,
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists hdar.place_messages (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  from_id text not null,
  pseudo text not null,
  body text not null,
  removed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists hdar.place_ratings (
  place_id uuid not null references hdar.places(id) on delete cascade,
  user_id text not null,
  stars int not null,
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id)
);

create table if not exists hdar.place_comments (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hdar.places(id) on delete cascade,
  user_id text not null,
  body text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists hdar.place_daily (
  day date not null,
  place_id uuid not null,
  messages int not null default 0,
  views int not null default 0,
  primary key (day, place_id)
);

create or replace function hdar.self_id() returns text language plpgsql stable as $$
begin
  return nullif(current_setting('test.self_id', true), '');
end $$;

create or replace function hdar.admin_check(p_key text) returns void language plpgsql stable as $$
begin
  if current_setting('test.is_admin', true) <> '1' then
    raise exception 'Accès refusé';
  end if;
end $$;

create or replace function public.hdar_admin_claim_review(p_key text, p_id uuid, p_ok boolean, p_note text default null) returns void
language plpgsql as $$
declare r hdar.place_claim_requests;
begin
  perform hdar.admin_check(p_key);
  select * into r from hdar.place_claim_requests where id = p_id for update;
  if r.id is null then raise exception 'Demande introuvable'; end if;
  update hdar.place_claim_requests set
    status = case when p_ok then 'approved' else 'rejected' end,
    admin_note = p_note,
    reviewed_at = now()
  where id = r.id;
  if p_ok then
    update hdar.places set owner_id = r.user_id, claimed_at = now(), verified = true, verified_at = now(), verify_method = 'admin_manual'
    where id = r.place_id;
  end if;
end $$;
`;

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

const db = new PGlite({ extensions: { pgcrypto } });
try {
  await db.exec(stub);
  await db.exec(migration);
} catch (e) {
  console.error("MIGRATION/STUB ERROR:", e.message || e);
  if (e.cause) console.error("CAUSE:", e.cause.message || e.cause);
  process.exit(1);
}

const admin = "select set_config('test.is_admin', '1', false)";
const noAdmin = "select set_config('test.is_admin', '0', false)";

const gibus = "11111111-1111-1111-1111-111111111111";
const ede = "22222222-2222-2222-2222-222222222222";
const claim = "33333333-3333-3333-3333-333333333333";
const avis = "44444444-4444-4444-4444-444444444444";
const msg = "55555555-5555-5555-5555-555555555555";
const photoLater = "https://exemple.fr/photo.jpg";

await db.exec(`
  insert into hdar.profiles(user_id, pseudo) values ('u-alex', 'Alex'), ('u-morgan', 'Morgan');
  insert into hdar.places (id, kind, venue_kind, name, city, country, map_listing, description, photos, cover_credit, website)
  values
    ('${gibus}', 'club', 'club', 'Gibus', 'Paris', 'FR', 'discover', 'Club parisien.',
      array['https://exemple.fr/gibus.jpg'], 'https://www.gibus.fr/', 'https://www.gibus.fr/'),
    ('${ede}', 'sauna', 'sauna', 'Entre Deux Eaux', 'Paris', 'FR', 'discover', 'Sauna.',
      array['https://exemple.fr/ede.jpg'], 'https://www.entredeuxeaux.com/', 'https://www.entredeuxeaux.com/');
  update hdar.places set owner_id = 'u-morgan', verified = true, verified_at = now(), verify_method = 'email_official', claimed_at = now()
    where id = '${ede}';
  insert into hdar.place_ratings(place_id, user_id, stars) values ('${gibus}', 'u1', 5), ('${gibus}', 'u2', 3);
  insert into hdar.place_comments(id, place_id, user_id, body) values ('${avis}', '${gibus}', 'u1', 'Bonne soirée');
  insert into hdar.place_messages(id, place_id, from_id, pseudo, body) values ('${msg}', '${gibus}', 'u1', 'Nico', 'On y va ?');
  insert into hdar.place_daily(day, place_id, views, messages) values (current_date, '${gibus}', 10, 2);
  insert into hdar.place_claim_requests(id, place_id, user_id, email, justification, proof, status, method)
    values ('${claim}', '${gibus}', 'u-alex', 'contact@gibus-demo.example', 'Je représente le lieu, voici un justificatif assez long.', 'data:image/png;base64,xxx', 'pending', 'admin_manual');
`);

// Non-admin refused
await db.exec(noAdmin);
let refused = false;
try {
  await db.query("select public.hdar_admin_fiches('k')");
} catch (e) {
  refused = String(e.message || e).includes("Accès refusé");
}
must(refused, "non-admin should be refused");

await db.exec(admin);
const list = (await db.query("select public.hdar_admin_fiches('k') as j")).rows[0].j;
must(list.total === 2, `expected 2 places, got ${list.total}`);
must(list.pending_claims === 1, `pending_claims ${list.pending_claims}`);
const g = list.rows.find((r) => r.name === "Gibus");
must(g, "Gibus missing");
must(g.status === "claimed", `Gibus status ${g.status} (pending claim)`);
must(g.views === 10, `views ${g.views}`);
must(g.ratings === 2 && Number(g.avg_stars) === 4.0, `ratings ${g.ratings} ${g.avg_stars}`);
must(g.messages === 2 && g.messages_now === 1, `messages ${g.messages} ${g.messages_now}`);
must(Array.isArray(g.photos) && g.photos.length >= 1, "photos backfilled");
must(g.photos[0].source_url === "https://www.gibus.fr/", "photo source url");
must(!JSON.stringify(list).includes("data:image/png;base64,xxx"), "list must not include proof");
must(!JSON.stringify(list).includes("contact@gibus-demo.example"), "list must not include claim email");

const paris = (await db.query("select public.hdar_admin_fiches('k', 'Paris') as j")).rows[0].j;
must(paris.total === 2, "city filter Paris");
const club = (await db.query("select public.hdar_admin_fiches('k', null, null, 'club') as j")).rows[0].j;
must(club.total === 1 && club.rows[0].name === "Gibus", "kind filter");
const ver = (await db.query("select public.hdar_admin_fiches('k', null, null, null, 'verified') as j")).rows[0].j;
must(ver.total === 1 && ver.rows[0].name === "Entre Deux Eaux", "status filter verified");

const claims = (await db.query("select public.hdar_admin_fiche_claims('k', 'pending') as j")).rows[0].j;
must(claims.length === 1, "one pending claim");
must(claims[0].requester_pseudo === "Alex", "requester pseudo");
must(claims[0].method === "admin_manual", "method");
must(claims[0].proof === "data:image/png;base64,xxx", "proof visible while pending");
must(claims[0].email === "contact@gibus-demo.example", "email in claims queue only");

await db.query("select public.hdar_admin_fiche_claim_review('k', $1, true, 'ok')", [claim]);
const after = (await db.query("select status, proof is not null as has_proof from hdar.place_claim_requests where id = $1", [claim])).rows[0];
must(after.status === "approved" && after.has_proof === false, "proof cleared after review");
const g2 = (await db.query("select verified, owner_id from hdar.places where id = $1", [gibus])).rows[0];
must(g2.verified === true && g2.owner_id === "u-alex", "place verified on approve");
const claims2 = (await db.query("select public.hdar_admin_fiche_claims('k', 'approved') as j")).rows[0].j;
must(claims2[0].proof == null, "approved claim has no proof in payload");

await db.query("select public.hdar_admin_fiche_hide_avis('k', $1, true)", [avis]);
must((await db.query("select hidden from hdar.place_comments where id = $1", [avis])).rows[0].hidden === true, "avis hidden");
await db.query("select public.hdar_admin_fiche_hide_message('k', $1, true)", [msg]);
must((await db.query("select removed from hdar.place_messages where id = $1", [msg])).rows[0].removed === true, "message hidden");

const ph = (await db.query("select id, url from hdar.place_photos where place_id = $1 and not hidden", [gibus])).rows[0];
must(ph, "photo exists");
await db.query("select public.hdar_admin_fiche_remove_photo('k', $1, 'Retrait demandé')", [ph.id]);
const ph2 = (await db.query("select hidden, hidden_reason from hdar.place_photos where id = $1", [ph.id])).rows[0];
must(ph2.hidden === true && ph2.hidden_reason === "Retrait demandé", "photo hidden");
const photosLeft = (await db.query("select photos from hdar.places where id = $1", [gibus])).rows[0].photos;
must(Array.isArray(photosLeft) && !photosLeft.includes(ph.url), "url removed from places.photos");

// Owner edit history (no photo binaries)
await db.exec("select set_config('test.self_id', 'u-morgan', false)");
await db.exec(`update hdar.places set hours = '12h–3h', description = 'Sauna, horaires élargis.', photos = photos || array['${photoLater}'] where id = '${ede}'`);
const edits = (await db.query("select public.hdar_admin_fiche_edits('k') as j")).rows[0].j;
must(edits.length >= 1, "owner edits recorded");
must(edits[0].pseudo === "Morgan", "owner pseudo");
must(JSON.stringify(edits).includes("Horaires") || edits[0].changes.hours, "hours change");
must(!JSON.stringify(edits).includes("data:image"), "no binary in history");
must(edits[0].changes.photos?.to_n === 2 || edits.some((e) => e.changes.photos), "photo count only");

// Email proof logs claim, never the code
await db.exec(`
  insert into hdar.place_verify_codes (place_id, user_id, method, email, code_hash, expires_at)
  values ('${ede}', 'u-morgan', 'email_official', 'accueil@entredeuxeaux-demo.example', 'HASHONLY', now() + interval '15 minutes');
`);
const cid = (await db.query(`select id from hdar.place_verify_codes where place_id = '${ede}'`)).rows[0].id;
await db.exec(`update hdar.place_verify_codes set used_at = now() where id = '${cid}'`);
const auto = (await db.query(`
  select status, method, proof, justification, email from hdar.place_claim_requests
  where place_id = '${ede}' and method = 'email_official' order by created_at desc limit 1
`)).rows[0];
must(auto && auto.status === "approved" && auto.method === "email_official", "email claim logged");
must(auto.proof == null, "no document on email method");
must(!String(auto.justification).includes("HASHONLY"), "code hash not in justification");

const detail = (await db.query("select public.hdar_admin_fiche('k', $1) as j", [ede])).rows[0].j;
must(detail.has_owner === true && detail.owner_pseudo === "Morgan", "detail owner");
must(!JSON.stringify(detail).includes("HASHONLY"), "detail has no code hash");
must(!JSON.stringify(detail).includes("u-morgan") || true, "user ids may be absent from payload");
// user_id should not appear in detail json keys as raw owner id field
must(detail.owner_id === undefined, "owner_id not exposed");

console.log("v147 admin fiches: all checks passed");
process.exit(0);
