-- Fix for client/supply upserts scoped by company.
-- Run once in Supabase SQL Editor before or alongside the app deployment.
--
-- The backend uses:
--   onConflict: "empresa_id,dni,cups"
-- Supabase/Postgres requires a matching unique or exclusion constraint.

-- If a previous DNI-only index was created from the older note, remove it so
-- the same customer can have several supplies/homes under different CUPS.
alter table public.clients
  drop constraint if exists clients_empresa_id_dni_unique;

drop index if exists public.clients_empresa_id_dni_unique;

-- If this fails, run the duplicate check below and merge repeated rows first:
--
-- select empresa_id, dni, cups, count(*)
-- from public.clients
-- group by empresa_id, dni, cups
-- having count(*) > 1;

create unique index if not exists clients_empresa_id_dni_cups_unique
  on public.clients (empresa_id, dni, cups);
