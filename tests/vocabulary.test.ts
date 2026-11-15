import { describe, expect, it } from 'vitest'
import { vocabularyRequirements } from '../src/lib/vocabulary'
import { documentFixture, fields, terms } from './fixtures'

describe('vocabolari necessari alla pubblicazione', () => {
  it('distingue i percorsi, deduplica le varianti e identifica valori inattivi o mancanti', () => {
    const document = documentFixture()
    document.variants.push(structuredClone(document.variants[0]))
    document.variants[1].annotations.push(
      {
        field_code: 'location',
        term_code: 'TEST_CONFIG',
        state: 'documented',
        hand: 'dominant',
        phase: 'final',
      },
      {
        field_code: 'cnm_mouth',
        term_code: null,
        state: 'unknown',
        hand: 'non_manual',
        phase: 'whole',
      },
    )
    const vocabulary = terms.map((term) => ({
      ...term,
      active: term.field_code !== 'part_of_speech',
    }))
    const required = vocabularyRequirements(document, fields, vocabulary)
    expect(required).toHaveLength(4)
    expect(required.filter((term) => !term.term?.active)).toMatchObject([
      {
        field_code: 'part_of_speech',
        code: 'nome',
        fieldLabel: 'Categoria',
        term: { active: false },
      },
      { field_code: 'location', code: 'TEST_CONFIG', term: undefined },
    ])
    expect(required.some((term) => term.field_code === 'cnm_mouth')).toBe(false)
  })

  it('include classe verbale e valori usati soltanto nelle realizzazioni degli esempi', () => {
    const document = documentFixture()
    const lexical = structuredClone(document.variants[0])
    lexical.annotations = [
      {
        field_code: 'location',
        term_code: 'TEST_LEXICAL_CONTEXT',
        state: 'documented',
        hand: 'dominant',
        phase: 'initial',
      },
    ]
    const grammatical = structuredClone(lexical)
    grammatical.annotations[0].term_code = 'TEST_GRAMMAR_CONTEXT'
    const example = {
      sentence: 'Esempio tecnico',
      translation: '',
      context: '',
      changes: '',
      realization: lexical,
    }
    document.examples = [example]
    document.grammar = {
      class_code: 'TEST_VERB_CLASS',
      agreement: '',
      inflection: '',
      direction: '',
      examples: [{ ...example, realization: grammatical }],
    }
    const missing = vocabularyRequirements(document, fields, terms).filter((term) => !term.term)
    expect(missing).toMatchObject([
      { field_code: 'location', code: 'TEST_LEXICAL_CONTEXT' },
      { field_code: 'verb_class', code: 'TEST_VERB_CLASS' },
      { field_code: 'location', code: 'TEST_GRAMMAR_CONTEXT' },
    ])
  })
})
