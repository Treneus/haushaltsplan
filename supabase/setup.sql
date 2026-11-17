-- =====================================================================
--  Haushaltsplan – Datenbank-Einrichtung für Supabase
--
--  So benutzen: Supabase-Dashboard → SQL Editor → "New query" →
--  diesen ganzen Text einfügen → "Run".
--  Das Skript kann gefahrlos mehrmals ausgeführt werden.
--
--  Sicherheitskonzept (Kurzfassung, Details in docs/TECHNIK.md):
--   * Alle Inhalte (Ausgaben, Kategorien, Namen) sind auf dem Handy
--     verschlüsselt. Die Datenbank sieht nur Zeichensalat.
--   * Row Level Security: Jedes Gerät sieht nur die Daten des Haushalts,
--     dem es beigetreten ist.
--   * Beitreten geht nur mit Haushalts-Code + Passwort. Nach 10 falschen
--     Versuchen ist der Haushalt 15 Minuten lang gesperrt.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  Tabellen
-- ---------------------------------------------------------------------

-- Ein Haushalt (eine Familie)
create table if not exists public.households (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,          -- z. B. "K7Q2-M9XA" (zum Beitreten)
  join_hash     text not null,                 -- SHA-256 des Beitritts-Schlüssels
  failed_joins  int  not null default 0,       -- falsche Passwort-Versuche
  locked_until  timestamptz,                   -- Sperre nach zu vielen Fehlversuchen
  created_at    timestamptz not null default now()
);

-- Geräte, die zu einem Haushalt gehören
create table if not exists public.members (
  household_id  uuid not null references public.households(id) on delete cascade,
  device_id     text not null,                 -- zufällige Geräte-ID der App
  user_id       uuid not null,                 -- anonymer Supabase-Nutzer dieses Geräts
  payload       text not null default '',      -- verschlüsselt: { name }
  last_seen     timestamptz not null default now(),
  primary key (household_id, device_id)
);
create index if not exists members_user_idx on public.members (user_id);

-- Alle Einträge (Kategorien + Ausgaben), jeweils verschlüsselt
create table if not exists public.records (
  household_id  uuid   not null references public.households(id) on delete cascade,
  id            text   not null,               -- Eintrags-ID aus der App
  updated_at    bigint not null,               -- Änderungszeit (ms) laut Gerät
  payload       text   not null,               -- verschlüsselter Inhalt
  server_ms     bigint not null default 0,     -- wann der Server es bekam (ms)
  primary key (household_id, id),
  constraint records_id_format check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  constraint records_payload_size check (length(payload) < 20000)
);
create index if not exists records_pull_idx on public.records (household_id, server_ms);

-- ---------------------------------------------------------------------
--  Hilfsfunktion: Ist der aktuelle Nutzer Mitglied in Haushalt h?
-- ---------------------------------------------------------------------
create or replace function public.is_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
--  Trigger: Server-Zeit setzen und "neueste Änderung gewinnt" erzwingen
-- ---------------------------------------------------------------------
create or replace function public.records_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old;  -- ältere Version überschreibt keine neuere
  end if;
  new.server_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end;
$$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write
  before insert or update on public.records
  for each row execute function public.records_before_write();

-- ---------------------------------------------------------------------
--  Row Level Security (Zugriffsregeln)
-- ---------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.members    enable row level security;
alter table public.records    enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated using (public.is_member(id));

drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated using (public.is_member(household_id));

drop policy if exists members_delete_own on public.members;
create policy members_delete_own on public.members
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists records_select on public.records;
create policy records_select on public.records
  for select to authenticated using (public.is_member(household_id));

drop policy if exists records_insert on public.records;
create policy records_insert on public.records
  for insert to authenticated with check (public.is_member(household_id));

drop policy if exists records_update on public.records;
create policy records_update on public.records
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
-- Kein DELETE auf records: Gelöschtes wird nur markiert (verschlüsselt).

-- Rechte: nicht angemeldete Zugriffe (anon) bekommen gar nichts
revoke all on public.households, public.members, public.records from anon;
revoke all on public.households, public.members, public.records from authenticated;
grant select                  on public.households to authenticated;
grant select, delete          on public.members    to authenticated;
grant select, insert, update  on public.records    to authenticated;

-- ---------------------------------------------------------------------
--  Funktionen, die die App aufruft
-- ---------------------------------------------------------------------

-- Neuen Haushalt anlegen. Gibt die Haushalts-ID zurück.
create or replace function public.create_household(
  p_code text, p_join_hash text, p_device_id text, p_payload text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'nicht angemeldet';
  end if;
  if p_code !~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$' or length(p_join_hash) <> 64
     or length(p_device_id) > 40 or length(p_payload) > 2000 then
    raise exception 'ungültige Eingabe';
  end if;

  insert into households (code, join_hash) values (p_code, p_join_hash)
  returning id into hid;

  insert into members (household_id, device_id, user_id, payload)
  values (hid, p_device_id, auth.uid(), p_payload);

  return hid;
end;
$$;

-- Einem Haushalt beitreten.
-- Rückgabe: { "status": "ok", "household_id": ... } | { "status": "wrong" } | { "status": "locked" }
create or replace function public.join_household(
  p_code text, p_join_token text, p_device_id text, p_payload text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h households%rowtype;
begin
  if auth.uid() is null then
    raise exception 'nicht angemeldet';
  end if;
  if length(p_device_id) > 40 or length(p_payload) > 2000 or length(p_join_token) > 200 then
    raise exception 'ungültige Eingabe';
  end if;

  select * into h from households where code = upper(p_code) for update;
  if not found then
    perform pg_sleep(0.5);
    return jsonb_build_object('status', 'wrong');
  end if;

  if h.locked_until is not null and h.locked_until > now() then
    return jsonb_build_object('status', 'locked');
  end if;

  if encode(digest(p_join_token, 'sha256'), 'hex') <> h.join_hash then
    update households
       set failed_joins = case when failed_joins + 1 >= 10 then 0 else failed_joins + 1 end,
           locked_until = case when failed_joins + 1 >= 10 then now() + interval '15 minutes' else locked_until end
     where id = h.id;
    perform pg_sleep(0.5);
    return jsonb_build_object('status', 'wrong');
  end if;

  update households set failed_joins = 0 where id = h.id;

  insert into members (household_id, device_id, user_id, payload)
  values (h.id, p_device_id, auth.uid(), p_payload)
  on conflict (household_id, device_id)
  do update set user_id = excluded.user_id, payload = excluded.payload, last_seen = now();

  return jsonb_build_object('status', 'ok', 'household_id', h.id);
end;
$$;

-- "Ich bin noch da": eigenen Gerätenamen und Zeitpunkt aktualisieren
create or replace function public.heartbeat(
  p_household uuid, p_device_id text, p_payload text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(p_payload) > 2000 then
    raise exception 'ungültige Eingabe';
  end if;
  update members
     set payload = p_payload, last_seen = now()
   where household_id = p_household
     and device_id = p_device_id
     and user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.create_household(text, text, text, text) from public, anon;
revoke all on function public.join_household(text, text, text, text)  from public, anon;
revoke all on function public.heartbeat(uuid, text, text)              from public, anon;
revoke all on function public.is_member(uuid)                          from public, anon;
grant execute on function public.create_household(text, text, text, text) to authenticated;
grant execute on function public.join_household(text, text, text, text)  to authenticated;
grant execute on function public.heartbeat(uuid, text, text)              to authenticated;
grant execute on function public.is_member(uuid)                          to authenticated;

-- Fertig! Jetzt noch: Authentication → Sign In / Providers →
-- "Allow anonymous sign-ins" einschalten.
