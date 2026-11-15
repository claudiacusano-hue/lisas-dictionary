-- Unica autorità di scrittura: procedure con autorizzazione esplicita.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Amministratore',
  created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_profiles where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.vocabulary_fields (
  code text primary key check (length(code) between 1 and 100),
  "group" text not null check ("group" in ('configuration','movement','location','orientation','non_manual','grammar')),
  label text not null,
  description text not null default '',
  scope text not null check (scope in ('state','movement','non_manual','lexical')),
  multiple boolean not null default false,
  allows_absence boolean not null default false,
  lisas_path text[] not null
);
-- Definizioni strutturali dal manuale v1.0. Nessun valore linguistico inventato.
insert into public.vocabulary_fields(code,"group",label,description,scope,multiple,allows_absence,lisas_path) values
('selected_fingers','configuration','Dita selezionate','Quali dita partecipano alla configurazione.','state',false,false,'{configurazione,selezione_dita}'),
('finger_position','configuration','Posizione delle dita','La postura delle dita selezionate.','state',false,false,'{configurazione,posizione_dita}'),
('unselected_fingers','configuration','Dita non selezionate','La postura delle altre dita, quando documentata.','state',false,false,'{configurazione,dita_non_selezionate}'),
('movement_type','movement','Tipo di movimento','Il percorso o il movimento della mano.','movement',false,false,'{movimento,tipo}'),
('movement_repeated','movement','Movimento ripetuto','Ripetizione indicata esplicitamente nella fonte.','movement',false,false,'{movimento,ripetuto}'),
('location','location','Luogo di articolazione','Dove si articola il segno, sul corpo o nello spazio.','state',false,false,'{luogo}'),
('orientation','orientation','Direzione del palmo','Verso dove è rivolto il palmo.','state',false,false,'{orientamento}'),
('metacarpus','orientation','Asse del metacarpo','Direzione dal polso all’attaccatura delle dita.','state',false,false,'{metacarpo}'),
('cnm_mouth','non_manual','Bocca','Componenti della bocca.','non_manual',true,true,'{bocca}'),
('cnm_cheeks','non_manual','Guance','Componenti delle guance.','non_manual',true,true,'{guance}'),
('cnm_tongue','non_manual','Lingua','Componenti della lingua.','non_manual',true,true,'{lingua}'),
('cnm_eyebrows','non_manual','Sopracciglia','Posizione o movimento delle sopracciglia.','non_manual',true,true,'{sopracciglia}'),
('cnm_head','non_manual','Testa','Posizione o movimento della testa.','non_manual',true,true,'{testa}'),
('cnm_torso','non_manual','Busto','Posizione o movimento del busto.','non_manual',true,true,'{busto}'),
('part_of_speech','grammar','Categoria grammaticale','Categoria lessicale verificata.','lexical',false,false,'{parte_del_discorso}'),
('verb_class','grammar','Classe verbale','Classificazione adottata dal progetto.','lexical',false,false,'{tipo}');

create table public.vocabulary_terms (
  field_code text not null references public.vocabulary_fields(code),
  code text not null check (length(code) between 1 and 200),
  label text not null check (length(label) between 1 and 250),
  active boolean not null default false,
  source text not null check (length(source) between 1 and 1000),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  primary key(field_code,code),
  check (not active or (reviewed_by is not null and reviewed_at is not null))
);
create table public.signs (
  id uuid primary key default gen_random_uuid(),
  gloss text not null check (length(trim(gloss)) between 1 and 160),
  category_field text not null default 'part_of_speech' check (category_field = 'part_of_speech'),
  category text,
  description text not null default '',
  source text not null default '',
  source_url text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  validated_by uuid references auth.users(id),
  foreign key(category_field,category) references public.vocabulary_terms(field_code,code),
  check (status <> 'published' or validated_by is not null)
);
create index signs_gloss_idx on public.signs(lower(gloss));
create index signs_status_idx on public.signs(status,updated_at desc);
create table public.glosses (
  sign_id uuid not null references public.signs(id) on delete cascade,
  gloss text not null check (length(trim(gloss)) between 1 and 160),
  primary key(sign_id,gloss)
);
create index glosses_lookup_idx on public.glosses(lower(gloss));
create table public.variants (
  id uuid primary key default gen_random_uuid(),
  sign_id uuid not null references public.signs(id) on delete cascade,
  position integer not null,
  label text not null,
  non_dominant_mode text not null check (non_dominant_mode in ('unknown','inactive','symmetric','explicit')),
  dominant_final_same boolean,
  non_dominant_final_same boolean,
  unique(sign_id,position)
);
create table public.annotations (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.variants(id) on delete cascade,
  field_code text not null references public.vocabulary_fields(code),
  term_code text,
  hand text not null check (hand in ('dominant','non_dominant','non_manual')),
  phase text not null check (phase in ('initial','final','whole')),
  state text not null check (state in ('documented','unknown','absent','not_applicable')),
  foreign key(field_code,term_code) references public.vocabulary_terms(field_code,code),
  check ((state = 'documented') = (term_code is not null))
);
create index annotations_search_idx on public.annotations(field_code,term_code,variant_id) where state = 'documented';
create index annotations_variant_idx on public.annotations(variant_id);
create unique index annotations_unique_value on public.annotations(variant_id,field_code,hand,phase,coalesce(term_code,''));
create table public.verb_profiles (
  sign_id uuid primary key references public.signs(id) on delete cascade,
  class_field text not null default 'verb_class' check (class_field = 'verb_class'),
  class_code text,
  agreement text not null default '', inflection text not null default '', direction text not null default '',
  foreign key(class_field,class_code) references public.vocabulary_terms(field_code,code)
);
create table public.examples (
  id uuid primary key default gen_random_uuid(),
  sign_id uuid not null references public.signs(id) on delete cascade,
  scope text not null check (scope in ('lexical','grammar')),
  position integer not null,
  sentence text not null, translation text not null default '', context text not null default '', changes text not null default ''
);
create table public.realizations (
  id uuid primary key default gen_random_uuid(),
  example_id uuid not null unique references public.examples(id) on delete cascade,
  annotation jsonb not null check (jsonb_typeof(annotation) = 'object'),
  media_url text, start_ms integer, end_ms integer,
  check (start_ms is null or start_ms >= 0), check (end_ms is null or end_ms > start_ms)
);
create table public.bibliographic_references (
  id uuid primary key default gen_random_uuid(),
  sign_id uuid not null references public.signs(id) on delete cascade,
  title text not null, locator text not null default '', url text not null default ''
);
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_sign','completion','correction')),
  target_id uuid references public.signs(id),
  base_revision integer,
  document jsonb not null,
  original_document jsonb not null,
  notes text not null default '',
  email text,
  consent_at timestamptz default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected','needs_clarification')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check ((kind = 'new_sign' and target_id is null and base_revision is null) or (kind <> 'new_sign' and target_id is not null and base_revision > 0))
);
create index proposals_queue_idx on public.proposals(status,created_at);
create table public.revisions (
  id bigint generated always as identity primary key,
  proposal_id uuid references public.proposals(id), sign_id uuid references public.signs(id),
  action text not null, reason text not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  before_document jsonb, after_document jsonb
);
create table app_private.rate_limits (key text primary key, window_start timestamptz not null, count integer not null);
create table app_private.import_sources (
  batch_sha256 text not null, source_id text not null, proposal_id uuid not null references public.proposals(id),
  original_lisas jsonb not null, warnings jsonb not null,
  primary key(batch_sha256,source_id)
);

-- RLS si applica anche alle letture dirette REST; nessun grant di scrittura al browser.
alter table public.admin_profiles enable row level security;
create policy own_admin_profile on public.admin_profiles for select to authenticated using (user_id = auth.uid());
alter table public.vocabulary_fields enable row level security;
create policy fields_read on public.vocabulary_fields for select using (true);
alter table public.vocabulary_terms enable row level security;
create policy terms_read on public.vocabulary_terms for select using (active or public.is_admin());
alter table public.signs enable row level security;
create policy signs_read on public.signs for select using (status = 'published' or public.is_admin());
alter table public.glosses enable row level security;
create policy glosses_read on public.glosses for select using (exists(select 1 from public.signs s where s.id = sign_id));
alter table public.variants enable row level security;
create policy variants_read on public.variants for select using (exists(select 1 from public.signs s where s.id = sign_id));
alter table public.annotations enable row level security;
create policy annotations_read on public.annotations for select using (exists(select 1 from public.variants v where v.id = variant_id));
alter table public.verb_profiles enable row level security;
create policy verbs_read on public.verb_profiles for select using (exists(select 1 from public.signs s where s.id = sign_id));
alter table public.examples enable row level security;
create policy examples_read on public.examples for select using (exists(select 1 from public.signs s where s.id = sign_id));
alter table public.realizations enable row level security;
create policy realizations_read on public.realizations for select using (exists(select 1 from public.examples e where e.id = example_id));
alter table public.bibliographic_references enable row level security;
create policy refs_read on public.bibliographic_references for select using (exists(select 1 from public.signs s where s.id = sign_id));
alter table public.proposals enable row level security;
create policy proposals_read on public.proposals for select to authenticated using (public.is_admin());
alter table public.revisions enable row level security;
create policy revisions_read on public.revisions for select to authenticated using (public.is_admin());
revoke all on all tables in schema public from anon, authenticated;
grant select on public.admin_profiles, public.vocabulary_fields, public.vocabulary_terms, public.signs, public.glosses,
  public.variants, public.annotations, public.verb_profiles, public.examples, public.realizations,
  public.bibliographic_references, public.proposals, public.revisions to anon, authenticated;
revoke all on all tables in schema app_private from public, anon, authenticated;

create function app_private.require_admin() returns void language plpgsql security definer set search_path = '' as $$
begin if not public.is_admin() then raise exception 'Accesso amministrativo richiesto' using errcode = '42501'; end if; end;
$$;
create function app_private.check_keys(p jsonb, allowed text[]) returns void language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Oggetto non valido'; end if;
  if exists(select 1 from jsonb_object_keys(p) k where not k = any(allowed)) then raise exception 'Campi non previsti'; end if;
end;
$$;
create function app_private.check_text(p jsonb, max_len integer, min_len integer default 0) returns void language plpgsql set search_path = '' as $$
begin if jsonb_typeof(p) is distinct from 'string' or length(p #>> '{}') > max_len or length(trim(p #>> '{}')) < min_len then raise exception 'Testo non valido'; end if; end;
$$;
create function app_private.check_array(p jsonb, max_len integer, min_len integer default 0) returns void language plpgsql set search_path = '' as $$
begin if jsonb_typeof(p) is distinct from 'array' then raise exception 'Lista non valida'; end if;
if jsonb_array_length(p) not between min_len and max_len then raise exception 'Numero di elementi non valido'; end if; end;
$$;
create function app_private.check_url(p jsonb) returns void language plpgsql set search_path = '' as $$
begin perform app_private.check_text(p,1000); if p #>> '{}' <> '' and p #>> '{}' !~ '^https?://[^[:space:]]+' then raise exception 'URL non valido'; end if; end;
$$;
create function app_private.check_term(field text, term_value jsonb, allow_inactive boolean) returns void language plpgsql set search_path = '' as $$
begin if jsonb_typeof(term_value) is distinct from 'string' or not exists(select 1 from public.vocabulary_terms t where t.field_code = field and t.code = term_value #>> '{}' and (allow_inactive or t.active)) then raise exception 'Valore non ammesso: %',field; end if; end;
$$;
create function app_private.validate_variant(v jsonb, allow_inactive boolean) returns void language plpgsql set search_path = '' as $$
declare a jsonb; f public.vocabulary_fields; mode text;
begin
  perform app_private.check_keys(v,array['id','label','non_dominant_mode','dominant_final_same','non_dominant_final_same','annotations']);
  if v ? 'id' and (v->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'ID variante non valido'; end if;
  perform app_private.check_text(v->'label',160,1);
  mode := v->>'non_dominant_mode';
  if mode is null or mode not in ('unknown','inactive','symmetric','explicit') then raise exception 'Stato mano non valido'; end if;
  if jsonb_typeof(v->'dominant_final_same') not in ('boolean','null') or not v ? 'dominant_final_same' or jsonb_typeof(v->'non_dominant_final_same') not in ('boolean','null') or not v ? 'non_dominant_final_same' then raise exception 'Stato finale non valido'; end if;
  if mode <> 'explicit' and v->'non_dominant_final_same' <> 'null'::jsonb then raise exception 'Stato finale seconda mano non pertinente'; end if;
  perform app_private.check_array(v->'annotations',200);
  for a in select value from jsonb_array_elements(v->'annotations') loop
    perform app_private.check_keys(a,array['field_code','term_code','hand','phase','state']);
    select * into f from public.vocabulary_fields where code = a->>'field_code' and scope <> 'lexical';
    if not found then raise exception 'Parametro non previsto'; end if;
    if a->>'state' is null or a->>'state' not in ('documented','unknown','absent','not_applicable') then raise exception 'Stato parametro non valido'; end if;
    if a->>'hand' is null or a->>'phase' is null or
       (f.scope = 'non_manual' and (a->>'hand' <> 'non_manual' or a->>'phase' <> 'whole')) or
       (f.scope <> 'non_manual' and (a->>'hand' not in ('dominant','non_dominant') or (f.scope = 'movement' and a->>'phase' <> 'whole') or (f.scope = 'state' and a->>'phase' not in ('initial','final')))) then raise exception 'Mano/fase non valida'; end if;
    if a->>'hand' = 'non_dominant' and mode <> 'explicit' then raise exception 'La seconda mano richiede descrizione esplicita'; end if;
    if a->>'phase' = 'final' and ((a->>'hand' = 'dominant' and v->'dominant_final_same' = 'true') or (a->>'hand' = 'non_dominant' and v->'non_dominant_final_same' = 'true')) then raise exception 'Stato finale duplicato'; end if;
    if a->>'state' = 'documented' then perform app_private.check_term(f.code,a->'term_code',allow_inactive);
    elsif a->'term_code' is distinct from 'null'::jsonb then raise exception 'Valore incompatibile con lo stato'; end if;
    if a->>'state' in ('absent','not_applicable') and not f.allows_absence then raise exception 'Assenza non prevista'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(v->'annotations') entries(item) join public.vocabulary_fields vf on vf.code = item->>'field_code'
    group by item->>'field_code',item->>'hand',item->>'phase',vf.multiple having count(*) > 1 and
      (not vf.multiple or bool_or(item->>'state' <> 'documented') or count(distinct item->>'term_code') <> count(*))) then raise exception 'Parametri duplicati o incompatibili'; end if;
end;
$$;
create function app_private.validate_examples(e jsonb, allow_inactive boolean) returns void language plpgsql set search_path = '' as $$
declare item jsonb;
begin perform app_private.check_array(e,30);
for item in select value from jsonb_array_elements(e) loop
  perform app_private.check_keys(item,array['sentence','translation','context','changes','realization']);
  perform app_private.check_text(item->'sentence',2000,1); perform app_private.check_text(item->'translation',2000);
  perform app_private.check_text(item->'context',2000); perform app_private.check_text(item->'changes',2000);
  if item->'realization' is not null and item->'realization' <> 'null'::jsonb then perform app_private.validate_variant(item->'realization',allow_inactive); end if;
end loop; end;
$$;
create function app_private.validate_document(d jsonb, allow_inactive boolean default false) returns void language plpgsql set search_path = '' as $$
declare v jsonb; g jsonb; r jsonb;
begin
  if octet_length(d::text) > 65536 then raise exception 'Scheda troppo grande'; end if;
  perform app_private.check_keys(d,array['gloss','alternative_glosses','category','description','source','source_url','variants','grammar','examples','references']);
  perform app_private.check_text(d->'gloss',160,1); perform app_private.check_text(d->'description',4000);
  perform app_private.check_text(d->'source',1000); perform app_private.check_url(d->'source_url');
  perform app_private.check_array(d->'alternative_glosses',30);
  for v in select value from jsonb_array_elements(d->'alternative_glosses') loop perform app_private.check_text(v,160,1); end loop;
  if (select count(*) <> count(distinct value) from jsonb_array_elements(d->'alternative_glosses')) then raise exception 'Glosse duplicate'; end if;
  if d->'category' is distinct from 'null'::jsonb then perform app_private.check_term('part_of_speech',d->'category',allow_inactive); end if;
  perform app_private.check_array(d->'variants',12,1);
  for v in select value from jsonb_array_elements(d->'variants') loop perform app_private.validate_variant(v,allow_inactive); end loop;
  if exists(select 1 from jsonb_array_elements(d->'variants') x where x ? 'id' group by x->>'id' having count(*) > 1) then raise exception 'ID varianti duplicati'; end if;
  perform app_private.validate_examples(d->'examples',allow_inactive);
  g := d->'grammar';
  if g is distinct from 'null'::jsonb then
    if d->>'category' is null or d->>'category' not in ('verbo','espressione_verbale') then raise exception 'Categoria verbale richiesta'; end if;
    perform app_private.check_keys(g,array['class_code','agreement','inflection','direction','examples']);
    if g->'class_code' is distinct from 'null'::jsonb then perform app_private.check_term('verb_class',g->'class_code',allow_inactive); end if;
    perform app_private.check_text(g->'agreement',4000); perform app_private.check_text(g->'inflection',4000); perform app_private.check_text(g->'direction',4000);
    perform app_private.validate_examples(g->'examples',allow_inactive);
  end if;
  perform app_private.check_array(d->'references',20);
  for r in select value from jsonb_array_elements(d->'references') loop
    perform app_private.check_keys(r,array['title','locator','url']); perform app_private.check_text(r->'title',500,1); perform app_private.check_text(r->'locator',300); perform app_private.check_url(r->'url');
  end loop;
end;
$$;

create function app_private.example_documents(p_id uuid,p_scope text) returns jsonb language sql stable set search_path = '' as $$
select coalesce(jsonb_agg(jsonb_build_object('sentence',e.sentence,'translation',e.translation,'context',e.context,'changes',e.changes,
  'realization',(select r.annotation from public.realizations r where r.example_id=e.id)) order by e.position),'[]') from public.examples e where e.sign_id=p_id and e.scope=p_scope;
$$;
create function app_private.document(p_id uuid) returns jsonb language sql stable set search_path = '' as $$
select jsonb_build_object('gloss',s.gloss,'alternative_glosses',coalesce((select jsonb_agg(g.gloss order by g.gloss) from public.glosses g where g.sign_id=s.id),'[]'),
  'category',s.category,'description',s.description,'source',s.source,'source_url',s.source_url,
  'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'label',v.label,'non_dominant_mode',v.non_dominant_mode,
    'dominant_final_same',v.dominant_final_same,'non_dominant_final_same',v.non_dominant_final_same,
    'annotations',coalesce((select jsonb_agg(jsonb_build_object('field_code',a.field_code,'term_code',a.term_code,'hand',a.hand,'phase',a.phase,'state',a.state) order by a.id) from public.annotations a where a.variant_id=v.id),'[]')) order by v.position) from public.variants v where v.sign_id=s.id),'[]'),
  'grammar',(select jsonb_build_object('class_code',g.class_code,'agreement',g.agreement,'inflection',g.inflection,'direction',g.direction,
    'examples',app_private.example_documents(s.id,'grammar')) from public.verb_profiles g where g.sign_id=s.id),
  'examples',app_private.example_documents(s.id,'lexical'),
  'references',coalesce((select jsonb_agg(jsonb_build_object('title',r.title,'locator',r.locator,'url',r.url) order by r.id) from public.bibliographic_references r where r.sign_id=s.id),'[]'))
from public.signs s where s.id=p_id;
$$;

create function app_private.write_examples(p_id uuid,p_scope text,items jsonb) returns void language plpgsql set search_path = '' as $$
declare e jsonb; eid uuid; pos integer := 0;
begin for e in select value from jsonb_array_elements(items) loop
  pos := pos+1;
  insert into public.examples(sign_id,scope,position,sentence,translation,context,changes) values(p_id,p_scope,pos,e->>'sentence',e->>'translation',e->>'context',e->>'changes') returning id into eid;
  if e->'realization' is not null and e->'realization' <> 'null'::jsonb then insert into public.realizations(example_id,annotation) values(eid,e->'realization'); end if;
end loop; end;
$$;
create function app_private.publish_document(p_id uuid,d jsonb) returns uuid language plpgsql set search_path = '' as $$
declare sid uuid := p_id; v jsonb; a jsonb; vid uuid; g jsonb; r jsonb; pos integer := 0;
begin
  perform app_private.validate_document(d);
  if sid is null then
    insert into public.signs(gloss,category,description,source,source_url,status,validated_by)
    values(d->>'gloss',d->>'category',d->>'description',d->>'source',d->>'source_url','published',auth.uid()) returning id into sid;
  else
    if exists(select 1 from jsonb_array_elements(d->'variants') x where x ? 'id' and not exists(select 1 from public.variants v where v.id=(x->>'id')::uuid and v.sign_id=sid)) then raise exception 'La variante non appartiene alla scheda'; end if;
    update public.signs set gloss=d->>'gloss',category=d->>'category',description=d->>'description',source=d->>'source',source_url=d->>'source_url',
      status='published',validated_by=auth.uid(),revision=revision+1,updated_at=now() where id=sid;
    if not found then raise exception 'Scheda non trovata'; end if;
    delete from public.glosses where sign_id=sid; delete from public.variants where sign_id=sid;
    delete from public.verb_profiles where sign_id=sid; delete from public.examples where sign_id=sid;
    delete from public.bibliographic_references where sign_id=sid;
  end if;
  insert into public.glosses(sign_id,gloss) select sid,value from jsonb_array_elements_text(d->'alternative_glosses');
  for v in select value from jsonb_array_elements(d->'variants') loop
    pos:=pos+1; vid:=coalesce((v->>'id')::uuid,gen_random_uuid());
    insert into public.variants(id,sign_id,position,label,non_dominant_mode,dominant_final_same,non_dominant_final_same)
      values(vid,sid,pos,v->>'label',v->>'non_dominant_mode',(v->>'dominant_final_same')::boolean,(v->>'non_dominant_final_same')::boolean);
    for a in select value from jsonb_array_elements(v->'annotations') loop
      insert into public.annotations(variant_id,field_code,term_code,hand,phase,state) values(vid,a->>'field_code',a->>'term_code',a->>'hand',a->>'phase',a->>'state');
    end loop;
  end loop;
  g:=d->'grammar';
  if g <> 'null'::jsonb then
    insert into public.verb_profiles(sign_id,class_code,agreement,inflection,direction) values(sid,g->>'class_code',g->>'agreement',g->>'inflection',g->>'direction');
    perform app_private.write_examples(sid,'grammar',g->'examples');
  end if;
  perform app_private.write_examples(sid,'lexical',d->'examples');
  for r in select value from jsonb_array_elements(d->'references') loop
    insert into public.bibliographic_references(sign_id,title,locator,url) values(sid,r->>'title',r->>'locator',r->>'url');
  end loop;
  return sid;
end;
$$;

create function public.submit_proposal(p_input jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid; sid uuid; base integer;
begin
  if octet_length(p_input::text) > 65536 then raise exception 'Proposta troppo grande'; end if;
  perform app_private.check_keys(p_input,array['kind','target_id','base_revision','document','notes','email','consent']);
  if p_input->'consent' is distinct from 'true'::jsonb then raise exception 'Consenso richiesto'; end if;
  if p_input->>'kind' is null or p_input->>'kind' not in ('new_sign','completion','correction') then raise exception 'Tipo proposta non valido'; end if;
  perform app_private.check_text(p_input->'notes',4000); perform app_private.check_text(p_input->'email',254);
  if p_input->>'email' <> '' and p_input->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email non valida'; end if;
  perform app_private.validate_document(p_input->'document');
  if p_input->>'kind' = 'new_sign' then
    if p_input->'target_id' is distinct from 'null'::jsonb or p_input->'base_revision' is distinct from 'null'::jsonb then raise exception 'Riferimento inatteso'; end if;
  else
    if jsonb_typeof(p_input->'base_revision') <> 'number' or (p_input->>'base_revision') !~ '^[1-9][0-9]*$' then raise exception 'Revisione non valida'; end if;
    sid:=(p_input->>'target_id')::uuid; base:=(p_input->>'base_revision')::integer;
    if not exists(select 1 from public.signs where id=sid and status='published' and revision=base) then raise exception 'Scheda aggiornata: ricaricala prima di contribuire'; end if;
  end if;
  insert into public.proposals(kind,target_id,base_revision,document,original_document,notes,email)
    values(p_input->>'kind',sid,base,p_input->'document',p_input->'document',p_input->>'notes',nullif(p_input->>'email','')) returning id into pid;
  return pid;
end;
$$;

-- Rate limit atomico: anche richieste concorrenti condividono lo stesso contatore.
create function public.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean language plpgsql security definer set search_path = '' as $$
declare hits integer;
begin
  if length(p_key)>100 or p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400 then raise exception 'Limite non valido'; end if;
  insert into app_private.rate_limits as r(key,window_start,count) values(p_key,clock_timestamp(),1)
    on conflict(key) do update set
      count=case when r.window_start < clock_timestamp()-make_interval(secs=>p_window_seconds) then 1 else r.count+1 end,
      window_start=case when r.window_start < clock_timestamp()-make_interval(secs=>p_window_seconds) then clock_timestamp() else r.window_start end
    returning count into hits;
  delete from app_private.rate_limits where window_start < clock_timestamp()-interval '2 days';
  return hits <= p_limit;
end;
$$;

create function public.edit_proposal(p_id uuid,p_version integer,p_document jsonb,p_reason text,p_base_revision integer default null) returns void language plpgsql security definer set search_path = '' as $$
declare p public.proposals;
begin
  perform app_private.require_admin();
  if length(trim(p_reason)) not between 3 and 2000 then raise exception 'Motivazione richiesta'; end if;
  select * into p from public.proposals where id=p_id for update;
  if not found or p.version<>p_version or p.status not in ('pending','needs_clarification') then raise exception 'Proposta modificata o conclusa: ricarica'; end if;
  perform app_private.validate_document(p_document);
  if p_base_revision is not null and (p.target_id is null or not exists(select 1 from public.signs where id=p.target_id and revision=p_base_revision and status='published')) then raise exception 'Revisione di base non valida'; end if;
  update public.proposals set document=p_document,version=version+1,base_revision=coalesce(p_base_revision,base_revision) where id=p_id;
  insert into public.revisions(proposal_id,sign_id,action,reason,actor_id,before_document,after_document)
    values(p_id,p.target_id,'edited',p_reason,auth.uid(),p.document,p_document);
end;
$$;
create function public.moderate_proposal(p_id uuid,p_version integer,p_action text,p_reason text) returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.proposals; sid uuid; before_doc jsonb; current_revision integer;
begin
  perform app_private.require_admin();
  if p_action is null or p_action not in ('approved','rejected','needs_clarification') or length(trim(p_reason)) not between 3 and 2000 then raise exception 'Decisione e motivazione richieste'; end if;
  select * into p from public.proposals where id=p_id for update;
  if not found or p.version<>p_version or p.status not in ('pending','needs_clarification') then raise exception 'Proposta modificata o già conclusa'; end if;
  if p_action='needs_clarification' and p.email is null then raise exception 'Nessun recapito disponibile'; end if;
  sid:=p.target_id;
  if p_action='approved' then
    if sid is not null then
      select revision into current_revision from public.signs where id=sid and status='published' for update;
      if current_revision is distinct from p.base_revision then raise exception 'Conflitto di revisione: confronta la scheda corrente e aggiorna la proposta'; end if;
      before_doc:=app_private.document(sid);
    end if;
    if length(trim(p.document->>'source'))<3 then raise exception 'Indica la provenienza prima di pubblicare'; end if;
    sid:=app_private.publish_document(sid,p.document);
  end if;
  update public.proposals set status=p_action,version=version+1 where id=p_id;
  insert into public.revisions(proposal_id,sign_id,action,reason,actor_id,before_document,after_document)
    values(p_id,sid,p_action,p_reason,auth.uid(),before_doc,case when p_action='approved' then app_private.document(sid) else p.document end);
  return sid;
end;
$$;

create function public.review_vocabulary(p_field text,p_code text,p_active boolean,p_label text,p_reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if length(trim(p_reason)) not between 3 and 2000 or length(trim(p_label)) not between 1 and 250 then raise exception 'Etichetta e motivazione richieste'; end if;
  if not p_active and (exists(select 1 from public.annotations a join public.variants v on v.id=a.variant_id join public.signs s on s.id=v.sign_id where s.status='published' and a.field_code=p_field and a.term_code=p_code)
    or exists(select 1 from public.signs s where s.status='published' and ((p_field='part_of_speech' and s.category=p_code) or exists(select 1 from public.verb_profiles g where g.sign_id=s.id and p_field='verb_class' and g.class_code=p_code)))
    or exists(select 1 from public.realizations r join public.examples e on e.id=r.example_id join public.signs s on s.id=e.sign_id
      where s.status='published' and exists(select 1 from jsonb_array_elements(r.annotation->'annotations') a where a->>'field_code'=p_field and a->>'term_code'=p_code))) then raise exception 'Valore usato in schede pubblicate: revisionare prima le schede'; end if;
  update public.vocabulary_terms set active=p_active,label=p_label,reviewed_by=auth.uid(),reviewed_at=now() where field_code=p_field and code=p_code;
  if not found then raise exception 'Valore non trovato'; end if;
  insert into public.revisions(action,reason,actor_id,after_document) values('vocabulary_review',p_reason,auth.uid(),jsonb_build_object('field',p_field,'code',p_code,'active',p_active,'label',p_label));
end;
$$;

-- Importazione idempotente in coda privata. I termini nuovi sono sempre inattivi.
create function public.stage_lisas_import(p_batch text,p_source_id text,p_original jsonb,p_document jsonb,p_terms jsonb,p_warnings jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare t jsonb; pid uuid;
begin
  perform app_private.require_admin();
  if p_batch !~ '^[a-f0-9]{64}$' or length(p_source_id) not between 1 and 200 or octet_length(p_original::text)>65536 then raise exception 'Fonte non valida'; end if;
  -- Lock sulla coppia di importazione, senza race fra importatori.
  perform pg_advisory_xact_lock(hashtextextended(p_batch||':'||p_source_id,0));
  select proposal_id into pid from app_private.import_sources where batch_sha256=p_batch and source_id=p_source_id;
  if found then return pid; end if;
  perform app_private.check_array(p_terms,1000);
  for t in select value from jsonb_array_elements(p_terms) loop
    perform app_private.check_text(t->'code',200,1); perform app_private.check_text(t->'label',250,1); perform app_private.check_text(t->'source',1000,1);
    insert into public.vocabulary_terms(field_code,code,label,source) values(t->>'field_code',t->>'code',t->>'label',t->>'source') on conflict do nothing;
  end loop;
  perform app_private.validate_document(p_document,true);
  insert into public.proposals(kind,document,original_document,notes,consent_at) values('new_sign',p_document,p_document,'Importazione LISAS: verificare provenienza, diritti e avvisi del rapporto prima di pubblicare.',null) returning id into pid;
  insert into app_private.import_sources values(p_batch,p_source_id,pid,p_original,p_warnings);
  insert into public.revisions(proposal_id,action,reason,actor_id,after_document) values(pid,'imported','Importazione in bozza '||p_batch,auth.uid(),p_document);
  return pid;
end;
$$;

create function app_private.completeness(p_id uuid) returns integer language sql stable set search_path = '' as $$
  select coalesce(max(score),0)::integer from (select count(distinct f."group")*20 as score from public.variants v
    left join public.annotations a on a.variant_id=v.id and a.state in ('documented','absent','not_applicable')
    left join public.vocabulary_fields f on f.code=a.field_code where v.sign_id=p_id group by v.id) scores;
$$;
-- Copertura dei cinque gruppi: indicatore descrittivo, non certificazione di completezza linguistica.
create function public.search_signs(p_query text default '',p_filters jsonb default '[]',p_offset integer default 0,p_limit integer default 24) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if length(p_query)>160 or p_offset not between 0 and 100000 or p_limit not between 1 and 100 then raise exception 'Ricerca non valida'; end if;
  perform app_private.check_array(p_filters,30);
  if exists(select 1 from jsonb_array_elements(p_filters) f where jsonb_typeof(f)<>'object' or not f ? 'field_code' or not f ? 'term_code' or (f ? 'hand' and f->>'hand' not in ('dominant','non_dominant')) or (f ? 'phase' and f->>'phase' not in ('initial','final'))) then raise exception 'Filtro non valido'; end if;
  with matching as (
    select s.* from public.signs s where s.status='published'
    and (p_query='' or lower(s.gloss) like '%'||lower(replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_'))||'%' escape '\'
      or exists(select 1 from public.glosses g where g.sign_id=s.id and lower(g.gloss) like '%'||lower(replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_'))||'%' escape '\'))
    and exists(select 1 from public.variants v where v.sign_id=s.id and not exists(
      select 1 from jsonb_array_elements(p_filters) f where not exists(
        select 1 from public.annotations a where a.variant_id=v.id and a.state='documented' and a.field_code=f->>'field_code' and a.term_code=f->>'term_code'
        and (not f ? 'hand' or a.hand=f->>'hand' or a.hand='non_manual' or (f->>'hand'='non_dominant' and v.non_dominant_mode='symmetric' and a.hand='dominant'))
        and (not f ? 'phase' or a.phase=f->>'phase' or a.phase='whole' or (f->>'phase'='final' and a.phase='initial' and
          (case when a.hand='dominant' then v.dominant_final_same else v.non_dominant_final_same end is true or
           (case when a.hand='dominant' then v.dominant_final_same else v.non_dominant_final_same end is false and not exists(
             select 1 from public.annotations final_a where final_a.variant_id=v.id and final_a.hand=a.hand and final_a.phase='final' and final_a.field_code=a.field_code)))))
      )))
  ), page as (select * from matching order by lower(gloss),id limit p_limit offset p_offset)
  select jsonb_build_object('total',(select count(*) from matching),'results',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'gloss',s.gloss,'category',s.category,'description',s.description,
    'revision',s.revision,'updated_at',s.updated_at,'completeness',app_private.completeness(s.id),'variant_count',(select count(*) from public.variants v where v.sign_id=s.id)) order by lower(s.gloss),s.id) from page s),'[]')) into result;
  return result;
end;
$$;
create function public.get_sign(p_id uuid) returns jsonb language sql stable security definer set search_path = '' as $$
select jsonb_build_object('id',s.id,'gloss',s.gloss,'category',s.category,'description',s.description,'revision',s.revision,'updated_at',s.updated_at,
  'completeness',app_private.completeness(s.id),'variant_count',(select count(*) from public.variants v where v.sign_id=s.id),'document',app_private.document(s.id))
from public.signs s where s.id=p_id and s.status='published';
$$;

create function public.get_import_context(p_proposal uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  return (select jsonb_build_object('batch_sha256',i.batch_sha256,'source_id',i.source_id,'original_lisas',i.original_lisas,'warnings',i.warnings)
    from app_private.import_sources i where i.proposal_id=p_proposal);
end;
$$;
revoke all on function public.get_import_context(uuid) from public,anon,authenticated;
grant execute on function public.get_import_context(uuid) to authenticated;

-- Permette di caricare un intero inventario controllato anche senza voci lessicali.
-- L'attivazione resta un atto di revisione separato, per ogni percorso/valore.
create function public.stage_vocabulary(p_source text,p_terms jsonb) returns integer language plpgsql security definer set search_path = '' as $$
declare t jsonb; inserted_count integer := 0; inserted_row integer;
begin
  perform app_private.require_admin();
  if length(trim(p_source)) not between 3 and 1000 or octet_length(p_terms::text)>1048576 then raise exception 'Fonte o dimensione del vocabolario non valida'; end if;
  perform app_private.check_array(p_terms,5000,1);
  for t in select value from jsonb_array_elements(p_terms) loop
    perform app_private.check_keys(t,array['field_code','code','label']);
    perform app_private.check_text(t->'field_code',100,1); perform app_private.check_text(t->'code',200,1); perform app_private.check_text(t->'label',250,1);
    insert into public.vocabulary_terms(field_code,code,label,source) values(t->>'field_code',t->>'code',t->>'label',p_source) on conflict do nothing;
    get diagnostics inserted_row = row_count;
    inserted_count := inserted_count + inserted_row;
  end loop;
  insert into public.revisions(action,reason,actor_id,after_document) values('vocabulary_import',p_source,auth.uid(),jsonb_build_object('inserted',inserted_count));
  return inserted_count;
end;
$$;
revoke all on function public.stage_vocabulary(text,jsonb) from public,anon,authenticated;
grant execute on function public.stage_vocabulary(text,jsonb) to authenticated;

revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.submit_proposal(jsonb),public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.submit_proposal(jsonb),public.consume_rate_limit(text,integer,integer) to service_role;
revoke all on function public.edit_proposal(uuid,integer,jsonb,text,integer),public.moderate_proposal(uuid,integer,text,text),public.review_vocabulary(text,text,boolean,text,text),public.stage_lisas_import(text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.edit_proposal(uuid,integer,jsonb,text,integer),public.moderate_proposal(uuid,integer,text,text),public.review_vocabulary(text,text,boolean,text,text),public.stage_lisas_import(text,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.search_signs(text,jsonb,integer,integer),public.get_sign(uuid) from public;
grant execute on function public.search_signs(text,jsonb,integer,integer),public.get_sign(uuid) to anon,authenticated;
-- Anche future funzioni private non devono ricevere EXECUTE pubblico per default.
alter default privileges in schema app_private revoke execute on functions from public;
