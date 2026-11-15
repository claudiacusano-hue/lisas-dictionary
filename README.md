# LISAS Lexicon

Database lessicale collaborativo della Lingua dei Segni Italiana, collegato al progetto di ricerca [LISAS-ICL](https://github.com/claudiacusano-hue/LISAS-ICL).

Prima versione del frontend React/TypeScript e del backend Supabase: consultazione libera, ricerca per glossa e cinque parametri, varianti, schede verbali, proposte senza registrazione e revisione amministrativa. La pubblicazione avviene soltanto dopo approvazione; email e proposte in attesa rimangono private.

## Avvio locale

Richiede **Node.js 24 LTS** e npm. Dalla root:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Apri l’indirizzo stampato da Vite. Senza chiavi Supabase il sito funziona con un catalogo vuoto dichiarato; non simula salvataggi o accessi amministrativi. Compila `.env.local` per usare il backend. Il percorso predefinito locale è `/`; `VITE_BASE_PATH` viene letto anche dai file `.env` per gli asset.

L’esempio contiene il percorso Pages `/lisas-dictionary/`: imposta `VITE_BASE_PATH=/` se vuoi avviare il sito alla root locale.

Su questa postazione è disponibile anche `./scripts/dev.ps1`: cerca Node nel PATH e nel runtime portatile locale preparato per il progetto. Non modifica il PATH di sistema. Su altri computer installa Node dal [sito ufficiale](https://nodejs.org).

```powershell
npm test                 # Contratto, Edge handler, importatore e PostgreSQL/RLS
npm run build            # TypeScript e build di produzione
npm run check:edge       # Controllo Deno della funzione distribuita
npx playwright install chromium
npm run test:e2e         # Desktop, smartphone e axe
```

## Collegamento ai servizi

1. Crea il progetto Supabase e applica la migrazione SQL.
2. Crea un utente Auth amministrativo e assegna il ruolo nel database.
3. Imposta URL e **publishable key** nel frontend. La chiave legacy `anon` è compatibile; una service-role key non deve mai essere inserita in variabili `VITE_*`.
4. Configura e distribuisci `submit-proposal` con Turnstile, origini ammesse e salt per il rate limit.
5. Importa le fonti LISAS in coda, verifica i vocabolari e revisiona le schede.
6. Completa e fai verificare l’informativa privacy, poi abilita la raccolta sia nel frontend sia nell’Edge Function.
7. Imposta GitHub Pages su **GitHub Actions** e configura le variabili del repository.

I revisori autenticati possono salvare completamenti e correzioni anche prima dell’apertura dei contributi pubblici: dalla scheda segui il collegamento all’area riservata, salva una proposta con motivazione e approvala poi nel pannello. Occorre applicare anche la migrazione `20261115131907_admin_contributions.sql`; vedi il [percorso dei revisori](docs/deployment.md#completamenti-e-correzioni-dei-revisori).

I passaggi e i comandi sono nella [guida di configurazione e pubblicazione](docs/deployment.md). Nessun progetto Supabase, account o deployment esterno è creato automaticamente da questo checkout.

## Struttura

| Percorso                  | Contenuto                                                                       |
| ------------------------- | ------------------------------------------------------------------------------- |
| `src/`                    | Interfaccia italiana, pagine pubbliche, modulo guidato, pannello amministrativo |
| `supabase/migrations/`    | Schema PostgreSQL, RLS, ricerca e procedure transazionali                       |
| `supabase/functions/`     | Endpoint pubblico e contratto condiviso con validazione                         |
| `scripts/import-lisas.ts` | Analisi locale e importazione autenticata in coda privata                       |
| `tests/`                  | Fixture tecniche e verifiche automatiche, mai dati pubblicati                   |
| `.github/workflows/`      | CI e build/deploy GitHub Pages                                                  |
| `.local/`                 | Rapporti e staging locali esclusi da Git                                        |

## Dati LISAS e limiti del primo adattatore

Sono stati esaminati il manuale operativo v1.0 e le 147 voci nel checkout adiacente `LISAS-ICL`. Il manuale documenta percorsi e valori osservati; non è uno schema formale completo. L’importatore conserva gli originali, segnala i percorsi non gestiti e lascia i nuovi valori **inattivi**. Non attribuisce una validazione scientifica alle fonti importate.

```powershell
npm run import:lisas -- --input "../LISAS-ICL/resources/lexicon/lisas_lexicon.json"
```

Questo comando produce solo staging e rapporto in `.local/import/`. Le credenziali e `--apply` sono necessari per scrivere in Supabase; non pubblica nulla. Leggi la [guida LISAS](docs/lisas-import.md) prima dell’importazione.

`npm run import:vocabulary -- --input inventario.json` prepara anche inventari controllati indipendenti dalle schede; con `--apply` li inserisce come valori inattivi da revisionare.

Il sito esporta lo scambio `lisas-lexicon/1` che mantiene gli stati e le varianti, e un adattamento ai percorsi del manuale con avvisi. La conformità a uno schema LISAS definitivo resta subordinata alla consegna e verifica di quello schema. Non sono inclusi video né riferimenti grammaticali inventati.

I dati di ricerca originali non sono copiati nel repository o pubblicati: diritti e licenza devono essere definiti dal responsabile dei materiali. Le fixture `TEST_*` esistono solo nei test. Le esportazioni destinate agli esperimenti vanno conservate come snapshot con revisione e checksum, senza sostituire automaticamente i dati di LISAS-ICL.

## Documentazione

- [Configurazione, primo amministratore e GitHub Pages](docs/deployment.md)
- [Architettura, modello dati e autorizzazioni](docs/architecture.md)
- [Importazione, vocabolari e formati di scambio](docs/lisas-import.md)
- [Verifiche e limiti della validazione](docs/validation.md)

Dipendenze risolte nel lockfile. Radix UI gestisce tab e pannelli accessibili; i font sono serviti localmente dal build. Aggiornare le dipendenze passando dalle verifiche del progetto.
