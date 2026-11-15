import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react'
import { vocabulary } from './api'
import type { VocabularyField, VocabularyTerm } from '../../supabase/functions/_shared/domain'

export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({
    data: null,
    error: '',
    loading: true,
  })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    setState({ data: null, loading: true, error: '' })
    loader()
      .then((data) => {
        if (current) setState({ data, loading: false, error: '' })
      })
      .catch(() => {
        if (current)
          setState({
            data: null,
            loading: false,
            error: 'Non è stato possibile caricare i dati. Controlla la connessione e riprova.',
          })
      })
    return () => {
      current = false
    }
    // Il chiamante dichiara esplicitamente le dipendenze della richiesta.
  }, [...deps, attempt])
  return { ...state, retry: () => setAttempt((x) => x + 1) }
}
interface VocabularyContext {
  fields: VocabularyField[]
  terms: VocabularyTerm[]
  loading: boolean
  error: string
  reload: () => void
}
const VocabContext = createContext<VocabularyContext>({
  fields: [],
  terms: [],
  loading: true,
  error: '',
  reload: () => {},
})
export function VocabularyProvider({ children }: { children: ReactNode }) {
  const state = useAsync(vocabulary, [])
  const reload = useCallback(state.retry, [])
  return (
    <VocabContext.Provider
      value={{
        fields: state.data?.fields || [],
        terms: state.data?.terms || [],
        loading: state.loading,
        error: state.error,
        reload,
      }}
    >
      {children}
    </VocabContext.Provider>
  )
}
export const useVocabulary = () => useContext(VocabContext)
export const displayValue = (text: string) => text.replaceAll('_', ' ')
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(date))
