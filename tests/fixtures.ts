import {
  emptyDocument,
  emptyVariant,
  type SignDocument,
  type VocabularyField,
  type VocabularyTerm,
  type ProposalInput,
} from '../supabase/functions/_shared/domain'
// Valori esclusivamente tecnici, mai inclusi nei dati o nelle build dell'app.
export const fields: VocabularyField[] = [
  {
    code: 'selected_fingers',
    group: 'configuration',
    label: 'Dita selezionate',
    description: '',
    scope: 'state',
    multiple: false,
    allows_absence: false,
    lisas_path: ['configurazione', 'selezione_dita'],
  },
  {
    code: 'location',
    group: 'location',
    label: 'Luogo',
    description: '',
    scope: 'state',
    multiple: false,
    allows_absence: false,
    lisas_path: ['luogo'],
  },
  {
    code: 'cnm_mouth',
    group: 'non_manual',
    label: 'Bocca',
    description: '',
    scope: 'non_manual',
    multiple: true,
    allows_absence: true,
    lisas_path: ['bocca'],
  },
  {
    code: 'part_of_speech',
    group: 'grammar',
    label: 'Categoria',
    description: '',
    scope: 'lexical',
    multiple: false,
    allows_absence: false,
    lisas_path: ['parte_del_discorso'],
  },
]
export const terms: VocabularyTerm[] = [
  {
    field_code: 'selected_fingers',
    code: 'TEST_CONFIG',
    label: 'Configurazione di test',
    active: true,
    source: 'Fixture tecnica',
  },
  {
    field_code: 'location',
    code: 'TEST_LOCATION',
    label: 'Luogo di test',
    active: true,
    source: 'Fixture tecnica',
  },
  {
    field_code: 'cnm_mouth',
    code: 'TEST_MOUTH',
    label: 'Bocca di test',
    active: true,
    source: 'Fixture tecnica',
  },
  {
    field_code: 'part_of_speech',
    code: 'nome',
    label: 'Categoria di test',
    active: true,
    source: 'Fixture tecnica',
  },
]
export function documentFixture(gloss = 'VOCE DI TEST'): SignDocument {
  return {
    ...emptyDocument(),
    gloss,
    category: 'nome',
    source: 'Fixture tecnica, non dati linguistici',
    variants: [
      {
        ...emptyVariant(),
        annotations: [
          {
            field_code: 'selected_fingers',
            term_code: 'TEST_CONFIG',
            hand: 'dominant',
            phase: 'initial',
            state: 'documented',
          },
          {
            field_code: 'location',
            term_code: 'TEST_LOCATION',
            hand: 'dominant',
            phase: 'initial',
            state: 'documented',
          },
        ],
      },
    ],
  }
}
export const proposalFixture = (): ProposalInput => ({
  kind: 'new_sign',
  target_id: null,
  base_revision: null,
  document: documentFixture(),
  notes: '',
  email: '',
  consent: true,
})
