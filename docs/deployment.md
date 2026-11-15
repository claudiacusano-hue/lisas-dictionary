# Configurazione e pubblicazione

Questo repository contiene il codice, non credenziali o servizi già attivati. I passaggi seguenti richiedono l’accesso del responsabile ai rispettivi account.

## Stato verificato il 15 novembre 2026

Il progetto Supabase **Lisas Lexicon**, riferimento `bodecqhevwwwykuntsxg`, è attivo nella regione `eu-central-1`. Tramite il plugin Supabase è stata applicata la migrazione del repository `202611150001_lexicon.sql`; la cronologia remota è allineata alla versione `202611150001`, così la CLI non deve applicarla nuovamente. L’utente Auth confermato indicato dal responsabile è stato configurato come **Revisore LISAS**.

Sono state importate **147 proposte `pending`**, con originali, avvisi e 147 eventi di importazione attribuiti al revisore. Il batch della fonte `lisas_lexicon.json` ha SHA-256 `7fc773dc4409f10edef6abcf032eef8c2669202bbdcd1b6d4869f516097af66b`. I **103 termini osservati restano inattivi**, nessuna proposta è approvata e **nessun segno è pubblicato**. Le 21 voci con avvisi richiedono esame scientifico insieme al resto del materiale.

L’importazione ha utilizzato `stage_lisas_import` in dieci transazioni, con ruolo `authenticated` e identità del revisore impostata localmente alle transazioni attraverso la connessione amministrativa del plugin. Non sono state richieste password o chiavi privilegiate. Questa operazione non verifica il login del frontend: quel flusso resta da provare con l’account del revisore.

Le verifiche SQL e le richieste reali al Data API con publishable key confermano che coda, originali, cronologia e termini inattivi rimangono privati; le RPC di importazione e moderazione rifiutano l’accesso anonimo. Dettagli e limiti sono nella [documentazione di verifica](validation.md). I rapporti tecnici locali sono in `.local/import/`, esclusa da Git.

La pubblicazione rimane subordinata alla validazione scientifica dei vocabolari e delle singole schede, alla verifica di provenienza e diritti e a una decisione motivata del revisore. Questa sessione non ha distribuito il frontend o l’Edge Function né abilitato la raccolta di contributi. I passaggi successivi descrivono anche le configurazioni ancora da completare; non rieseguire l’inizializzazione sul database già preparato.

## 1. Supabase e migrazioni

Crea un progetto Supabase, scegliendo la regione appropriata. Conserva la password del database fuori dal repository. Installa la [CLI Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started) e, dalla root:

```powershell
supabase login
supabase link --project-ref IL_PROJECT_REF
supabase db push
```

La migrazione `202611150001_lexicon.sql` è destinata a un progetto nuovo. Su un database esistente verifica prima i nomi e fai un backup. Non rieseguire manualmente la stessa migrazione applicata tramite CLI; i cambiamenti successivi vanno in nuove migrazioni.

In alternativa, su un progetto nuovo, esegui la migrazione nel SQL Editor e registra la sua applicazione nella cronologia delle migrazioni prima di passare alla CLI. Non aggiungere `app_private` agli schemi esposti dal Data API: il frontend necessita soltanto di `public`.

Nelle impostazioni API imposta il limite massimo di righe a **10000** (già configurato in locale). Il client scorre i vocabolari in pagine di 1000; le schede usano RPC paginate. Mantieni RLS e grant della migrazione; il modulo non richiede permessi anonimi di scrittura.

## 2. Primo amministratore

In Supabase Auth crea manualmente un utente con email e password e conferma l’email. Disabilita la registrazione pubblica nelle impostazioni Auth. Assegna il ruolo dal SQL Editor, usando l’UUID effettivo:

```sql
insert into public.admin_profiles(user_id, display_name)
values ('UUID-UTENTE-AUTH', 'Revisore LISAS');
```

Il ruolo non deriva da metadati modificabili dal client. La pagina `/#/admin` usa email e password; ogni operazione viene autorizzata nuovamente sul server. Per revocare il ruolo elimina la riga da `admin_profiles`; per recuperare la password usa gli strumenti Auth. Non eliminare utenti che devono rimanere nella cronologia: revoca il ruolo o disabilita l’accesso.

Il frontend non gestisce registrazioni o invii automatici di email. Le richieste di chiarimenti cambiano lo stato della proposta; il revisore usa il recapito facoltativo per contattare il contributore.

## 3. Frontend locale

Copia `.env.example` in `.env.local` e compila:

| Variabile                       | Valore                                                      |
| ------------------------------- | ----------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | URL del progetto senza slash finale                         |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key; compatibile anche la legacy `anon`         |
| `VITE_TURNSTILE_SITE_KEY`       | Site key pubblica Turnstile                                 |
| `VITE_BASE_PATH`                | `/` in locale, `/lisas-dictionary/` su Pages del repository |
| `VITE_CONTRIBUTIONS_ENABLED`    | `false` finché la raccolta non è pronta                     |
| `VITE_PRIVACY_CONTROLLER`       | Nome del titolare verificato                                |
| `VITE_PRIVACY_CONTACT`          | Recapito privacy                                            |
| `VITE_PRIVACY_RETENTION`        | Politica di conservazione verificata                        |

Tutti i valori `VITE_*` sono pubblici nel build. Non inserirvi service-role key, segreti Turnstile, password o token CLI. Dopo le modifiche riavvia Vite oppure ricostruisci e ridistribuisci il sito.

## 4. Edge Function pubblica

Crea un widget [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/) per i domini previsti. Il server verifica token, hostname e azione `contribution`; il solo widget nel browser non protegge gli invii.

Copia `supabase/.env.example` in `supabase/.env.local` (ignorato da Git):

```dotenv
ALLOWED_ORIGINS=https://claudiacusano-hue.github.io
TURNSTILE_SECRET_KEY=CHIAVE_SEGRETA_TURNSTILE
TURNSTILE_HOSTNAMES=claudiacusano-hue.github.io
RATE_LIMIT_SALT=SEGRETO_CASUALE_LUNGO_ALMENO_32_CARATTERI
TRUSTED_IP_HEADER=x-forwarded-for
CONTRIBUTIONS_ENABLED=false
```

L’origine CORS non contiene `/lisas-dictionary/`. Gli hostname non contengono protocollo o percorso. Per lo sviluppo aggiungi le origini e gli hostname locali; usa le chiavi di prova Turnstile esclusivamente in sviluppo.

Genera il salt con un generatore crittografico, per esempio `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"`, e conservalo nei segreti. Il runtime Supabase fornisce `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`; la chiave privilegiata viene usata soltanto dall’Edge Function e non va nel sito.

```powershell
supabase secrets set --env-file supabase/.env.local
supabase functions deploy submit-proposal --no-verify-jwt
```

`verify_jwt = false` è intenzionale: chi contribuisce non deve avere un account. La funzione applica origine ammessa, limiti, captcha e validazione prima della scrittura. Le RPC di invio sono inaccessibili con la chiave pubblica; quelle amministrative richiedono JWT utente verificato da Supabase e ruolo nel database. Le dipendenze sono in `submit-proposal/deno.json` con lockfile.

Il limite è 8 tentativi per identificativo di rete e 200 globali all’ora; richieste di massimo 64 KiB, anche senza `Content-Length`. Il contatore è condiviso e atomico. `TRUSTED_IP_HEADER` deve essere sovrascritto dal gateway affidabile: verifica questa proprietà sull’infrastruttura effettiva e adatta l’header se aggiungi proxy. Il codice usa l’ultimo hop di `x-forwarded-for`, rifiuta richieste senza header e non accetta IP dal body. Il limite globale si applica anche se un chiamante falsifica un header. Il CORS da solo non è un’autorizzazione.

I contatori più vecchi di due giorni vengono eliminati nelle richieste successive. Senza traffico restano fino alla richiesta seguente: predisponi una pulizia programmata se il piano di conservazione richiede una scadenza esatta. Il codice non registra payload o indirizzi di rete in chiaro; verifica separatamente log e conservazione dei fornitori.

Riferimenti: [deploy Supabase](https://supabase.com/docs/guides/functions/deploy), [dipendenze per funzione](https://supabase.com/docs/guides/functions/dependencies), [validazione server Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## 5. Importazione e apertura

Segui la [guida di importazione](lisas-import.md). In Amministrazione → Vocabolari controllati verifica e attiva i valori per percorso. Poi revisiona le proposte e pubblicale con una motivazione.

Prima di raccogliere contributi completa e fai verificare la pagina Privacy in `src/pages/Public.tsx`. Il testo è una base di lavoro. Definisci titolarità e licenza delle annotazioni, criteri scientifici, conservazione/cancellazione di email e proposte, regione e condizioni dei fornitori. Imposta infine `CONTRIBUTIONS_ENABLED=true` nei segreti Edge e `VITE_CONTRIBUTIONS_ENABLED=true` nel build. Entrambi devono essere abilitati; il frontend richiede anche i tre campi privacy e la site key.

## 6. GitHub Pages

Il workflow `.github/workflows/pages.yml` costruisce `dist/` e pubblica su push a `main` o avvio manuale. Scegli **Settings → Pages → Build and deployment → Source → GitHub Actions**.

In **Settings → Secrets and variables → Actions → Variables** aggiungi le variabili `VITE_*` della tabella. Non servono segreti privilegiati nel workflow. Base path predefinito: `/lisas-dictionary/`; per dominio personalizzato o repository `utente.github.io` usa `/`.

Destinazione attesa dopo il primo deploy riuscito: `https://claudiacusano-hue.github.io/lisas-dictionary/`. Non è una conferma di pubblicazione. Le schede hanno indirizzi `…/lisas-dictionary/#/segni/UUID`: il refresh non richiede un fallback 404.

`ci.yml` verifica TypeScript, database e RLS via PGlite, Edge Function e browser. Il workflow Pages richiede test e build; imposta la protezione di `main` con CI obbligatoria per rendere vincolanti le prove browser prima della pubblicazione. I workflow usano revisioni esplicite delle azioni. Configurazione basata sulla [guida Vite per gli hosting statici](https://vite.dev/guide/static-deploy).

## 7. Verifica reale e manutenzione

Su staging esegui un invio reale, verifica che rimanga privato, approvalo come amministratore e controlla la scheda pubblicata. Con chiave pubblica prova a scrivere `signs`, leggere `proposals` e chiamare `moderate_proposal`: scrittura e moderazione devono fallire, la lettura della coda deve restituire zero righe. Prova un utente Auth senza ruolo e due revisioni concorrenti.

Verifica token scaduti, origine errata, rate limit e header di rete nel gateway reale: i test locali non certificano la configurazione dei fornitori. Non aggiungere policy permissive o bypass del captcha per risolvere errori di configurazione.

Fai backup PostgreSQL secondo il piano scelto. Conserva export scientifici con UUID, revisione e checksum; mantieni immutati gli snapshot degli esperimenti. Aggiorna dipendenze e migrazioni passando prima da staging. Nessun aggiornamento automatico del lessico di LISAS-ICL è previsto.

## Ambiente Supabase locale facoltativo

Con il runtime supportato dalla CLI, ad esempio Docker, usa `supabase start`, poi `supabase db reset` **solo sul database locale di sviluppo** e `supabase functions serve submit-proposal --env-file supabase/.env.local`. Recupera URL e chiavi locali dalla CLI. `config.toml` disabilita il signup e prepara le porte standard. I test PGlite non richiedono questo ambiente.
