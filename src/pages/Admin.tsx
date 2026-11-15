import { useEffect, useState, type FormEvent } from 'react'
import { Link, Route, Routes, useParams } from 'react-router-dom'
import { LogOut, Check, X, MessageCircle, Save, ShieldCheck, ArrowRight } from 'lucide-react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  supabase,
  getProposal,
  getSign,
  searchSigns,
  proposals,
  revisions,
  editProposal,
  moderate,
  reviewTerm,
  getImportContext,
} from '../lib/api'
import { useAsync, useVocabulary, dateLabel } from '../lib/context'
import { documentLines } from '../lib/diff'
import { DocumentEditor } from '../components/DocumentEditor'
import { DocumentView } from '../components/DocumentView'
import { DownloadButton, Loading, Notice, PageHeading } from '../components/ui'
import { kindLabels } from './Contribute'
import { validateDocument } from '../../supabase/functions/_shared/validation'
import type {
  ProposalStatus,
  Proposal,
  SignDocument,
  VocabularyTerm,
} from '../../supabase/functions/_shared/domain'

const statusLabels: Record<ProposalStatus, string> = {
  pending: 'In attesa',
  approved: 'Approvata',
  rejected: 'Rifiutata',
  needs_clarification: 'In attesa di chiarimenti',
}
export function Admin() {
  const [auth, setAuth] = useState<'loading' | 'login' | 'admin' | 'denied'>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { reload } = useVocabulary()
  useEffect(() => {
    if (!supabase) {
      setAuth('login')
      return
    }
    let active = true
    const check = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase!.auth.getUser()
        if (!active) return
        if (error || !user) {
          setAuth('login')
          return
        }
        const role = await supabase!.rpc('is_admin')
        if (active) {
          setAuth(!role.error && role.data === true ? 'admin' : 'denied')
          reload()
        }
      } catch {
        if (active) {
          setAuth('login')
          setError('Non è stato possibile verificare la sessione.')
        }
      }
    }
    void check()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (active) void check()
      }, 0)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [reload])
  const signIn = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setPassword('')
    if (error) setError('Accesso non riuscito. Controlla email e password.')
    setBusy(false)
  }
  const signOut = async () => {
    setError('')
    const result = await supabase?.auth.signOut()
    if (result?.error) {
      setError('Uscita non riuscita. Riprova.')
      return
    }
    setAuth('login')
    reload()
  }
  if (auth === 'loading')
    return (
      <div className="container page">
        <Loading />
      </div>
    )
  if (auth === 'login' || auth === 'denied')
    return (
      <div className="container page narrow">
        <PageHeading eyebrow="Area riservata" title="Amministrazione">
          <p>L’accesso è riservato ai revisori autorizzati del progetto.</p>
        </PageHeading>
        {!supabase && <Notice>Il servizio di autenticazione non è ancora collegato.</Notice>}
        {auth === 'denied' ? (
          <>
            <Notice error>
              Il tuo account non ha il ruolo di amministratore. Il ruolo deve essere assegnato nel
              database dal responsabile del progetto.
            </Notice>
            <button className="button secondary" onClick={() => void signOut()}>
              Esci dall’account
            </button>
          </>
        ) : (
          <form className="login-form" onSubmit={(e) => void signIn(e)}>
            <label className="field">
              Email
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <Notice error>{error}</Notice>}
            <button className="button primary" disabled={!supabase || busy}>
              {busy ? 'Accesso…' : 'Accedi'}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <p className="field-help">
              Per recuperare l’accesso contatta il responsabile del progetto. La registrazione
              pubblica non è prevista.
            </p>
          </form>
        )}
      </div>
    )
  return (
    <div className="container page admin-page">
      <div className="admin-bar">
        <Link className="text-link" to="/admin">
          <ShieldCheck size={18} aria-hidden="true" /> Pannello di revisione
        </Link>
        <button className="text-link" onClick={() => void signOut()}>
          <LogOut size={16} aria-hidden="true" /> Esci
        </button>
      </div>
      {error && <Notice error>{error}</Notice>}
      <Routes>
        <Route index element={<Queue />} />
        <Route path="proposte/:id" element={<Review />} />
        <Route path="*" element={<p>Pagina amministrativa non trovata.</p>} />
      </Routes>
    </div>
  )
}
function Queue() {
  const [status, setStatus] = useState<ProposalStatus | 'all'>('pending')
  const [kind, setKind] = useState('all')
  const [offset, setOffset] = useState(0)
  const data = useAsync(() => proposals(status, kind, offset), [status, kind, offset])
  return (
    <>
      <PageHeading eyebrow="Validazione scientifica" title="Dai contributi al lessico.">
        <p>Verifica le proposte, confronta i dati e pubblica soltanto annotazioni controllate.</p>
      </PageHeading>
      <Tabs.Root defaultValue="queue">
        <Tabs.List className="tabs" aria-label="Strumenti amministrativi">
          <Tabs.Trigger value="queue">Proposte</Tabs.Trigger>
          <Tabs.Trigger value="vocabulary">Vocabolari controllati</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="queue">
          <div className="queue-filters">
            <label className="field">
              Stato
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as typeof status)
                  setOffset(0)
                }}
              >
                <option value="all">Tutti</option>
                {Object.entries(statusLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Tipo di contributo
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value)
                  setOffset(0)
                }}
              >
                <option value="all">Tutti</option>
                {Object.entries(kindLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {data.loading ? (
            <Loading />
          ) : data.error ? (
            <Notice error>
              {data.error}
              <button onClick={data.retry}>Riprova</button>
            </Notice>
          ) : (
            <>
              <p className="muted">{data.data?.total} proposte</p>
              <div className="proposal-list">
                {data.data?.results.length ? (
                  data.data.results.map((p) => (
                    <Link className="proposal-row" to={`/admin/proposte/${p.id}`} key={p.id}>
                      <div>
                        <span className="tag">{kindLabels[p.kind]}</span>
                        <h3>{p.document.gloss}</h3>
                        <small>{dateLabel(p.created_at)}</small>
                      </div>
                      <span>
                        {statusLabels[p.status]} <ArrowRight size={16} aria-hidden="true" />
                      </span>
                    </Link>
                  ))
                ) : (
                  <p>Nessuna proposta con questi filtri.</p>
                )}
              </div>
              <div className="pagination">
                <button
                  className="button secondary"
                  disabled={offset === 0}
                  onClick={() => setOffset((x) => x - 25)}
                >
                  Precedenti
                </button>
                <button
                  className="button secondary"
                  disabled={offset + 25 >= (data.data?.total || 0)}
                  onClick={() => setOffset((x) => x + 25)}
                >
                  Successive
                </button>
              </div>
            </>
          )}
        </Tabs.Content>
        <Tabs.Content value="vocabulary">
          <VocabularyReview />
        </Tabs.Content>
      </Tabs.Root>
    </>
  )
}
function VocabularyReview() {
  const { fields, terms, reload } = useVocabulary()
  const [field, setField] = useState('')
  const [onlyPending, setOnlyPending] = useState(true)
  const [selected, setSelected] = useState<VocabularyTerm | null>(null)
  const [label, setLabel] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const rows = terms.filter(
    (t) => (!field || t.field_code === field) && (!onlyPending || !t.active),
  )
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      await reviewTerm(selected, !selected.active, label, reason)
      setSelected(null)
      setReason('')
      reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="section-pad">
      <h2>Vocabolari e valori osservati</h2>
      <p>
        I valori importati sono inattivi. Verifica il percorso LISAS, la fonte e l’etichetta prima
        di renderli disponibili nei menu. L’attivazione non pubblica automaticamente alcuna scheda.
      </p>
      <div className="queue-filters">
        <label className="field">
          Parametro
          <select value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">Tutti i parametri</option>
            {fields.map((f) => (
              <option key={f.code} value={f.code}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => setOnlyPending(e.target.checked)}
          />
          Solo valori da verificare
        </label>
      </div>
      {selected && (
        <form className="vocabulary-edit" onSubmit={(e) => void save(e)}>
          <h3>
            {fields.find((f) => f.code === selected.field_code)?.label}: {selected.code}
          </h3>
          <p>
            <strong>Fonte:</strong> {selected.source}
          </p>
          <label className="field">
            Etichetta italiana
            <input
              required
              maxLength={250}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="field">
            Motivazione della verifica
            <textarea
              required
              minLength={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {error && <Notice error>{error}</Notice>}
          <div className="inline-actions">
            <button className="button primary" disabled={busy}>
              {selected.active ? 'Disattiva valore' : 'Approva e attiva valore'}
            </button>
            <button type="button" className="button secondary" onClick={() => setSelected(null)}>
              Annulla
            </button>
          </div>
        </form>
      )}
      <p className="muted">{rows.length} valori</p>
      <div className="vocabulary-list">
        {rows.map((t) => (
          <button
            className="vocabulary-row"
            key={`${t.field_code}/${t.code}`}
            onClick={() => {
              setSelected(t)
              setLabel(t.label)
              setReason('')
              setError('')
            }}
          >
            <span>
              <strong>{t.label}</strong>
              <small>
                {fields.find((f) => f.code === t.field_code)?.label} · {t.code}
              </small>
            </span>
            <span className="tag">{t.active ? 'Attivo' : 'Da verificare'}</span>
          </button>
        ))}
        {!rows.length && (
          <p>
            Nessun valore da mostrare. L’importatore prepara i vocabolari dalle fonti LISAS senza
            inventare valori.
          </p>
        )}
      </div>
    </section>
  )
}
function Review() {
  const { id = '' } = useParams()
  const state = useAsync(() => getProposal(id), [id])
  if (state.loading) return <Loading />
  if (state.error || !state.data)
    return (
      <Notice error>
        {state.error || 'Proposta non disponibile.'}
        <button onClick={state.retry}>Riprova</button>
      </Notice>
    )
  return (
    <ReviewDetail
      key={`${state.data.id}/${state.data.version}`}
      proposal={state.data}
      refresh={state.retry}
    />
  )
}
function ReviewDetail({ proposal: p, refresh }: { proposal: Proposal; refresh: () => void }) {
  const { fields, terms } = useVocabulary()
  const [document, setDocument] = useState(p.document)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [rebase, setRebase] = useState(false)
  const current = useAsync(
    () => (p.target_id ? getSign(p.target_id) : Promise.resolve(null)),
    [p.target_id],
  )
  const history = useAsync(() => revisions(p.id), [p.id, p.version])
  const duplicates = useAsync(() => searchSigns(p.document.gloss, [], 0, 12), [p.document.gloss])
  const imported = useAsync(() => getImportContext(p.id), [p.id])
  const before = current.data
    ? documentLines(current.data.document, fields, terms)
    : new Map<string, string>()
  const after = documentLines(document, fields, terms)
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
    (k) => (before.get(k) || '') !== (after.get(k) || ''),
  )
  const editable = p.status === 'pending' || p.status === 'needs_clarification'
  const dirty = JSON.stringify(document) !== JSON.stringify(p.document)
  const conflict = current.data && p.base_revision !== current.data.revision
  const save = async () => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      validateDocument(document, fields, terms)
      await editProposal(p, document, reason, rebase ? current.data?.revision || null : null)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const decide = async (action: string) => {
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await moderate(p, action, reason)
      setMessage('Decisione registrata.')
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Link className="back-link" to="/admin">
        ← Torna alle proposte
      </Link>
      <PageHeading
        eyebrow={`${kindLabels[p.kind]} · ${statusLabels[p.status]}`}
        title={p.document.gloss}
      >
        <p>
          Ricevuta il {dateLabel(p.created_at)} · versione della proposta {p.version}
        </p>
      </PageHeading>
      <div className="review-meta">
        <p>
          <strong>Note riservate:</strong> {p.notes || 'Nessuna nota.'}
        </p>
        <p>
          <strong>Recapito:</strong>{' '}
          {p.email ? (
            <a href={`mailto:${encodeURIComponent(p.email)}`}>{p.email}</a>
          ) : (
            'Non fornito'
          )}
        </p>
      </div>
      {current.error && (
        <Notice error>
          {current.error}
          <button onClick={current.retry}>Riprova</button>
        </Notice>
      )}
      {conflict && (
        <Notice error>
          La scheda è stata aggiornata dopo questa proposta (revisione corrente{' '}
          {current.data?.revision}). Confronta tutti i dati, integra le modifiche e salva una
          revisione della proposta prima di approvare.
        </Notice>
      )}
      {imported.error && (
        <Notice error>
          {imported.error}
          <button onClick={imported.retry}>Riprova</button>
        </Notice>
      )}
      {imported.data && (
        <section className="import-context">
          <h2>Fonte di importazione</h2>
          <p>
            ID nella fonte: {imported.data.source_id}. Batch:{' '}
            <code>{imported.data.batch_sha256}</code>
          </p>
          {imported.data.warnings.length > 0 && (
            <Notice>
              <strong>Avvisi da verificare</strong>
              <ul>
                {imported.data.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </Notice>
          )}
          <DownloadButton value={imported.data.original_lisas} name={`fonte-lisas-${p.id}.json`}>
            Scarica l’originale per la verifica
          </DownloadButton>
        </section>
      )}
      <section className="duplicates">
        <h2>Possibili duplicati</h2>
        {duplicates.loading ? (
          <Loading />
        ) : duplicates.error ? (
          <Notice error>
            {duplicates.error}
            <button onClick={duplicates.retry}>Riprova</button>
          </Notice>
        ) : duplicates.data?.results.filter((s) => s.id !== p.target_id).length ? (
          <ul>
            {duplicates.data.results
              .filter((s) => s.id !== p.target_id)
              .map((s) => (
                <li key={s.id}>
                  <Link to={`/segni/${s.id}`} target="_blank">
                    {s.gloss} · {s.id.slice(0, 8)}
                  </Link>
                </li>
              ))}
          </ul>
        ) : (
          <p className="muted">
            Nessuna altra scheda trovata per questa glossa. Controlla anche eventuali glosse
            alternative nel catalogo.
          </p>
        )}
      </section>
      <Tabs.Root defaultValue="compare">
        <Tabs.List className="tabs" aria-label="Revisione della proposta">
          <Tabs.Trigger value="compare">Confronto</Tabs.Trigger>
          <Tabs.Trigger value="preview">Scheda proposta</Tabs.Trigger>
          {editable && <Tabs.Trigger value="edit">Correggi proposta</Tabs.Trigger>}
          <Tabs.Trigger value="history">Cronologia</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="compare">
          <div className="section-pad">
            <h2>
              {p.target_id ? 'Modifiche rispetto alla scheda corrente' : 'Dati della nuova scheda'}
            </h2>
            {current.loading ? (
              <Loading />
            ) : (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Confronto dei dati, tabella scorrevole"
              >
                <table className="diff-table">
                  <thead>
                    <tr>
                      <th scope="col">Campo</th>
                      <th scope="col">Pubblicato</th>
                      <th scope="col">Proposto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changed.map((key) => (
                      <tr key={key}>
                        <th scope="row">{key}</th>
                        <td>{before.get(key) || 'Non documentato'}</td>
                        <td>{after.get(key) || 'Non documentato / rimosso'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!changed.length && <p>Nessuna differenza nei dati annotati.</p>}
              </div>
            )}
          </div>
        </Tabs.Content>
        <Tabs.Content value="preview">
          <DocumentView document={document} proposed />
        </Tabs.Content>
        {editable && (
          <Tabs.Content value="edit">
            <DocumentEditor value={document} onChange={setDocument} />
          </Tabs.Content>
        )}
        <Tabs.Content value="history">
          <div className="section-pad">
            <h2>Revisioni e decisioni</h2>
            {history.loading ? (
              <Loading />
            ) : history.error ? (
              <Notice error>{history.error}</Notice>
            ) : history.data?.length ? (
              <ol className="history-list">
                {history.data.map((r) => (
                  <li key={r.id}>
                    <strong>{r.action}</strong> · {dateLabel(r.created_at)}
                    <p>{r.reason}</p>
                    <small>Revisore {r.actor_id}</small>
                    {r.before_document && r.after_document && (
                      <details>
                        <summary>Vedi le modifiche di questa revisione</summary>
                        <HistoricalDiff before={r.before_document} after={r.after_document} />
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p>Nessuna decisione registrata.</p>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
      {editable && (
        <section className="moderation-actions">
          <h2>Decisione di revisione</h2>
          <label className="field">
            Motivazione (richiesta)
            <textarea
              minLength={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </label>
          {conflict && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rebase}
                onChange={(e) => setRebase(e.target.checked)}
              />
              Ho confrontato la revisione corrente e integrato i dati nella proposta modificata.
            </label>
          )}
          {dirty && <Notice>Ci sono modifiche da salvare prima della decisione.</Notice>}
          {error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          <div className="inline-actions">
            <button
              className="button secondary"
              disabled={busy || reason.trim().length < 3 || (!dirty && !rebase)}
              onClick={() => void save()}
            >
              <Save size={16} aria-hidden="true" /> Salva proposta corretta
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                dirty ||
                Boolean(conflict) ||
                reason.trim().length < 3 ||
                duplicates.loading ||
                Boolean(duplicates.error) ||
                Boolean(current.error) ||
                imported.loading ||
                Boolean(imported.error)
              }
              onClick={() => void decide('approved')}
            >
              <Check size={17} aria-hidden="true" /> Approva e pubblica
            </button>
            <button
              className="button secondary danger"
              disabled={busy || dirty || reason.trim().length < 3}
              onClick={() => void decide('rejected')}
            >
              <X size={17} aria-hidden="true" /> Rifiuta
            </button>
            <button
              className="button secondary"
              disabled={busy || dirty || !p.email || reason.trim().length < 3}
              onClick={() => void decide('needs_clarification')}
            >
              <MessageCircle size={17} aria-hidden="true" /> Richiedi chiarimenti
            </button>
          </div>
          <p className="field-help">
            La richiesta di chiarimenti registra lo stato. Se disponibile, apri il recapito per
            contattare il contributore: nessuna email viene inviata automaticamente.
          </p>
        </section>
      )}
    </>
  )
}
function HistoricalDiff({ before, after }: { before: SignDocument; after: SignDocument }) {
  const { fields, terms } = useVocabulary()
  const a = documentLines(before, fields, terms)
  const b = documentLines(after, fields, terms)
  const keys = [...new Set([...a.keys(), ...b.keys()])].filter(
    (k) => (a.get(k) || '') !== (b.get(k) || ''),
  )
  return (
    <ul>
      {keys.map((k) => (
        <li key={k}>
          <strong>{k}:</strong> {a.get(k) || 'Non documentato'} → {b.get(k) || 'Non documentato'}
        </li>
      ))}
    </ul>
  )
}
