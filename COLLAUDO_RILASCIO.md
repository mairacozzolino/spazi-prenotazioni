# Collaudo Spazi 1.0.1 — 14 ottobre 2026

## Esito delle prove locali

Nove suite automatiche, eseguibili con npm test. I test usano database separati nella cartella .qa; non modificano il database operativo.

| Suite | Verifiche |
| --- | --- |
| test-domain | Disponibilità, posti individuali, intervalli, orari di Roma e iCal |
| test-policy | Cancellazioni, finestre di avvio, duplicati, termine, chiusure e limiti |
| test-scheduling | Slot futuri, ricerca della prima fascia disponibile e chiusure |
| test-weekly-limit | Dieci riunioni/call, pranzo escluso, settimane separate, annullamenti e fine anno |
| test-backend | Account, ruoli, password iniziale, privacy, creazione concorrente, codici, audit e origine |
| test-release | Idempotenza, sala del tablet, fine anticipata, reset password, revoca sessioni e ripristino snapshot |
| test-production | HTTPS, origine e proxy, cookie, CSP, CSRF, richieste malformate, rate limit e percorsi protetti |
| test-concurrency | Quaranta richieste sulla stessa sala, tavolo intero contro posto, Unicode e account duplicati |
| test-dining | Pranzo senza finalità, nome e cognome, persistenza e rilettura, nomi visibili da altri account, posto e tavolo intero, privacy delle sale |

## Collaudo nel browser

Con account sintetici: accesso utente, prenotazione di sala, conferma persistente, storico, caratteri speciali visualizzati come testo, annullamento, calendario e profili amministrativi. Sessioni separate di utente e tablet sullo stesso backend: codice verificato, solo pulsante Inizia, timer, ricarica senza azzeramento, termine e sala nuovamente disponibile nell'altra sessione. Gestione account e assegnazione della sala al tablet verificate; dialogo di recupero accesso verificato senza modificare password dal browser. Nessun errore JavaScript rilevato nelle sessioni di collaudo.

Vista tablet a 1024×768 e 390×844: nessun overflow orizzontale, pulsanti di 88 e 80 pixel. Anche la gestione account è verificata a 390×844 senza overflow. Un server di prova che risponde 503 alle API mostra “Servizio non disponibile” e il pulsante Riprova, senza passare alla demo. Screenshot e log sono nella cartella qa-release della cartella di lavoro, separata dal pacchetto. Questa è una prova nel browser con viewport simulate, non su un tablet fisico.

## Protezioni aggiunte

Demo disabilitata in produzione; rete non disponibile mostrata esplicitamente; HTTPS e dominio obbligatori; proxy dichiarato; password con scrypt asincrono; sessioni protette e revocabili; tentativi limitati; richieste JSON con limite di dimensione e decodifica UTF-8; codice assegnabile a una sala; transazioni e chiavi idempotenti; backup consistente verificato; shutdown ordinato e health endpoint.

## Prove ancora richieste sull'hosting

Installazione del pacchetto, build Docker se usata, certificato HTTPS pubblico, DNS, avvio supervisionato, riavvio del server, backup fuori dal server, ripristino isolato e accesso da telefono su rete mobile. Docker e Caddy non sono installati in questo ambiente: i modelli sono preparati, ma una build Docker e l'emissione del certificato pubblico non sono state eseguite qui.

Il programma usa un'istanza Node 24 e SQLite locale persistente. Non si dichiara una certificazione di sicurezza o accessibilità né una garanzia operativa dell'hosting. Prima dell'apertura pubblica occorre completare le prove sul server effettivo.
