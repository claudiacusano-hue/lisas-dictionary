import * as Tabs from '@radix-ui/react-tabs'
import { Check, Info } from 'lucide-react'
import { useVocabulary, displayValue } from '../lib/context'
import {
  GROUPS,
  groupLabels,
  isVerb,
  stateLabels,
  type Example,
  type SignDocument,
  type Variant,
} from '../../supabase/functions/_shared/domain'

export function ExampleList({ items, proposed = false }: { items: Example[]; proposed?: boolean }) {
  return items.length ? (
    <div className="example-list">
      {items.map((e, i) => (
        <article className="example" key={i}>
          <h4>{e.sentence}</h4>
          {e.translation && <p>{e.translation}</p>}
          {e.context && (
            <p>
              <strong>Contesto:</strong> {e.context}
            </p>
          )}
          {e.changes && (
            <p>
              <strong>Modificazioni osservate:</strong> {e.changes}
            </p>
          )}
          {e.realization && (
            <details>
              <summary>Realizzazione in questo contesto</summary>
              <VariantView variant={e.realization} proposed={proposed} />
            </details>
          )}
        </article>
      ))}
    </div>
  ) : (
    <p className="muted">Esempi non ancora documentati.</p>
  )
}
export function VariantView({
  variant,
  proposed = false,
}: {
  variant: Variant
  proposed?: boolean
}) {
  const { fields, terms } = useVocabulary()
  return (
    <div className="variant-view">
      <h3>{variant.label}</h3>
      <div className="variant-meta">
        <span>
          Mano non dominante:{' '}
          {
            {
              unknown: 'non documentata',
              inactive: proposed ? 'inattiva (da verificare)' : 'inattiva (verificato)',
              symmetric: 'simmetrica alla dominante',
              explicit: 'descritta separatamente',
            }[variant.non_dominant_mode]
          }
        </span>
        {variant.dominant_final_same === false && (
          <span>
            Mano dominante: lo stato finale riporta le differenze; gli altri parametri mantengono il
            valore iniziale, salvo indicazione di dato non documentato.
          </span>
        )}
        {variant.non_dominant_final_same === false && (
          <span>Mano non dominante: lo stato finale riporta le differenze.</span>
        )}
        {variant.dominant_final_same === true && (
          <span>Mano dominante: stato finale uguale all’iniziale.</span>
        )}
        {variant.non_dominant_final_same === true && (
          <span>Mano non dominante: stato finale uguale all’iniziale.</span>
        )}
      </div>
      <div className="parameter-list">
        {GROUPS.map((group) => (
          <section key={group} className="parameter-section">
            <h4>{groupLabels[group]}</h4>
            <dl>
              {fields
                .filter((f) => f.group === group)
                .map((f) => {
                  const entries = variant.annotations.filter((a) => a.field_code === f.code)
                  return (
                    <div key={f.code} className="parameter-row">
                      <dt>{f.label}</dt>
                      <dd>
                        {entries.length ? (
                          entries.map((a, i) => (
                            <span
                              className={`annotation ${a.state === 'unknown' ? 'muted' : ''}`}
                              key={i}
                            >
                              {a.hand !== 'non_manual' && (
                                <small>
                                  {a.hand === 'dominant' ? 'Dominante' : 'Non dominante'} ·{' '}
                                  {a.phase === 'initial'
                                    ? 'inizio'
                                    : a.phase === 'final'
                                      ? 'fine'
                                      : 'intero movimento'}
                                  :{' '}
                                </small>
                              )}
                              {a.state === 'documented'
                                ? terms.find(
                                    (t) => t.field_code === a.field_code && t.code === a.term_code,
                                  )?.label || displayValue(a.term_code || '')
                                : proposed && a.state === 'absent'
                                  ? 'Proposta: fenomeno assente'
                                  : proposed && a.state === 'not_applicable'
                                    ? 'Proposta: non applicabile'
                                    : stateLabels[a.state]}
                            </span>
                          ))
                        ) : (
                          <span className="muted">Non ancora documentato</span>
                        )}
                      </dd>
                    </div>
                  )
                })}
              {!fields.some((f) => f.group === group) && (
                <div className="parameter-row">
                  <dt>Descrizione</dt>
                  <dd className="muted">Non ancora documentata</dd>
                </div>
              )}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
export function DocumentView({
  document: d,
  proposed = false,
}: {
  document: SignDocument
  proposed?: boolean
}) {
  const { terms } = useVocabulary()
  const classLabel = terms.find(
    (t) => t.field_code === 'verb_class' && t.code === d.grammar?.class_code,
  )?.label
  return (
    <div className="document-view">
      {proposed && (
        <p className="proposal-note">
          <Info size={16} aria-hidden="true" /> Proposta da verificare. Gli stati di assenza e i
          valori inseriti saranno validati in revisione.
        </p>
      )}
      {d.alternative_glosses.length > 0 && (
        <p>
          <strong>Glosse alternative:</strong> {d.alternative_glosses.join(', ')}
        </p>
      )}
      {d.description && <p className="description">{d.description}</p>}
      <Tabs.Root defaultValue="phonology">
        <Tabs.List className="tabs" aria-label="Sezioni della scheda">
          <Tabs.Trigger value="phonology">Descrizione fonologica</Tabs.Trigger>
          {isVerb(d.category) && <Tabs.Trigger value="grammar">Grammatica del verbo</Tabs.Trigger>}
          <Tabs.Trigger value="examples">Esempi d’uso</Tabs.Trigger>
          <Tabs.Trigger value="sources">Fonti e riferimenti</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="phonology">
          {d.variants.map((v, i) => (
            <VariantView key={v.id || i} variant={v} proposed={proposed} />
          ))}
        </Tabs.Content>
        <Tabs.Content value="grammar">
          <div className="section-pad">
            <h3>Comportamento grammaticale</h3>
            <dl className="reading-list">
              {[
                ['Classe verbale', classLabel],
                ['Accordo', d.grammar?.agreement],
                ['Flessione', d.grammar?.inflection],
                ['Direzione del movimento e accordo', d.grammar?.direction],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || <span className="muted">Non ancora documentato</span>}</dd>
                </div>
              ))}
            </dl>
            <h3>Il verbo nei diversi contesti</h3>
            <ExampleList items={d.grammar?.examples || []} proposed={proposed} />
          </div>
        </Tabs.Content>
        <Tabs.Content value="examples">
          <div className="section-pad">
            <h3>Esempi d’uso</h3>
            <ExampleList items={d.examples} proposed={proposed} />
          </div>
        </Tabs.Content>
        <Tabs.Content value="sources">
          <div className="section-pad">
            <h3>Provenienza dei dati</h3>
            <p>{d.source || 'Provenienza non ancora documentata.'}</p>
            {d.source_url && (
              <a className="text-link" href={d.source_url} target="_blank" rel="noreferrer">
                Apri la fonte
              </a>
            )}
            <h3>Riferimenti bibliografici</h3>
            {d.references.length ? (
              <ul>
                {d.references.map((r, i) => (
                  <li key={i}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.title}
                      </a>
                    ) : (
                      r.title
                    )}
                    {r.locator && ` · ${r.locator}`}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nessun riferimento associato a questa scheda.</p>
            )}
            {!proposed && (
              <p className="validation-note">
                <Check size={16} aria-hidden="true" /> Scheda pubblicata dopo revisione
                amministrativa.
              </p>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
