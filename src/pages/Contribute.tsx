import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Send, Plus, Pencil, ListPlus } from 'lucide-react'
import {
  emptyDocument,
  type ProposalInput,
  type ProposalKind,
} from '../../supabase/functions/_shared/domain'
import { validateDocument, validateProposal } from '../../supabase/functions/_shared/validation'
import {
  contributionsOpen,
  getSign,
  searchSigns,
  submitAdminProposal,
  submitProposal,
} from '../lib/api'
import { useAsync, useVocabulary } from '../lib/context'
import { DocumentEditor } from '../components/DocumentEditor'
import { DocumentView } from '../components/DocumentView'
import { Turnstile } from '../components/Turnstile'
import { Loading, Notice, PageHeading } from '../components/ui'

export const kindLabels = {
  new_sign: 'Nuovo segno',
  completion: 'Completamento',
  correction: 'Correzione',
}
export function Contribute({ administrative = false }: { administrative?: boolean }) {
  const stepLabels = [
    'Scegli il contributo',
    'Descrivi il segno',
    administrative ? 'Rivedi e salva' : 'Rivedi e invia',
  ]
  const [params] = useSearchParams()
  const { fields, terms, error: vocabError, reload } = useVocabulary()
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<ProposalKind>(
    params.get('tipo') === 'correction'
      ? 'correction'
      : params.has('segno')
        ? 'completion'
        : 'new_sign',
  )
  const [document, setDocument] = useState(emptyDocument)
  const [target, setTarget] = useState<string | null>(null)
  const [base, setBase] = useState<number | null>(null)
  const [lookup, setLookup] = useState('')
  const [debounced, setDebounced] = useState('')
  const [notes, setNotes] = useState('')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [token, setToken] = useState('')
  const [website, setWebsite] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(lookup), 300)
    return () => clearTimeout(timer)
  }, [lookup])
  const matches = useAsync(
    () =>
      kind === 'new_sign' || debounced.trim().length < 2
        ? Promise.resolve({ total: 0, results: [] })
        : searchSigns(debounced, [], 0, 10),
    [kind, debounced],
  )
  useEffect(() => {
    heading.current?.focus()
  }, [step, receipt])
  useEffect(() => {
    const id = params.get('segno')
    if (!id) return
    let active = true
    setBusy(true)
    getSign(id)
      .then((s) => {
        if (!active) return
        if (!s) throw new Error('Scheda non disponibile.')
        setDocument(s.document)
        setTarget(s.id)
        setBase(s.revision)
      })
      .catch(() => {
        if (active)
          setError('Non è stato possibile aprire la scheda. Cercala nel catalogo e riprova.')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [params])
  const selectSign = async (id: string) => {
    setBusy(true)
    setError('')
    try {
      const s = await getSign(id)
      if (!s) throw new Error('Scheda non disponibile.')
      setTarget(s.id)
      setBase(s.revision)
      setDocument(s.document)
      setLookup('')
    } catch {
      setError('Non è stato possibile caricare la scheda.')
    } finally {
      setBusy(false)
    }
  }
  const input = (): ProposalInput => ({
    kind,
    target_id: target,
    base_revision: base,
    document,
    notes,
    email,
    consent,
  })
  const next = () => {
    setError('')
    if (step === 0 && kind !== 'new_sign' && !target) {
      setError('Seleziona una scheda da completare o correggere.')
      return
    }
    try {
      if (step === 1) {
        validateDocument(document, fields, terms)
        if (administrative && notes.trim().length < 3)
          throw new Error('Inserisci una motivazione di almeno tre caratteri.')
      }
      setStep((x) => x + 1)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const send = async () => {
    if ((!administrative && !contributionsOpen) || busy) return
    setError('')
    try {
      if (administrative) {
        validateDocument(document, fields, terms)
        if (notes.trim().length < 3)
          throw new Error('Inserisci una motivazione di almeno tre caratteri.')
        setBusy(true)
        setReceipt(
          await submitAdminProposal({
            kind,
            target_id: target,
            base_revision: base,
            document,
            notes,
          }),
        )
        return
      }
      validateProposal(input(), fields, terms)
      if (!token) throw new Error('Completa il controllo antispam.')
      setBusy(true)
      setReceipt(await submitProposal(input(), token, website))
    } catch (e) {
      setError((e as Error).message)
      setToken('')
      setCaptchaReset((x) => x + 1)
    } finally {
      setBusy(false)
    }
  }
  if (receipt)
    return (
      <div className={administrative ? 'narrow' : 'container page narrow'}>
        <div className="success-state">
          <span className="success-icon">
            <Check size={32} aria-hidden="true" />
          </span>
          <h1 tabIndex={-1} ref={heading}>
            Grazie per il tuo contributo.
          </h1>
          <p>
            La proposta è stata ricevuta ed è in attesa di revisione. Sarà visibile nel catalogo
            soltanto dopo l’approvazione.
          </p>
          <p>Conserva questo codice per eventuali richieste:</p>
          <code className="receipt">{receipt}</code>
          <Link
            className="button primary"
            to={administrative ? `/admin/proposte/${receipt}` : '/esplora'}
          >
            {administrative ? 'Apri la proposta da revisionare' : 'Torna al catalogo'}{' '}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
    )
  if (!administrative && !contributionsOpen)
    return (
      <div className="container page narrow">
        <PageHeading
          eyebrow="Partecipa al lessico"
          title="I contributi pubblici non sono ancora aperti."
        >
          <p>
            Puoi consultare il catalogo. L’invio di nuove schede, completamenti e correzioni sarà
            disponibile all’apertura della raccolta.
          </p>
        </PageHeading>
        <Notice>
          Se sei una revisora o un revisore, accedi all’area amministrativa per completare o
          correggere una scheda.
        </Notice>
        <Link
          className="button primary"
          to={`/admin/contribuisci${params.size ? `?${params.toString()}` : ''}`}
        >
          Accedi per contribuire come revisore <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    )
  return (
    <div className={administrative ? 'form-page' : 'container page form-page'}>
      <PageHeading eyebrow="Partecipa al lessico" title="Ogni contributo conta.">
        <p>
          {administrative
            ? 'Prepara una proposta dal tuo account di revisore. Dopo il salvataggio potrai verificarla e approvarla nel pannello.'
            : 'Condividi ciò che conosci. Non serve un account e non occorre compilare tutti i parametri.'}
        </p>
      </PageHeading>
      {vocabError && (
        <Notice error>
          {vocabError} <button onClick={reload}>Riprova</button>
        </Notice>
      )}
      <ol className="steps" aria-label="Passaggi della proposta">
        {stepLabels.map((label, i) => (
          <li
            key={label}
            className={step === i ? 'current' : step > i ? 'done' : ''}
            aria-current={step === i ? 'step' : undefined}
          >
            <span>{step > i ? <Check size={16} aria-hidden="true" /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <h2 className="sr-only" ref={heading} tabIndex={-1}>
        {stepLabels[step]}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (step < 2) next()
          else void send()
        }}
      >
        {step === 0 && (
          <section className="form-section">
            <h2>Come vuoi contribuire?</h2>
            <div className="contribution-types">
              {(
                [
                  {
                    kind: 'new_sign',
                    label: 'Aggiungi un nuovo segno',
                    text: 'Proponi una voce che manca nel catalogo.',
                    icon: Plus,
                  },
                  {
                    kind: 'completion',
                    label: 'Completa una scheda',
                    text: 'Aggiungi informazioni non ancora documentate.',
                    icon: ListPlus,
                  },
                  {
                    kind: 'correction',
                    label: 'Suggerisci una correzione',
                    text: 'Proponi una modifica a una scheda pubblicata.',
                    icon: Pencil,
                  },
                ] as const
              ).map((item) => (
                <label
                  key={item.kind}
                  className={`contribution-type ${kind === item.kind ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={item.kind}
                    checked={kind === item.kind}
                    onChange={() => {
                      setKind(item.kind)
                      setError('')
                      if (item.kind === 'new_sign') {
                        setTarget(null)
                        setBase(null)
                        setDocument(emptyDocument())
                      }
                    }}
                  />
                  <item.icon size={24} aria-hidden="true" />
                  <strong>{item.label}</strong>
                  <span>{item.text}</span>
                </label>
              ))}
            </div>
            {kind !== 'new_sign' && (
              <div className="target-picker">
                {target && (
                  <Notice>
                    Scheda selezionata: <strong>{document.gloss}</strong> · revisione {base}
                  </Notice>
                )}
                <label className="field">
                  Cerca la scheda da {kind === 'completion' ? 'completare' : 'correggere'}
                  <input
                    type="search"
                    value={lookup}
                    maxLength={160}
                    onChange={(e) => setLookup(e.target.value)}
                    placeholder="Scrivi almeno due lettere…"
                  />
                </label>
                {matches.loading && lookup.length >= 2 && <Loading />}
                {matches.error && <Notice error>{matches.error}</Notice>}
                {matches.data?.results.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className="target-result"
                    disabled={busy}
                    onClick={() => void selectSign(s.id)}
                  >
                    <strong>{s.gloss}</strong>
                    <span>
                      {s.id.slice(0, 8)} · Seleziona <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </button>
                ))}
                {!matches.loading && debounced.length >= 2 && !matches.data?.results.length && (
                  <p className="muted">Nessuna scheda trovata. Prova un’altra glossa.</p>
                )}
              </div>
            )}
          </section>
        )}
        {step === 1 && (
          <>
            <DocumentEditor value={document} onChange={setDocument} />
            <section className="form-section">
              <h2>{administrative ? 'Motivazione del contributo' : 'Note per la revisione'}</h2>
              <label className="field">
                {administrative
                  ? 'Motivazione (richiesta)'
                  : 'Spiega la tua proposta (facoltativo)'}
                <textarea
                  required={administrative}
                  rows={4}
                  maxLength={4000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <small>
                  Queste note sono riservate alla moderazione e sono separate dai parametri
                  linguistici.
                </small>
              </label>
              {!administrative && (
                <label className="field">
                  La tua email (facoltativa)
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <small>Servirà soltanto per eventuali chiarimenti. Non sarà pubblicata.</small>
                </label>
              )}
            </section>
          </>
        )}
        {step === 2 && (
          <>
            <section className="form-section">
              <span className="tag">{kindLabels[kind]}</span>
              <h2>{document.gloss}</h2>
              <DocumentView document={document} proposed />
              {notes && (
                <p>
                  <strong>Note riservate:</strong> {notes}
                </p>
              )}
              {email && (
                <p>
                  <strong>Recapito riservato:</strong> {email}
                </p>
              )}
            </section>
            {administrative ? (
              <section className="form-section">
                <h2>Prima di salvare</h2>
                <p>
                  La proposta sarà salvata in attesa di revisione e associata al tuo account. Aprila
                  nel pannello per verificarla e approvarne la pubblicazione.
                </p>
              </section>
            ) : (
              <section className="form-section">
                <h2>Prima di inviare</h2>
                <p>
                  La proposta sarà visibile soltanto agli amministratori. Non inserire dati
                  personali nelle descrizioni o negli esempi da pubblicare.
                </p>
                <label className="checkbox-label">
                  <input
                    required
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    Ho letto l’
                    <Link to="/privacy" target="_blank">
                      informativa privacy
                    </Link>{' '}
                    e acconsento al trattamento dei dati della proposta per la revisione e
                    l’eventuale pubblicazione delle annotazioni.
                  </span>
                </label>
                <div className="honeypot" aria-hidden="true">
                  <label>
                    Sito web
                    <input
                      name="website"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </label>
                </div>
                {contributionsOpen && <Turnstile onToken={setToken} resetKey={captchaReset} />}
              </section>
            )}
          </>
        )}
        {error && <Notice error>{error}</Notice>}
        <div className="form-actions">
          {step > 0 ? (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setError('')
                setStep((s) => s - 1)
              }}
            >
              <ArrowLeft size={17} aria-hidden="true" /> Indietro
            </button>
          ) : (
            <span className="muted">
              {administrative ? 'Contributo del revisore.' : 'Tre passaggi, nessuna registrazione.'}
            </span>
          )}
          <button
            className="button primary"
            type="submit"
            disabled={busy || (step === 2 && !administrative && (!token || !consent))}
          >
            {busy
              ? 'Attendi…'
              : step === 2
                ? administrative
                  ? 'Salva la proposta'
                  : 'Invia la proposta'
                : step === 1
                  ? 'Rivedi la proposta'
                  : 'Continua'}
            {step === 2 ? (
              <Send size={17} aria-hidden="true" />
            ) : (
              <ArrowRight size={17} aria-hidden="true" />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
