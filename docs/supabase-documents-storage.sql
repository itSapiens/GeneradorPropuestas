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

-- Historical document index for back-office/prosumidores screens.
-- For a study detail, use study_* snapshot fields instead of current_client_*.
create or replace view public.client_study_documents as
select
  s.client_id,
  s.empresa_id,
  c.dni as current_client_dni,
  c.nombre as current_client_nombre,
  c.apellidos as current_client_apellidos,
  c.email as current_client_email,
  c.telefono as current_client_telefono,
  s.id as study_id,
  s.created_at as study_created_at,
  s.updated_at as study_updated_at,
  s.status as study_status,
  s.email_status,
  s.customer as study_customer,
  s.invoice_data as study_invoice_data,
  s.calculation as study_calculation,
  s.location as study_location,
  s.source_file,
  s.source_file ->> 'document_set_id' as document_set_id,
  coalesce(
    s.source_file ->> 'documentos_supabase_bucket',
    c.documentos_supabase_bucket
  ) as documentos_supabase_bucket,
  s.source_file ->> 'supabase_folder_path' as supabase_folder_path,
  s.source_file ->> 'factura_supabase_path' as factura_supabase_path,
  coalesce(
    s.source_file ->> 'propuesta_supabase_path',
    s.source_file ->> 'proposal_supabase_path'
  ) as propuesta_supabase_path,
  s.source_file -> 'documents' as documents,
  s.source_file ->> 'uploaded_at' as documents_uploaded_at
from public.studies s
left join public.clients c
  on c.id = s.client_id;
