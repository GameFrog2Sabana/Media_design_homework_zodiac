-- 星座アトリエ — research storage schema (Neon Postgres)
-- Run this once in the Neon SQL editor, or let the app create it on the
-- first generation. The app also runs the same DDL lazily via lib/server/store.ts.
--
-- Deliberately absent: IP address, user agent, name, email, cookies,
-- drag trajectories, and free-form demographic data.

create table if not exists generations (
  id uuid primary key,
  session_id text not null,
  created_at timestamptz not null,
  consent boolean not null default true,
  variant text not null,
  config_version integer not null,
  stars jsonb not null,
  edges jsonb not null,
  aspect double precision not null,
  theme text not null default '',
  attempt integer not null,
  result jsonb not null,
  source text not null,
  model text not null,
  latency_ms integer not null
);

create index if not exists generations_created_at_idx
  on generations (created_at desc);

create index if not exists generations_session_idx
  on generations (session_id);

create table if not exists ratings (
  generation_id uuid primary key references generations(id) on delete cascade,
  session_id text not null,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null
);

create index if not exists ratings_created_at_idx
  on ratings (created_at desc);

-- Convenience view for analysis notebooks. It includes the anonymous
-- session id, so do not publish this view directly.
create or replace view generation_ratings as
select
  g.id,
  g.session_id,
  g.created_at,
  g.variant,
  g.config_version,
  g.stars,
  g.edges,
  g.aspect,
  g.theme,
  g.attempt,
  g.result,
  g.source,
  g.model,
  g.latency_ms,
  r.score,
  r.created_at as rated_at
from generations g
left join ratings r on r.generation_id = g.id;
