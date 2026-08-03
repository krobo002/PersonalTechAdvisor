-- supabase/migrations/0002_enable_rls.sql
alter table profiles enable row level security;
alter table recommendations enable row level security;
alter table digest_log enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

create policy "Users can view their own recommendations"
  on recommendations for select
  using (auth.uid() = profile_id);

create policy "Users can update their own recommendations"
  on recommendations for update
  using (auth.uid() = profile_id);

create policy "Users can view their own digest log"
  on digest_log for select
  using (auth.uid() = profile_id);
