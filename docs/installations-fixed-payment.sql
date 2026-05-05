alter table public.installations
  add column if not exists pago text not null default 'segun_factura',
  add column if not exists cantidad_precio_fijo numeric(10, 2) null;

alter table public.installations
  drop constraint if exists installations_pago_check;

alter table public.installations
  add constraint installations_pago_check
  check (pago = any (array['segun_factura'::text, 'fijo'::text]));

alter table public.installations
  drop constraint if exists installations_cantidad_precio_fijo_check;

alter table public.installations
  add constraint installations_cantidad_precio_fijo_check
  check (cantidad_precio_fijo is null or cantidad_precio_fijo >= 0);

alter table public.installations
  drop constraint if exists installations_pago_fijo_cantidad_check;

alter table public.installations
  add constraint installations_pago_fijo_cantidad_check
  check (pago <> 'fijo'::text or cantidad_precio_fijo > 0);
