import {
  emptyDocument,
  isVerb,
  type SignDocument,
  type VocabularyTerm,
  type Annotation,
  type Variant,
} from './domain.ts'

/** Adattatore limitato ai percorsi effettivamente descritti nel manuale operativo.
 * Non è uno schema LISAS formale. I percorsi non gestiti sono segnalati e conservati nell'originale. */
export const mappings = [
  { code: 'selected_fingers', path: ['configurazione', 'selezione_dita'], scope: 'state' },
  { code: 'finger_position', path: ['configurazione', 'posizione_dita'], scope: 'state' },
  { code: 'unselected_fingers', path: ['configurazione', 'dita_non_selezionate'], scope: 'state' },
  { code: 'location', path: ['luogo'], scope: 'state' },
  { code: 'orientation', path: ['orientamento'], scope: 'state' },
  { code: 'metacarpus', path: ['metacarpo'], scope: 'state' },
  { code: 'movement_type', path: ['movimento', 'tipo'], scope: 'movement' },
  { code: 'movement_repeated', path: ['movimento', 'ripetuto'], scope: 'movement' },
  ...['bocca', 'guance', 'lingua', 'sopracciglia', 'testa', 'busto'].map((name, i) => ({
    code: ['cnm_mouth', 'cnm_cheeks', 'cnm_tongue', 'cnm_eyebrows', 'cnm_head', 'cnm_torso'][i],
    path: [name],
    scope: 'non_manual',
  })),
] as const
type RecordValue = Record<string, unknown>
const record = (v: unknown): v is RecordValue =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
export function flattenEntries(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.flatMap(flattenEntries)
  if (record(value) && typeof value.lemma === 'string') return [value]
  throw new Error(
    'Atteso un array di voci LISAS (anche annidato), con lemma e identificativo della fonte.',
  )
}
export interface ImportEntry {
  source_id: string
  original: RecordValue
  document: SignDocument
  terms: VocabularyTerm[]
  warnings: string[]
}
export function importLisas(original: RecordValue, source: string): ImportEntry {
  if (
    !['string', 'number'].includes(typeof original.id) ||
    String(original.id).length > 200 ||
    typeof original.lemma !== 'string'
  )
    throw new Error('Voce senza ID della fonte o lemma valido.')
  const document = emptyDocument()
  document.gloss = original.lemma
  document.category =
    typeof original.parte_del_discorso === 'string' ? original.parte_del_discorso : null
  document.source = source
  const warnings: string[] = []
  const terms: VocabularyTerm[] = []
  const consumed = new Set(['id', 'lemma', 'parte_del_discorso'])
  const addTerm = (field_code: string, value: string | boolean) => {
    const code = String(value)
    if (!terms.some((t) => t.field_code === field_code && t.code === code))
      terms.push({ field_code, code, label: code.replaceAll('_', ' '), active: false, source })
    return code
  }
  if (document.category) addTerm('part_of_speech', document.category)
  if (typeof original.tipo === 'string' && isVerb(document.category)) {
    document.grammar = {
      class_code: original.tipo,
      agreement: '',
      inflection: '',
      direction: '',
      examples: [],
    }
    addTerm('verb_class', original.tipo)
    consumed.add('tipo')
  }
  const variant = document.variants[0]
  const read = (root: unknown, path: string[]): unknown =>
    path.reduce<unknown>((o, k) => (record(o) ? o[k] : undefined), root)
  function collect(root: unknown, prefix: string, path: string[], out: Set<string>) {
    if (record(root)) {
      for (const [key, v] of Object.entries(root)) collect(v, prefix, [...path, key], out)
    } else out.add([prefix, ...path].join('.'))
  }
  const handledPaths = new Set<string>()
  function hand(root: unknown, name: 'dominant' | 'non_dominant', prefix: string) {
    if (!record(root)) {
      warnings.push(`${prefix}: descrizione della mano mancante.`)
      return
    }
    for (const phase of ['initial', 'final'] as const) {
      const phaseName = phase === 'initial' ? 'inizio' : 'fine'
      const state = root[phaseName]
      if (phase === 'final' && state === null) {
        if (name === 'dominant') variant.dominant_final_same = true
        else variant.non_dominant_final_same = true
        handledPaths.add(`${prefix}.fine`)
        continue
      }
      if (phase === 'final' && record(state)) {
        if (name === 'dominant') variant.dominant_final_same = false
        else variant.non_dominant_final_same = false
      }
      for (const m of mappings.filter((m) => m.scope === 'state')) {
        const value = read(state, [...m.path])
        const path = `${prefix}.${phaseName}.${m.path.join('.')}`
        if (typeof value === 'string') {
          variant.annotations.push({
            field_code: m.code,
            term_code: addTerm(m.code, value),
            hand: name,
            phase,
            state: 'documented',
          })
          handledPaths.add(path)
        } else if (value === null) {
          variant.annotations.push({
            field_code: m.code,
            term_code: null,
            hand: name,
            phase,
            state: 'unknown',
          })
          warnings.push(
            `${path}: null conservato nell’originale; nel modello resta non documentato.`,
          )
          handledPaths.add(path)
        }
      }
    }
    for (const m of mappings.filter((m) => m.scope === 'movement')) {
      const value = read(root, [...m.path])
      if (
        typeof value === 'string' ||
        (m.code === 'movement_repeated' && typeof value === 'boolean')
      ) {
        variant.annotations.push({
          field_code: m.code,
          term_code: addTerm(m.code, value),
          hand: name,
          phase: 'whole',
          state: 'documented',
        })
        handledPaths.add(`${prefix}.${m.path.join('.')}`)
      }
    }
  }
  if (record(original.mano)) {
    hand(original.mano.dominante, 'dominant', 'mano.dominante')
    const nd = original.mano.non_dominante
    if (record(nd)) {
      handledPaths.add('mano.non_dominante.attiva')
      const explicit = ['inizio', 'movimento', 'fine'].some((k) => k in nd)
      if (nd.attiva === false) {
        variant.non_dominant_mode = 'inactive'
        if (explicit || nd.relazione != null)
          warnings.push('Mano non dominante inattiva con campi aggiuntivi: richiede revisione.')
      } else if (nd.attiva === true && nd.relazione === 'simmetrica' && !explicit) {
        variant.non_dominant_mode = 'symmetric'
        handledPaths.add('mano.non_dominante.relazione')
      } else if (nd.attiva === true) {
        variant.non_dominant_mode = 'explicit'
        hand(nd, 'non_dominant', 'mano.non_dominante')
        if (nd.relazione != null)
          warnings.push(
            'Forma mista della mano non dominante: relazione e descrizione esplicita. Nessuna normalizzazione automatica.',
          )
      }
    }
    consumed.add('mano')
  }
  const cnm = original.componenti_non_manuali
  if (record(cnm)) {
    consumed.add('componenti_non_manuali')
    handledPaths.add('componenti_non_manuali.attiva')
    if (cnm.attiva === false && Object.keys(cnm).every((k) => k === 'attiva')) {
      for (const m of mappings.filter((m) => m.scope === 'non_manual'))
        variant.annotations.push({
          field_code: m.code,
          term_code: null,
          hand: 'non_manual',
          phase: 'whole',
          state: 'absent',
        })
    } else if (cnm.attiva === false) {
      warnings.push(
        'CNM inattive con articolatori aggiuntivi: dati contraddittori conservati nell’originale, senza inferire assenza.',
      )
    } else
      for (const m of mappings.filter((m) => m.scope === 'non_manual')) {
        const values = cnm[m.path[0]]
        if (Array.isArray(values) && values.every((v) => typeof v === 'string')) {
          for (const value of new Set(values as string[]))
            variant.annotations.push({
              field_code: m.code,
              term_code: addTerm(m.code, value),
              hand: 'non_manual',
              phase: 'whole',
              state: 'documented',
            })
          handledPaths.add(`componenti_non_manuali.${m.path[0]}`)
        }
      }
  }
  const actual = new Set<string>()
  if (original.mano) collect(original.mano, 'mano', [], actual)
  if (cnm) collect(cnm, 'componenti_non_manuali', [], actual)
  for (const path of actual)
    if (!handledPaths.has(path))
      warnings.push(`Percorso non mappato, conservato nell’originale: ${path}`)
  for (const key of Object.keys(original))
    if (!consumed.has(key)) warnings.push(`Metadato non mappato, conservato nell’originale: ${key}`)
  return { source_id: String(original.id), original, document, terms, warnings }
}
/** Formato di scambio v1: tutti gli stati/varianti restano espliciti, senza completamenti impliciti. */
export function parseExchange(value: unknown): SignDocument {
  if (!record(value) || value.format !== 'lisas-lexicon/1' || !record(value.document))
    throw new Error('Formato di scambio LISAS Lexicon v1 richiesto.')
  return value.document as unknown as SignDocument
}
export function exportLisasVariant(
  document: SignDocument,
  variant: Variant,
): { annotation: RecordValue; warnings: string[] } {
  const warnings: string[] = []
  const annotation: RecordValue = { lemma: document.gloss }
  if (document.category) annotation.parte_del_discorso = document.category
  if (document.grammar?.class_code) annotation.tipo = document.grammar.class_code
  const dominant: RecordValue = {}
  const nonDominant: RecordValue = {}
  const cnm: RecordValue = {}
  const hands: RecordValue = { dominante: dominant }
  const set = (root: RecordValue, path: string[], value: unknown) => {
    let cursor = root
    for (const key of path.slice(0, -1)) {
      if (!record(cursor[key])) cursor[key] = {}
      cursor = cursor[key] as RecordValue
    }
    cursor[path.at(-1)!] = value
  }
  for (const a of variant.annotations) {
    const m = mappings.find((m) => m.code === a.field_code)
    if (!m) {
      warnings.push(`Parametro non esportabile: ${a.field_code}`)
      continue
    }
    if (a.state !== 'documented') {
      if (a.state !== 'absent' || a.hand !== 'non_manual')
        warnings.push(`${a.field_code}: stato ${a.state} conservato nel formato di scambio.`)
      continue
    }
    const value = a.field_code === 'movement_repeated' ? a.term_code === 'true' : a.term_code
    if (a.hand === 'non_manual') {
      const key = m.path[0]
      cnm[key] = [...(Array.isArray(cnm[key]) ? (cnm[key] as string[]) : []), String(value)]
    } else {
      const root = a.hand === 'dominant' ? dominant : nonDominant
      set(
        root,
        m.scope === 'state' ? [a.phase === 'initial' ? 'inizio' : 'fine', ...m.path] : [...m.path],
        value,
      )
    }
  }
  if (variant.dominant_final_same === true) dominant.fine = null
  else if (variant.dominant_final_same === false && !record(dominant.fine)) dominant.fine = {}
  if (variant.non_dominant_mode === 'inactive') hands.non_dominante = { attiva: false }
  else if (variant.non_dominant_mode === 'symmetric')
    hands.non_dominante = { attiva: true, relazione: 'simmetrica' }
  else if (variant.non_dominant_mode === 'explicit') {
    nonDominant.attiva = true
    if (variant.non_dominant_final_same === true) nonDominant.fine = null
    else if (variant.non_dominant_final_same === false && !record(nonDominant.fine))
      nonDominant.fine = {}
    hands.non_dominante = nonDominant
  } else warnings.push('Mano non dominante non documentata: omessa.')
  annotation.mano = hands
  if (Object.keys(cnm).length) annotation.componenti_non_manuali = { attiva: true, ...cnm }
  else if (
    mappings
      .filter((m) => m.scope === 'non_manual')
      .every((m) =>
        variant.annotations.some((a) => a.field_code === m.code && a.state === 'absent'),
      )
  )
    annotation.componenti_non_manuali = { attiva: false }
  else warnings.push('CNM non completamente documentate: nessuna assenza inferita.')
  return { annotation, warnings }
}
export const stripVariantIds = (d: SignDocument): SignDocument => ({
  ...d,
  variants: d.variants.map(({ id: _id, ...v }) => v),
})
export const documentedAnnotations = (annotations: Annotation[]) =>
  annotations.filter((a) => a.state === 'documented')
