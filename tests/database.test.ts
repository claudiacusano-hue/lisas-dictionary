import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { documentFixture, terms, proposalFixture } from './fixtures'
import type { SignDocument } from '../supabase/functions/_shared/domain'
import { importLisas } from '../supabase/functions/_shared/lisas'

const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const outsider = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let db: PGlite
async function role<T>(name: string, user: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec(`begin; set local role ${name}`)
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user || ''])
  try {
    const value = await run()
    await db.exec('commit')
    return value
  } catch (e) {
    await db.exec('rollback')
    throw e
  }
}
const rpc = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<{ result: T }>(`select ${sql} as result`, params)).rows[0].result
const submit = (d: SignDocument) =>
  role('service_role', null, () =>
    rpc<string>('public.submit_proposal($1::jsonb)', [
      JSON.stringify({ ...proposalFixture(), document: d }),
    ]),
  )
const approve = (id: string, version = 1) =>
  role('authenticated', admin, () =>
    rpc<string>("public.moderate_proposal($1,$2,'approved','Revisione tecnica del test')", [
      id,
      version,
    ]),
  )

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    insert into auth.users values('${admin}'),('${outsider}');`)
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/202611150001_lexicon.sql', import.meta.url),
      'utf8',
    ),
  )
  await db.query('insert into public.admin_profiles(user_id) values($1)', [admin])
  for (const t of terms)
    await db.query(
      'insert into public.vocabulary_terms(field_code,code,label,active,source,reviewed_by,reviewed_at) values($1,$2,$3,true,$4,$5,now())',
      [t.field_code, t.code, t.label, t.source, admin],
    )
}, 60000)
afterAll(async () => {
  await db?.close()
})

describe('schema PostgreSQL e autorizzazioni reali', () => {
  it('carica inventari controllati senza attivarli e protegge l’operazione', async () => {
    const input = JSON.stringify([
      { field_code: 'location', code: 'TEST_VOCABULARY', label: 'Valore tecnico di test' },
    ])
    await expect(
      role('authenticated', outsider, () =>
        rpc("public.stage_vocabulary('Fonte di test',$1)", [input]),
      ),
    ).rejects.toThrow('Accesso amministrativo')
    expect(
      await role('authenticated', admin, () =>
        rpc("public.stage_vocabulary('Fonte di test',$1)", [input]),
      ),
    ).toBe(1)
    expect(
      await role('authenticated', admin, () =>
        rpc("public.stage_vocabulary('Fonte di test',$1)", [input]),
      ),
    ).toBe(0)
    expect(
      (
        await role('anon', null, () =>
          db.query("select * from public.vocabulary_terms where code='TEST_VOCABULARY'"),
        )
      ).rows,
    ).toEqual([])
  })
  it('anonimo non legge la coda né scrive tabelle, ruoli o RPC privilegiate', async () => {
    for (const table of ['signs', 'proposals', 'admin_profiles', 'vocabulary_terms'])
      await expect(
        role('anon', null, () => db.exec(`insert into public.${table} default values`)),
      ).rejects.toThrow()
    await expect(
      role('anon', null, () =>
        rpc('public.submit_proposal($1::jsonb)', [JSON.stringify(proposalFixture())]),
      ),
    ).rejects.toThrow('permission denied')
    expect(
      await role('anon', null, () => db.query('select * from public.proposals')),
    ).toMatchObject({ rows: [] })
  })
  it('un utente autenticato senza ruolo non può moderare, importare o attivare termini', async () => {
    await expect(
      role('authenticated', admin, () =>
        db.exec('update public.vocabulary_terms set active=false'),
      ),
    ).rejects.toThrow('permission denied')
    await expect(
      role('authenticated', outsider, () =>
        rpc("public.moderate_proposal(gen_random_uuid(),1,'approved','Motivazione')"),
      ),
    ).rejects.toThrow('Accesso amministrativo')
    await expect(
      role('authenticated', outsider, () =>
        rpc("public.review_vocabulary('location','TEST_LOCATION',true,'Test','Motivazione')"),
      ),
    ).rejects.toThrow('Accesso amministrativo')
    await expect(
      role('authenticated', outsider, () =>
        rpc("public.stage_lisas_import('x','1','{}','{}','[]','[]')"),
      ),
    ).rejects.toThrow('Accesso amministrativo')
  })
  it('proposte restano private e approvazione è tracciata', async () => {
    const d = documentFixture('APPROVAZIONE TEST')
    const pid = await submit(d)
    expect(
      await role('anon', null, () =>
        rpc<{ total: number }>("public.search_signs('APPROVAZIONE TEST')"),
      ),
    ).toMatchObject({ total: 0 })
    const sid = await approve(pid)
    const detail = await role('anon', null, () =>
      rpc<{ document: SignDocument }>('public.get_sign($1)', [sid]),
    )
    expect(detail.document.gloss).toBe(d.gloss)
    expect(
      (await db.query('select action from public.revisions where proposal_id=$1', [pid])).rows,
    ).toEqual([{ action: 'approved' }])
    expect(
      await role('anon', null, () => db.query('select * from public.revisions')),
    ).toMatchObject({ rows: [] })
    await expect(approve(pid)).rejects.toThrow('già conclusa')
  })
  it('rifiuta valori controllati invalidi anche chiamando direttamente la procedura', async () => {
    const d = documentFixture()
    d.variants[0].annotations[0].term_code = 'INVENTATO'
    await expect(submit(d)).rejects.toThrow('Valore non ammesso')
    await expect(
      submit({ ...documentFixture(), grammar: undefined } as unknown as SignDocument),
    ).rejects.toThrow()
  })
  it('filtri AND non attraversano varianti diverse e la ricerca è letterale', async () => {
    const d = documentFixture('VARIANTI TEST')
    const v = structuredClone(d.variants[0])
    d.variants[0].annotations.pop()
    v.annotations.shift()
    v.label = 'Altra variante'
    d.variants.push(v)
    await approve(await submit(d))
    const filters = [
      { field_code: 'selected_fingers', term_code: 'TEST_CONFIG' },
      { field_code: 'location', term_code: 'TEST_LOCATION' },
    ]
    expect(
      await rpc("public.search_signs('VARIANTI TEST',$1)", [JSON.stringify(filters)]),
    ).toMatchObject({ total: 0 })
    expect(await rpc("public.search_signs('%')")).toMatchObject({ total: 0 })
  })
  it('gestisce fine uguale e mano simmetrica senza inventare annotazioni', async () => {
    const d = documentFixture('SIMMETRIA TEST')
    d.variants[0].non_dominant_mode = 'symmetric'
    d.variants[0].dominant_final_same = true
    await approve(await submit(d))
    const filters = [
      {
        field_code: 'selected_fingers',
        term_code: 'TEST_CONFIG',
        hand: 'non_dominant',
        phase: 'final',
      },
    ]
    expect(
      await rpc("public.search_signs('SIMMETRIA TEST',$1)", [JSON.stringify(filters)]),
    ).toMatchObject({ total: 1 })
  })
  it('blocca sovrascritture concorrenti e mantiene pubblicazione atomica', async () => {
    const sid = await approve(await submit(documentFixture('CONCORRENZA TEST')))
    const detail = await rpc<{ document: SignDocument }>('public.get_sign($1)', [sid])
    const p = {
      ...proposalFixture(),
      kind: 'correction',
      target_id: sid,
      base_revision: 1,
      document: detail.document,
    }
    const [p1, p2] = await role('service_role', null, async () => [
      await rpc<string>('public.submit_proposal($1)', [JSON.stringify(p)]),
      await rpc<string>('public.submit_proposal($1)', [JSON.stringify(p)]),
    ])
    await approve(p1)
    await expect(approve(p2)).rejects.toThrow('Conflitto di revisione')
    expect((await db.query('select status from public.proposals where id=$1', [p2])).rows).toEqual([
      { status: 'pending' },
    ])
    expect(await rpc('public.get_sign($1)', [sid])).toMatchObject({ revision: 2 })
  })
  it('richiede motivo e recapito per chiarimenti, senza esporre email', async () => {
    const pid = await submit(documentFixture())
    await expect(
      role('authenticated', admin, () =>
        rpc("public.moderate_proposal($1,1,'needs_clarification','Richiesta fonte')", [pid]),
      ),
    ).rejects.toThrow('recapito')
    await expect(
      role('authenticated', admin, () =>
        rpc("public.moderate_proposal($1,1,'rejected','')", [pid]),
      ),
    ).rejects.toThrow('motivazione')
  })
  it('applica un contatore persistente e non lo espone al browser', async () => {
    expect(
      await role('service_role', null, () => rpc("public.consume_rate_limit('test',1,3600)")),
    ).toBe(true)
    expect(
      await role('service_role', null, () => rpc("public.consume_rate_limit('test',1,3600)")),
    ).toBe(false)
    await expect(
      role('anon', null, () => rpc("public.consume_rate_limit('test',1,3600)")),
    ).rejects.toThrow('permission denied')
  })
  it('importa in coda senza pubblicare, conserva originali e impedisce duplicati del batch', async () => {
    const raw = {
      id: 1,
      lemma: 'IMPORT TEST',
      mano: {
        dominante: { inizio: { luogo: 'NUOVO_VALORE_DI_TEST' }, fine: null },
        non_dominante: { attiva: false },
      },
      metadato_da_rivedere: 'test',
    }
    const entry = importLisas(raw, 'Fonte tecnica di importazione')
    const batch = 'c'.repeat(64)
    const args = [
      batch,
      entry.source_id,
      JSON.stringify(entry.original),
      JSON.stringify(entry.document),
      JSON.stringify(entry.terms),
      JSON.stringify(entry.warnings),
    ]
    const run = () =>
      role('authenticated', admin, () =>
        rpc<string>('public.stage_lisas_import($1,$2,$3,$4,$5,$6)', args),
      )
    const pid = await run()
    expect(await run()).toBe(pid)
    expect(await rpc("public.search_signs('IMPORT TEST')")).toMatchObject({ total: 0 })
    expect(
      (
        await db.query(
          "select active from public.vocabulary_terms where field_code='location' and code='NUOVO_VALORE_DI_TEST'",
        )
      ).rows,
    ).toEqual([{ active: false }])
    await expect(approve(pid)).rejects.toThrow('Valore non ammesso')
    expect(
      await role('authenticated', admin, () => rpc('public.get_import_context($1)', [pid])),
    ).toMatchObject({ original_lisas: raw, warnings: entry.warnings })
    await expect(
      role('authenticated', outsider, () => rpc('public.get_import_context($1)', [pid])),
    ).rejects.toThrow('Accesso amministrativo')
    await role('authenticated', admin, () =>
      rpc(
        "public.review_vocabulary('location','NUOVO_VALORE_DI_TEST',true,'Valore tecnico verificato','Verifica della fonte di test')",
      ),
    )
    await approve(pid)
    expect(await rpc("public.search_signs('IMPORT TEST')")).toMatchObject({ total: 1 })
  })
  it('salva modifiche del revisore e preserva la proposta originaria', async () => {
    const pid = await submit(documentFixture('MODIFICA TEST'))
    const revised = documentFixture('MODIFICA REVISIONATA TEST')
    await role('authenticated', admin, () =>
      rpc("public.edit_proposal($1,1,$2,'Correzione documentata')", [pid, JSON.stringify(revised)]),
    )
    const row = (
      await db.query<{ version: number; original_document: SignDocument; document: SignDocument }>(
        'select version,original_document,document from public.proposals where id=$1',
        [pid],
      )
    ).rows[0]
    expect(row.version).toBe(2)
    expect(row.original_document.gloss).toBe('MODIFICA TEST')
    expect(row.document.gloss).toBe(revised.gloss)
    await expect(approve(pid)).rejects.toThrow('già conclusa')
    await approve(pid, 2)
  })
  it('rifiuto motivato non pubblica nulla e resta nella cronologia', async () => {
    const pid = await submit(documentFixture('RIFIUTO TEST'))
    await role('authenticated', admin, () =>
      rpc("public.moderate_proposal($1,1,'rejected','Fonte non verificabile')", [pid]),
    )
    expect(await rpc("public.search_signs('RIFIUTO TEST')")).toMatchObject({ total: 0 })
    expect(
      (await db.query('select action,reason from public.revisions where proposal_id=$1', [pid]))
        .rows,
    ).toEqual([{ action: 'rejected', reason: 'Fonte non verificabile' }])
  })
  it('lo stato finale parziale eredita i campi solo se non sovrascritti', async () => {
    const d = documentFixture('FINE PARZIALE TEST')
    d.variants[0].dominant_final_same = false
    const sid = await approve(await submit(d))
    const f = JSON.stringify([
      { field_code: 'selected_fingers', term_code: 'TEST_CONFIG', phase: 'final' },
    ])
    expect(await rpc("public.search_signs('FINE PARZIALE TEST',$1)", [f])).toMatchObject({
      total: 1,
    })
    const current = await rpc<{ document: SignDocument }>('public.get_sign($1)', [sid])
    current.document.variants[0].annotations.push({
      field_code: 'selected_fingers',
      term_code: null,
      hand: 'dominant',
      phase: 'final',
      state: 'unknown',
    })
    const p = {
      ...proposalFixture(),
      kind: 'correction',
      target_id: sid,
      base_revision: 1,
      document: current.document,
    }
    const pid = await role('service_role', null, () =>
      rpc<string>('public.submit_proposal($1)', [JSON.stringify(p)]),
    )
    await approve(pid)
    expect(await rpc("public.search_signs('FINE PARZIALE TEST',$1)", [f])).toMatchObject({
      total: 0,
    })
  })
  it('non disattiva un termine usato soltanto in una realizzazione contestuale pubblicata', async () => {
    await db.query(
      "insert into public.vocabulary_terms(field_code,code,label,source,active,reviewed_by,reviewed_at) values('location','TEST_CONTEXT','Contesto di test','Fixture',true,$1,now())",
      [admin],
    )
    const d = documentFixture('REALIZZAZIONE TEST')
    const realization = structuredClone(d.variants[0])
    realization.annotations = [
      {
        field_code: 'location',
        term_code: 'TEST_CONTEXT',
        hand: 'dominant',
        phase: 'initial',
        state: 'documented',
      },
    ]
    d.examples = [
      { sentence: 'Frase di test', translation: '', context: '', changes: '', realization },
    ]
    const sid = await approve(await submit(d))
    expect(await rpc('public.get_sign($1)', [sid])).toMatchObject({
      document: { examples: [{ realization: { annotations: realization.annotations } }] },
    })
    await expect(
      role('authenticated', admin, () =>
        rpc(
          "public.review_vocabulary('location','TEST_CONTEXT',false,'Contesto di test','Disattivazione di test')",
        ),
      ),
    ).rejects.toThrow('Valore usato in schede pubblicate')
    expect(
      await rpc("public.search_signs('REALIZZAZIONE TEST',$1)", [
        JSON.stringify([{ field_code: 'location', term_code: 'TEST_CONTEXT' }]),
      ]),
    ).toMatchObject({ total: 0 })
  })
})
