-- Tensini Barbieri — banco de dados do agendamento
-- Rodar no Supabase → SQL Editor, num projeto SÓ DA BARBEARIA.
-- Pode ser rodado de novo: recria funções e regras sem apagar agendamentos.
--
-- Regra principal: cada barbeiro tem a própria agenda. Um horário só fica ocupado
-- para o barbeiro que vai atender; bloqueio sem barbeiro fecha a barbearia toda.

create extension if not exists pgcrypto;

-- ---------- Catálogo ----------
create table if not exists services (
  id           text primary key,
  grp          text not null,                 -- Cabelo / Barba / Combos / Acabamento / Química
  name         text not null,
  description  text not null default '',
  duration_min int  not null check (duration_min between 10 and 480),
  opt_title    text not null default 'Opção',
  options      jsonb not null,                -- [{"label":"Valor único","price":45}] ou várias opções
  note         text,
  sort         int  not null default 0,
  active       boolean not null default true,
  promo_slots     int,          -- vagas da promoção (null = não é promoção)
  promo_from      timestamptz,  -- começa a valer
  promo_until     timestamptz,  -- último momento para agendar (null = até acabar as vagas)
  promo_last_day  date          -- último dia de atendimento (null = sem limite)
);

create table if not exists barbers (
  id       text primary key,
  name     text not null,
  role     text not null default '',
  days     int[],                -- dias da semana em que atende (0 = domingo). null = todos os dias abertos
  services text[],               -- ids dos serviços que faz. null = todos
  sort     int not null default 0,
  active   boolean not null default true
);

create table if not exists opening_hours (
  dow    int primary key check (dow between 0 and 6),   -- 0 = domingo
  opens  time not null,
  closes time not null check (closes > opens)
);

create table if not exists settings (
  id             int primary key default 1 check (id = 1),
  hold_hours     int not null default 24,     -- quanto tempo um pedido segura o horário sem confirmação
  slot_step      int not null default 30,     -- intervalo entre horários de início (min)
  days_ahead     int not null default 30,
  min_notice_min int not null default 60,     -- antecedência mínima para agendar (min)
  break_start    time,                        -- pausa do almoço (null = sem pausa)
  break_end      time,
  prepay         boolean not null default false   -- true = Pix/cartão pagos antes (contam como recebidos ao confirmar)
);
insert into settings (id) values (1) on conflict do nothing;

-- ---------- Agenda ----------
create table if not exists bookings (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  created_at    timestamptz not null default now(),
  service_id    text not null,               -- id do serviço (ou "avulso", lançado no painel)
  service_name  text not null,
  option_label  text not null,
  total         numeric(10,2) not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  barber_id     text not null references barbers(id),
  barber_name   text not null default '',
  any_barber    boolean not null default false,  -- cliente escolheu "qualquer um"
  client_name   text not null,
  client_phone  text not null default '',
  notes         text not null default '',
  payment       text not null check (payment in ('Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro')),
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'done', 'cancelled', 'expired')),
  expires_at    timestamptz,
  confirmed_at  timestamptz,
  paid_amount   numeric(10,2) check (paid_amount >= 0),   -- quanto entrou de fato
  paid_at       timestamptz,
  source        text not null default 'site',            -- site / manual
  -- pagamento automático pela InfinitePay (Edge Function supabase/functions/infinitepay)
  pay_url            text,
  ip_transaction_nsu text,
  ip_slug            text,
  ip_method          text,
  ip_installments    int,
  ip_receipt_url     text,
  ip_charged         numeric(10,2),
  check (ends_at > starts_at)
);
create index if not exists bookings_starts_idx on bookings (starts_at);
create index if not exists bookings_barber_idx on bookings (barber_id, starts_at);

create table if not exists blocks (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null check (ends_at > starts_at),
  barber_id  text references barbers(id),    -- null = barbearia toda
  reason     text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- despesas (produtos, aluguel, contas...)
create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  spent_on    date not null,
  description text not null,
  category    text not null default 'Outros',
  amount      numeric(10,2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);

-- planilhas do financeiro: "Zerar planilha" começa uma nova a partir de agora; as anteriores continuam salvas
create table if not exists ledgers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  started_at timestamptz not null default now()
);

-- ---------- Segurança ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

alter table services      enable row level security;
alter table barbers       enable row level security;
alter table opening_hours enable row level security;
alter table settings      enable row level security;
alter table bookings      enable row level security;
alter table blocks        enable row level security;
alter table admins        enable row level security;
alter table expenses      enable row level security;
alter table ledgers       enable row level security;

-- clientes não leem nenhuma tabela diretamente: só pelas funções públicas lá embaixo
drop policy if exists admin_all on services;      create policy admin_all on services      for all using (is_admin()) with check (is_admin());
drop policy if exists admin_all on barbers;       create policy admin_all on barbers       for all using (is_admin()) with check (is_admin());
drop policy if exists admin_all on opening_hours; create policy admin_all on opening_hours for all using (is_admin()) with check (is_admin());
drop policy if exists admin_all on settings;      create policy admin_all on settings      for all using (is_admin()) with check (is_admin());
drop policy if exists admin_all on bookings;      create policy admin_all on bookings      for all using (is_admin()) with check (is_admin());
drop policy if exists admin_all on blocks;        create policy admin_all on blocks        for all using (is_admin()) with check (is_admin());
drop policy if exists admin_all on expenses;      create policy admin_all on expenses      for all using (is_admin()) with check (is_admin());
drop policy if exists admin_all on ledgers;       create policy admin_all on ledgers       for all using (is_admin()) with check (is_admin());
drop policy if exists admin_self on admins;       create policy admin_self on admins       for select using (user_id = auth.uid());

-- confirmação registra a hora; com pagamento antecipado (settings.prepay) Pix/cartão contam como recebidos ao confirmar;
-- sem ele, tudo conta como recebido quando o atendimento é concluído
create or replace function bookings_touch() returns trigger language plpgsql security definer set search_path = public as $$
declare was text := null;
begin
  if tg_op = 'UPDATE' then was := old.status; end if;
  if new.barber_name = '' then new.barber_name := coalesce((select name from barbers where id = new.barber_id), ''); end if;
  if new.status = 'confirmed' and was is distinct from 'confirmed' then
    new.confirmed_at := coalesce(new.confirmed_at, now());
    -- lançamento manual no painel diz por conta própria se já pagou
    if coalesce((select prepay from settings where id = 1), false) and new.payment <> 'Dinheiro'
       and new.paid_amount is null and not (tg_op = 'INSERT' and new.source = 'manual') then
      new.paid_amount := new.total;
    end if;
  end if;
  if new.status = 'done' and new.paid_amount is null then new.paid_amount := new.total; end if;
  if new.paid_amount is not null and new.paid_at is null then new.paid_at := now(); end if;
  if new.paid_amount is null then new.paid_at := null; end if;
  if new.status <> 'pending' then new.expires_at := null; end if;
  return new;
end $$;
drop trigger if exists bookings_touch on bookings;
create trigger bookings_touch before insert or update on bookings for each row execute function bookings_touch();

-- o barbeiro está livre? (bloqueio dele ou da barbearia toda, ou outro atendimento ativo dele no mesmo horário)
create or replace function barber_free(p_barber text, p_start timestamptz, p_end timestamptz, p_except uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from blocks k
                      where (k.barber_id is null or k.barber_id = p_barber)
                        and k.starts_at < p_end and k.ends_at > p_start)
     and not exists (select 1 from bookings b
                      where b.barber_id = p_barber and b.id is distinct from p_except
                        and (b.status = 'confirmed' or (b.status = 'pending' and b.expires_at > now()))
                        and b.starts_at < p_end and b.ends_at > p_start);
$$;

create or replace function check_fit(p_id uuid, p_barber text, p_start timestamptz, p_end timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not barber_free(p_barber, p_start, p_end, p_id) then raise exception 'horario_ocupado'; end if;
end $$;

-- vale para tudo que entra na agenda (site, painel, pagamento): nunca dois atendimentos do mesmo barbeiro ao mesmo tempo
create or replace function bookings_fit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' or (new.status = 'pending' and coalesce(new.expires_at, now() + interval '1 hour') > now()) then
    if tg_op = 'INSERT' or new.status is distinct from old.status or new.starts_at <> old.starts_at
       or new.ends_at <> old.ends_at or new.barber_id <> old.barber_id then
      perform pg_advisory_xact_lock(hashtext('tensini_request_booking'));
      perform check_fit(new.id, new.barber_id, new.starts_at, new.ends_at);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_fit on bookings;
create trigger bookings_fit before insert or update on bookings for each row execute function bookings_fit();

-- pedidos não confirmados a tempo liberam o horário
create or replace function expire_pending() returns void
language sql security definer set search_path = public as $$
  update bookings set status = 'expired' where status = 'pending' and expires_at < now();
$$;

-- vagas usadas da promoção: pedidos ativos (aguardando dentro do prazo, confirmados ou já atendidos)
create or replace function promo_used(p_service text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from bookings
   where service_id = p_service
     and (status in ('confirmed', 'done') or (status = 'pending' and expires_at > now()));
$$;

create or replace function promo_check(s services, p_start timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if s.promo_slots is null then return; end if;
  if s.promo_from is not null and now() < s.promo_from then raise exception 'promo_nao_comecou'; end if;
  if s.promo_until is not null and now() > s.promo_until then raise exception 'promo_encerrada'; end if;
  if s.promo_last_day is not null and (p_start at time zone 'America/Sao_Paulo')::date > s.promo_last_day then raise exception 'promo_data'; end if;
  if promo_used(s.id) >= s.promo_slots then raise exception 'promo_esgotada'; end if;
end $$;

-- ---------- Funções públicas (site) ----------
create or replace function get_catalog() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'services', coalesce((select json_agg(json_build_object(
        'id', id, 'grp', grp, 'name', name, 'desc', description, 'min', duration_min,
        'optTitle', opt_title, 'options', options, 'note', note,
        'promo', case when promo_slots is null then null else json_build_object(
                   'vagas', promo_slots, 'restam', greatest(0, promo_slots - promo_used(id)),
                   'de', promo_from, 'ate', promo_until, 'atendeAte', promo_last_day) end) order by sort)
      from services where active), '[]'::json),
    'barbers', coalesce((select json_agg(json_build_object(
        'id', id, 'name', name, 'role', role, 'days', days, 'services', services) order by sort)
      from barbers where active), '[]'::json),
    'hours', coalesce((select json_object_agg(dow, json_build_array(to_char(opens, 'HH24:MI'), to_char(closes, 'HH24:MI'))) from opening_hours), '{}'::json),
    'settings', (select row_to_json(s) from (select hold_hours, slot_step, days_ahead, min_notice_min, prepay,
                   to_char(break_start, 'HH24:MI') as break_start, to_char(break_end, 'HH24:MI') as break_end from settings) s)
  );
$$;

-- horários ocupados de cada barbeiro (sem nenhum dado do cliente). barber_id null = barbearia toda
drop function if exists busy_slots(timestamptz, timestamptz);
create or replace function busy_slots(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, barber_id text)
language sql stable security definer set search_path = public as $$
  select b.starts_at, b.ends_at, b.barber_id from bookings b
   where (b.status = 'confirmed' or (b.status = 'pending' and b.expires_at > now()))
     and b.starts_at < p_to and b.ends_at > p_from
  union all
  select k.starts_at, k.ends_at, k.barber_id from blocks k
   where k.starts_at < p_to and k.ends_at > p_from;
$$;

-- p_barber: id do barbeiro, ou 'any' / null para "qualquer um" (o banco escolhe o livre com menos atendimentos no dia)
drop function if exists request_booking(text, int, text, timestamptz, text, text, text, text);
create or replace function request_booking(
  p_service text, p_option int, p_barber text, p_start timestamptz,
  p_name text, p_phone text, p_notes text, p_payment text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  s      services;
  cfg    settings;
  h      opening_hours;
  br     barbers;
  opt    jsonb;
  loc    timestamp := p_start at time zone 'America/Sao_Paulo';
  v_day  date := (p_start at time zone 'America/Sao_Paulo')::date;
  v_dow  int := extract(dow from (p_start at time zone 'America/Sao_Paulo'))::int;
  v_end  timestamptz;
  seg_start time;
  v_total numeric;
  v_code text;
  v_any  boolean := p_barber is null or p_barber in ('', 'any');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name text := btrim(coalesce(p_name, ''));
begin
  -- um pedido por vez: quem chega depois no mesmo segundo recebe "horario_ocupado", não um erro técnico
  perform pg_advisory_xact_lock(hashtext('tensini_request_booking'));
  perform expire_pending();
  select * into cfg from settings where id = 1;
  select * into s from services where id = p_service and active;
  if not found then raise exception 'servico_invalido'; end if;
  perform promo_check(s, p_start);
  opt := s.options -> p_option;
  if opt is null then raise exception 'opcao_invalida'; end if;
  if p_payment not in ('Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro') then raise exception 'pagamento_invalido'; end if;
  if s.promo_slots is not null and p_payment = 'Dinheiro' then raise exception 'promo_pagamento'; end if;
  if length(v_name) < 3 or length(v_name) > 80 then raise exception 'nome_invalido'; end if;
  if length(v_phone) < 10 or length(v_phone) > 13 then raise exception 'telefone_invalido'; end if;
  if length(coalesce(p_notes, '')) > 500 then raise exception 'obs_longa'; end if;

  -- regras de horário
  if p_start < now() + make_interval(mins => cfg.min_notice_min) then raise exception 'antecedencia'; end if;
  if p_start > now() + make_interval(days => cfg.days_ahead + 1) then raise exception 'muito_longe'; end if;
  select * into h from opening_hours where dow = v_dow;
  if not found then raise exception 'fechado'; end if;
  seg_start := case when cfg.break_end is not null and loc::time >= cfg.break_end and cfg.break_end < h.closes then cfg.break_end else h.opens end;
  if loc::time < h.opens or loc::time + make_interval(mins => s.duration_min) > h.closes
     or (cfg.break_start is not null and loc::time < cfg.break_end and loc::time + make_interval(mins => s.duration_min) > cfg.break_start)
     or (extract(epoch from loc::time - seg_start)::int / 60) % cfg.slot_step <> 0 then
    raise exception 'fora_do_horario';
  end if;
  v_end := p_start + make_interval(mins => s.duration_min);

  -- limite contra pedidos falsos
  if (select count(*) from bookings where client_phone = v_phone and status = 'pending') >= 2 then
    raise exception 'muitos_pedidos';
  end if;

  -- barbeiro
  if v_any then
    select * into br from barbers x
     where x.active and (x.days is null or v_dow = any(x.days)) and (x.services is null or s.id = any(x.services))
       and barber_free(x.id, p_start, v_end)
     order by (select count(*) from bookings b where b.barber_id = x.id
                 and (b.status = 'confirmed' or (b.status = 'pending' and b.expires_at > now()))
                 and (b.starts_at at time zone 'America/Sao_Paulo')::date = v_day), x.sort
     limit 1;
    if not found then raise exception 'sem_barbeiro'; end if;
  else
    select * into br from barbers where id = p_barber and active;
    if not found or (br.services is not null and not (s.id = any(br.services))) then raise exception 'barbeiro_invalido'; end if;
    if br.days is not null and not (v_dow = any(br.days)) then raise exception 'barbeiro_folga'; end if;
  end if;

  v_total := (opt ->> 'price')::numeric;
  v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));

  -- a regra da agenda do barbeiro (gatilho bookings_fit) recusa com 'horario_ocupado'
  insert into bookings (code, service_id, service_name, option_label, total, starts_at, ends_at,
                        barber_id, barber_name, any_barber, client_name, client_phone, notes, payment, expires_at)
  values (v_code, s.id, s.name, opt ->> 'label', v_total, p_start, v_end,
          br.id, br.name, v_any, v_name, v_phone, coalesce(p_notes, ''), p_payment, now() + make_interval(hours => cfg.hold_hours));

  return json_build_object('code', v_code, 'total', v_total, 'barber_id', br.id, 'barber_name', br.name,
                           'expires_at', now() + make_interval(hours => cfg.hold_hours));
end $$;

-- o cliente acompanha o próprio pedido pelo código
create or replace function booking_status(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('code', code, 'status',
           case when status = 'pending' and expires_at < now() then 'expired' else status end,
           'service', service_name, 'barber', barber_name, 'starts_at', starts_at)
    from bookings where code = upper(btrim(p_code));
$$;

-- ---------- contador de visitas do site ----------
create table if not exists site_visits (
  day      date        not null default (now() at time zone 'America/Sao_Paulo')::date,
  visitor  text        not null,
  first_at timestamptz not null default now(),
  views    int         not null default 1,
  primary key (day, visitor)
);
alter table site_visits enable row level security;
drop policy if exists admin_all on site_visits;
create policy admin_all on site_visits for all using (is_admin()) with check (is_admin());

create or replace function track_visit(p_visitor text) returns void
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_visitor is null or p_visitor !~ '^[a-z0-9]{16,40}$' then return; end if;
  -- trava contra robôs: no máximo 5000 aparelhos novos por dia
  if (select count(*) from site_visits where day = d) >= 5000 then return; end if;
  insert into site_visits (day, visitor) values (d, p_visitor)
  on conflict (day, visitor) do update set views = least(site_visits.views + 1, 500);
end $$;

create or replace function visit_stats() returns json
language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select case when is_admin() then json_build_object(
    'today', (select count(*)                from site_visits, t where day = t.d),
    'week',  (select count(distinct visitor) from site_visits, t where day > t.d - 7),
    'month', (select count(distinct visitor) from site_visits, t where day >= date_trunc('month', t.d)::date),
    'total', (select count(distinct visitor) from site_visits),
    'views', (select coalesce(sum(views), 0) from site_visits),
    'since', (select min(day)                from site_visits),
    'days',  (select coalesce(json_agg(json_build_object('day', g::date, 'n',
                (select count(*) from site_visits where day = g::date)) order by g), '[]'::json)
                from t, generate_series(t.d - 13, t.d, interval '1 day') g)
  ) end
$$;

-- ---------- Permissões ----------
-- funções internas: ninguém de fora chama direto (o Supabase libera funções novas para o site por padrão)
revoke execute on function barber_free(text, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function check_fit(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function promo_used(text) from public, anon, authenticated;
revoke execute on function promo_check(services, timestamptz) from public, anon, authenticated;
revoke execute on function expire_pending() from public, anon;
revoke execute on function bookings_touch() from public, anon, authenticated;
revoke execute on function bookings_fit() from public, anon, authenticated;
revoke all on function request_booking(text, int, text, timestamptz, text, text, text, text) from public;
revoke all on function track_visit(text) from public;
revoke all on function visit_stats() from public, anon;
grant execute on function get_catalog() to anon, authenticated;
grant execute on function busy_slots(timestamptz, timestamptz) to anon, authenticated;
grant execute on function request_booking(text, int, text, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function booking_status(text) to anon, authenticated;
grant execute on function expire_pending() to authenticated;
grant execute on function track_visit(text) to anon, authenticated;
grant execute on function visit_stats() to authenticated;

-- avisos em tempo real para o painel
do $$ begin
  alter publication supabase_realtime add table bookings;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table blocks;
exception when duplicate_object then null; end $$;
