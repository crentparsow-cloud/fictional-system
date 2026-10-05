-- 003: markets (what a reader sees by country), the book catalogue, and book link counts.
-- Location is reduced to a two-letter country code. No coordinates and no IP address are stored.

create table if not exists public.markets (
  code          text primary key,              -- ISO 3166-1 alpha-2, or 'XX' for everywhere else
  name          text not null,
  currency      text not null,                 -- ISO 4217, lower case for Stripe
  amazon_domain text not null,                 -- store the Books tab links to
  date_locale   text not null,                 -- for Intl date and number formats
  copy_locale   text not null,                 -- which copy variant to show; falls back to en-US
  legal_set     text not null check (legal_set in ('us','uk','eu','au','ca','nz','intl')),
  crisis        jsonb not null,                -- [{label, number, how}]
  active        boolean not null default true,
  sort          int not null default 100
);

insert into public.markets (code,name,currency,amazon_domain,date_locale,copy_locale,legal_set,crisis,sort) values
 ('US','United States','usd','amazon.com','en-US','en-US','us','[{"label":"988 Suicide and Crisis Lifeline","number":"988","how":"Call or text"}]',1),
 ('GB','United Kingdom','gbp','amazon.co.uk','en-GB','en-GB','uk','[{"label":"Samaritans","number":"116 123","how":"Call"},{"label":"Shout","number":"85258","how":"Text SHOUT"}]',2),
 ('CA','Canada','cad','amazon.ca','en-CA','en-US','ca','[{"label":"9-8-8 Suicide Crisis Helpline","number":"988","how":"Call or text"}]',3),
 ('AU','Australia','aud','amazon.com.au','en-AU','en-GB','au','[{"label":"Lifeline","number":"13 11 14","how":"Call"}]',4),
 ('IE','Ireland','eur','amazon.co.uk','en-IE','en-GB','eu','[{"label":"Samaritans","number":"116 123","how":"Call"},{"label":"Text About It","number":"50808","how":"Text HELLO"}]',5),
 ('NZ','New Zealand','nzd','amazon.com.au','en-NZ','en-GB','nz','[{"label":"Need to talk?","number":"1737","how":"Call or text"}]',6),
 ('XX','Everywhere else','usd','amazon.com','en-US','en-US','intl','[{"label":"Find a helpline near you","number":"findahelpline.com","how":"Website"}]',99)
on conflict (code) do update set name=excluded.name,currency=excluded.currency,amazon_domain=excluded.amazon_domain,
 date_locale=excluded.date_locale,copy_locale=excluded.copy_locale,legal_set=excluded.legal_set,crisis=excluded.crisis,sort=excluded.sort;

alter table public.markets enable row level security;
drop policy if exists markets_read on public.markets;
create policy markets_read on public.markets for select to anon, authenticated using (active);

-- Where a reader's market comes from: the network (ip), the phone's location (device) or their own choice (manual).
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists country_source text check (country_source in ('ip','device','manual'));
alter table public.profiles add column if not exists country_set_at timestamptz;

-- Market for a profile, falling back to XX.
create or replace function public.market_for(p_country text)
returns setof public.markets language sql stable security invoker set search_path = public as $$
  select m.* from public.markets m
  where m.code = coalesce((select code from public.markets where code = upper(p_country) and active), 'XX');
$$;

-- The book catalogue. One row per book. The Books tab, the /go/ links and emails read from here.
create table if not exists public.books (
  id              text primary key,             -- slug, e.g. wired-differently
  title           text not null,
  subtitle        text not null,
  author          text not null default 'Maya Vaughn',
  asin_kindle     text not null,
  asin_paperback  text,
  workbook_id     text,                         -- companion workbook, if any
  topic_set       text,
  hue             int,                          -- workbook tile hue, 0 to 359
  cover_path      text not null,                -- without size suffix, e.g. covers/wired-differently
  sort            int not null default 100,
  active          boolean not null default true
);
alter table public.books enable row level security;
drop policy if exists books_read on public.books;
create policy books_read on public.books for select to anon, authenticated using (active);

-- Book link counts: one counter per day, book, format, store and placement. No reader id, IP or user agent.
create table if not exists public.book_click_counts (
  day       date not null,
  book_id   text not null references public.books(id) on delete cascade,
  format    text not null check (format in ('kindle','paperback')),
  store     text not null,
  placement text not null,
  clicks    int not null default 0,
  primary key (day, book_id, format, store, placement)
);
alter table public.book_click_counts enable row level security;  -- no client policies: counts are read by the owner only

create or replace function public.log_book_click(p_book text, p_format text, p_store text, p_placement text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_format not in ('kindle','paperback') then return; end if;
  if not exists (select 1 from public.books where id = p_book) then return; end if;
  insert into public.book_click_counts(day, book_id, format, store, placement, clicks)
  values (current_date, p_book, p_format, left(coalesce(p_store,'amazon.com'),20), left(coalesce(nullif(p_placement,''),'unknown'),24), 1)
  on conflict (day, book_id, format, store, placement) do update set clicks = public.book_click_counts.clicks + 1;
end $$;
revoke all on function public.log_book_click(text,text,text,text) from public;
grant execute on function public.log_book_click(text,text,text,text) to anon, authenticated;
insert into public.books (id,title,subtitle,asin_kindle,asin_paperback,workbook_id,topic_set,hue,cover_path,sort) values
('quieting-the-noise','Quieting the Noise','A Practical Guide to Generalised Anxiety','B0H4NZKQ5D','B0HFCL5KJX','worry','worry',180,'covers/quieting-the-noise',1),
('finding-your-way-back','Finding Your Way Back','A Practical Guide to Depression','B0GYFFY4ML','B0HDPYNL85','lowmood','mood',198,'covers/finding-your-way-back',2),
('bearing-it-better','Bearing It Better','A Practical Guide to Chronic Stress','B0H4PDJ8TT','B0HCXX62NJ','stress','stress',36,'covers/bearing-it-better',3),
('rebuilding-from-empty','Rebuilding from Empty','A Practical Guide to Burnout Recovery','B0H4PJYWLV','B0HF9ZG2LF','burnout','stress',54,'covers/rebuilding-from-empty',4),
('finding-your-people','Finding Your People','A Practical Guide to Loneliness','B0H4PQJWQ5','B0HDJCSSSW','connection','self',90,'covers/finding-your-people',5),
('after-the-storm','After the Storm','A Practical Guide to Trauma and PTSD','B0H4PMBKJV','B0HC2ZWYZH','aftertrauma','heal',0,'covers/after-the-storm',6),
('wired-differently','Wired Differently','A Practical Guide to ADHD','B0H4PNN9GG','B0HG461C6R','focus','stress',252,'covers/wired-differently',7),
('when-everything-changes','When Everything Changes','A Practical Guide to Grief and Loss','B0H4HDKDFS','B0HFFTG9PC','grief','heal',18,'covers/when-everything-changes',8),
('the-long-way-home','The Long Way Home','A Practical Guide to Addiction Recovery','B0H4HGH7D6','B0HFDZLQKF','drinking','heal',216,'covers/the-long-way-home',9),
('enough','Enough','A Practical Guide to Low Self-Esteem','B0GXQ86FJS','B0HB9SNS31','selfworth','self',72,'covers/enough',10),
('steady-ground','Steady Ground','A Practical Guide to Bipolar Disorder','B0H4YQK5LM','B0HG1VZQ1K','steady','mood',342,'covers/steady-ground',11),
('loosening-the-grip','Loosening the Grip','A Practical Guide to OCD','B0H59JFFLK','B0HG4XCK5P','doubt','worry',144,'covers/loosening-the-grip',12),
('still-standing','Still Standing','A Practical Guide to Panic Attacks','B0H59FVM9G','B0HG4YKT9Y','panic','worry',234,'covers/still-standing',13),
('facing-the-room','Facing the Room','A Practical Guide to Social Anxiety','B0H59NJQXJ','B0HG54D1R3','social','worry',270,'covers/facing-the-room',14),
('safe-ground','Safe Ground','A Practical Guide to Childhood Trauma','B0H59X3762','B0HG3XVG2W','childhood','heal',162,'covers/safe-ground',15),
('bending-not-breaking','Bending, Not Breaking','A Practical Guide to Emotional Resilience','B0H59QRKXK','B0HDL95RBX','overwhelm','stress',126,'covers/bending-not-breaking',16),
('being-here','Being Here','A Practical Guide to Mindfulness','B0H59MKMMC','B0HC39NPFQ','mindfulness','self',288,'covers/being-here',17),
('rest-to-reset','Rest to Reset','A Practical Guide to Sleep and Mental Health','B0H59PDQNK','B0HFK89H5X','sleep','self',324,'covers/rest-to-reset',18),
('nourished','Nourished','A Practical Guide to Nutrition and Mood','B0H59K9XMY','B0HG4Z3Q3F','food','mood',108,'covers/nourished',19),
('moving-through-it','Moving Through It','A Practical Guide to Exercise and Mental Health','B0GX32N9F7','B0HBRW1G6D','movement','mood',306,'covers/moving-through-it',20)
on conflict (id) do update set title=excluded.title,subtitle=excluded.subtitle,asin_kindle=excluded.asin_kindle,asin_paperback=excluded.asin_paperback,workbook_id=excluded.workbook_id,topic_set=excluded.topic_set,hue=excluded.hue,cover_path=excluded.cover_path,sort=excluded.sort;