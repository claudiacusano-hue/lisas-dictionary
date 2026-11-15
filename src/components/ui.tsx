import { ArrowRight, Search, BookOpen, RefreshCw, CircleCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useState, type ReactNode } from 'react'
import { useVocabulary } from '../lib/context'
import type { SignSummary } from '../../supabase/functions/_shared/domain'

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
export function Loading() {
  return (
    <p className="loading" role="status">
      <RefreshCw size={18} className="spin" aria-hidden="true" /> Caricamento…
    </p>
  )
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {children && <div className="lead">{children}</div>}
    </div>
  )
}
export function SearchBox({
  initial = '',
  compact = false,
}: {
  initial?: string
  compact?: boolean
}) {
  const [query, setQuery] = useState(initial)
  const navigate = useNavigate()
  return (
    <form
      className={`search-box ${compact ? 'compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        navigate(`/esplora?q=${encodeURIComponent(query.trim())}`)
      }}
      role="search"
    >
      <label className="sr-only" htmlFor={compact ? 'catalog-search' : 'home-search'}>
        Cerca un lemma o una glossa italiana
      </label>
      <Search size={23} aria-hidden="true" />
      <input
        id={compact ? 'catalog-search' : 'home-search'}
        type="search"
        maxLength={160}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca una parola in italiano…"
      />
      <button className="button primary" type="submit">
        Cerca <ArrowRight size={17} aria-hidden="true" />
      </button>
    </form>
  )
}
export function EmptyState({
  filtered = false,
  reset,
}: {
  filtered?: boolean
  reset?: () => void
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <BookOpen size={28} aria-hidden="true" />
      </div>
      <h2>{filtered ? 'Nessun segno con questi criteri' : 'Un lessico da costruire insieme'}</h2>
      <p>
        {filtered
          ? 'Prova una glossa alternativa oppure rimuovi uno o più filtri. I parametri non documentati non corrispondono ai filtri selezionati.'
          : 'Qui compariranno le schede approvate. Ogni annotazione viene verificata prima della pubblicazione.'}
      </p>
      {reset && filtered ? (
        <button className="button secondary" onClick={reset}>
          Azzera la ricerca
        </button>
      ) : (
        <Link className="text-link" to="/contribuisci">
          Scopri come contribuire <ArrowRight size={17} aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
export function SignCard({ sign }: { sign: SignSummary }) {
  const { terms } = useVocabulary()
  const category = terms.find(
    (t) => t.field_code === 'part_of_speech' && t.code === sign.category,
  )?.label
  return (
    <Link className="sign-card" to={`/segni/${sign.id}`}>
      <div className="card-top">
        <span className="tag">{category || 'Categoria da documentare'}</span>
        <ArrowRight size={20} aria-hidden="true" />
      </div>
      <h3>{sign.gloss}</h3>
      <p>{sign.description || 'Esplora i parametri e la descrizione di questo segno.'}</p>
      <div className="card-foot">
        <span>
          <CircleCheck size={14} aria-hidden="true" /> Validato
        </span>
        <span>
          {sign.variant_count} {sign.variant_count === 1 ? 'variante' : 'varianti'}
        </span>
      </div>
    </Link>
  )
}
export function DownloadButton({
  value,
  name,
  children,
}: {
  value: unknown
  name: string
  children: ReactNode
}) {
  return (
    <button
      className="button secondary"
      onClick={() => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
        )
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}
    >
      {children}
    </button>
  )
}
