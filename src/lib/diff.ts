import type {
  SignDocument,
  VocabularyField,
  VocabularyTerm,
  Variant,
  Example,
} from '../../supabase/functions/_shared/domain'
export function documentLines(
  d: SignDocument,
  fields: VocabularyField[],
  terms: VocabularyTerm[],
): Map<string, string> {
  const lines = new Map<string, string>()
  const term = (field: string, code: string | null) =>
    terms.find((t) => t.field_code === field && t.code === code)?.label || code || 'Non documentato'
  lines.set('Glossa', d.gloss)
  lines.set('Glosse alternative', d.alternative_glosses.join(', '))
  lines.set('Categoria', term('part_of_speech', d.category))
  lines.set('Descrizione', d.description)
  lines.set('Provenienza', d.source)
  lines.set('Indirizzo della fonte', d.source_url)
  function variant(v: Variant, prefix: string) {
    lines.set(`${prefix} · nome`, v.label)
    lines.set(
      `${prefix} · seconda mano`,
      {
        unknown: 'Non documentata',
        inactive: 'Inattiva',
        symmetric: 'Simmetrica',
        explicit: 'Descrizione separata',
      }[v.non_dominant_mode],
    )
    lines.set(
      `${prefix} · fine dominante uguale`,
      v.dominant_final_same === null ? 'Non documentato' : v.dominant_final_same ? 'Sì' : 'No',
    )
    lines.set(
      `${prefix} · fine non dominante uguale`,
      v.non_dominant_final_same === null
        ? 'Non documentato'
        : v.non_dominant_final_same
          ? 'Sì'
          : 'No',
    )
    for (const a of v.annotations) {
      const key = `${prefix} · ${fields.find((f) => f.code === a.field_code)?.label || a.field_code} · ${a.hand === 'dominant' ? 'dominante' : a.hand === 'non_dominant' ? 'non dominante' : 'non manuale'} · ${a.phase === 'initial' ? 'inizio' : a.phase === 'final' ? 'fine' : 'intero segno'}`
      const value =
        a.state === 'documented'
          ? term(a.field_code, a.term_code)
          : {
              unknown: 'Non documentato',
              absent: 'Assenza proposta',
              not_applicable: 'Non applicabile proposto',
            }[a.state]
      lines.set(key, lines.has(key) ? `${lines.get(key)}, ${value}` : value)
    }
  }
  function examples(items: Example[], prefix: string) {
    items.forEach((e, i) => {
      const p = `${prefix} ${i + 1}`
      lines.set(`${p} · frase`, e.sentence)
      lines.set(`${p} · traduzione`, e.translation)
      lines.set(`${p} · contesto`, e.context)
      lines.set(`${p} · modificazioni`, e.changes)
      if (e.realization) variant(e.realization, `${p} · realizzazione`)
    })
  }
  d.variants.forEach((v, i) => variant(v, `Variante ${i + 1}`))
  examples(d.examples, 'Esempio')
  if (d.grammar) {
    lines.set('Classe verbale', term('verb_class', d.grammar.class_code))
    lines.set('Accordo', d.grammar.agreement)
    lines.set('Flessione', d.grammar.inflection)
    lines.set('Direzione e accordo', d.grammar.direction)
    examples(d.grammar.examples, 'Esempio verbale')
  }
  d.references.forEach((r, i) =>
    lines.set(`Riferimento ${i + 1}`, [r.title, r.locator, r.url].filter(Boolean).join(' · ')),
  )
  return lines
}
