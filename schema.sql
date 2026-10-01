-- ChinaLink schema. Paste this whole file into Supabase > SQL Editor > Run.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  ref text not null default ('CL' || to_char(now(), 'YYMMDD') || lpad(floor(random()*10000)::int::text, 4, '0')),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  visa_type text not null,
  passport_no text not null,
  name_zh text,
  name_en text not null,
  arrival_date date not null,
  fee integer not null default 0,
  paid boolean not null default false, -- staff set this after the passport is returned and the customer pays
  status text not null default 'submitted'
    check (status in ('submitted','in_review','pending','completed')),
  created_at timestamptz not null default now()
);

-- Fee is set on the server so customers cannot change the price.
create or replace function public.set_fee() returns trigger language plpgsql as $$
begin
  new.fee := case new.visa_type
    when 'tourist' then 60 when 'business' then 90 when 'work' then 130
    when 'extension' then 50 when 'overstay' then 70 else 0 end;
  new.status := 'submitted';
  new.paid := false;
  return new;
end $$;
create trigger applications_set_fee before insert on public.applications
  for each row execute function public.set_fee();

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null,
  path text not null,
  created_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade, -- the customer this thread belongs to
  from_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.documents enable row level security;
alter table public.messages enable row level security;

create policy "profile read own or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profile update own name" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and is_admin = (select is_admin from public.profiles where id = auth.uid()));

create policy "apps read own or admin" on public.applications for select using (user_id = auth.uid() or public.is_admin());
create policy "apps insert own" on public.applications for insert with check (user_id = auth.uid());
create policy "apps update admin" on public.applications for update using (public.is_admin());

create policy "docs read own or admin" on public.documents for select using (user_id = auth.uid() or public.is_admin());
create policy "docs insert own" on public.documents for insert with check (user_id = auth.uid());

create policy "msgs read own or admin" on public.messages for select using (user_id = auth.uid() or public.is_admin());
create policy "msgs customer insert" on public.messages for insert with check (user_id = auth.uid() and from_staff = false);
create policy "msgs staff insert" on public.messages for insert with check (public.is_admin() and from_staff = true);

-- Private bucket for passports and photos
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict do nothing;
create policy "docs upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs read own folder or admin" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- Live chat
alter publication supabase_realtime add table public.messages;

-- After you sign up in the app, make yourself staff (replace the email):
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
