-- 0015 Expanded taxonomy (F-148) and faith consent (F-150).
--
-- Same rules as 0001 to 0012. Depends on 0001 to 0012 only. Additive: no
-- existing id, column, value or constraint is renamed or removed.
--
-- Part 1, taxonomy. The draft taxonomy in docs/research/taxonomy.json and
-- categories.md becomes data: 3 new shelves (Health and Body, Faith and
-- Spirituality, Creativity and Making), 7 new areas and 34 new Themes beside
-- the 17 that exist. All 17 existing Theme ids are kept. Every new name is
-- pending clearance (no register search yet) with the three-book minimum.
--
--   * themes.group_suitable records whether a Theme works for a team,
--     church or small group following one plan together. Default false.
--   * themes.hidden_until_min_books and shelves.hidden_until_min_books mark
--     rows added after launch. Readers do not see such a Theme (or shelf)
--     until it holds min_books live titles. The library and /themes pages
--     apply the rule. Existing rows default to false, so their behaviour does
--     not change.
--   * content/registry/*.json is the source; supabase/seed/seed.sql is
--     regenerated from it and upserts the same values.
--
-- Part 2, faith consent. Religious belief is special category data (UK GDPR
-- Article 9). Akana is not a religious body, so it relies on explicit consent
-- under 9(2)(a) [check legal]. Before a reader's first workbook on the Faith
-- and Spirituality shelf, they give that consent. It is built like the health
-- data consent in 0006: two columns on the reader's own profile, a guard that
-- refuses a direct client write, one function to give and one to withdraw,
-- each for app.uid() only. Withdrawal stops new saves in faith workbooks; it
-- deletes nothing. The trigger is the shelf because Crent has not yet decided
-- the optional faith genre (F-149); the app also accepts a genre id of
-- 'faith' should one be added later. Account erasure (0007) clears the faith
-- columns too, through a trigger on the completed deletion request.

-- ---------------------------------------------------------------------------
-- Part 1. Taxonomy columns.
-- ---------------------------------------------------------------------------
alter table public.themes
  add column group_suitable         boolean not null default false,
  add column hidden_until_min_books boolean not null default false;
alter table public.shelves
  add column hidden_until_min_books boolean not null default false;

comment on column public.themes.group_suitable is 'Suits a team, church or small group following one plan together (F-148).';
comment on column public.themes.hidden_until_min_books is 'Added after launch: hidden from readers until min_books live titles (F-148).';
comment on column public.shelves.hidden_until_min_books is 'Added after launch: hidden from readers until min_books live titles across its Themes (F-148).';

-- ---------------------------------------------------------------------------
-- Part 1. Taxonomy rows. Generated from content/registry; keep in step.
-- ---------------------------------------------------------------------------
-- Shelves. The seven seeded shelves are listed so a fresh database (no seed
-- yet) has the parents the new rows point at; on conflict leaves any row
-- that already exists untouched.
insert into public.shelves (id, name, status, sort)
values
  ('mind-and-mood', 'Mind and Mood', 'active', 1),
  ('work-and-career', 'Work and Career', 'active', 2),
  ('money', 'Money', 'active', 3),
  ('family-and-parenting', 'Family and Parenting', 'active', 4),
  ('love-and-relationships', 'Love and Relationships', 'active', 5),
  ('personal-growth', 'Personal Growth', 'proposed', 6),
  ('learning-and-skills', 'Learning and Skills', 'proposed', 7),
  ('health-and-body', 'Health and Body', 'proposed', 8),
  ('faith-and-spirituality', 'Faith and Spirituality', 'proposed', 9),
  ('creativity-and-making', 'Creativity and Making', 'proposed', 10)
on conflict (id) do nothing;

insert into public.areas (id, shelf_id, name)
values
  ('worry', 'mind-and-mood', 'Worry and Fear'),
  ('mood', 'mind-and-mood', 'Mood and Energy'),
  ('stress', 'mind-and-mood', 'Stress and Overload'),
  ('heal', 'mind-and-mood', 'Loss and Recovery'),
  ('self', 'mind-and-mood', 'Self and Connection'),
  ('careers-and-craft', 'work-and-career', 'Careers and Craft'),
  ('teams-and-ventures', 'work-and-career', 'Teams and Ventures'),
  ('spending-and-saving', 'money', 'Spending and Saving'),
  ('home-and-family', 'family-and-parenting', 'Home and Family'),
  ('couples-and-friends', 'love-and-relationships', 'Couples and Friends'),
  ('habits-and-character', 'personal-growth', 'Habits and Character'),
  ('study-and-know-how', 'learning-and-skills', 'Study and Know-How'),
  ('everyday-health', 'health-and-body', 'Everyday Health'),
  ('direction-and-meaning', 'personal-growth', 'Direction and Meaning'),
  ('long-term-money', 'money', 'Long-Term Money'),
  ('scripture-and-prayer', 'faith-and-spirituality', 'Scripture and Prayer'),
  ('faith-in-daily-life', 'faith-and-spirituality', 'Faith in Daily Life'),
  ('church-and-groups', 'faith-and-spirituality', 'Church and Groups'),
  ('writing-and-making', 'creativity-and-making', 'Writing and Making')
on conflict (id) do nothing;

-- The 34 new Themes, pending clearance, three-book minimum, hidden from
-- readers until they hold that many live titles.
insert into public.themes (id, name, line, shelf_id, area_id, topics, clearance_status, min_books, group_suitable, hidden_until_min_books)
values
  ('settled-mind', 'Settled Mind', 'Guided workbooks for meeting worry and fear with steadier steps.', 'mind-and-mood', 'worry', array['worry', 'anxiety', 'panic attacks', 'social anxiety', 'OCD', 'intrusive thoughts', 'health anxiety', 'fear']::text[], 'pending', 3, false, true),
  ('brighter-days', 'Brighter Days', 'Guided workbooks for lifting your mood and keeping it steady.', 'mind-and-mood', 'mood', array['low mood', 'depression', 'sadness', 'motivation', 'mood swings', 'bipolar', 'winter blues']::text[], 'pending', 3, false, true),
  ('gentle-mending', 'Gentle Mending', 'Guided workbooks for living with loss and rebuilding after hard times.', 'mind-and-mood', 'heal', array['grief', 'bereavement', 'trauma', 'PTSD', 'childhood trauma', 'addiction recovery', 'drinking less', 'loss']::text[], 'pending', 3, false, true),
  ('everyday-movement', 'Everyday Movement', 'Guided workbooks for moving more in ways that fit your week.', 'health-and-body', 'everyday-health', array['exercise', 'walking', 'fitness', 'strength', 'stretching', 'running', 'active habits', 'movement and mood']::text[], 'pending', 3, true, true),
  ('nourishing-meals', 'Nourishing Meals', 'Guided workbooks for planning, cooking and enjoying everyday food.', 'health-and-body', 'everyday-health', array['healthy eating', 'nutrition', 'meal planning', 'cooking at home', 'food and mood', 'sugar', 'hydration']::text[], 'pending', 3, true, true),
  ('ageing-well', 'Ageing Well', 'Guided workbooks for staying active, curious and connected in later life.', 'health-and-body', 'everyday-health', array['ageing', 'later life', 'menopause', 'memory', 'balance', 'retirement', 'staying active']::text[], 'pending', 3, true, true),
  ('quiet-confidence', 'Quiet Confidence', 'Guided workbooks for speaking up, setting limits and trusting yourself.', 'personal-growth', 'habits-and-character', array['confidence', 'assertiveness', 'shyness', 'imposter syndrome', 'boundaries', 'self-belief', 'people pleasing']::text[], 'pending', 3, true, true),
  ('clearer-choices', 'Clearer Choices', 'Guided workbooks for setting goals and making good decisions.', 'personal-growth', 'direction-and-meaning', array['decision-making', 'goals', 'goal setting', 'problem solving', 'critical thinking', 'priorities', 'life planning']::text[], 'pending', 3, true, true),
  ('living-with-purpose', 'Living With Purpose', 'Guided workbooks for finding what matters and shaping life around it.', 'personal-growth', 'direction-and-meaning', array['purpose', 'meaning of life', 'midlife', 'finding yourself', 'identity', 'life lessons', 'new chapter', 'legacy']::text[], 'pending', 3, true, true),
  ('wisdom-for-living', 'Wisdom for Living', 'Guided workbooks that turn old philosophy into daily habits.', 'personal-growth', 'habits-and-character', array['stoicism', 'philosophy', 'ethics', 'virtue', 'Marcus Aurelius', 'Seneca', 'Epictetus', 'existentialism']::text[], 'pending', 3, true, true),
  ('new-chapters', 'New Chapters', 'Guided workbooks for dating, separating and starting again.', 'love-and-relationships', 'couples-and-friends', array['dating', 'breakup', 'divorce', 'separation', 'single life', 'starting again', 'heartbreak']::text[], 'pending', 3, false, true),
  ('early-days', 'Early Days', 'Guided workbooks for pregnancy, a new baby and the first year.', 'family-and-parenting', 'home-and-family', array['pregnancy', 'new baby', 'new parents', 'first year', 'fatherhood', 'motherhood', 'baby sleep', 'postnatal']::text[], 'pending', 3, true, true),
  ('changing-families', 'Changing Families', 'Guided workbooks for step-families, adoption and new family shapes.', 'family-and-parenting', 'home-and-family', array['step-parenting', 'blended families', 'adoption', 'fostering', 'co-parenting', 'grandparenting', 'kinship care']::text[], 'pending', 3, true, true),
  ('caring-hands', 'Caring Hands', 'Guided workbooks for people who look after a relative or friend.', 'family-and-parenting', 'home-and-family', array['carers', 'caring for parents', 'dementia', 'elderly parent', 'respite', 'sandwich generation', 'young carers']::text[], 'pending', 3, true, true),
  ('words-that-land', 'Words That Land', 'Guided workbooks for speaking, writing and negotiating at work.', 'work-and-career', 'careers-and-craft', array['public speaking', 'presentations', 'negotiation', 'persuasion', 'storytelling', 'pitching', 'business writing', 'networking']::text[], 'pending', 3, true, true),
  ('welcoming-workplaces', 'Welcoming Workplaces', 'Guided workbooks for team culture, hiring and fair ways of working.', 'work-and-career', 'teams-and-ventures', array['work culture', 'inclusion', 'hiring', 'onboarding', 'remote work', 'hybrid working', 'psychological safety', 'business ethics']::text[], 'pending', 3, true, true),
  ('wider-reach', 'Wider Reach', 'Guided workbooks for marketing, selling and finding customers.', 'work-and-career', 'teams-and-ventures', array['marketing', 'sales', 'branding', 'social media marketing', 'copywriting', 'pricing', 'newsletters']::text[], 'pending', 3, true, true),
  ('paying-it-down', 'Paying It Down', 'Guided workbooks for clearing what you owe, one step at a time.', 'money', 'spending-and-saving', array['debt', 'credit cards', 'loans', 'overdraft', 'arrears', 'money worries', 'credit score']::text[], 'pending', 3, true, true),
  ('patient-investing', 'Patient Investing', 'Guided workbooks for pensions, long-term saving and learning how investing works.', 'money', 'long-term-money', array['investing', 'index funds', 'pensions', 'ISA', 'retirement planning', 'compound interest', 'risk']::text[], 'pending', 3, true, true),
  ('digital-ease', 'Digital Ease', 'Guided workbooks for everyday tech, online safety and screen habits.', 'learning-and-skills', 'study-and-know-how', array['screen time', 'digital habits', 'phone use', 'online safety', 'scams', 'AI tools', 'spreadsheets']::text[], 'pending', 3, true, true),
  ('guiding-learners', 'Guiding Learners', 'Guided workbooks for teachers, tutors and home educators.', 'learning-and-skills', 'study-and-know-how', array['teaching', 'homeschooling', 'tutoring', 'lesson planning', 'classroom', 'home education', 'Sunday school']::text[], 'pending', 3, true, true),
  ('curious-reading', 'Curious Reading', 'Guided study companions for big books on history, science and society.', 'learning-and-skills', 'study-and-know-how', array['history', 'science', 'economics', 'society', 'technology', 'nature', 'biography', 'study guide', 'book club']::text[], 'pending', 3, true, true),
  ('reading-scripture', 'Reading Scripture', 'Guided workbooks for reading and studying the Bible week by week.', 'faith-and-spirituality', 'scripture-and-prayer', array['Bible study', 'Bible reading plan', 'Gospels', 'Psalms', 'Proverbs', 'Old Testament', 'New Testament', 'Paul''s letters', 'inductive study']::text[], 'pending', 3, true, true),
  ('rhythms-of-prayer', 'Rhythms of Prayer', 'Guided workbooks for building a steady habit of prayer.', 'faith-and-spirituality', 'scripture-and-prayer', array['prayer', 'quiet time', 'Lord''s Prayer', 'praying the Psalms', 'intercession', 'fasting', 'prayer journal']::text[], 'pending', 3, true, true),
  ('growing-in-faith', 'Growing in Faith', 'Guided workbooks for discipleship and the Christian life.', 'faith-and-spirituality', 'faith-in-daily-life', array['discipleship', 'spiritual growth', 'Christian living', 'new Christian', 'baptism preparation', 'confirmation', 'fruit of the Spirit', 'spiritual disciplines']::text[], 'pending', 3, true, true),
  ('faith-at-home', 'Faith at Home', 'Guided workbooks for marriage, parenting and family life shaped by faith.', 'faith-and-spirituality', 'faith-in-daily-life', array['Christian marriage', 'Christian parenting', 'family devotions', 'marriage preparation', 'family prayer', 'raising children in faith']::text[], 'pending', 3, true, true),
  ('work-as-calling', 'Work as Calling', 'Guided workbooks for faith, vocation and rest in working life.', 'faith-and-spirituality', 'faith-in-daily-life', array['calling', 'vocation', 'faith and work', 'Sabbath', 'integrity at work', 'Christian leadership', 'rest']::text[], 'pending', 3, true, true),
  ('generous-living', 'Generous Living', 'Guided workbooks for giving, stewardship and contentment.', 'faith-and-spirituality', 'faith-in-daily-life', array['stewardship', 'giving', 'tithing', 'generosity', 'contentment', 'simplicity', 'money and faith']::text[], 'pending', 3, true, true),
  ('mercy-and-comfort', 'Mercy and Comfort', 'Guided workbooks for forgiveness, grief and hope in hard seasons.', 'faith-and-spirituality', 'faith-in-daily-life', array['forgiveness', 'grief', 'bereavement', 'lament', 'suffering', 'doubt', 'hope', 'loss']::text[], 'pending', 3, true, true),
  ('serving-together', 'Serving Together', 'Guided workbooks for small group leaders, volunteers and church teams.', 'faith-and-spirituality', 'church-and-groups', array['small group leaders', 'church leadership', 'volunteers', 'ministry teams', 'pastoral care', 'youth work', 'eldership', 'welcome teams']::text[], 'pending', 3, true, true),
  ('quiet-contemplation', 'Quiet Contemplation', 'Guided workbooks for contemplative practice across faith traditions.', 'faith-and-spirituality', 'scripture-and-prayer', array['contemplation', 'meditation', 'Christian mysticism', 'silence', 'Buddhism', 'Judaism', 'Islam', 'interfaith']::text[], 'pending', 3, true, true),
  ('steady-writing', 'Steady Writing', 'Guided workbooks for a steady writing habit and better stories.', 'creativity-and-making', 'writing-and-making', array['creative writing', 'journaling', 'poetry', 'fiction writing', 'novel', 'short stories', 'writer''s block', 'writing habit']::text[], 'pending', 3, true, true),
  ('life-stories', 'Life Stories', 'Guided workbooks for writing your memories and family history.', 'creativity-and-making', 'writing-and-making', array['memoir', 'life story', 'family history', 'legacy letters', 'reminiscence', 'ancestry', 'autobiography']::text[], 'pending', 3, true, true),
  ('creative-habits', 'Creative Habits', 'Guided workbooks for making time to draw, play and create.', 'creativity-and-making', 'writing-and-making', array['creativity', 'creative block', 'drawing', 'art', 'music practice', 'crafts', 'photography', 'design thinking']::text[], 'pending', 3, true, true)
on conflict (id) do nothing;

-- Make sure the flag is set even where a seed run created a new Theme first.
update public.themes set hidden_until_min_books = true
 where id in ('settled-mind', 'brighter-days', 'gentle-mending', 'everyday-movement', 'nourishing-meals', 'ageing-well', 'quiet-confidence', 'clearer-choices', 'living-with-purpose', 'wisdom-for-living', 'new-chapters', 'early-days', 'changing-families', 'caring-hands', 'words-that-land', 'welcoming-workplaces', 'wider-reach', 'paying-it-down', 'patient-investing', 'digital-ease', 'guiding-learners', 'curious-reading', 'reading-scripture', 'rhythms-of-prayer', 'growing-in-faith', 'faith-at-home', 'work-as-calling', 'generous-living', 'mercy-and-comfort', 'serving-together', 'quiet-contemplation', 'steady-writing', 'life-stories', 'creative-habits');

-- The 17 existing Themes: fill the five empty Mind and Mood lines, add the
-- extra hidden topics, move stoicism to Wisdom for Living, and record the
-- group flag. Ids, names, shelves and areas are not touched. A row that does
-- not exist yet (fresh database before the seed) is simply skipped.
update public.themes t
   set line = coalesce(t.line, v.line), topics = v.topics, group_suitable = v.group_suitable
  from (values
    ('work-worth-choosing', 'Guided workbooks for changing jobs, growing a career and talking about your work.', array['career change', 'job search', 'interviews', 'pay conversations', 'mentoring', 'promotion', 'CV']::text[], true),
    ('purposeful-time', 'Guided workbooks for planning your days, meetings and focused hours.', array['productivity', 'time management', 'planning', 'meetings', 'focus', 'procrastination', 'deep work']::text[], true),
    ('shared-direction', 'Guided workbooks for managing people and leading teams.', array['leadership', 'management', 'delegation', 'feedback', 'teams', 'coaching', 'strategy', 'project management']::text[], true),
    ('ventures-taking-shape', 'Guided workbooks for starting and running a small business.', array['small business', 'trading', 'customers', 'bookkeeping', 'hiring', 'start-up', 'business plan']::text[], true),
    ('considered-spending', 'Guided workbooks for budgets, bills and everyday money choices.', array['budgeting', 'spending', 'bills', 'household money', 'cost of living', 'shopping habits']::text[], true),
    ('money-for-later', 'Guided workbooks for saving, irregular income and planning ahead.', array['saving', 'savings groups', 'freelance income', 'emergency fund', 'sinking funds', 'irregular pay']::text[], true),
    ('raising-with-care', 'Guided workbooks for family routines, children and teenagers.', array['parenting', 'family routines', 'teenagers', 'screens', 'homework', 'toddlers', 'behaviour', 'siblings']::text[], true),
    ('partners-in-step', 'Guided workbooks for couples sharing a life and a home.', array['couples', 'marriage', 'household chores', 'shared calendar', 'newlyweds', 'couple communication', 'marriage preparation']::text[], true),
    ('companionable-days', 'Guided workbooks for friendship, family talk and honest conversations.', array['friendship', 'making friends', 'moving city', 'difficult conversations', 'resolving conflict', 'listening', 'etiquette']::text[], true),
    ('chosen-habits', 'Guided workbooks for habits, values and character, old and new.', array['habits', 'routines', 'values', 'self-improvement', 'discipline', 'minimalism', 'morning routine']::text[], true),
    ('unrushed-learning', 'Guided workbooks for study, exams and returning to learning.', array['study skills', 'exams', 'note-taking', 'adult learning', 'revision', 'memory techniques', 'languages']::text[], true),
    ('practical-know-how', 'Guided workbooks for running a home and looking after yourself.', array['life skills', 'first home', 'cooking', 'bills', 'repairs', 'cleaning', 'renting']::text[], true),
    ('noticing-more', 'Guided workbooks for slowing down and paying attention to the moment.', array['mindfulness', 'meditation', 'breathing', 'attention', 'present moment', 'pausing', 'grounding']::text[], true),
    ('softer-nights', 'Guided workbooks for gentler evenings and better rest.', array['sleep', 'insomnia', 'bedtime routine', 'wind-down', 'night waking', 'screens at night', 'tiredness']::text[], false),
    ('even-pace', 'Guided workbooks for a steadier pace through busy weeks.', array['stress', 'overload', 'pressure', 'breaks', 'workload', 'overwhelm', 'slowing down']::text[], true),
    ('seeing-yourself-fairly', 'Guided workbooks for kinder self-talk and fairer self-judgement.', array['self-esteem', 'self-criticism', 'self-compassion', 'inner critic', 'perfectionism', 'shame', 'self-worth']::text[], false),
    ('renewing-energy', 'Guided workbooks for making room, resting and getting your energy back.', array['burnout', 'exhaustion', 'fatigue', 'overcommitment', 'rest', 'saying no', 'recovery']::text[], true)
  ) as v(id, line, topics, group_suitable)
 where t.id = v.id;

update public.shelves set hidden_until_min_books = true
 where id in ('health-and-body', 'faith-and-spirituality', 'creativity-and-making');

-- ---------------------------------------------------------------------------
-- Part 2. Faith consent columns on the reader's own profile.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column faith_consent_at      timestamptz,
  add column faith_consent_version text check (faith_consent_version is null or faith_consent_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  add constraint profiles_faith_consent_pair check ((faith_consent_at is null) = (faith_consent_version is null));

-- Guard: a client may not write the faith consent columns directly. Runs as
-- the caller, so the security definer functions below pass, as does server
-- code on the service role.
create or replace function app.guard_faith_consent() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.faith_consent_at      is distinct from (case when tg_op = 'UPDATE' then old.faith_consent_at end)
    or new.faith_consent_version is distinct from (case when tg_op = 'UPDATE' then old.faith_consent_version end)) then
    raise exception 'faith consent changes only through app.set_faith_consent or app.clear_faith_consent'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger profiles_faith_consent_guard before insert or update on public.profiles
  for each row execute function app.guard_faith_consent();

-- Give consent, for the signed-in reader only. Returns the time recorded.
create or replace function app.set_faith_consent(p_version text) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
  v_at  timestamptz := now();
begin
  if v_uid is null then
    raise exception 'sign in to give consent' using errcode = 'insufficient_privilege';
  end if;
  if p_version is null or p_version !~ '^[a-z0-9][a-z0-9._-]{0,31}$' then
    raise exception 'unknown consent version' using errcode = 'check_violation';
  end if;
  insert into public.profiles (user_id, faith_consent_at, faith_consent_version)
  values (v_uid, v_at, p_version)
  on conflict (user_id) do update
    set faith_consent_at = excluded.faith_consent_at,
        faith_consent_version = excluded.faith_consent_version;
  return v_at;
end $$;

-- Withdraw consent, for the signed-in reader only.
create or replace function app.clear_faith_consent() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app.uid();
begin
  if v_uid is null then
    raise exception 'sign in to withdraw consent' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles
     set faith_consent_at = null, faith_consent_version = null
   where user_id = v_uid;
end $$;

-- RPC wrappers. Security invoker: the app functions do the checks.
create or replace function public.set_faith_consent(p_version text) returns timestamptz
language sql volatile security invoker set search_path = '' as $$
  select app.set_faith_consent(p_version)
$$;
create or replace function public.clear_faith_consent() returns void
language sql volatile security invoker set search_path = '' as $$
  select app.clear_faith_consent()
$$;

revoke execute on function app.set_faith_consent(text), app.clear_faith_consent() from public, anon;
revoke execute on function public.set_faith_consent(text), public.clear_faith_consent() from public, anon;
grant execute on function app.set_faith_consent(text), app.clear_faith_consent() to authenticated;
grant execute on function public.set_faith_consent(text), public.clear_faith_consent() to authenticated;

-- Account erasure (0007) clears the health consent columns but predates this
-- one. When a deletion request completes, clear the faith columns as well.
create or replace function app.clear_faith_consent_on_erasure() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.completed_at is not null and old.completed_at is null then
    update public.profiles
       set faith_consent_at = null, faith_consent_version = null
     where user_id = new.user_id;
  end if;
  return new;
end $$;
revoke execute on function app.clear_faith_consent_on_erasure() from public, anon, authenticated;
create trigger account_deletion_clears_faith_consent after update of completed_at on public.account_deletion_requests
  for each row execute function app.clear_faith_consent_on_erasure();
