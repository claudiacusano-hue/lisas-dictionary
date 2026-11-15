-- Public submissions and reviewer submissions share document/revision validation.
-- Only the public path collects a contributor's privacy consent and optional email.
create function app_private.create_proposal(p_input jsonb, p_consent_at timestamptz)
returns uuid language plpgsql set search_path = '' as $$
declare pid uuid; sid uuid; base integer;
begin
  if octet_length(p_input::text) > 65536 then raise exception 'Proposta troppo grande'; end if;
  perform app_private.check_keys(p_input,array['kind','target_id','base_revision','document','notes','email','consent']);
  if p_input->>'kind' is null or p_input->>'kind' not in ('new_sign','completion','correction') then raise exception 'Tipo proposta non valido'; end if;
  perform app_private.check_text(p_input->'notes',4000);
  perform app_private.check_text(p_input->'email',254);
  if p_input->>'email' <> '' and p_input->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Email non valida'; end if;
  perform app_private.validate_document(p_input->'document');
  if p_input->>'kind' = 'new_sign' then
    if p_input->'target_id' is distinct from 'null'::jsonb or p_input->'base_revision' is distinct from 'null'::jsonb then raise exception 'Riferimento inatteso'; end if;
  else
    if jsonb_typeof(p_input->'base_revision') is distinct from 'number' or (p_input->>'base_revision') !~ '^[1-9][0-9]*$' then raise exception 'Revisione non valida'; end if;
    sid:=(p_input->>'target_id')::uuid; base:=(p_input->>'base_revision')::integer;
    if not exists(select 1 from public.signs where id=sid and status='published' and revision=base) then raise exception 'Scheda aggiornata: ricaricala prima di contribuire'; end if;
  end if;
  insert into public.proposals(kind,target_id,base_revision,document,original_document,notes,email,consent_at)
    values(p_input->>'kind',sid,base,p_input->'document',p_input->'document',p_input->>'notes',nullif(p_input->>'email',''),p_consent_at) returning id into pid;
  return pid;
end;
$$;
revoke all on function app_private.create_proposal(jsonb,timestamptz) from public,anon,authenticated,service_role;

-- Keep the existing service-role-only API used by the antispam Edge Function.
create or replace function public.submit_proposal(p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_input->'consent' is distinct from 'true'::jsonb then raise exception 'Consenso richiesto'; end if;
  return app_private.create_proposal(p_input,now());
end;
$$;

-- Reviewers can prepare proposals while anonymous contributions are closed.
-- Authentication alone is insufficient: require the application reviewer role.
create function public.submit_admin_proposal(p_input jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  perform app_private.require_admin();
  perform app_private.check_keys(p_input,array['kind','target_id','base_revision','document','notes']);
  perform app_private.check_text(p_input->'notes',4000,3);
  pid := app_private.create_proposal(p_input || jsonb_build_object('email',''),null);
  insert into public.revisions(proposal_id,sign_id,action,reason,actor_id,after_document)
    values(pid,(p_input->>'target_id')::uuid,'submitted',p_input->>'notes',auth.uid(),p_input->'document');
  return pid;
end;
$$;
revoke all on function public.submit_admin_proposal(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.submit_admin_proposal(jsonb) to authenticated;
