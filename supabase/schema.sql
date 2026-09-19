-- Emm Luxury Hair — product reviews
--
-- Paste this whole file into the Supabase dashboard:
--   Project Settings -> SQL Editor (or "SQL" in the left menu) -> New query -> Run
--
-- Access model: the browser NEVER talks to Supabase. Every read and write goes
-- through the Node server, which uses the project secret key. A secret key
-- bypasses row-level security by design, so no policies are needed here — and
-- none must be added, because the public read path is /api/reviews on this
-- server, not the Data API.

create table if not exists public.product_reviews (
  id             bigint generated always as identity primary key,
  created_at     timestamptz   not null default now(),
  product_handle text,
  product_title  text,
  author         text          not null check (char_length(author) between 2 and 80),
  country        text          check (country is null or char_length(country) <= 60),
  rating         smallint      not null check (rating between 1 and 5),
  title          text          check (title is null or char_length(title) <= 120),
  body           text          not null check (char_length(body) between 10 and 2000),
  status         text          not null default 'pending'
                               check (status in ('pending', 'approved', 'rejected'))
);

comment on table public.product_reviews is
  'Customer product reviews. Only the storefront server touches this, with the secret key.';

-- Public listing: newest approved reviews for one product.
create index if not exists product_reviews_approved_idx
  on public.product_reviews (product_handle, created_at desc)
  where status = 'approved';

-- Moderation queue: pending first, newest first.
create index if not exists product_reviews_status_idx
  on public.product_reviews (status, created_at desc);

-- Defense in depth. RLS with zero policies means "select * " returns no rows for
-- any non-bypassing role, so even a leaked publishable/anon key reads nothing.
alter table public.product_reviews enable row level security;

-- Belt on top of braces: take away table-level rights the Supabase defaults
-- hand to the anonymous and logged-in web roles.
revoke all on table public.product_reviews from anon;
revoke all on table public.product_reviews from authenticated;

-- If the server later reports "Could not find the table 'product_reviews' in
-- the schema cache", the Data API is not exposing this schema: dashboard ->
-- Project Settings -> API -> "Exposed schemas in the Data API" must include
-- `public`. Then restart the API (Settings -> API -> Restart Data API).
