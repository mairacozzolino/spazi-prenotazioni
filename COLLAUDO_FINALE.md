# Collaudo del 15 ottobre 2026 — Spazi 1.0.2

## Risultato e perimetro

Le dieci suite automatiche passano con Node 24.21.0. I test che aprono connessioni locali richiedono accesso alla rete loopback nell'ambiente di esecuzione. Nessun database operativo è stato usato: i test del browser lavorano sul servizio sintetico avviato con `node scripts/qa-preview.mjs`, porta 8930.

Il risultato riguarda il codice e l'istanza locale. Non costituisce garanzia di assenza assoluta di bug, certificazione di accessibilità o attestazione di una pubblicazione Internet effettuata.

## Miglioramenti

- Percorso iniziale più lineare: scelta dello spazio, dettagli, conferma. La pagina iniziale non apre automaticamente la piantina pranzo né cambia l'orario selezionato per adattarlo al pranzo.
- Piantine delle sale sempre visibili alla selezione, senza menu espandibile, secondo la revisione richiesta. Icone degli spazi e della navigazione ridisegnate con tratto uniforme.
- Maggiore coerenza di focus, campi testo, selezione, cifre orarie e dimensioni dei controlli mobili, mantenendo identità bianca e rossa e font locale.
- Informazione corretta sulla visibilità di nome e finalità nel calendario condiviso.
- Stato di caricamento del codice riunione, campo azzerato e copia disabilitata durante la richiesta; risposte superate non sovrascrivono un'altra richiesta.
- Invii amministrativi protetti dai doppi clic, con stato occupato e ripristino dei controlli anche in caso di errore.
- Dopo la creazione di un account il selettore sala torna disabilitato per il ruolo Utente.
- Errori di uscita gestiti anche durante il cambio password obbligatorio; pulizia del codice tablet alla disconnessione.
- Controllo locale delle chiusure coerente con il server per riunioni già terminate.
- Timeout API esteso alla lettura del corpo; rifiuto di risposte JSON malformate, nulle, array o primitive.

## Verifiche automatiche

Eseguire `npm test` dalla cartella `bozza`. Il comando esegue dieci suite, interrompendosi al primo errore:

1. Trasporto HTTP: credenziali, metodi, errori, offline, JSON e timeout dopo ricezione delle intestazioni.
2. Dominio: intervalli, disponibilità, cancellazioni, fuso Roma, iCalendar.
3. Regole e presenza: scadenze, codici, duplicati e vincoli.
4. Ricerca fasce: disponibilità futura, chiusure, limiti.
5. Quota settimanale: confini settimana e anno, annullamenti, pranzo escluso.
6. Backend: accessi, ruoli, isolamento, concorrenza, codice, inizio e fine riunione, audit.
7. Rilascio: idempotenza, tablet assegnato, recupero password, revoca sessioni, backup e ripristino.
8. Produzione: HTTPS, proxy, cookie, CSRF, limiti richieste, percorsi riservati, sessioni.
9. Concorrenza: 40 richieste sulla stessa sala, tavoli e posti, account e Unicode.
10. Pranzo: persistenza, riavvio, nomi condivisi, conflitti e campi obbligatori.

## Verifiche nel browser

Su Chromium con account sintetico amministratore:

| Percorso | Esito |
| --- | --- |
| Accesso e navigazione delle cinque sezioni a 1440, 768, 390 e 320 px | Passato, nessuno scorrimento orizzontale della pagina |
| Prenotazione sala, conferma e storico | Passato |
| Codice riunione di otto cifre e verifica sul tablet | Passato |
| Esportazione iCalendar | File `.ics` scaricato |
| Annullamento: apertura, Mantieni, conferma e filtro Annullate | Passato |
| Prenotazione pranzo e dettaglio del posto occupato | Nome e fascia corretti |
| Creazione account e ripristino selettore sala | Passato |
| Piantina visibile senza apertura, a 1440 e 390 px | Passato |
| Navigazione giorno calendario e selezione fascia verso prenotazione | Passato |
| Data prenotazione svuotata | Errore esplicito, nessun arresto della pagina |
| Console al termine del collaudo | Nessun errore nell'ultima pagina |

Il controllo meccanico Impeccable sui file UI modificati restituisce `[]`. Le schermate desktop e mobile sono conservate in `qa-release/finale-*-2026-10-15.png`. L'avvio e il termine della riunione, la sicurezza tra ruoli, la disattivazione utenti, il ripristino password e i conflitti sono coperti dalle suite backend; non ogni combinazione di stato è stata azionata manualmente nel browser.

## Prima di aprire al pubblico

Restano da configurare e collaudare hosting, dominio, DNS, HTTPS e backup esterno seguendo INSTALLAZIONE.md. Provare accesso e prenotazione da rete mobile sul dominio reale, il tablet fisico, i browser effettivamente usati e il ripristino sull'hosting scelto. Non sono stati eseguiti test di carico prolungato, audit con screen reader o collaudi su Safari e Firefox. Il controllo responsive è stato eseguito con viewport del browser, senza dispositivi fisici.

`npm run release` crea un archivio con manifest SHA-256, escludendo database, account di collaudo e segreti operativi. Il pacchetto contiene anche queste note e la nuova suite trasporto.

Revisione successiva: piantine sempre visibili e nuove icone, collaudate su desktop e mobile senza overflow. Controllo Impeccable sui tre file UI modificati: nessun rilievo. Schermata: `qa-release/piantina-visibile-icone.png`.

Revisione codici e conferma: codice univoco generato nella transazione di creazione di ciascuna prenotazione di sala/call, visibile nella conferma e nella relativa riga personale. Test aggiuntivo con tre prenotazioni, incluse fasce diverse della stessa sala: codici distinti e stabili, verificati dal tablet e non leggibili da un altro utente. Dieci suite superate. Due prenotazioni effettuate dal browser mostrano codici diversi associati alle rispettive sale e agli orari. Conferma compatta verificata a 1440 e 390 px senza overflow.

## Flusso definitivo: salvataggio verso Le mie prenotazioni

Questa revisione sostituisce il precedente riquadro di conferma e i codici visibili nella lista. Dopo il salvataggio, la pagina apre direttamente Le mie prenotazioni, seleziona Attive e azzera la ricerca. La nuova riga è evidenziata. Il pulsante Codice e il nome cliccabile della sala aprono il dialogo con sala, data, fascia e codice di quella specifica prenotazione; le cifre restano nascoste nella lista. Il pranzo non espone codici riunione.

Verifica browser: due nuove prenotazioni in sale e orari diversi hanno aperto direttamente lo storico, senza riquadro di conferma, mostrando codici distinti solo dopo il clic. Verificati azzeramento filtri, apertura dal nome della sala su mobile, stesso codice dopo ricarica, assenza di overflow a 390 px. Dieci suite automatiche superate. Schermate: qa-release/prenotazioni-codice-su-richiesta.png e qa-release/codice-su-richiesta-mobile.png.

Avviso dopo il salvataggio: dialogo compatto con messaggio “La tua prenotazione è stata confermata”, indicazione del codice in Le mie prenotazioni e unico pulsante Chiudi. Lo storico rimane aperto sotto il dialogo; per il pranzo il messaggio specifica che non serve un codice stanza.

Ultima revisione del flusso: rimossa interamente la sezione Le tue prossime prenotazioni dalla pagina Prenota. Dopo il salvataggio si rimane su Prenota con il solo dialogo: La tua prenotazione è stata confermata. Troverai il codice aprendo Le mie prenotazioni. Il pulsante Chiudi consente di continuare sulla stessa pagina. La lista personale è accessibile soltanto dalla voce Le mie prenotazioni. Verifica browser completata con salvataggio reale su database sintetico, chiusura avviso, apertura manuale storico e codice corretto, nessun errore JavaScript né overflow mobile. Questa revisione sostituisce le precedenti descrizioni del reindirizzamento automatico.
