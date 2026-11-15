import { describe, expect, it } from 'vitest'
import { matchesFilters } from '../supabase/functions/_shared/domain'
import { validateDocument, validateProposal } from '../supabase/functions/_shared/validation'
import { documentFixture, fields, terms, proposalFixture } from './fixtures'

describe('filtri sulla stessa variante', () => {
  const filters = [
    { field_code: 'selected_fingers', term_code: 'TEST_CONFIG' },
    { field_code: 'location', term_code: 'TEST_LOCATION' },
  ]
  it('combina in AND', () => {
    expect(matchesFilters(documentFixture(), filters)).toBe(true)
    expect(
      matchesFilters(documentFixture(), [
        ...filters,
        { field_code: 'cnm_mouth', term_code: 'TEST_MOUTH' },
      ]),
    ).toBe(false)
  })
  it('non combina proprietà di varianti diverse', () => {
    const d = documentFixture()
    const v = structuredClone(d.variants[0])
    d.variants[0].annotations.pop()
    v.annotations.shift()
    d.variants.push(v)
    expect(matchesFilters(d, filters)).toBe(false)
  })
  it('non interpreta un valore mancante come assenza', () => {
    const d = documentFixture()
    d.variants[0].annotations[0] = {
      field_code: 'selected_fingers',
      term_code: null,
      state: 'unknown',
      hand: 'dominant',
      phase: 'initial',
    }
    expect(matchesFilters(d, [filters[0]])).toBe(false)
    expect(validateDocument(d, fields, terms)).toBe(d)
  })
  it('rispetta mano, fase e stato finale uguale all’iniziale', () => {
    const d = documentFixture()
    expect(matchesFilters(d, [{ ...filters[0], phase: 'final' }])).toBe(false)
    d.variants[0].dominant_final_same = true
    expect(matchesFilters(d, [{ ...filters[0], phase: 'final' }])).toBe(true)
    d.variants[0].non_dominant_mode = 'symmetric'
    expect(matchesFilters(d, [{ ...filters[0], hand: 'non_dominant' }])).toBe(true)
  })
  it('uno stato finale parziale eredita solo i parametri non sovrascritti', () => {
    const d = documentFixture()
    d.variants[0].dominant_final_same = false
    expect(matchesFilters(d, [{ ...filters[0], phase: 'final' }])).toBe(true)
    d.variants[0].annotations.push({
      field_code: 'selected_fingers',
      term_code: null,
      hand: 'dominant',
      phase: 'final',
      state: 'unknown',
    })
    expect(matchesFilters(d, [{ ...filters[0], phase: 'final' }])).toBe(false)
  })
})
describe('validazione controllata', () => {
  it('permette CNM multiple distinte e separa assenza da mancanza', () => {
    const d = documentFixture()
    const second = { ...terms[2], code: 'TEST_MOUTH_2' }
    d.variants[0].annotations.push(
      {
        field_code: 'cnm_mouth',
        term_code: 'TEST_MOUTH',
        hand: 'non_manual',
        phase: 'whole',
        state: 'documented',
      },
      {
        field_code: 'cnm_mouth',
        term_code: second.code,
        hand: 'non_manual',
        phase: 'whole',
        state: 'documented',
      },
    )
    expect(validateDocument(d, fields, [...terms, second])).toBe(d)
    d.variants[0].annotations.push({
      field_code: 'cnm_mouth',
      term_code: null,
      hand: 'non_manual',
      phase: 'whole',
      state: 'absent',
    })
    expect(() => validateDocument(d, fields, [...terms, second])).toThrow('incompatibili')
  })
  it('accetta una proposta valida senza email', () => {
    const p = proposalFixture()
    expect(validateProposal(p, fields, terms)).toBe(p)
  })
  it('rifiuta valori inattivi, inventati e nel percorso sbagliato', () => {
    const d = documentFixture()
    expect(() =>
      validateDocument(
        d,
        fields,
        terms.map((t) => ({ ...t, active: false })),
      ),
    ).toThrow('Valore non ammesso')
    d.variants[0].annotations[0].term_code = 'TEST_LOCATION'
    expect(() => validateDocument(d, fields, terms)).toThrow('Valore non ammesso')
  })
  it('rifiuta l’assenza per un parametro che non la prevede', () => {
    const d = documentFixture()
    Object.assign(d.variants[0].annotations[0], { state: 'absent', term_code: null })
    expect(() => validateDocument(d, fields, terms)).toThrow('Assenza non prevista')
  })
  it('rifiuta duplicati e valori singoli multipli', () => {
    const d = documentFixture()
    d.variants[0].annotations.push(d.variants[0].annotations[0])
    expect(() => validateDocument(d, fields, terms)).toThrow('duplicati')
  })
  it('rifiuta strutture arbitrarie, link eseguibili e consenso assente', () => {
    expect(() => validateDocument({ ...documentFixture(), admin: true }, fields, terms)).toThrow(
      'campi',
    )
    expect(() =>
      validateDocument({ ...documentFixture(), source_url: 'javascript:alert(1)' }, fields, terms),
    ).toThrow()
    expect(() => validateProposal({ ...proposalFixture(), consent: false }, fields, terms)).toThrow(
      'privacy',
    )
  })
})
