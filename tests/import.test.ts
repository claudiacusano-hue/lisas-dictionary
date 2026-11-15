import { describe, expect, it } from 'vitest'
import {
  flattenEntries,
  importLisas,
  exportLisasVariant,
  parseExchange,
} from '../supabase/functions/_shared/lisas'

// Strutture sintetiche di test, non voci linguistiche da distribuire.
const source = {
  id: 7,
  lemma: 'FIXTURE',
  parte_del_discorso: 'nome',
  mano: {
    dominante: {
      inizio: { configurazione: { selezione_dita: 'TEST_CONFIG' }, luogo: 'TEST_LOCATION' },
      movimento: { tipo: 'TEST_MOVEMENT', ripetuto: false },
      fine: null,
    },
    non_dominante: { attiva: true, relazione: 'simmetrica' },
  },
  componenti_non_manuali: { attiva: false },
}
describe('adattatore LISAS con provenienza', () => {
  it('gestisce liste annidate senza rinumerare la fonte', () => {
    expect(flattenEntries([[source]])).toEqual([source])
    expect(importLisas(source, 'Fonte del test').source_id).toBe('7')
  })
  it('mantiene booleane, null finali e simmetria nel roundtrip dei percorsi gestiti', () => {
    const e = importLisas(source, 'Fonte')
    const back = exportLisasVariant(e.document, e.document.variants[0])
    expect(back.annotation).toEqual({ ...source, id: undefined })
    expect(e.terms.every((t) => !t.active)).toBe(true)
  })
  it('segnala campi non gestiti senza cancellare gli originali', () => {
    const raw = { ...source, altro: { test: 'valore' } }
    const e = importLisas(raw, 'Fonte')
    expect(e.warnings.some((w) => w.includes('altro'))).toBe(true)
    expect(e.original).toEqual(raw)
  })
  it('non interpreta null o omissioni come assenza', () => {
    const e = importLisas(
      {
        id: 1,
        lemma: 'FIXTURE',
        mano: {
          dominante: { inizio: { luogo: null } },
          non_dominante: { attiva: true, inizio: {} },
        },
      },
      'Fonte',
    )
    expect(e.document.variants[0].dominant_final_same).toBeNull()
    expect(e.document.variants[0].annotations[0]).toMatchObject({
      state: 'unknown',
      term_code: null,
    })
    expect(e.warnings.some((w) => w.includes('null'))).toBe(true)
  })
  it('non ricava realizzazioni contestuali dalle sole voci lessicali', () => {
    const e = importLisas(source, 'Fonte')
    expect(e.document.examples).toEqual([])
    expect(parseExchange({ format: 'lisas-lexicon/1', document: e.document })).toEqual(e.document)
  })
})
