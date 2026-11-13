-- ScoreMaster : e-mail réel + nom d'utilisateur unique.
-- À coller dans Supabase > SQL Editor > Run, APRÈS supabase.sql et supabase-partage.sql (sans risque de le relancer).

-- 1) identifiant "slug" du pseudo (minuscules, sans accents) : unique, sert au partage des parties
alter table public.profiles add column if not exists slug text;

-- anciens comptes (e-mail technique pseudo@scoremaster.app) : on retrouve leur slug
update public.profiles p set slug = split_part(u.email, '@', 1)
  from auth.users u where u.id = p.user_id and p.slug is null;

-- anciens comptes sans profil : on en crée un
insert into public.profiles (user_id, pseudo, slug)
  select u.id, coalesce(u.raw_user_meta_data->>'pseudo', split_part(u.email, '@', 1)), split_part(u.email, '@', 1)
  from auth.users u where not exists (select 1 from public.profiles p where p.user_id = u.id)
  on conflict do nothing;

create unique index if not exists profiles_slug_uniq on public.profiles (slug) where slug is not null;

-- 2) à l'inscription, le profil (pseudo + slug) est créé automatiquement
create or replace function public.creer_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, pseudo, slug)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'pseudo', ''), split_part(new.email, '@', 1)),
          coalesce(nullif(new.raw_user_meta_data->>'slug', ''), split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists sm_creer_profil on auth.users;
create trigger sm_creer_profil after insert on auth.users for each row execute function public.creer_profil();

-- 3) "ce pseudo est-il libre ?" (appelable avant de créer le compte ; ne révèle que l'existence du pseudo, déjà public au classement)
create or replace function public.pseudo_libre(p_slug text) returns boolean
language sql security definer stable set search_path = public as $$
  select not exists (select 1 from public.profiles where slug = p_slug);
$$;
grant execute on function public.pseudo_libre(text) to anon, authenticated;

-- 4) mon slug (pour le partage des parties) : ne dépend plus de l'e-mail
create or replace function public.mon_slug() returns text
language sql security definer stable set search_path = public as $$
  select slug from public.profiles where user_id = auth.uid();
$$;
grant execute on function public.mon_slug() to authenticated;

drop policy if exists "parties lecture" on public.parties;
create policy "parties lecture" on public.parties for select to authenticated
  using (owner = auth.uid() or public.mon_slug() = any(players));
