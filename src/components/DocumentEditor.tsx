import { useId, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useVocabulary } from '../lib/context'
import {
  emptyVariant,
  GROUPS,
  groupLabels,
  isVerb,
  type Annotation,
  type AnnotationState,
  type Example,
  type Phase,
  type Hand,
  type SignDocument,
  type Variant,
  type VocabularyField,
} from '../../supabase/functions/_shared/domain'

function ControlledField({
  field,
  variant,
  hand,
  phase,
  onChange,
}: {
  field: VocabularyField
  variant: Variant
  hand: Hand
  phase: Phase
  onChange: (annotations: Annotation[]) => void
}) {
  const id = useId()
  const { terms } = useVocabulary()
  const options = terms.filter((t) => t.active && t.field_code === field.code)
  const rows = variant.annotations.filter(
    (a) => a.field_code === field.code && a.hand === hand && a.phase === phase,
  )
  const inherits =
    phase === 'final' &&
    (hand === 'dominant' ? variant.dominant_final_same : variant.non_dominant_final_same) === false
  const state = rows[0]?.state || (inherits ? 'inherit' : 'unknown')
  const update = (state: AnnotationState | 'inherit', codes: string[] = []) => {
    const others = variant.annotations.filter(
      (a) => !(a.field_code === field.code && a.hand === hand && a.phase === phase),
    )
    onChange([
      ...others,
      ...(state === 'documented'
        ? (codes.length ? codes : ['']).map((code) => ({
            field_code: field.code,
            term_code: code || null,
            hand,
            phase,
            state,
          }))
        : state === 'inherit'
          ? []
          : [{ field_code: field.code, term_code: null, hand, phase, state }]),
    ])
  }
  return (
    <fieldset className="controlled-field">
      <legend>{field.label}</legend>
      <p className="field-help" id={`${id}-help`}>
        {field.description}
      </p>
      <label className="sr-only" htmlFor={`${id}-state`}>
        Stato di {field.label}
      </label>
      <select
        id={`${id}-state`}
        aria-describedby={`${id}-help`}
        value={state}
        onChange={(e) => update(e.target.value as AnnotationState | 'inherit')}
      >
        {inherits && <option value="inherit">Come nello stato iniziale (non modificato)</option>}
        <option value="unknown">Non so / non documentato</option>
        <option value="documented" disabled={!options.length}>
          Propongo un valore
        </option>
        {field.allows_absence && (
          <>
            <option value="absent">Propongo: fenomeno assente</option>
            <option value="not_applicable">Propongo: non applicabile</option>
          </>
        )}
      </select>
      {!options.length && <small className="muted">Vocabolario in attesa di verifica.</small>}
      {state === 'documented' &&
        (field.multiple ? (
          <div className="checkbox-options" role="group" aria-label={`Valori di ${field.label}`}>
            {options.map((t) => (
              <label key={t.code}>
                <input
                  type="checkbox"
                  checked={rows.some((a) => a.term_code === t.code)}
                  onChange={(e) =>
                    update(
                      'documented',
                      e.target.checked
                        ? [...rows.flatMap((a) => (a.term_code ? [a.term_code] : [])), t.code]
                        : rows.flatMap((a) =>
                            a.term_code && a.term_code !== t.code ? [a.term_code] : [],
                          ),
                    )
                  }
                />
                {t.label}
              </label>
            ))}
          </div>
        ) : (
          <>
            <label className="sr-only" htmlFor={`${id}-value`}>
              Valore di {field.label}
            </label>
            <select
              id={`${id}-value`}
              value={rows[0]?.term_code || ''}
              onChange={(e) => update('documented', [e.target.value])}
            >
              <option value="">Seleziona un valore…</option>
              {options.map((t) => (
                <option value={t.code} key={t.code}>
                  {t.label}
                </option>
              ))}
              {rows[0]?.term_code && !options.some((t) => t.code === rows[0].term_code) && (
                <option disabled value={rows[0].term_code}>
                  Valore in attesa di verifica
                </option>
              )}
            </select>
          </>
        ))}
    </fieldset>
  )
}
export function VariantEditor({
  value: v,
  onChange,
}: {
  value: Variant
  onChange: (v: Variant) => void
}) {
  const { fields } = useVocabulary()
  const [hand, setHand] = useState<'dominant' | 'non_dominant'>('dominant')
  const [phase, setPhase] = useState<'initial' | 'final'>('initial')
  const currentHand = v.non_dominant_mode === 'explicit' ? hand : 'dominant'
  const finalSame = currentHand === 'dominant' ? v.dominant_final_same : v.non_dominant_final_same
  const setFinal = (same: boolean | null) =>
    onChange({
      ...v,
      [currentHand === 'dominant' ? 'dominant_final_same' : 'non_dominant_final_same']: same,
      annotations:
        same === true
          ? v.annotations.filter((a) => a.hand !== currentHand || a.phase !== 'final')
          : v.annotations,
    })
  return (
    <div className="variant-editor">
      <label className="field">
        Nome della variante
        <input
          value={v.label}
          maxLength={160}
          onChange={(e) => onChange({ ...v, label: e.target.value })}
        />
      </label>
      <label className="field">
        Mano non dominante
        <select
          value={v.non_dominant_mode}
          onChange={(e) => {
            const mode = e.target.value as Variant['non_dominant_mode']
            onChange({
              ...v,
              non_dominant_mode: mode,
              non_dominant_final_same: mode === 'explicit' ? v.non_dominant_final_same : null,
              annotations:
                mode === 'explicit'
                  ? v.annotations
                  : v.annotations.filter((a) => a.hand !== 'non_dominant'),
            })
          }}
        >
          <option value="unknown">Non ancora documentata</option>
          <option value="inactive">Inattiva</option>
          <option value="symmetric">Simmetrica alla dominante</option>
          <option value="explicit">Descrizione separata</option>
        </select>
      </label>
      <div className="editor-scope">
        <label className="field">
          Mano da descrivere
          <select value={currentHand} onChange={(e) => setHand(e.target.value as typeof hand)}>
            <option value="dominant">Dominante</option>
            <option value="non_dominant" disabled={v.non_dominant_mode !== 'explicit'}>
              Non dominante
            </option>
          </select>
        </label>
        <label className="field">
          Fase da descrivere
          <select value={phase} onChange={(e) => setPhase(e.target.value as typeof phase)}>
            <option value="initial">Stato iniziale</option>
            <option value="final">Stato finale</option>
          </select>
        </label>
        <label className="field">
          Lo stato finale coincide con l’iniziale?
          <select
            value={finalSame === null ? '' : String(finalSame)}
            onChange={(e) => setFinal(e.target.value === '' ? null : e.target.value === 'true')}
          >
            <option value="">Non documentato</option>
            <option value="true">Sì, coincide</option>
            <option value="false">No, descrivo le differenze</option>
          </select>
        </label>
      </div>
      <p className="field-help">
        Se lo stato finale è distinto, descrivi i parametri cambiati: gli altri mantengono il valore
        iniziale secondo il manuale LISAS. Puoi segnare esplicitamente un parametro finale come non
        documentato. Se la relazione tra gli stati non ? nota, non viene ereditato alcun valore.
      </p>
      {GROUPS.map((group) => {
        const members = fields.filter((f) => f.group === group)
        return (
          <section className="editor-group" key={group}>
            <h4>{groupLabels[group]}</h4>
            {group !== 'non_manual' &&
            group !== 'movement' &&
            phase === 'final' &&
            finalSame === true ? (
              <p className="muted">
                Stato finale uguale all’iniziale: vengono usati i valori iniziali.
              </p>
            ) : members.length ? (
              <div className="editor-field-grid">
                {members.map((f) => (
                  <ControlledField
                    key={`${f.code}/${currentHand}/${phase}`}
                    field={f}
                    variant={v}
                    hand={f.scope === 'non_manual' ? 'non_manual' : currentHand}
                    phase={f.scope === 'state' ? phase : 'whole'}
                    onChange={(annotations) => onChange({ ...v, annotations })}
                  />
                ))}
              </div>
            ) : (
              <p className="muted">Vocabolario non ancora disponibile.</p>
            )}
          </section>
        )
      })}
    </div>
  )
}
function ExampleEditor({
  items,
  onChange,
}: {
  items: Example[]
  onChange: (items: Example[]) => void
}) {
  return (
    <div className="example-editor">
      {items.map((e, i) => (
        <fieldset className="example-edit" key={i}>
          <legend>Esempio {i + 1}</legend>
          {(
            [
              ['sentence', 'Frase o glosse dell’esempio'],
              ['translation', 'Traduzione italiana'],
              ['context', 'Contesto'],
              ['changes', 'Modificazioni fonologiche o morfologiche osservate'],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <textarea
                value={e[key]}
                maxLength={2000}
                rows={2}
                onChange={(ev) =>
                  onChange(
                    items.map((old, index) =>
                      index === i ? { ...old, [key]: ev.target.value } : old,
                    ),
                  )
                }
              />
            </label>
          ))}
          <details>
            <summary>Annotazione della realizzazione contestuale</summary>
            <p className="field-help">
              Questa forma descrive l’esempio. Non sostituisce la forma lessicale e non entra nei
              filtri del catalogo.
            </p>
            {e.realization ? (
              <>
                <VariantEditor
                  value={e.realization}
                  onChange={(v) =>
                    onChange(
                      items.map((old, index) => (index === i ? { ...old, realization: v } : old)),
                    )
                  }
                />
                <button
                  type="button"
                  className="text-link danger"
                  onClick={() =>
                    onChange(
                      items.map((old, index) =>
                        index === i ? { ...old, realization: null } : old,
                      ),
                    )
                  }
                >
                  Rimuovi realizzazione
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  onChange(
                    items.map((old, index) =>
                      index === i ? { ...old, realization: emptyVariant() } : old,
                    ),
                  )
                }
              >
                Descrivi questa realizzazione
              </button>
            )}
          </details>
          <button
            type="button"
            className="text-link danger"
            onClick={() => onChange(items.filter((_, index) => index !== i))}
          >
            <Trash2 size={15} aria-hidden="true" /> Rimuovi esempio
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={items.length >= 30}
        onClick={() =>
          onChange([...items, { sentence: '', translation: '', context: '', changes: '' }])
        }
      >
        <Plus size={16} aria-hidden="true" /> Aggiungi esempio
      </button>
    </div>
  )
}
export function DocumentEditor({
  value: d,
  onChange,
}: {
  value: SignDocument
  onChange: (d: SignDocument) => void
}) {
  const { terms } = useVocabulary()
  const categories = terms.filter((t) => t.field_code === 'part_of_speech' && t.active)
  const update = <K extends keyof SignDocument>(key: K, value: SignDocument[K]) =>
    onChange({ ...d, [key]: value })
  const verb = isVerb(d.category)
  return (
    <div className="document-editor">
      <section className="form-section">
        <h2>Identità del segno</h2>
        <div className="form-grid">
          <label className="field">
            Glossa italiana <span aria-hidden="true">*</span>
            <input
              required
              maxLength={160}
              value={d.gloss}
              onChange={(e) => update('gloss', e.target.value)}
              autoComplete="off"
            />
            <small>La parola italiana aiuta a trovare il segno; non è il suo identificativo.</small>
          </label>
          <label className="field">
            Categoria grammaticale
            <select
              value={d.category || ''}
              onChange={(e) =>
                onChange({
                  ...d,
                  category: e.target.value || null,
                  grammar: isVerb(e.target.value) ? d.grammar : null,
                })
              }
            >
              <option value="">Non ancora documentata</option>
              {categories.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
              {d.category && !categories.some((t) => t.code === d.category) && (
                <option disabled value={d.category}>
                  Categoria da verificare: {d.category}
                </option>
              )}
            </select>
          </label>
        </div>
        <label className="field">
          Glosse alternative (una per riga)
          <textarea
            rows={2}
            maxLength={4800}
            value={d.alternative_glosses.join('\n')}
            onChange={(e) => update('alternative_glosses', e.target.value.split('\n'))}
            onBlur={() =>
              update(
                'alternative_glosses',
                d.alternative_glosses.map((g) => g.trim()).filter(Boolean),
              )
            }
          />
        </label>
        <label className="field">
          Descrizione del segno
          <textarea
            rows={3}
            maxLength={4000}
            value={d.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </label>
      </section>
      <section className="form-section">
        <h2>Descrizione fonologica</h2>
        <p className="muted">
          Compila soltanto ciò che conosci. Puoi lasciare i parametri non documentati. I valori
          vengono dal vocabolario verificato LISAS.
        </p>
        {d.variants.map((v, i) => (
          <details key={i} open={i === 0} className="variant-details">
            <summary>
              Variante {i + 1}: {v.label}
            </summary>
            <VariantEditor
              value={v}
              onChange={(value) =>
                update(
                  'variants',
                  d.variants.map((old, index) => (index === i ? value : old)),
                )
              }
            />
            {d.variants.length > 1 && (
              <button
                type="button"
                className="text-link danger"
                onClick={() =>
                  update(
                    'variants',
                    d.variants.filter((_, index) => index !== i),
                  )
                }
              >
                Rimuovi variante {i + 1}
              </button>
            )}
          </details>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={d.variants.length >= 12}
          onClick={() =>
            update('variants', [
              ...d.variants,
              { ...emptyVariant(), label: `Variante ${d.variants.length + 1}` },
            ])
          }
        >
          <Plus size={16} aria-hidden="true" /> Aggiungi variante
        </button>
      </section>
      {verb && (
        <section className="form-section">
          <h2>Grammatica del verbo</h2>
          <p className="muted">
            Descrivi solo comportamenti documentati. Puoi aggiungere realizzazioni diverse negli
            esempi.
          </p>
          {d.grammar ? (
            <>
              <label className="field">
                Classe verbale
                <select
                  value={d.grammar.class_code || ''}
                  onChange={(e) =>
                    update('grammar', { ...d.grammar!, class_code: e.target.value || null })
                  }
                >
                  <option value="">Non documentata</option>
                  {terms
                    .filter((t) => t.field_code === 'verb_class' && t.active)
                    .map((t) => (
                      <option value={t.code} key={t.code}>
                        {t.label}
                      </option>
                    ))}
                  {d.grammar.class_code &&
                    !terms.some(
                      (t) =>
                        t.field_code === 'verb_class' &&
                        t.code === d.grammar?.class_code &&
                        t.active,
                    ) && (
                      <option disabled value={d.grammar.class_code}>
                        Classe da verificare: {d.grammar.class_code}
                      </option>
                    )}
                </select>
              </label>
              {(
                [
                  ['agreement', 'Comportamento nell’accordo'],
                  ['inflection', 'Caratteristiche di flessione'],
                  ['direction', 'Direzione del movimento e accordo'],
                ] as const
              ).map(([key, label]) => (
                <label className="field" key={key}>
                  {label}
                  <textarea
                    rows={3}
                    maxLength={4000}
                    value={d.grammar![key]}
                    onChange={(e) => update('grammar', { ...d.grammar!, [key]: e.target.value })}
                  />
                </label>
              ))}
              <h3>Esempi e variazioni del verbo</h3>
              <ExampleEditor
                items={d.grammar.examples}
                onChange={(examples) => update('grammar', { ...d.grammar!, examples })}
              />
            </>
          ) : (
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                update('grammar', {
                  class_code: null,
                  agreement: '',
                  inflection: '',
                  direction: '',
                  examples: [],
                })
              }
            >
              Aggiungi descrizione grammaticale
            </button>
          )}
        </section>
      )}
      <section className="form-section">
        <h2>Esempi d’uso</h2>
        <ExampleEditor items={d.examples} onChange={(examples) => update('examples', examples)} />
      </section>
      <section className="form-section">
        <h2>Provenienza e riferimenti</h2>
        <label className="field">
          Provenienza dei dati
          <textarea
            rows={2}
            maxLength={1000}
            value={d.source}
            onChange={(e) => update('source', e.target.value)}
          />
          <small>
            Una fonte, un contesto di osservazione o una descrizione della verifica. Richiesta per
            pubblicare.
          </small>
        </label>
        <label className="field">
          Indirizzo della fonte (facoltativo)
          <input
            type="url"
            maxLength={1000}
            value={d.source_url}
            onChange={(e) => update('source_url', e.target.value)}
          />
        </label>
        {d.references.map((r, i) => (
          <fieldset className="reference-editor" key={i}>
            <legend>Riferimento {i + 1}</legend>
            {(
              [
                ['title', 'Titolo'],
                ['locator', 'Capitolo o sezione verificati'],
                ['url', 'Indirizzo web'],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type={key === 'url' ? 'url' : 'text'}
                  maxLength={key === 'title' ? 500 : key === 'url' ? 1000 : 300}
                  value={r[key]}
                  onChange={(e) =>
                    update(
                      'references',
                      d.references.map((old, index) =>
                        index === i ? { ...old, [key]: e.target.value } : old,
                      ),
                    )
                  }
                />
              </label>
            ))}
            <button
              type="button"
              className="text-link danger"
              onClick={() =>
                update(
                  'references',
                  d.references.filter((_, index) => index !== i),
                )
              }
            >
              Rimuovi riferimento
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={d.references.length >= 20}
          onClick={() =>
            update('references', [...d.references, { title: '', locator: '', url: '' }])
          }
        >
          Aggiungi riferimento verificato
        </button>
      </section>
    </div>
  )
}
