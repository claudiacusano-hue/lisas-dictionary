import {
  isVerb,
  type ProposalInput,
  type SignDocument,
  type VocabularyField,
  type VocabularyTerm,
} from './domain.ts'

export class ValidationError extends Error {}
const fail = (message: string): never => {
  throw new ValidationError(message)
}
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail('Struttura dei dati non valida.')
const keys = (v: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    fail('La proposta contiene campi non previsti.')
}
const str = (v: unknown, label: string, max: number, min = 0): string =>
  typeof v === 'string' &&
  v.trim().length >= min &&
  v.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
    ? v
    : fail(`${label}: testo non valido o troppo lungo.`)
const arr = (v: unknown, max: number): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : fail('Numero di elementi non valido.')
const nullableBool = (v: unknown) => {
  if (v !== null && typeof v !== 'boolean') fail('Stato finale non valido.')
}
export const isUuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
function url(v: unknown) {
  const s = str(v, 'Indirizzo web', 1000)
  if (s) {
    try {
      if (!['https:', 'http:'].includes(new URL(s).protocol)) fail('Usa un indirizzo http o https.')
    } catch {
      fail('Indirizzo web non valido.')
    }
  }
}

export function validateDocument(
  value: unknown,
  fields: VocabularyField[],
  terms: VocabularyTerm[],
  allowInactive = false,
): SignDocument {
  const d = obj(value)
  keys(d, [
    'gloss',
    'alternative_glosses',
    'category',
    'description',
    'source',
    'source_url',
    'variants',
    'grammar',
    'examples',
    'references',
  ])
  str(d.gloss, 'Glossa', 160, 1)
  const glosses = arr(d.alternative_glosses, 30)
  glosses.forEach((g) => str(g, 'Glossa alternativa', 160, 1))
  if (new Set(glosses).size !== glosses.length)
    fail('Le glosse alternative devono essere distinte.')
  str(d.description, 'Descrizione', 4000)
  str(d.source, 'Provenienza', 1000)
  url(d.source_url)
  const term = (field: string, code: unknown) => {
    if (
      typeof code !== 'string' ||
      !terms.some((t) => t.field_code === field && t.code === code && (allowInactive || t.active))
    )
      fail(`Valore non ammesso per ${fields.find((f) => f.code === field)?.label || field}.`)
  }
  if (d.category !== null) term('part_of_speech', d.category)
  function variant(value: unknown) {
    const v = obj(value)
    keys(v, [
      'id',
      'label',
      'non_dominant_mode',
      'dominant_final_same',
      'non_dominant_final_same',
      'annotations',
    ])
    if (v.id !== undefined && !isUuid(v.id)) fail('Identificativo della variante non valido.')
    str(v.label, 'Nome variante', 160, 1)
    if (!['unknown', 'inactive', 'symmetric', 'explicit'].includes(v.non_dominant_mode as string))
      fail('Stato della mano non dominante non valido.')
    nullableBool(v.dominant_final_same)
    nullableBool(v.non_dominant_final_same)
    if (v.non_dominant_mode !== 'explicit' && v.non_dominant_final_same !== null)
      fail('Descrivi lo stato finale solo per una mano esplicita.')
    const seen = new Map<string, { state: unknown; codes: unknown[] }>()
    for (const annotation of arr(v.annotations, 200)) {
      const a = obj(annotation)
      keys(a, ['field_code', 'term_code', 'hand', 'phase', 'state'])
      const f = fields.find((f) => f.code === a.field_code && f.scope !== 'lexical')
      if (!f) fail('Parametro non previsto dallo schema attivo.')
      const field = f!
      if (!['documented', 'unknown', 'absent', 'not_applicable'].includes(a.state as string))
        fail('Stato del parametro non valido.')
      if (
        field.scope === 'non_manual'
          ? a.hand !== 'non_manual' || a.phase !== 'whole'
          : !['dominant', 'non_dominant'].includes(a.hand as string) ||
            !(field.scope === 'movement'
              ? a.phase === 'whole'
              : ['initial', 'final'].includes(a.phase as string))
      )
        fail('Mano o fase non consentita per il parametro.')
      if (a.hand === 'non_dominant' && v.non_dominant_mode !== 'explicit')
        fail('I parametri della seconda mano richiedono una descrizione esplicita.')
      if (
        a.phase === 'final' &&
        (a.hand === 'dominant' ? v.dominant_final_same : v.non_dominant_final_same) === true
      )
        fail('Lo stato finale coincide con quello iniziale: rimuovi i valori finali distinti.')
      if (a.state === 'documented') term(field.code, a.term_code)
      else if (a.term_code !== null)
        fail('Un parametro non documentato non può contenere un valore.')
      if (['absent', 'not_applicable'].includes(a.state as string) && !field.allows_absence)
        fail('Assenza non prevista per questo parametro.')
      const k = `${a.field_code}/${a.hand}/${a.phase}`
      const previous = seen.get(k)
      if (
        previous &&
        (!field.multiple ||
          a.state !== 'documented' ||
          previous.state !== 'documented' ||
          previous.codes.includes(a.term_code))
      )
        fail('Valori duplicati o stati incompatibili nello stesso parametro.')
      seen.set(k, { state: a.state, codes: [...(previous?.codes || []), a.term_code] })
    }
  }
  const variants = arr(d.variants, 12)
  if (!variants.length) fail('Inserisci almeno una variante.')
  variants.forEach(variant)
  const ids = variants.map((v) => obj(v).id).filter(Boolean)
  if (new Set(ids).size !== ids.length) fail('Varianti duplicate.')
  function examples(value: unknown) {
    for (const example of arr(value, 30)) {
      const e = obj(example)
      keys(e, ['sentence', 'translation', 'context', 'changes', 'realization'])
      str(e.sentence, 'Esempio', 2000, 1)
      str(e.translation, 'Traduzione', 2000)
      str(e.context, 'Contesto', 2000)
      str(e.changes, 'Modificazioni', 2000)
      if (e.realization != null) variant(e.realization)
    }
  }
  examples(d.examples)
  if (d.grammar !== null) {
    if (!isVerb(d.category as string | null))
      fail('La scheda grammaticale richiede una categoria verbale.')
    const g = obj(d.grammar)
    keys(g, ['class_code', 'agreement', 'inflection', 'direction', 'examples'])
    if (g.class_code !== null) term('verb_class', g.class_code)
    str(g.agreement, 'Accordo', 4000)
    str(g.inflection, 'Flessione', 4000)
    str(g.direction, 'Direzione', 4000)
    examples(g.examples)
  }
  for (const ref of arr(d.references, 20)) {
    const r = obj(ref)
    keys(r, ['title', 'locator', 'url'])
    str(r.title, 'Titolo', 500, 1)
    str(r.locator, 'Sezione', 300)
    url(r.url)
  }
  return value as SignDocument
}
export function validateProposal(
  value: unknown,
  fields: VocabularyField[],
  terms: VocabularyTerm[],
): ProposalInput {
  const p = obj(value)
  keys(p, ['kind', 'target_id', 'base_revision', 'document', 'notes', 'email', 'consent'])
  if (!['new_sign', 'completion', 'correction'].includes(p.kind as string))
    fail('Tipo di contributo non valido.')
  if (
    p.kind === 'new_sign'
      ? p.target_id !== null || p.base_revision !== null
      : !isUuid(p.target_id) || !Number.isInteger(p.base_revision) || Number(p.base_revision) < 1
  )
    fail('Seleziona una scheda esistente aggiornata.')
  if (p.consent !== true) fail('Leggi e accetta l’informativa privacy prima di inviare.')
  str(p.notes, 'Note', 4000)
  const email = str(p.email, 'Email', 254)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Indirizzo email non valido.')
  validateDocument(p.document, fields, terms)
  return value as ProposalInput
}
