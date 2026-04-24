-- Supabase Storage migration for client documents.
-- Run this once in Supabase SQL Editor before deploying the app changes.

alter table public.clients
  add column if not exists documentos_supabase_bucket text,
  add column if not exists supabase_folder_path text,
  add column if not exists factura_supabase_path text,
  add column if not exists propuesta_supabase_path text;

alter table public.contracts
  add column if not exists contract_supabase_bucket text,
  add column if not exists contract_supabase_path text,
  add column if not exists supabase_folder_path text;
