-- Account deletion: delete personal data, retain history (anonymized/unlinked).
-- Goal:
-- - Delete profile + contacts + preferences + subscription/family rows
-- - Preserve "history" rows (emergencies, checkins, tracking_sessions, call_sessions, bodyguard_bookings)
--   by unlinking them from the user before deleting the account.

-- 1) Ensure history tables do NOT cascade-delete when the user/profile is deleted.
--    We make `mobile_user_id` nullable and convert any FK to ON DELETE SET NULL
--    (covering both auth.users and public.mobile_users references).
do $$
declare
  t text;
  fk record;
begin
  foreach t in array array['emergencies','checkins','tracking_sessions','call_sessions','bodyguard_bookings'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'mobile_user_id'
    ) then
      execute format('alter table public.%I alter column mobile_user_id drop not null', t);

      -- Drop any FK on mobile_user_id that references auth.users or public.mobile_users,
      -- then recreate as ON DELETE SET NULL (auth.users preferred).
      for fk in
        select c.conname
        from pg_constraint c
        join pg_class rel on rel.oid = c.conrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where c.contype = 'f'
          and n.nspname = 'public'
          and rel.relname = t
      loop
        if exists (
          select 1
          from pg_constraint c2
          join pg_attribute a on a.attrelid = c2.conrelid and a.attnum = any(c2.conkey)
          join pg_class frel on frel.oid = c2.confrelid
          join pg_namespace fn on fn.oid = frel.relnamespace
          where c2.conname = fk.conname
            and a.attname = 'mobile_user_id'
            and (
              (fn.nspname = 'auth' and frel.relname = 'users')
              or
              (fn.nspname = 'public' and frel.relname = 'mobile_users')
            )
        ) then
          execute format('alter table public.%I drop constraint %I', t, fk.conname);
        end if;
      end loop;

      -- Add a stable FK back to auth.users with ON DELETE SET NULL (if auth.users exists).
      if to_regclass('auth.users') is not null then
        if not exists (
          select 1
          from pg_constraint c
          join pg_class rel on rel.oid = c.conrelid
          join pg_namespace n on n.oid = rel.relnamespace
          where c.contype = 'f'
            and n.nspname = 'public'
            and rel.relname = t
            and c.conname = (t || '_mobile_user_id_fkey_setnull')
        ) then
          execute format(
            'alter table public.%I add constraint %I foreign key (mobile_user_id) references auth.users(id) on delete set null',
            t,
            (t || '_mobile_user_id_fkey_setnull')
          );
        end if;
      end if;
    end if;
  end loop;
end
$$;

-- 2) Server-side deletion routine (service-only).
create or replace function public.delete_user_personal_data_keep_history(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  t text;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Preserve history: unlink by nulling the user reference.
  foreach t in array array['emergencies','checkins','tracking_sessions','call_sessions','bodyguard_bookings'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'mobile_user_id'
    ) then
      execute format('update public.%I set mobile_user_id = null where mobile_user_id = $1', t)
      using p_user_id;
    end if;
  end loop;

  -- Delete personal/profile data (best-effort, only if tables/columns exist).
  -- IMPORTANT: keep this list tight to avoid deleting retained history tables.

  -- Emergency contacts
  if to_regclass('public.emergency_contacts') is not null and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='emergency_contacts' and column_name in ('mobile_user_id','user_id')
  ) then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='emergency_contacts' and column_name='mobile_user_id') then
      execute 'delete from public.emergency_contacts where mobile_user_id = $1' using p_user_id;
    else
      execute 'delete from public.emergency_contacts where user_id = $1' using p_user_id;
    end if;
  end if;

  -- Notification / privacy settings tables
  if to_regclass('public.notification_preferences') is not null and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notification_preferences' and column_name in ('mobile_user_id','user_id')
  ) then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='notification_preferences' and column_name='mobile_user_id') then
      execute 'delete from public.notification_preferences where mobile_user_id = $1' using p_user_id;
    else
      execute 'delete from public.notification_preferences where user_id = $1' using p_user_id;
    end if;
  end if;

  if to_regclass('public.privacy_settings') is not null and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='privacy_settings' and column_name in ('mobile_user_id','user_id')
  ) then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='privacy_settings' and column_name='mobile_user_id') then
      execute 'delete from public.privacy_settings where mobile_user_id = $1' using p_user_id;
    else
      execute 'delete from public.privacy_settings where user_id = $1' using p_user_id;
    end if;
  end if;

  -- Subscription / family data
  if to_regclass('public.family_members') is not null and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='family_members' and column_name in ('member_user_id','user_id','mobile_user_id','subscription_id')
  ) then
    -- If family_members ties to member_user_id (activated member accounts), remove those links.
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='family_members' and column_name='member_user_id') then
      execute 'delete from public.family_members where member_user_id = $1' using p_user_id;
    end if;
    -- If the user is the owner, remove all members under their subscription(s).
    if to_regclass('public.user_subscriptions') is not null
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_subscriptions' and column_name='user_id')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='family_members' and column_name='subscription_id') then
      execute $q$
        delete from public.family_members fm
        where fm.subscription_id in (
          select us.id from public.user_subscriptions us where us.user_id = $1
        )
      $q$ using p_user_id;
    end if;
  end if;

  if to_regclass('public.user_subscriptions') is not null and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='user_subscriptions' and column_name='user_id'
  ) then
    execute 'delete from public.user_subscriptions where user_id = $1' using p_user_id;
  end if;

  -- Finally: delete the profile row (PII) if it exists.
  if to_regclass('public.mobile_users') is not null and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='mobile_users' and column_name='id'
  ) then
    execute 'delete from public.mobile_users where id = $1' using p_user_id;
  end if;
end;
$$;

revoke all on function public.delete_user_personal_data_keep_history(uuid) from public;
-- Allow service role to execute during Edge Function call.
grant execute on function public.delete_user_personal_data_keep_history(uuid) to service_role;

