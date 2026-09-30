-- =====================================================================
-- Gobbo Logística – Plataforma de gestão
-- Esquema do banco (Supabase / PostgreSQL)
-- Rode este arquivo UMA vez no SQL Editor do Supabase; depois rode seed.sql.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Perfis de acesso (1 linha por usuário do Supabase Auth)
--   papel = 'socio'     -> acesso total
--   papel = 'motorista' -> vê/lança só as próprias viagens e vê o próprio acerto
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text,
  papel text not null default 'motorista' check (papel in ('socio', 'motorista')),
  motorista_id uuid,
  criado_em timestamptz not null default now()
);

create table if not exists public.config (
  id text primary key default 'geral',
  taxa_cartao numeric(6, 4) not null default 0.0899,
  saldo_inicial numeric(14, 2) not null default 0
);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  grupo text not null,
  ordem int not null default 0
);

create table if not exists public.caminhoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  modelo text,
  placa text,
  ano int,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'vendido', 'parado')),
  venc_seguro date,
  venc_licenciamento date,
  km int,
  obs text
);

create table if not exists public.motoristas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  apelido text,
  caminhao_id uuid references public.caminhoes (id) on delete set null,
  admissao date,
  fixo numeric(12, 2) not null default 3500,
  media_ref numeric(12, 2) not null default 200,
  ativo boolean not null default true,
  obs text
);

alter table public.perfis
  drop constraint if exists perfis_motorista_fk,
  add constraint perfis_motorista_fk foreign key (motorista_id) references public.motoristas (id) on delete set null;

create table if not exists public.tabela_fretes (
  id uuid primary key default gen_random_uuid(),
  cidade text not null unique,
  valor_16 numeric(12, 2),
  valor_18 numeric(12, 2)
);

-- Semanas de fechamento com a Levíssima
create table if not exists public.semanas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,          -- ex.: '18.09 a 24.09'
  inicio date not null,
  fim date not null,
  status text not null default 'aberta' check (status in ('aberta', 'fechada', 'paga')),
  total_oficial numeric(14, 2),
  obs text
);

-- Fretes (Kanban: agendado -> em_rota -> entregue -> fechado -> recebido)
create table if not exists public.fretes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  semana_id uuid references public.semanas (id) on delete set null,
  motorista_id uuid references public.motoristas (id) on delete set null,
  caminhao_id uuid references public.caminhoes (id) on delete set null,
  origem text,
  cliente text not null,
  cidade text,
  tipo text not null default 'Entrega',
  valor numeric(14, 2) not null default 0,
  status text not null default 'agendado' check (status in ('agendado', 'em_rota', 'entregue', 'fechado', 'recebido')),
  fonte text,
  obs text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists fretes_data_idx on public.fretes (data);
create index if not exists fretes_motorista_idx on public.fretes (motorista_id);

-- Despesas / contas a pagar (Kanban derivado de vencimento + status)
create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  vencimento date,
  pagamento date,
  categoria text not null,
  descricao text not null,
  fornecedor text,
  caminhao_id uuid references public.caminhoes (id) on delete set null,
  motorista_id uuid references public.motoristas (id) on delete set null,
  forma text,                             -- 'Pago por sócio' e 'Abatimento' não saem do caixa
  valor numeric(14, 2) not null default 0,
  status text not null default 'a_pagar' check (status in ('a_pagar', 'pago')),
  obs text,
  criado_em timestamptz not null default now()
);
create index if not exists despesas_comp_idx on public.despesas (competencia);
create index if not exists despesas_venc_idx on public.despesas (vencimento);

create table if not exists public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  semana_id uuid references public.semanas (id) on delete set null,
  descricao text not null,
  tipo text not null,                     -- 'Abatimento', 'Crédito anterior', 'Aporte via cartão (bruto)', 'Recebido por sócio' não entram no caixa
  valor numeric(14, 2) not null default 0,
  obs text,
  criado_em timestamptz not null default now()
);

-- Acertos mensais dos motoristas (Kanban: aberto -> conferido -> pago)
create table if not exists public.acertos (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,              -- 1º dia do mês
  motorista_id uuid references public.motoristas (id) on delete set null,
  motorista_nome text,
  fixo numeric(12, 2) not null default 0,
  comissao numeric(12, 2),
  media numeric(12, 2) not null default 0,
  pernoite numeric(12, 2) not null default 0,
  extras numeric(12, 2) not null default 0,
  vales numeric(12, 2) not null default 0,
  media_paga numeric(12, 2) not null default 0,
  pagamento date,
  status text not null default 'aberto' check (status in ('aberto', 'conferido', 'pago')),
  obs text
);

-- Manutenção da frota (Kanban: solicitada -> em_oficina -> concluida -> paga)
create table if not exists public.manutencoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  caminhao_id uuid references public.caminhoes (id) on delete set null,
  oficina text,
  valor numeric(14, 2),
  status text not null default 'solicitada' check (status in ('solicitada', 'em_oficina', 'concluida', 'paga')),
  data date not null default current_date,
  obs text
);

-- ---------------------------------------------------------------------
-- Funções auxiliares de permissão
-- ---------------------------------------------------------------------
create or replace function public.is_socio() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'socio');
$$;

create or replace function public.meu_motorista() returns uuid
language sql stable security definer set search_path = public as $$
  select motorista_id from public.perfis where id = auth.uid();
$$;

-- Novo usuário -> cria perfil. Só os e-mails da lista 'socios_iniciais' viram sócio automaticamente;
-- todos os demais entram como motorista SEM vínculo (não veem dado nenhum) até um sócio liberar
-- em Cadastros › Usuários. Isso impede que um estranho que se cadastre no site público veja algo.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email, papel)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)), new.email,
          case when lower(new.email) = any (array['andrergobbo@gmail.com', 'andregobbo@outlook.com.br']) then 'socio' else 'motorista' end)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.novo_usuario();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['perfis','config','categorias','caminhoes','motoristas','tabela_fretes','semanas',
                           'fretes','despesas','recebimentos','acertos','manutencoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists socio_tudo on public.%I', t);
    execute format('create policy socio_tudo on public.%I for all to authenticated using (public.is_socio()) with check (public.is_socio())', t);
  end loop;
end $$;

-- Leitura geral para qualquer usuário logado (dados de referência)
do $$
declare t text;
begin
  foreach t in array array['config','categorias','caminhoes','motoristas','tabela_fretes','semanas'] loop
    execute format('drop policy if exists leitura_logado on public.%I', t);
    execute format('create policy leitura_logado on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Perfil: cada um vê o próprio
drop policy if exists perfil_proprio on public.perfis;
create policy perfil_proprio on public.perfis for select to authenticated using (id = auth.uid());

-- Motorista: vê e lança as próprias viagens (não pode alterar valor de fretes já fechados)
drop policy if exists motorista_ve_fretes on public.fretes;
create policy motorista_ve_fretes on public.fretes for select to authenticated
  using (motorista_id = public.meu_motorista());
drop policy if exists motorista_lanca_fretes on public.fretes;
create policy motorista_lanca_fretes on public.fretes for insert to authenticated
  with check (motorista_id = public.meu_motorista() and status in ('agendado', 'em_rota', 'entregue'));
drop policy if exists motorista_move_fretes on public.fretes;
create policy motorista_move_fretes on public.fretes for update to authenticated
  using (motorista_id = public.meu_motorista() and status in ('agendado', 'em_rota', 'entregue'))
  with check (motorista_id = public.meu_motorista() and status in ('agendado', 'em_rota', 'entregue'));

-- Motorista: vê o próprio acerto
drop policy if exists motorista_ve_acerto on public.acertos;
create policy motorista_ve_acerto on public.acertos for select to authenticated
  using (motorista_id = public.meu_motorista());

-- Tempo real (atualiza as telas de todos quando alguém lança algo)
do $$
declare t text;
begin
  foreach t in array array['fretes','despesas','recebimentos','acertos','manutencoes','semanas'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- =====================================================================
-- v2 – Frota (inspirado em Cobli, Sofit, Prolog, Trizy): abastecimentos,
-- manutenção preventiva por km/data e checklist diário do motorista.
-- Pode rodar de novo com segurança (if not exists).
-- =====================================================================
alter table public.caminhoes add column if not exists meta_km_l numeric(6, 2);   -- consumo esperado (km/L)

-- Abastecimentos: registro operacional (o valor financeiro entra no acerto do posto, em Despesas)
create table if not exists public.abastecimentos (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  caminhao_id uuid references public.caminhoes (id) on delete set null,
  motorista_id uuid references public.motoristas (id) on delete set null,
  km int,                                 -- odômetro no abastecimento (obrigatório no app)
  litros numeric(10, 2) not null,
  valor numeric(12, 2),
  posto text,
  tanque_cheio boolean not null default true,
  obs text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists abast_cam_idx on public.abastecimentos (caminhao_id, km);

-- Plano de manutenção preventiva (ex.: troca de óleo a cada 20.000 km ou 180 dias)
create table if not exists public.planos_manutencao (
  id uuid primary key default gen_random_uuid(),
  caminhao_id uuid references public.caminhoes (id) on delete cascade,
  item text not null,
  intervalo_km int,
  intervalo_dias int,
  ultimo_km int,
  ultima_data date,
  obs text
);

-- Checklist diário do motorista (antes de sair)
create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  caminhao_id uuid references public.caminhoes (id) on delete set null,
  motorista_id uuid references public.motoristas (id) on delete set null,
  km int,
  itens jsonb not null default '{}'::jsonb, -- {"Pneus": true, "Freios": false, ...}
  problemas text,
  status text not null default 'ok' check (status in ('ok', 'atencao', 'resolvido')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['abastecimentos','planos_manutencao','checklists'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists socio_tudo on public.%I', t);
    execute format('create policy socio_tudo on public.%I for all to authenticated using (public.is_socio()) with check (public.is_socio())', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

drop policy if exists leitura_logado on public.planos_manutencao;
create policy leitura_logado on public.planos_manutencao for select to authenticated using (true);

drop policy if exists motorista_abast on public.abastecimentos;
create policy motorista_abast on public.abastecimentos for select to authenticated using (motorista_id = public.meu_motorista());
drop policy if exists motorista_abast_ins on public.abastecimentos;
create policy motorista_abast_ins on public.abastecimentos for insert to authenticated with check (motorista_id = public.meu_motorista());

drop policy if exists motorista_check on public.checklists;
create policy motorista_check on public.checklists for select to authenticated using (motorista_id = public.meu_motorista());
drop policy if exists motorista_check_ins on public.checklists;
create policy motorista_check_ins on public.checklists for insert to authenticated with check (motorista_id = public.meu_motorista());

-- =====================================================================
-- v3 – Bônus semanal por média de consumo (km/L)
-- Regra: média < 3,50 = sem bônus; 3,50–3,79 = R$150; >= 3,80 = R$200.
-- Semana = sábado a sexta; cálculo e lançamento automáticos no sábado ~14h (Brasília).
-- =====================================================================
alter table public.config add column if not exists bonus_faixa1_km_l numeric(5, 2) not null default 3.50;
alter table public.config add column if not exists bonus_faixa1_valor numeric(10, 2) not null default 150;
alter table public.config add column if not exists bonus_faixa2_km_l numeric(5, 2) not null default 3.80;
alter table public.config add column if not exists bonus_faixa2_valor numeric(10, 2) not null default 200;

create table if not exists public.bonus_media (
  id uuid primary key default gen_random_uuid(),
  semana_ini date not null,               -- sábado
  semana_fim date not null,               -- sexta
  motorista_id uuid references public.motoristas (id) on delete set null,
  caminhao_id uuid references public.caminhoes (id) on delete set null,
  km numeric(10, 1),
  litros numeric(10, 2),
  media numeric(6, 2),
  valor numeric(10, 2) not null default 0,
  despesa_id uuid references public.despesas (id) on delete set null,
  alerta text,
  calculado_em timestamptz not null default now(),
  unique (semana_ini, motorista_id)
);
alter table public.bonus_media enable row level security;
drop policy if exists socio_tudo on public.bonus_media;
create policy socio_tudo on public.bonus_media for all to authenticated using (public.is_socio()) with check (public.is_socio());
drop policy if exists motorista_ve_bonus on public.bonus_media;
create policy motorista_ve_bonus on public.bonus_media for select to authenticated using (motorista_id = public.meu_motorista());

-- Calcula a média da semana (sábado anterior até sexta) de cada motorista e lança o bônus como despesa "a pagar".
create or replace function public.calcular_bonus_media(p_sabado date default null)
returns setof public.bonus_media language plpgsql security definer set search_path = public as $$
declare
  v_sab date := coalesce(p_sabado, (now() at time zone 'America/Sao_Paulo')::date);
  v_ini date; v_fim date; m record; cfg record;
  v_km numeric; v_l numeric; v_media numeric; v_val numeric; v_ant int; v_ult int; v_desp uuid; v_alerta text;
begin
  v_sab := v_sab - ((extract(dow from v_sab)::int + 1) % 7); -- ajusta para o sábado da data (dow 6 = sábado)
  v_ini := v_sab - 7; v_fim := v_sab - 1;
  select * into cfg from public.config limit 1;
  for m in select * from public.motoristas where ativo loop
    select max(km) into v_ant from public.abastecimentos a where a.motorista_id = m.id and a.data < v_ini;
    select max(km), sum(litros) into v_ult, v_l from public.abastecimentos a where a.motorista_id = m.id and a.data between v_ini and v_fim;
    continue when v_ult is null or v_ant is null or coalesce(v_l, 0) = 0;
    v_km := v_ult - v_ant; v_media := round(v_km / v_l, 2);
    v_alerta := case when v_media > 5 or v_media < 2 then 'Média fora do normal – confira se falta abastecimento ou KM digitado errado' end;
    v_val := case when v_alerta is not null then 0
                  when v_media >= cfg.bonus_faixa2_km_l then cfg.bonus_faixa2_valor
                  when v_media >= cfg.bonus_faixa1_km_l then cfg.bonus_faixa1_valor else 0 end;
    v_desp := null;
    if v_val > 0 and v_alerta is null
       and not exists (select 1 from public.bonus_media b where b.semana_ini = v_ini and b.motorista_id = m.id and b.despesa_id is not null) then
      insert into public.despesas (competencia, vencimento, categoria, descricao, fornecedor, motorista_id, caminhao_id, forma, valor, status, obs)
      values (v_sab, v_sab, 'Bônus motorista', 'Bônus média semana ' || to_char(v_ini, 'DD/MM') || '–' || to_char(v_fim, 'DD/MM') || ' – ' || m.nome,
              m.nome, m.id, m.caminhao_id, 'PIX', v_val, 'a_pagar', 'Média ' || v_media || ' km/L (' || v_km || ' km / ' || v_l || ' L) – automático')
      returning id into v_desp;
    end if;
    insert into public.bonus_media (semana_ini, semana_fim, motorista_id, caminhao_id, km, litros, media, valor, despesa_id, alerta)
    values (v_ini, v_fim, m.id, m.caminhao_id, v_km, v_l, v_media, v_val, v_desp, v_alerta)
    on conflict (semana_ini, motorista_id) do update set km = excluded.km, litros = excluded.litros, media = excluded.media,
      valor = excluded.valor, alerta = excluded.alerta, calculado_em = now(),
      despesa_id = coalesce(public.bonus_media.despesa_id, excluded.despesa_id);
  end loop;
  return query select * from public.bonus_media where semana_ini = v_ini;
end $$;
grant execute on function public.calcular_bonus_media(date) to authenticated;

-- Agendamento: todo sábado às 14h de Brasília (17h UTC). Requer a extensão pg_cron
-- (Supabase › Database › Extensions › pg_cron › Enable). Se ainda não estiver ativa, este bloco só avisa.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'bonus_media_sabado';
  perform cron.schedule('bonus_media_sabado', '0 17 * * 6', 'select public.calcular_bonus_media()');
exception when others then
  raise notice 'pg_cron indisponível – ative a extensão pg_cron e rode este bloco de novo (%).', sqlerrm;
end $$;
