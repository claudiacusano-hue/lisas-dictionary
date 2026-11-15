import type {
  SignDocument,
  Variant,
  VocabularyField,
  VocabularyTerm,
} from '../../supabase/functions/_shared/domain'

export function vocabularyRequirements(
  document: SignDocument,
  fields: VocabularyField[],
  terms: VocabularyTerm[],
) {
  const references = new Map<string, { field_code: string; code: string }>()
  const add = (field_code: string, code: string | null) => {
    if (code !== null) references.set(JSON.stringify([field_code, code]), { field_code, code })
  }
  const variant = (value: Variant) => {
    for (const annotation of value.annotations)
      if (annotation.state === 'documented') add(annotation.field_code, annotation.term_code)
  }
  add('part_of_speech', document.category)
  document.variants.forEach(variant)
  for (const example of document.examples) if (example.realization) variant(example.realization)
  if (document.grammar) {
    add('verb_class', document.grammar.class_code)
    for (const example of document.grammar.examples)
      if (example.realization) variant(example.realization)
  }
  return [...references.values()].map((reference) => ({
    ...reference,
    fieldLabel:
      fields.find((field) => field.code === reference.field_code)?.label || reference.field_code,
    term: terms.find(
      (term) => term.field_code === reference.field_code && term.code === reference.code,
    ),
  }))
}
