-- ============================================================
-- profiles table
-- Linked to auth.users; stores extra user metadata.
-- Supabase Auth handles credentials — no raw passwords here.
-- ============================================================

create table public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  username   text,
  created_at timestamptz default now() not null
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Storage: resumes bucket
-- Private bucket; each user may only access their own resume
-- at path {user_id}/resume.pdf
-- ============================================================

-- Create the private bucket (if not already created via the dashboard)
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

-- Allow authenticated users to upload their own resume
create policy "Users can upload own resume"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to read their own resume
create policy "Users can read own resume"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to update (replace) their own resume
create policy "Users can update own resume"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to delete their own resume
create policy "Users can delete own resume"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
