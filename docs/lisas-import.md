# Fonti, importazione e vocabolari LISAS

## Fonti disponibili

Nel checkout adiacente `LISAS-ICL` sono presenti il lessico operativo con 147 voci, anche in liste annidate, e il manuale di annotazione v1.0. Il manuale descrive struttura, forme della mano non dominante, stati finali parziali, CNM multiple e valori osservati. La documentazione distingue revisioni operative e validazione linguistica completa; lascia da definire i diritti di pubblicazione.

Non è disponibile un JSON Schema formale completo. Non si deducono nuove classi, obbligatorietà o valori da esempi isolati. Nessuna fonte è copiata nella directory pubblica. L’importatore legge il percorso indicato; build e test non dipendono dal repository adiacente.

## Preparazione senza scritture

```powershell
npm run import:lisas -- --input "../LISAS-ICL/resources/lexicon/lisas_lexicon.json"
```

Produce `.local/import/staging.json` e `report.json`, ignorati da Git. Il batch ha il checksum SHA-256 dei byte della fonte; ogni voce mantiene l’ID della fonte, indipendente dall’UUID assegnato alla pubblicazione. La glossa non è una chiave univoca.

Il rapporto elenca percorsi non mappati, `null` storici e forme miste. Questi rimangono nell’originale e non diventano valori inventati. Ogni valore osservato produce un termine `active=false`, con fonte ed etichetta suggerita da verificare.

## Invio alla coda privata

Servono account amministrativo e chiave pubblica, non una service-role key. Imposta nell’ambiente del terminale:

```powershell
$env:LISAS_SUPABASE_URL = 'https://IL_PROJECT_REF.supabase.co'
$env:LISAS_SUPABASE_PUBLISHABLE_KEY = 'LA_CHIAVE_PUBBLICA'
$env:LISAS_ADMIN_EMAIL = 'EMAIL_DEL_REVISORE'
$credential = Get-Credential -UserName $env:LISAS_ADMIN_EMAIL -Message 'Credenziali amministrative LISAS'
$env:LISAS_ADMIN_PASSWORD = $credential.GetNetworkCredential().Password
try {
    npm run import:lisas -- --input "../LISAS-ICL/resources/lexicon/lisas_lexicon.json" --apply
} finally {
    Remove-Item Env:LISAS_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

Le password non vanno negli argomenti della shell, nei file tracciati o nelle variabili frontend. Su altri sistemi usa variabili equivalenti e inserimento password senza eco.

La CLI prevalida tutto il batch contro il registro del database. Ogni voce è poi inserita in una transazione separata, idempotente sulla coppia checksum/ID della fonte: ripetere il comando riprende senza duplicati dopo un’interruzione. Il batch intero non è una singola transazione.

Un file modificato ha un checksum diverso e genera nuove proposte. Non aggiorna automaticamente identità già pubblicate: controlla i duplicati e usa il flusso di correzione per le schede esistenti.

## Revisione

Un inventario completo può essere importato anche senza voci lessicali. Prepara un file `lisas-vocabulary/1` con `source` e una lista `terms` di oggetti `{ "field_code": "…", "code": "…", "label": "…" }`, riportando soltanto codici e valori della fonte verificabile. I codici di campo ammessi corrispondono al registro della migrazione. L’envelope è il formato tecnico del progetto, non uno schema LISAS dichiarato ufficiale.

```powershell
npm run import:vocabulary -- --input "vocabolario-verificabile.json"
# Con le stesse variabili amministrative illustrate sopra:
npm run import:vocabulary -- --input "vocabolario-verificabile.json" --apply
```

La CLI aggiunge il checksum alla provenienza. La transazione inserisce soltanto termini nuovi e inattivi, senza modificare termini già revisionati. Questa strada consente di caricare tutti i valori ammessi da un inventario, anche quelli non ancora attestati nelle schede. L’adattamento da un futuro schema esterno a questo envelope deve essere verificato prima dell’uso.

1. In Amministrazione → Vocabolari controllati verifica ogni valore per il proprio percorso. Uno stesso codice in luogo e orientamento costituisce due termini distinti.
2. Correggi l’etichetta italiana e registra una motivazione. Un termine inattivo non appare nei menu pubblici e non può essere pubblicato in una scheda.
3. Apri ogni proposta e verifica gli avvisi e l’originale scaricabile in Fonte di importazione. L’originale rimane privato, distinto dalla scheda corrente dopo una correzione.
4. Controlla i duplicati, completa provenienza e annotazioni, salva eventuali correzioni e approva.

Revisione del vocabolario e pubblicazione sono atti distinti. Non è prevista attivazione di massa dei valori osservati. Per i campi non rappresentabili risolvi la convenzione e aggiungi migrazione e adattatore; non forzarli in un parametro diverso.

## Percorsi gestiti

Configurazione con dita selezionate, postura e dita non selezionate; luogo, orientamento, metacarpo; movimento con tipo e ripetizione; CNM per bocca, guance, lingua, sopracciglia, testa e busto. Sono distinti mano, fase, simmetria e coincidenza degli stati. Categoria e classe verbale usano vocabolari per percorso.

`fine: null` indica coincidenza con l’inizio; un oggetto `fine` descrive differenze parziali secondo il manuale. Un parametro esplicitamente `null` diventa `unknown` con un avviso e interrompe l’eredità da inizio. Omettere l’intero stato finale non permette di inferire coincidenza.

Contatto, relazione dettagliata delle mani, ancoraggio e classi degli aggettivi restano da formalizzare e sono conservati nell’originale. Il movimento dentro `fine` nelle voci storiche non viene spostato automaticamente nel movimento lessicale. Il corpus di frasi non viene importato come forma lessicale.

## Esportazione e rientro

Ogni scheda offre due esportazioni avanzate:

- `lisas-lexicon/1`: documento completo con UUID, revisione, varianti, stati, grammatica, esempi, realizzazioni e riferimenti. `document` segue il contratto condiviso del progetto.
- `lisas-adapter/manual-v1`: percorsi compatibili con il manuale e avvisi per variante. Non certifica conformità a uno schema formale ancora da fornire e non completa dati sconosciuti.

Lo scambio completo può rientrare in coda, con i vocabolari corrispondenti già presenti:

```powershell
npm run import:lisas -- --input "snapshot-lisas.json" --exchange
# Dopo la verifica, con l'ambiente amministrativo configurato:
npm run import:lisas -- --input "snapshot-lisas.json" --exchange --apply
```

Il rientro crea una nuova proposta: non sovrascrive l’UUID nel lessico di destinazione e non salta la moderazione. L’envelope dell’adattatore ai percorsi è un formato di uscita, non un lessico legacy reimportabile direttamente. Per la ricerca riproducibile usa lo scambio completo e conserva il checksum.

Quando arriverà lo schema formale, aggiungi il validatore a CLI e Edge Function, aggiorna registro e vincoli con migrazioni e verifica import/export con casi forniti dal responsabile linguistico. Mantieni la compatibilità dello scambio o introduci una nuova versione esplicita.
