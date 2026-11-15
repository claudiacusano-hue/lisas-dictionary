/** Contratto condiviso dal client, dall'Edge Function e dall'importatore. */
export const GROUPS = [
  'configuration',
  'movement',
  'location',
  'orientation',
  'non_manual',
] as const
export type ParameterGroup = (typeof GROUPS)[number]
export type AnnotationState = 'documented' | 'unknown' | 'absent' | 'not_applicable'
export type Hand = 'dominant' | 'non_dominant' | 'non_manual'
export type Phase = 'initial' | 'final' | 'whole'
export interface VocabularyField {
  code: string
  group: ParameterGroup | 'grammar'
  label: string
  description: string
  scope: 'state' | 'movement' | 'non_manual' | 'lexical'
  multiple: boolean
  allows_absence: boolean
  lisas_path: string[]
}
export interface VocabularyTerm {
  field_code: string
  code: string
  label: string
  active: boolean
  source: string
}
export interface Annotation {
  field_code: string
  term_code: string | null
  hand: Hand
  phase: Phase
  state: AnnotationState
}
export interface Variant {
  id?: string
  label: string
  non_dominant_mode: 'unknown' | 'inactive' | 'symmetric' | 'explicit'
  dominant_final_same: boolean | null
  non_dominant_final_same: boolean | null
  annotations: Annotation[]
}
export interface Example {
  sentence: string
  translation: string
  context: string
  changes: string
  /** Realizzazione contestuale, distinta dalla forma lessicale. */
  realization?: Variant | null
}
export interface Grammar {
  class_code: string | null
  agreement: string
  inflection: string
  direction: string
  examples: Example[]
}
export interface Reference {
  title: string
  locator: string
  url: string
}
export interface SignDocument {
  gloss: string
  alternative_glosses: string[]
  category: string | null
  description: string
  source: string
  source_url: string
  variants: Variant[]
  grammar: Grammar | null
  examples: Example[]
  references: Reference[]
}
export type ProposalKind = 'new_sign' | 'completion' | 'correction'
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'needs_clarification'
export interface ProposalInput {
  kind: ProposalKind
  target_id: string | null
  base_revision: number | null
  document: SignDocument
  notes: string
  email: string
  consent: boolean
}
export interface SignSummary {
  id: string
  gloss: string
  category: string | null
  description: string
  revision: number
  updated_at: string
  completeness: number
  variant_count: number
}
export interface SignDetail extends SignSummary {
  document: SignDocument
}
export interface Filter {
  field_code: string
  term_code: string
  hand?: 'dominant' | 'non_dominant'
  phase?: 'initial' | 'final'
}
export interface Proposal {
  id: string
  kind: ProposalKind
  target_id: string | null
  base_revision: number | null
  document: SignDocument
  original_document: SignDocument
  notes: string
  email: string | null
  status: ProposalStatus
  version: number
  created_at: string
}
export interface Revision {
  id: number
  proposal_id: string
  sign_id: string | null
  action: string
  reason: string
  actor_id: string
  created_at: string
  before_document: SignDocument | null
  after_document: SignDocument | null
}
export const emptyVariant = (): Variant => ({
  label: 'Forma di citazione',
  non_dominant_mode: 'unknown',
  dominant_final_same: null,
  non_dominant_final_same: null,
  annotations: [],
})
export const emptyDocument = (): SignDocument => ({
  gloss: '',
  alternative_glosses: [],
  category: null,
  description: '',
  source: '',
  source_url: '',
  variants: [emptyVariant()],
  grammar: null,
  examples: [],
  references: [],
})
export const isVerb = (category: string | null) =>
  category === 'verbo' || category === 'espressione_verbale'
export const stateLabels: Record<AnnotationState, string> = {
  documented: 'Documentato e validato',
  unknown: 'Non ancora documentato',
  absent: 'Assenza verificata',
  not_applicable: 'Non applicabile (verificato)',
}
export const groupLabels: Record<ParameterGroup, string> = {
  configuration: 'Configurazione',
  movement: 'Movimento',
  location: 'Luogo',
  orientation: 'Orientamento',
  non_manual: 'Componenti non manuali',
}
export function matchesVariant(variant: Variant, filters: Filter[]): boolean {
  return filters.every((filter) =>
    variant.annotations.some(
      (a) =>
        a.state === 'documented' &&
        a.field_code === filter.field_code &&
        a.term_code === filter.term_code &&
        (!filter.hand ||
          a.hand === filter.hand ||
          a.hand === 'non_manual' ||
          (filter.hand === 'non_dominant' &&
            variant.non_dominant_mode === 'symmetric' &&
            a.hand === 'dominant')) &&
        (!filter.phase ||
          a.phase === filter.phase ||
          a.phase === 'whole' ||
          (filter.phase === 'final' &&
            a.phase === 'initial' &&
            ((a.hand === 'dominant'
              ? variant.dominant_final_same
              : variant.non_dominant_final_same) === true ||
              ((a.hand === 'dominant'
                ? variant.dominant_final_same
                : variant.non_dominant_final_same) === false &&
                !variant.annotations.some(
                  (end) =>
                    end.hand === a.hand && end.phase === 'final' && end.field_code === a.field_code,
                ))))),
    ),
  )
}
export function matchesFilters(document: SignDocument, filters: Filter[]): boolean {
  return document.variants.some((v) => matchesVariant(v, filters))
}
