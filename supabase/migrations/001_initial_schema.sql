create table competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  website text,
  logo_emoji text,
  category text default 'Link Management',
  created_at timestamptz default now()
);

create table signals (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references competitors(id) on delete cascade,
  signal_type text not null check (signal_type in ('blog', 'changelog', 'pricing', 'feature')),
  title text not null,
  summary text,
  source_url text,
  detected_at timestamptz default now(),
  dedup_hash text unique
);

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references competitors(id) on delete cascade,
  snapshot_type text not null,
  data jsonb,
  captured_at timestamptz default now()
);

create index idx_signals_detected on signals(detected_at desc);
create index idx_signals_competitor on signals(competitor_id);
create index idx_signals_type on signals(signal_type);

alter table competitors enable row level security;
alter table signals enable row level security;
alter table snapshots enable row level security;

create policy "Public read competitors" on competitors for select using (true);
create policy "Service write competitors" on competitors for insert with check (true);

create policy "Public read signals" on signals for select using (true);
create policy "Service write signals" on signals for insert with check (true);

create policy "Public read snapshots" on snapshots for select using (true);
create policy "Service write snapshots" on snapshots for insert with check (true);
