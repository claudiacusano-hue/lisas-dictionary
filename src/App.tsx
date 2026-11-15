import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowUpRight, Menu, X, LockKeyhole } from 'lucide-react'
import { VocabularyProvider } from './lib/context'
import { Home, Catalog, SignPage, About, Privacy } from './pages/Public'
import { Loading } from './components/ui'

const Contribute = lazy(() => import('./pages/Contribute').then((m) => ({ default: m.Contribute })))
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })))

function Layout() {
  const { pathname } = useLocation()
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
    document.getElementById('main')?.focus()
  }, [pathname])
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Vai al contenuto
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="LISAS Lexicon, pagina iniziale">
            <span className="brand-mark" aria-hidden="true">
              L<span>•</span>
            </span>
            <span>
              LISAS <strong>Lexicon</strong>
              <small>Lingua dei Segni Italiana</small>
            </span>
          </Link>
          <button
            className="icon-button menu-button"
            aria-label={menu ? 'Chiudi menu' : 'Apri menu'}
            aria-expanded={menu}
            aria-controls="main-nav"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
          <nav id="main-nav" className={menu ? 'open' : ''} aria-label="Navigazione principale">
            <NavLink to="/esplora">Esplora i segni</NavLink>
            <NavLink to="/progetto">Il progetto</NavLink>
            <NavLink className="nav-contribute" to="/contribuisci">
              Contribuisci <ArrowUpRight size={16} aria-hidden="true" />
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="container page">
              <Loading />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/esplora" element={<Catalog />} />
            <Route path="/segni/:id" element={<SignPage />} />
            <Route path="/contribuisci" element={<Contribute />} />
            <Route path="/progetto" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/admin/*" element={<Admin />} />
            <Route
              path="*"
              element={
                <div className="container page">
                  <h1>Pagina non trovata</h1>
                  <Link className="text-link" to="/esplora">
                    Torna al catalogo
                  </Link>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <Link to="/" className="footer-brand">
              LISAS Lexicon<span aria-hidden="true"> ↗</span>
            </Link>
            <p>Un lessico aperto. Una conoscenza condivisa.</p>
          </div>
          <nav aria-label="Navigazione nel piè di pagina">
            <Link to="/progetto">Metodologia</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/admin">
              <LockKeyhole size={14} aria-hidden="true" /> Amministrazione
            </Link>
          </nav>
        </div>
        <div className="container footer-note">
          Annotazioni collaborative, sottoposte a validazione scientifica.
        </div>
      </footer>
    </>
  )
}
export function App() {
  return (
    <VocabularyProvider>
      <Layout />
    </VocabularyProvider>
  )
}
