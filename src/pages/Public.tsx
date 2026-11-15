import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import * as Accordion from '@radix-ui/react-accordion'
import {
  ArrowRight,
  ArrowUpRight,
  SlidersHorizontal,
  ChevronDown,
  Check,
  Users,
  BookOpen,
  Fingerprint,
  MoveUpRight,
  MapPin,
  ScanFace,
  Compass,
  Download,
  RotateCcw,
} from 'lucide-react'
import { GROUPS, groupLabels, type Filter } from '../../supabase/functions/_shared/domain'
import { exportLisasVariant } from '../../supabase/functions/_shared/lisas'
import { dateLabel, useAsync, useVocabulary } from '../lib/context'
import { configuration, configured, getSign, searchSigns } from '../lib/api'
import { DocumentView } from '../components/DocumentView'
import {
  DownloadButton,
  EmptyState,
  Loading,
  Notice,
  PageHeading,
  SearchBox,
  SignCard,
} from '../components/ui'

const parameterDescriptions = {
  configuration: 'La forma che assume la mano.',
  movement: 'Come si muovono le mani.',
  location: 'Dove viene articolato il segno.',
  orientation: 'La direzione del palmo.',
  non_manual: 'Espressioni del viso e movimenti del corpo.',
}
const icons = {
  configuration: Fingerprint,
  movement: MoveUpRight,
  location: MapPin,
  orientation: Compass,
  non_manual: ScanFace,
}

export function Home() {
  const catalog = useAsync(() => searchSigns('', [], 0, 6), [])
  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="status-dot" /> Il database collaborativo della LIS
            </span>
            <h1>
              Ogni segno,
              <br />
              una nuova <em>prospettiva.</em>
            </h1>
            <p>
              Esplora il lessico della Lingua dei Segni Italiana.
              <br className="desktop-break" /> Cerca, scopri e contribuisci a una conoscenza
              condivisa.
            </p>
            <SearchBox />
            <Link className="hero-advanced" to="/esplora?avanzata=1">
              <SlidersHorizontal size={17} aria-hidden="true" /> Cerca attraverso i parametri del
              segno <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <div className="hero-footnote">
              <span>
                <Check size={15} aria-hidden="true" /> Consultazione libera
              </span>
              <span>
                <Check size={15} aria-hidden="true" /> Contributi aperti
              </span>
              <span>
                <Check size={15} aria-hidden="true" /> Revisione scientifica
              </span>
            </div>
          </div>
          <aside className="hero-panel" aria-label="I cinque parametri LISAS">
            <div className="panel-caption">
              UN SEGNO, CINQUE DIMENSIONI <span aria-hidden="true">↗</span>
            </div>
            {GROUPS.map((g, i) => {
              const Icon = icons[g]
              return (
                <Link to={`/esplora?avanzata=1#${g}`} className="hero-parameter" key={g}>
                  <span className="parameter-icon">
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{groupLabels[g]}</strong>
                    <small>{parameterDescriptions[g]}</small>
                  </span>
                  <span className="parameter-number">0{i + 1}</span>
                </Link>
              )
            })}
            <p>Il punto di partenza è la forma del segno.</p>
          </aside>
        </div>
      </section>
      <section className="container home-section">
        <div className="section-title">
          <div>
            <span className="eyebrow">Il lessico, una scheda alla volta</span>
            <h2>Esplora i segni</h2>
          </div>
          <Link to="/esplora" className="text-link">
            Vai al catalogo <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
        {catalog.loading ? (
          <Loading />
        ) : catalog.error ? (
          <Notice error>
            {catalog.error} <button onClick={catalog.retry}>Riprova</button>
          </Notice>
        ) : catalog.data?.results.length ? (
          <>
            <p className="muted">
              {catalog.data.total}{' '}
              {catalog.data.total === 1
                ? 'scheda pubblicata e validata.'
                : 'schede pubblicate e validate.'}
            </p>
            <div className="sign-grid">
              {catalog.data.results.map((s) => (
                <SignCard sign={s} key={s.id} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState />
        )}
      </section>
      <section className="container contribution-banner">
        <div className="banner-icon">
          <Users size={34} aria-hidden="true" />
        </div>
        <div>
          <span className="eyebrow">La conoscenza cresce con le persone</span>
          <h2>Un lessico che costruiamo insieme.</h2>
          <p>
            Proponi un segno, completa una scheda o suggerisci una correzione.
            <br />
            Ogni contributo passa attraverso una revisione.
          </p>
        </div>
        <Link className="button primary" to="/contribuisci">
          Dai il tuo contributo <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      </section>
      <section className="container principles">
        <article>
          <BookOpen size={23} aria-hidden="true" />
          <h3>Una risorsa per imparare</h3>
          <p>Schede chiare per studenti, docenti e per chi vuole avvicinarsi alla LIS.</p>
        </article>
        <article>
          <Fingerprint size={23} aria-hidden="true" />
          <h3>La lingua, nei suoi dettagli</h3>
          <p>Configurazione, movimento, luogo, orientamento e componenti non manuali.</p>
        </article>
        <article>
          <Check size={23} aria-hidden="true" />
          <h3>Dati con una provenienza</h3>
          <p>Annotazioni revisionate, fonti documentate e modifiche tracciabili.</p>
        </article>
      </section>
    </>
  )
}

export function Catalog() {
  const [params, setParams] = useSearchParams()
  const { fields, terms, loading, error, reload } = useVocabulary()
  const active = terms.filter((t) => t.active)
  const query = params.get('q') || ''
  const offset = Math.max(0, Number(params.get('pagina') || 0) * 24) || 0
  const set = (key: string, value: string) => {
    setParams((p) => {
      if (value) p.set(key, value)
      else p.delete(key)
      p.delete('pagina')
      return p
    })
  }
  const filters: Filter[] = []
  for (const key of [...GROUPS, ...fields.map((f) => `detail_${f.code}`)]) {
    try {
      const value = JSON.parse(params.get(key) || 'null') as Filter | null
      if (value && typeof value.field_code === 'string' && typeof value.term_code === 'string') {
        const f: Filter = { field_code: value.field_code, term_code: value.term_code }
        if (params.get('mano')) f.hand = params.get('mano') as Filter['hand']
        if (params.get('fase')) f.phase = params.get('fase') as Filter['phase']
        filters.push(f)
      }
    } catch {
      /* Un parametro URL estraneo non è un filtro linguistico. */
    }
  }
  const results = useAsync(
    () => searchSigns(query, filters, offset),
    [query, JSON.stringify(filters), offset],
  )
  const reset = () => setParams({})
  return (
    <div className="container page">
      <PageHeading eyebrow="Consulta il lessico" title="Esplora i segni">
        <p>Cerca una parola oppure parti dalla forma del segno. Puoi combinare più parametri.</p>
      </PageHeading>
      <SearchBox key={query} initial={query} compact />
      <Accordion.Root
        type="single"
        collapsible
        defaultValue={params.has('avanzata') || filters.length ? 'filters' : undefined}
        className="filter-box"
      >
        <Accordion.Item value="filters">
          <Accordion.Header>
            <Accordion.Trigger className="filter-trigger">
              <span>
                <SlidersHorizontal size={19} aria-hidden="true" /> Ricerca per parametri{' '}
                {filters.length > 0 && <span className="count">{filters.length}</span>}
              </span>
              <ChevronDown size={19} aria-hidden="true" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>
            <div className="filter-content">
              {loading ? (
                <Loading />
              ) : error ? (
                <Notice error>
                  {error} <button onClick={reload}>Riprova</button>
                </Notice>
              ) : (
                <>
                  {!active.length && (
                    <Notice>
                      I vocabolari verificati non sono ancora disponibili. La ricerca per glossa
                      resta utilizzabile.
                    </Notice>
                  )}
                  <div className="filter-grid">
                    {GROUPS.map((group) => (
                      <label key={group} className="field">
                        <span>{groupLabels[group]}</span>
                        <select
                          value={params.get(group) || ''}
                          onChange={(e) => set(group, e.target.value)}
                          disabled={
                            !active.some(
                              (t) => fields.find((f) => f.code === t.field_code)?.group === group,
                            )
                          }
                        >
                          <option value="">Qualsiasi</option>
                          {fields
                            .filter((f) => f.group === group)
                            .map((f) => (
                              <optgroup key={f.code} label={f.label}>
                                {active
                                  .filter((t) => t.field_code === f.code)
                                  .map((t) => (
                                    <option
                                      key={t.code}
                                      value={JSON.stringify({
                                        field_code: f.code,
                                        term_code: t.code,
                                      })}
                                    >
                                      {t.label}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                        </select>
                        <small>{parameterDescriptions[group]}</small>
                      </label>
                    ))}
                  </div>
                  <details className="fine-filters">
                    <summary>Dettagli: mano, fase e configurazione</summary>
                    <p className="muted">
                      I criteri si riferiscono alla stessa variante. La fase riguarda gli stati
                      articolatori; movimento e CNM descrivono il segno nel suo insieme.
                    </p>
                    <div className="filter-grid details-grid">
                      <label className="field">
                        Mano
                        <select
                          value={params.get('mano') || ''}
                          onChange={(e) => set('mano', e.target.value)}
                        >
                          <option value="">Qualsiasi mano</option>
                          <option value="dominant">Dominante</option>
                          <option value="non_dominant">Non dominante</option>
                        </select>
                      </label>
                      <label className="field">
                        Fase
                        <select
                          value={params.get('fase') || ''}
                          onChange={(e) => set('fase', e.target.value)}
                        >
                          <option value="">Qualsiasi fase</option>
                          <option value="initial">Iniziale</option>
                          <option value="final">Finale</option>
                        </select>
                      </label>
                      {fields
                        .filter((f) =>
                          ['finger_position', 'unselected_fingers', 'metacarpus'].includes(f.code),
                        )
                        .map((f) => (
                          <label className="field" key={f.code}>
                            {f.label}
                            <select
                              value={params.get(`detail_${f.code}`) || ''}
                              onChange={(e) => set(`detail_${f.code}`, e.target.value)}
                              disabled={!active.some((t) => t.field_code === f.code)}
                            >
                              <option value="">Qualsiasi</option>
                              {active
                                .filter((t) => t.field_code === f.code)
                                .map((t) => (
                                  <option
                                    value={JSON.stringify({
                                      field_code: f.code,
                                      term_code: t.code,
                                    })}
                                    key={t.code}
                                  >
                                    {t.label}
                                  </option>
                                ))}
                            </select>
                          </label>
                        ))}
                    </div>
                  </details>
                  <div className="filter-actions">
                    <span>I filtri selezionati si combinano tra loro (AND).</span>
                    <button className="text-link" onClick={reset}>
                      <RotateCcw size={15} aria-hidden="true" /> Azzera filtri e ricerca
                    </button>
                  </div>
                </>
              )}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
      <div className="results-heading">
        <h2>
          Risultati <span className="muted">{results.data ? `(${results.data.total})` : ''}</span>
        </h2>
        <span className="muted">Ordine alfabetico</span>
      </div>
      {results.loading ? (
        <Loading />
      ) : results.error ? (
        <Notice error>
          {results.error} <button onClick={results.retry}>Riprova</button>
        </Notice>
      ) : results.data?.results.length ? (
        <>
          <div className="sign-grid">
            {results.data.results.map((s) => (
              <SignCard sign={s} key={s.id} />
            ))}
          </div>
          <div className="pagination">
            <button
              className="button secondary"
              disabled={offset === 0}
              onClick={() =>
                setParams((p) => {
                  p.set('pagina', String(offset / 24 - 1))
                  return p
                })
              }
            >
              Precedente
            </button>
            <span>Pagina {offset / 24 + 1}</span>
            <button
              className="button secondary"
              disabled={offset + 24 >= results.data.total}
              onClick={() =>
                setParams((p) => {
                  p.set('pagina', String(offset / 24 + 1))
                  return p
                })
              }
            >
              Successiva
            </button>
          </div>
        </>
      ) : (
        <EmptyState filtered={Boolean(query || filters.length)} reset={reset} />
      )}
      {!configured && (
        <p className="setup-note">
          Il catalogo sarà disponibile dopo il collegamento al database del progetto.
        </p>
      )}
    </div>
  )
}

export function SignPage() {
  const { id = '' } = useParams()
  const sign = useAsync(() => getSign(id), [id])
  const [exporting, setExporting] = useState(false)
  if (sign.loading)
    return (
      <div className="container page">
        <Loading />
      </div>
    )
  if (sign.error)
    return (
      <div className="container page">
        <Notice error>
          {sign.error} <button onClick={sign.retry}>Riprova</button>
        </Notice>
      </div>
    )
  if (!sign.data)
    return (
      <div className="container page">
        <h1>Scheda non disponibile</h1>
        <Link to="/esplora">Torna ai segni pubblicati</Link>
      </div>
    )
  const s = sign.data
  const lisasExport = {
    format: 'lisas-adapter/manual-v1',
    lexical_id: s.id,
    revision: s.revision,
    variants: s.document.variants.map((v) => ({
      variant_id: v.id,
      ...exportLisasVariant(s.document, v),
    })),
  }
  return (
    <div className="container page">
      <Link className="back-link" to="/esplora">
        ← Tutti i segni
      </Link>
      <div className="sign-heading">
        <div>
          <span className="eyebrow">
            Scheda lessicale · <Check size={14} aria-hidden="true" /> Validata
          </span>
          <h1>{s.gloss}</h1>
          <p className="muted">
            Aggiornata il {dateLabel(s.updated_at)} · Revisione {s.revision}
          </p>
        </div>
        <Link className="button secondary" to={`/contribuisci?segno=${s.id}&tipo=correction`}>
          Suggerisci una correzione <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <DocumentView document={s.document} />
      <aside className="completion-banner">
        <div>
          <h3>Ogni dettaglio aiuta a conoscere la lingua.</h3>
          <p>Aiutaci a completare questa descrizione fonologica.</p>
          <small>
            Copertura dei gruppi di parametri: {s.completeness}%. Indica i gruppi documentati, non
            la completezza linguistica.
          </small>
        </div>
        <Link className="text-link" to={`/contribuisci?segno=${s.id}&tipo=completion`}>
          Completa la scheda <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </aside>
      <details
        className="export-details"
        open={exporting}
        onToggle={(e) => setExporting(e.currentTarget.open)}
      >
        <summary>Identificativi ed esportazione delle annotazioni</summary>
        <p className="muted">
          ID lessicale: <code>{s.id}</code>. L’identità del segno è indipendente dalla glossa
          italiana.
        </p>
        <p>
          L’esportazione conserva varianti, stati dei dati e realizzazioni contestuali nel formato
          di scambio LISAS Lexicon v1. L’adattamento allo schema LISAS definitivo richiede il suo
          schema formale verificato.
        </p>
        <DownloadButton
          value={{
            format: 'lisas-lexicon/1',
            lexical_id: s.id,
            revision: s.revision,
            validation: 'reviewed',
            document: s.document,
          }}
          name={`lisas-${s.id}.json`}
        >
          <Download size={16} aria-hidden="true" /> Esporta annotazioni
        </DownloadButton>
        <p>
          Adattatore ai percorsi del manuale operativo: include avvisi per i dati non
          rappresentabili e non certifica la conformit? a uno schema formale.
        </p>
        <DownloadButton value={lisasExport} name={`lisas-manuale-${s.id}.json`}>
          Esporta percorsi LISAS del manuale
        </DownloadButton>
      </details>
    </div>
  )
}

export function About() {
  return (
    <div className="container page reading-page">
      <PageHeading eyebrow="Il progetto" title="Una lingua viva. Un sapere condiviso.">
        <p>
          LISAS Lexicon nasce per rendere consultabile e costruire insieme un database lessicale
          della Lingua dei Segni Italiana.
        </p>
      </PageHeading>
      <section>
        <h2>Per chi studia, insegna e ricerca</h2>
        <p>
          Puoi cercare una glossa italiana oppure combinare i cinque parametri principali del segno:
          configurazione, movimento, luogo, orientamento e componenti non manuali. Una stessa glossa
          può corrispondere a segni diversi; ogni voce ha un proprio identificativo.
        </p>
      </section>
      <section>
        <h2>Lo schema LISAS</h2>
        <p>
          Le annotazioni distinguono la mano dominante dalla non dominante, gli stati iniziali da
          quelli finali e le forme lessicali dalle realizzazioni in una frase. I menu sono
          alimentati esclusivamente dai vocabolari revisionati del progetto.
        </p>
        <p>
          Il manuale operativo v1.0 e il lessico del progetto LISAS-ICL sono fonti per
          l’importazione. Il loro inventario di valori osservati non sostituisce uno schema formale
          completo: i dati importati attendono revisione prima di essere pubblicati.
        </p>
      </section>
      <section>
        <h2>Che cosa significa un dato mancante</h2>
        <p>
          «Non ancora documentato» indica che non abbiamo un’annotazione validata. «Assenza
          verificata» e «Non applicabile» sono stati distinti, disponibili solo nei parametri che li
          prevedono. Un campo vuoto non indica l’assenza di un fenomeno.
        </p>
      </section>
      <section>
        <h2>Come funziona la revisione</h2>
        <ol className="process-list">
          <li>
            <strong>Proponi.</strong> Aggiungi un segno, completa una descrizione o segnala una
            correzione. Non serve un account.
          </li>
          <li>
            <strong>Verifichiamo.</strong> Un amministratore controlla valori, provenienza e
            possibili duplicati. Può correggere la proposta o chiedere chiarimenti se hai lasciato
            un recapito.
          </li>
          <li>
            <strong>Condividiamo.</strong> Soltanto le proposte approvate aggiornano il catalogo.
            Ogni decisione e modifica resta nella cronologia di revisione.
          </li>
        </ol>
      </section>
      <section>
        <h2>Schede grammaticali e sviluppi futuri</h2>
        <p>
          I verbi possono includere classi verificate, descrizioni dell’accordo ed esempi con
          realizzazioni contestuali. L’architettura prevede riferimenti alla grammatica curata da
          Branchini e Mantovan e futuri video allineati. Le schede mostrano soltanto materiali
          effettivamente documentati.
        </p>
      </section>
      <Link className="button primary" to="/contribuisci">
        Partecipa al progetto <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </div>
  )
}
export function Privacy() {
  const complete = Boolean(
    configuration.controller && configuration.contact && configuration.retention,
  )
  return (
    <div className="container page reading-page">
      <PageHeading eyebrow="Trasparenza" title="Privacy e contributi" />
      {!complete && (
        <Notice>
          L’informativa è in preparazione. L’invio pubblico dei contributi resta disattivato fino al
          suo completamento e alla verifica del titolare.
        </Notice>
      )}
      <section>
        <h2>Titolare e contatti</h2>
        <p>{configuration.controller || 'Da indicare prima dell’apertura dei contributi.'}</p>
        <p>{configuration.contact || 'Recapito privacy da indicare.'}</p>
      </section>
      <section>
        <h2>Dati inviati con una proposta</h2>
        <p>
          Raccogliamo la proposta linguistica, le note, la data di invio e, solo se lo desideri, il
          tuo indirizzo email. L’email rimane riservata agli amministratori per eventuali
          chiarimenti e non compare nelle schede pubblicate. Evita di inserire dati personali nelle
          descrizioni e negli esempi destinati alla pubblicazione.
        </p>
        <p>
          Il controllo antispam usa Cloudflare Turnstile. I dati dei contributi sono conservati in
          Supabase; il sito statico è ospitato tramite GitHub Pages. Per limitare gli abusi il
          server conserva temporaneamente un identificativo derivato dall’indirizzo di rete, senza
          registrare l’indirizzo in chiaro nel database dei contributi.
        </p>
      </section>
      <section>
        <h2>Conservazione e richieste</h2>
        <p>
          {configuration.retention ||
            'Tempi di conservazione da definire prima della pubblicazione.'}
        </p>
        <p>
          Per richieste relative ai tuoi dati contatta il titolare indicando il codice della
          proposta. La configurazione del progetto deve completare e verificare finalità, base
          giuridica, destinatari, trasferimenti, diritti e modalità di reclamo prima di aprire la
          raccolta.
        </p>
      </section>
      <section>
        <h2>Memoria del browser</h2>
        <p>
          La consultazione pubblica non richiede un account. Il browser conserva la sessione
          soltanto dopo l’accesso amministrativo. Turnstile viene caricato nel riepilogo quando i
          contributi sono aperti.
        </p>
      </section>
    </div>
  )
}
