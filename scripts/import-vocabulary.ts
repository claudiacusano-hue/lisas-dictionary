import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { adminClient } from './admin-client'
import { mappings } from '../supabase/functions/_shared/lisas'

const { values } = parseArgs({
  options: { input: { type: 'string' }, apply: { type: 'boolean', default: false } },
})
if (!values.input)
  throw new Error('Uso: npm run import:vocabulary -- --input <vocabolario.json> [--apply]')
const bytes = await readFile(resolve(values.input))
if (bytes.length > 1048576)
  throw new Error('Vocabolario troppo grande: dividere in inventari più piccoli.')
const raw = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
const allowedFields = new Set([...mappings.map((m) => m.code), 'part_of_speech', 'verb_class'])
if (
  raw.format !== 'lisas-vocabulary/1' ||
  typeof raw.source !== 'string' ||
  raw.source.trim().length < 3 ||
  raw.source.length > 900 ||
  !Array.isArray(raw.terms) ||
  !raw.terms.length ||
  raw.terms.length > 5000
)
  throw new Error('Formato lisas-vocabulary/1 con fonte e termini richiesto.')
const seen = new Set<string>()
for (const t of raw.terms) {
  if (
    !t ||
    typeof t !== 'object' ||
    Array.isArray(t) ||
    Object.keys(t).some((k) => !['field_code', 'code', 'label'].includes(k)) ||
    !allowedFields.has(t.field_code) ||
    typeof t.code !== 'string' ||
    !t.code.trim() ||
    t.code.length > 200 ||
    typeof t.label !== 'string' ||
    !t.label.trim() ||
    t.label.length > 250
  )
    throw new Error(
      'Termine non valido o percorso non registrato. Non indovinare il percorso: aggiornare il registro verificato.',
    )
  const key = JSON.stringify([t.field_code, t.code])
  if (seen.has(key)) throw new Error('Valori duplicati nello stesso percorso.')
  seen.add(key)
}
const source = `${raw.source} · SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`
console.log(`${raw.terms.length} valori preparati dalla fonte indicata.`)
if (!values.apply) {
  console.log('Solo analisi. Nessun valore importato o attivato.')
  process.exit(0)
}
const client = await adminClient()
try {
  const { data, error } = await client.rpc('stage_vocabulary', {
    p_source: source,
    p_terms: raw.terms,
  })
  if (error) throw new Error(error.message)
  console.log(
    `${data} nuovi valori in attesa di revisione. Nessun valore attivato; i valori già presenti rimangono invariati.`,
  )
} finally {
  await client.auth.signOut()
}
