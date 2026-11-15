# Verifiche della prima versione

Verifiche eseguite il 15 novembre 2026, con dipendenze del lockfile, Node.js 24 e Windows. Dopo le prove locali è stato configurato il database Supabase remoto e importata la fonte nella coda privata, come descritto sotto. Cloudflare, frontend ed Edge Function non sono stati distribuiti in questa sessione.

## Controlli eseguiti

| Controllo | Risultato |
| --- | --- |
| `npm test` | 36 test superati in quattro suite |
| `npm run build` | TypeScript e build Vite riusciti, senza avvisi sulle dimensioni dei chunk |
| `npm run check:edge` | Funzione Deno e dipendenze verificate |
| `npm run test:e2e` | 14 prove superate su Chromium desktop e viewport smartphone |
| Build con `VITE_BASE_PATH=/lisas-dictionary/` | Asset e route hash verificati nel browser anche senza backend configurato |
| axe, tag WCAG 2 A/AA, 2.1 AA e 2.2 AA | Nessuna violazione automatica rilevata nelle viste controllate |
| Importazione locale della fonte disponibile | 147 voci preparate; 21 con avvisi, nessuna scrittura remota |
| Prevalidazione dei documenti importati | 147 documenti conformi al contratto tecnico del progetto |

I test PostgreSQL eseguono **la migrazione effettiva** tramite PGlite, con ruoli `anon`, `authenticated`, `service_role` e un emulatore minimale di `auth.uid()`. Verificano grant e RLS, accesso amministrativo, validazione dei vocabolari, coda privata, pubblicazione, conflitti di revisione, importazione idempotente, cronologia e rate limit. Il catalogo non combina valori da varianti differenti e non cerca nelle sole realizzazioni contestuali.

Le suite del contratto e dell’endpoint controllano AND, mani e fasi, stato finale coincidente o parziale, dati sconosciuti, CNM multiple, stati incompatibili, codici nel percorso sbagliato, captcha fallito, honeypot, origini estranee, dimensione del body senza `Content-Length` ed errori interni non esposti.

Le prove browser usano **risposte HTTP di test intercettate**, con fixture sintetiche e widget Turnstile simulato. Coprono ricerca, filtri nell’URL, schede, percorso di contribuzione fino alla ricevuta, login separato e revisione amministrativa motivata. La pubblicazione effettiva è verificata separatamente nelle prove SQL. Le fixture non sono incluse nei dati pubblici o nella build.

Sono stati ispezionati anche screenshot desktop e smartphone. Il controllo di overflow riguarda home, catalogo, scheda, modulo iniziale e accesso amministrativo; la tabella di confronto usa un contenitore scorrevole raggiungibile da tastiera. I font sono serviti dal build, senza richieste a Google Fonts.

## Verifica del backend remoto e importazione

Il plugin Supabase accede al progetto **Lisas Lexicon** (`bodecqhevwwwykuntsxg`, `eu-central-1`, stato `ACTIVE_HEALTHY`). Prima delle modifiche sono state verificate l’assenza di tabelle applicative e la cronologia vuota. La migrazione del repository è stata applicata e registrata con versione `202611150001`; RLS è attiva su tutte le 13 tabelle pubbliche dell’applicazione. L’utente Auth confermato indicato dal responsabile ha ricevuto il ruolo di revisore.

`npm test` è stato rieseguito con esito **36/36**. La fonte è stata nuovamente preparata e verificata contro il contratto TypeScript e, in PGlite, attraverso gli stessi batch SQL e la stessa procedura usati sul server. La ripetizione locale dei batch conserva esattamente 147 proposte e 147 eventi, verificando l’idempotenza sui dati effettivi. Queste prove non costituiscono validazione linguistica.

| Controllo remoto | Risultato |
| --- | --- |
| Proposte e ID della fonte distinti | 147, tutte `pending` |
| Originali LISAS e documenti normalizzati conservati | 147 |
| Eventi `imported` attribuiti al revisore indicato | 147 |
| Voci con avvisi | 21 |
| Termini osservati | 103, tutti inattivi e non revisionati |
| Proposte approvate e segni pubblicati | 0 |
| Lettura Data API anonima di proposte, termini e cronologia | HTTP 200, zero righe |
| Ricerca pubblica tramite RPC | HTTP 200, zero risultati |
| RPC `get_import_context`, `stage_lisas_import`, `moderate_proposal` con chiave pubblica | HTTP 401, codice PostgreSQL `42501` |
| Letture e RPC private con ruolo `authenticated` senza identità amministrativa | Negate o zero righe secondo il contratto |

Checksum SHA-256 della fonte: `7fc773dc4409f10edef6abcf032eef8c2669202bbdcd1b6d4869f516097af66b`. I rapporti `plugin-preflight.json`, `supabase-import-result.json` e `remote-api-checks.json` sono conservati in `.local/import/`, esclusa da Git insieme ai dati.

L’advisor Supabase segnala le funzioni `SECURITY DEFINER` eseguibili da [anonimi](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) e da [utenti autenticati](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Le tre funzioni pubbliche sono intenzionali (`is_admin`, `search_signs`, `get_sign`); le altre procedure richiedono il ruolo applicativo sul server. Le definizioni fissano `search_path` e i controlli sopra verificano il rifiuto delle operazioni private. Gli avvisi non sono stati eliminati allargando i permessi.

## Limiti delle verifiche

Questi risultati non certificano conformità WCAG completa o accuratezza linguistica. Restano da effettuare prove manuali con persone segnanti e studenti, lettori di schermo, zoom e browser differenti, oltre alla validazione scientifica dei vocabolari e delle schede.

PGlite verifica PostgreSQL e le policy, ma non replica l’intero gateway, Auth e l’infrastruttura Edge di Supabase. Le verifiche remote coprono i permessi anonimi del Data API e le autorizzazioni SQL; l’importazione tramite plugin non prova il login con password e JWT del frontend. Su staging restano da verificare quel flusso, CORS, header IP sovrascritto dal gateway, Siteverify reale, retry e limiti, conservazione dei log e pubblicazione end-to-end. Le prove di pubblicazione devono usare materiale tecnico di test separato: le 147 voci di ricerca restano in attesa di validazione scientifica. Seguire la [guida di configurazione](deployment.md).

Il successo dell’importatore indica validità tecnica del modello normalizzato. I 21 avvisi riguardano campi storici, metadati non mappati, `null` o strutture da rivedere: non vanno ignorati nella pubblicazione. Il rapporto e gli originali rimangono in `.local/import/`; dopo `--apply` gli originali sono accessibili solo ai revisori autorizzati.

## Ripetizione e CI

### Correzione del completamento delle schede

Il controllo del sito pubblico ha confermato che la raccolta dei contributi era disabilitata, con site key antispam e dati di configurazione privacy vuoti. Il vecchio modulo consentiva comunque di arrivare al consenso finale, lasciando poi il pulsante di invio disabilitato. Il nuovo percorso riservato ai revisori salva proposte indipendentemente dall’apertura della raccolta pubblica; l’avviso pubblico precede la compilazione.

Verifiche locali della correzione: **41 test superati in cinque suite**, build TypeScript/Vite riuscita e **22 prove browser superate**, su desktop e smartphone. Le nuove prove SQL applicano tutte le migrazioni e controllano accessi anonimi e autenticati senza ruolo, vocabolari validi, revisione di base, motivazione, attribuzione dell’autore, assenza di un consenso fittizio e pubblicazione soltanto dopo approvazione. Le prove browser usano risposte HTTP simulate e coprono completamento e correzione con vocabolari attivi, recupero dopo errore senza perdita dei dati, collegamento alla revisione e avvisi a raccolta chiusa. Le nuove viste controllate non presentano violazioni axe; gli screenshot locali sono in `test-results/`.

La prima esecuzione con quattro worker ha superato il tempo limite in tre prove desktop per il carico iniziale del browser. Con due worker configurati, l’intera suite è passata senza retry.

Dopo conferma del responsabile, la migrazione è stata applicata al progetto remoto con versione `20261115131907`, riportata anche nel nome del file locale. Una prova SQL con ruolo `authenticated` e identità di revisore ha creato un completamento temporaneo, verificato coda privata, autore e motivazione, quindi annullato la transazione. La stessa prova ha confermato il rifiuto di un’identità priva del ruolo. I conteggi prima e dopo restano 1 scheda, 147 proposte e 159 eventi; la scheda pubblicata non è stata modificata. I grant negano agli anonimi la nuova RPC e a tutti i client l’helper privato; l’API pubblica originale rimane accessibile soltanto al servizio Edge. L’advisor segnala anche la nuova RPC tra le funzioni [eseguibili da autenticati](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): il controllo amministrativo interno è intenzionale e verificato.

### Comandi

```powershell
npm ci
npm test
npm run build
npm run check:edge
npx playwright install chromium
npm run test:e2e
```

La CI esegue gli stessi controlli su Linux e installa le dipendenze di sistema Chromium. In questa sessione non è stata eseguita una GitHub Action remota. Gli artefatti locali, i rapporti browser e i dati preparati sono ignorati da Git.
