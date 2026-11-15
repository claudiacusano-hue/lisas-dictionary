import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { adminClient } from './admin-client'
import {
  flattenEntries,
  importLisas,
  parseExchange,
  stripVariantIds,
} from '../supabase/functions/_shared/lisas'
import { validateDocument } from '../supabase/functions/_shared/validation'
import type { VocabularyField, VocabularyTerm } from '../supabase/functions/_shared/domain'

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    output: { type: 'string', default: '.local/import' },
    source: { type: 'string' },
    apply: { type: 'boolean', default: false },
    exchange: { type: 'boolean', default: false },
  },
})
if (!values.input) {
  console.error(
    'Uso: npm run import:lisas -- --input <lessico.json> [--source <fonte>] [--output .local/import] [--exchange] [--apply]',
  )
  process.exit(1)
}
const bytes = await readFile(resolve(values.input))
const sha = createHash('sha256').update(bytes).digest('hex')
const raw = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
const source = values.source || `${basename(values.input)} · SHA-256 ${sha}`
let entries: ReturnType<typeof importLisas>[]
if (values.exchange) {
  const document = stripVariantIds(parseExchange(raw))
  entries = [
    {
      source_id: typeof raw.lexical_id === 'string' ? raw.lexical_id : sha,
      original: raw,
      document,
      terms: [],
      warnings: ['Scambio Lexicon v1: richiede gli stessi vocabolari già importati nel database.'],
    },
  ]
} else entries = flattenEntries(raw).map((e) => importLisas(e, source))
const ids = entries.map((e) => e.source_id)
if (new Set(ids).size !== ids.length)
  throw new Error('ID della fonte duplicati: nessuna importazione eseguita.')
const output = resolve(values.output!)
await mkdir(output, { recursive: true })
await writeFile(
  resolve(output, 'staging.json'),
  JSON.stringify({ format: 'lisas-staging/1', batch_sha256: sha, source, entries }, null, 2),
  'utf8',
)
await writeFile(
  resolve(output, 'report.json'),
  JSON.stringify(
    {
      batch_sha256: sha,
      source,
      entries: entries.length,
      warnings: entries
        .filter((e) => e.warnings.length)
        .map((e) => ({ source_id: e.source_id, gloss: e.document.gloss, warnings: e.warnings })),
    },
    null,
    2,
  ),
  'utf8',
)
console.log(
  `${entries.length} voci preparate; ${entries.filter((e) => e.warnings.length).length} con avvisi. Rapporto: ${resolve(output, 'report.json')}`,
)
if (!values.apply) {
  console.log('Solo analisi locale. Nessuna modifica a Supabase.')
  process.exit(0)
}
const db = await adminClient()
try {
  const fieldResult = await db.from('vocabulary_fields').select('*')
  if (fieldResult.error || !fieldResult.data) throw new Error('Vocabolari non disponibili.')
  const fields = fieldResult.data as VocabularyField[]
  const terms: VocabularyTerm[] = []
  for (let offset = 0; ; offset += 1000) {
    const page = await db
      .from('vocabulary_terms')
      .select('*')
      .order('field_code')
      .order('code')
      .range(offset, offset + 999)
    if (page.error || !page.data) throw new Error('Vocabolari non disponibili.')
    terms.push(...page.data)
    if (page.data.length < 1000) break
  }
  // Prevalidazione dell'intero batch prima della prima scrittura. Ogni voce è poi transazionale e idempotente.
  for (const e of entries) validateDocument(e.document, fields, [...terms, ...e.terms], true)
  for (const e of entries) {
    const { error } = await db.rpc('stage_lisas_import', {
      p_batch: sha,
      p_source_id: e.source_id,
      p_original: e.original,
      p_document: e.document,
      p_terms: e.terms,
      p_warnings: e.warnings,
    })
    if (error)
      throw new Error(
        `Importazione interrotta sulla voce ${e.source_id}: ${error.message}. Ripetere il comando per riprendere senza duplicati.`,
      )
  }
  console.log(
    `${entries.length} voci in coda privata. Nessun segno pubblicato e nessun valore attivato.`,
  )
} finally {
  await db.auth.signOut()
}
