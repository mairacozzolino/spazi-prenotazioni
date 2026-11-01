# Spazi 1.1.1 — prenotazioni e tablet

Applicazione condivisa per tre sale riunioni, una sala call e 22 posti pranzo su sei tavoli. Frontend HTML/CSS/JavaScript, backend Node 24 e SQLite persistente, interfaccia rossa e bianca. Account creati soltanto dall'amministratore, con ruoli Utente, Operatore e Amministratore.

## Per il tutor di stage

Questo repository raccoglie il codice della piattaforma Spazi, le istruzioni per eseguirla, i test automatici e la documentazione tecnica.

- [Requisiti del progetto](docs/REQUISITI.md)
- [Architettura e componenti](ARCHITETTURA.md)
- [Installazione e distribuzione](INSTALLAZIONE.md)
- [Ultimo verbale di collaudo funzionale](COLLAUDO_2026-10-26.md)

Il codice frontend direttamente eseguito dal browser si trova in `dist/`; non occorre una compilazione. Il backend si trova in `server/`, i test in `test-*.mjs` e `tests/`, gli strumenti in `scripts/` e i modelli di distribuzione in `deploy/`. Non ci sono dipendenze npm esterne: basta Node.js 24.

Per provarlo dopo aver scaricato o clonato il repository:

```sh
cd spazi-prenotazioni
npm start
```

Aprire [l'applicazione locale](http://127.0.0.1:8766) e configurare il primo amministratore. Il database viene creato localmente: account e prenotazioni operative non sono inclusi nel repository. Per eseguire le verifiche usare `npm test`.

**Stato:** prototipo funzionante con test automatici; la pubblicazione sul server aziendale e il collaudo del dominio HTTPS restano da completare. Il link GitHub mostra codice e documentazione; non ospita l'applicazione in esecuzione.

## Regole concordate

- Massimo 10 prenotazioni settimanali complessive per utente per sale riunioni e call, da lunedì a domenica nella settimana prenotata. Anche quelle svolte contano; le annullate no. Pranzo escluso dal limite.
- Sale esclusive; pranzo per posto singolo o tavolo intero. Turni pranzo 12:30–13:00 e 13:30–14:00. Per il pranzo serve solo nome e cognome: cliccando un posto occupato si vede chi lo ha prenotato. Per riunioni e call restano obbligatori referente e finalità.
- Codice stabile di otto cifre, senza QR o fotocamera. Sul tablet, dopo la verifica resta solo “Inizia riunione”. Dopo l'avvio compaiono timer e “Termina riunione”.
- Il timer non si ferma all'orario previsto; continua fino al termine registrato e riprende dopo una ricarica. “Termina riunione” libera subito la sala. L'inizio è consentito da 15 minuti prima a 15 minuti dopo l'orario prenotato.
- L'operatore può essere assegnato a una sala; il server rifiuta i codici delle altre sale.

## Avvio locale

Da questa cartella, con Node 24:

```sh
npm start
```

Aprire http://127.0.0.1:8766. Alla prima apertura locale è possibile creare l'amministratore. L'accesso richiede nome, cognome, email e codice di apertura porta; l'amministratore assegna i codici quando crea gli account. La demo separata è disponibile solo quando abilitata: i suoi dati rimangono nel browser. Le prenotazioni sintetiche dei precedenti test tablet vengono annullate senza eliminare lo storico.

## Pubblicazione esterna

Il software supporta un indirizzo pubblico HTTPS tramite proxy fidato o HTTPS diretto. La configurazione di produzione disabilita la demo e impedisce il setup dell'amministratore dal browser pubblico. “Fuori dall'azienda” usa lo stesso dominio, con account e verifiche server; non richiede accesso alla rete interna.

Seguire [INSTALLAZIONE.md](INSTALLAZIONE.md). Sono forniti Docker Compose con Caddy, un modello Linux systemd e configurazioni per un proxy locale. Non è sufficiente caricare i file su hosting soltanto statico o PHP: serve eseguire Node 24 o Docker e mantenere il database su disco persistente. Hosting e dominio effettivi devono ancora essere confermati e collaudati; il pacchetto non attesta una pubblicazione Internet già eseguita.

## Verifiche e manutenzione

```sh
npm test
npm run backup
npm run admin
npm run release
```

Le dodici suite verificano disponibilità, fuso orario, pranzo, quota settimanale, account, ruoli, codice tablet, concorrenza, richieste duplicate, reset password, protezioni della modalità pubblica e backup/ripristino. Il pacchetto di rilascio esclude dati, password operative, certificati e fixture di collaudo e include un manifest SHA-256. [COLLAUDO_RILASCIO.md](COLLAUDO_RILASCIO.md) riporta prove e limiti.

L'installazione prevista è su un solo servizio con SQLite locale. Export Google Calendar/iCal manuali; nessuna sincronizzazione automatica, email o pagamento. Manrope e la sua licenza sono inclusi localmente.

Il calendario condiviso mostra a tutti gli utenti autenticati nome del referente e finalità delle prenotazioni di sale e call. Per il pranzo mostra il nome della persona. I codici riunione restano riservati al proprietario.

Collaudo del 15 ottobre 2026: vedi [COLLAUDO_FINALE.md](COLLAUDO_FINALE.md) per modifiche, verifiche browser e condizioni ancora da verificare sul server pubblico.

## Statistiche di utilizzo

In Gestione → Statistiche l’amministratore può consultare confermate, annullate, riunioni avviate e concluse, ore prenotate ed effettive e posti pranzo riservati. Il periodo iniziale comprende gli ultimi 30 giorni; è modificabile fino a 366 giorni inclusivi. Le durate effettive sono disponibili solo per riunioni concluse dal tablet. Le prenotazioni restano gratuite.

Ultimo controllo: [collaudo del 26 ottobre 2026](COLLAUDO_2026-10-26.md), con 12 suite superate e verifica browser desktop/mobile. Dominio e hosting restano da scegliere.

Correzione 1.1.1: le cinque sezioni di Gestione mostrano pannelli distinti anche nella demo. Account richiede l’accesso amministratore; prenotazioni, statistiche e attività della demo usano solo i dati locali.
