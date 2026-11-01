# Installazione di Spazi 1.0

Questa versione usa un servizio Node 24 con database SQLite persistente. Funziona da Internet e dalla rete aziendale tramite lo stesso indirizzo HTTPS. Richiede un server che esegua Node o Docker: uno spazio hosting soltanto statico o PHP non è sufficiente. Il collaudo locale è completato; dominio, certificato e accesso da rete esterna vanno verificati sul server effettivo.

## Prima dell'installazione

Servono il dominio scelto, il server con accesso amministrativo, un referente per account e backup e un archivio protetto esterno al server. Collegare il DNS del dominio all'indirizzo del server. Aprire soltanto le porte pubbliche 80 e 443; la porta dell'applicazione rimane interna. Non inviare password o chiavi nella chat.

## Percorso Docker su server compatibile

Nel pacchetto, aprire la cartella `deploy`. Copiare `.env.example` in `.env` e sostituire dominio ed email del referente.

```sh
docker compose config
docker compose up -d --build
docker compose ps
docker compose exec app node server/manage-admin.mjs
```

L'ultimo comando crea il primo amministratore dal terminale del server; nome, cognome, email e codice di apertura porta vengono registrati, con il codice protetto da hash. Il servizio pubblico non consente il setup via browser. Il certificato viene gestito dal proxy Caddy. Dopo la creazione accedere all'indirizzo HTTPS e creare gli account degli utenti.

`compose.yaml` usa una rete privata dedicata: controllare che la sottorete indicata non sia già usata dal server. Se va cambiata, aggiornare insieme rete, indirizzi dei due servizi e `SPAZI_TRUSTED_PROXIES`. Il container dell'applicazione non pubblica la propria porta. I volumi conservano database, backup e certificati anche quando il container viene ricreato. Non usare `docker compose down -v` durante un aggiornamento: rimuoverebbe i volumi persistenti.

## Percorso Node senza Docker

Installare Node 24 sul server. `server.env.example` mostra le variabili necessarie. In produzione impostare l'indirizzo pubblico HTTPS, disabilitare la demo e indicare esattamente gli indirizzi del proxy fidato. Il servizio deve ascoltare solo su loopback; il proxy inoltra le richieste, mantiene il dominio pubblico e sovrascrive `X-Real-IP` e `X-Forwarded-Proto` come nei file Caddy forniti.

```sh
node --env-file=deploy/server.env server/manage-admin.mjs
node --env-file=deploy/server.env server/server.mjs
```

Su Linux il file `spazi.service` è un modello per systemd: preparare l'utente `spazi`, il percorso del programma e le directory dei dati e dei backup con permessi riservati, quindi adattare e installare il servizio. Sul server Windows usare un servizio o un'attività pianificata gestita dall'IT con le stesse variabili e un proxy HTTPS. Il modello systemd non è utilizzabile su Windows. I percorsi di esempio Linux devono essere cambiati sul server Windows.

## Configurazione degli account

Solo l'amministratore crea gli account; non c'è registrazione pubblica. Per accedere servono nome, cognome, email e codice di apertura porta. L'amministratore assegna il codice all'account e può reimpostare nome, cognome e codice; l'operazione chiude le sessioni precedenti. Un amministratore non può disattivare il proprio account. I vecchi account non hanno ancora il campo cognome e il codice: prima del nuovo accesso, l'amministratore deve recuperare il proprio account dal terminale e reimpostare gli altri dal pannello Account.

Se l'amministratore perde l'accesso o deve migrare da un account precedente, un responsabile con accesso al terminale e al database del server può eseguire `node server/manage-admin.mjs recover` (o `docker compose exec app node server/manage-admin.mjs recover`). Il comando richiede email, nome, cognome e nuovo codice; il codice viene digitato in modo nascosto, le sessioni precedenti vengono revocate e l'operazione è registrata nell'audit. Questo recupero non è disponibile dal sito pubblico.

Per il tablet creare un account Operatore e assegnargli la sala corrispondente nel campo “Sala del tablet”. Il controllo viene applicato anche sul server. Un operatore senza sala assegnata può gestire tutte le sale. Sul tablet aprire `/?tablet=1#checkin` all'indirizzo HTTPS del servizio e accedere con questo account.

## Backup e ripristino

```sh
docker compose exec app node server/backup.mjs
```

Il backup viene salvato nel volume dei backup, con controllo di integrità. Per estrarne una copia:

```sh
docker compose cp app:/backups ./backup-export
```

In installazione Node usare `node --env-file=deploy/server.env server/backup.mjs`. Copiare i backup in un archivio protetto su un altro dispositivo e pianificarne l'esecuzione con lo scheduler del server. La frequenza e la conservazione dipendono dalle esigenze dell'azienda; il pacchetto non configura automaticamente lo scheduler del server.

Per ripristinare: fermare l'applicazione, conservare una copia dei file correnti, sostituire il database con lo snapshot scelto nella directory persistente, non riutilizzare i vecchi file WAL/SHM e riavviare. Controllare integrità, accesso, prenotazioni e audit. Provare prima su un'istanza isolata. I test automatici verificano la riapertura di uno snapshot; non attestano il ripristino sul tuo hosting.

## Collaudo prima dell'apertura

1. Accedere dal dominio HTTPS da un telefono su rete mobile, con Wi-Fi disattivato.
2. Prenotare la stessa fascia da due account: una sola richiesta deve riuscire.
3. Verificare pranzo, tavolo intero, calendario, storico e annullamento.
4. Verificare il tablet: codice errato, sala diversa, inizio, timer, ricarica e termine anticipato. La sala deve risultare libera nell'altra sessione.
5. Verificare che utenti e operatori non possano gestire gli account amministrativi.
6. Riavviare il servizio e confermare persistenza di dati e accessi.
7. Eseguire un backup ed effettuare un ripristino su copia isolata.

In locale tutte le suite si eseguono con `npm test`, oppure `node scripts/test-all.mjs`. Il controllo `/healthz` restituisce disponibilità e versione, senza account o dettagli delle prenotazioni.

## Aggiornamenti e ritorno alla versione precedente

Prima di aggiornare, creare un backup e conservare il pacchetto corrente. Installare il nuovo programma senza sostituire la directory dei dati. Le aggiunte allo schema sono applicate in modo non distruttivo all'avvio. Per tornare a una versione precedente, fermare il servizio e ripristinare insieme programma e snapshot del database corrispondente; controllare prima il risultato su una copia isolata.

## Limiti concreti

L'installazione prevista è su una sola istanza con disco persistente locale. Non distribuire copie indipendenti del servizio su più server con lo stesso SQLite né usarlo su filesystem di rete. Una futura installazione con più istanze richiederà un database e una strategia di concorrenza adatti. Non sono inclusi email automatiche, sincronizzazione bidirezionale con calendari, pagamenti o accesso tramite identità aziendale: gli export dei calendari restano manuali.

Riferimenti del proxy: [documentazione Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). Riferimenti delle sessioni: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
