# Architettura di Spazi 1.0

## Componenti

| Modulo | Responsabilità |
| --- | --- |
| dist/domain.js | Date di Roma, risorse, disponibilità, settimana lunedì–domenica, export |
| dist/payments.js | Occupazione delle risorse; le riunioni terminate liberano la capacità |
| dist/booking-service.js | Creazione e cancellazione della demo |
| dist/attendance.js | Codici numerici, inizio e termine della demo |
| dist/storage.js | Dati demo separati, migrazione e pulizia dei soli test sintetici |
| dist/transport.js | API, timeout e messaggi di rete |
| dist/app.js | Prenotazione, calendario, storico, amministrazione e timer del tablet |
| server/server.mjs | API, autorizzazioni, transazioni, idempotenza e audit |
| server/security.mjs | Hash password asincroni, origine pubblica, proxy fidato, header e limiti richieste |
| server/database.mjs | SQLite con WAL, vincoli univoci e migrazioni additive |
| server/accounts.mjs / manage-admin.mjs | Creazione iniziale dell'amministratore dal server |
| server/backup-service.mjs / backup.mjs | Snapshot consistenti con controllo di integrità |
| deploy | HTTPS pubblico, persistenza e servizio supervisionato |

## Dati e concorrenza

Ogni prenotazione appartiene a un account. Le modifiche alle prenotazioni sono serializzate con transazioni SQLite BEGIN IMMEDIATE. Una chiave idempotente per utente impedisce che ritentare una stessa richiesta crei duplicati. Le impostazioni richiedono la revisione corrente; le modifiche obsolete vengono rifiutate. I codici riunione hanno un hash univoco per la verifica e una copia nei dati riservati del proprietario, necessaria per mostrarli di nuovo.

La fine della riunione conserva lo storico ma libera subito la risorsa. Quota settimanale e occupazione sono regole distinte: una riunione già svolta continua a contare nelle dieci di quella settimana. La disponibilità degli altri utenti include solo risorsa, data, orari e stato, senza referente, finalità o codice.

## Account e sicurezza

Password con salt e scrypt asincrono, sessioni lato server e cookie HttpOnly/SameSite/Secure in produzione. La password temporanea va cambiata al primo accesso. Disattivazione e ripristino password revocano le sessioni dell'account. Gli endpoint verificano il ruolo indipendentemente dai menu visibili. I tablet assegnati a una sala non possono verificare codici di altre sale né leggere presenze di altre sale.

La produzione richiede un'origine HTTPS esplicita. Header inoltrati vengono considerati solo da indirizzi proxy dichiarati; il dominio della richiesta deve corrispondere all'origine configurata. I limiti di richieste e tentativi sono in memoria e si azzerano al riavvio: per una distribuzione più grande va aggiunta una protezione al proxy o una gestione distribuita dei limiti. Nessun endpoint permette la registrazione autonoma.

## Demo e uso reale

La demo conserva i dati nel browser e non condivide la disponibilità fra dispositivi. In produzione è disabilitata. Se il server non risponde, l'app mostra un errore e non passa alla demo. Gli account e le prenotazioni reali restano nel database, mai nella demo. Il timer usa l'orario del server per evitare che un tablet con l'orologio sfasato mostri una durata sbagliata.

## Operatività

Node 24, un'istanza applicativa e disco persistente locale. Docker Compose include un proxy Caddy e volumi separati per dati, backup e certificati; è fornito anche un modello systemd. Gli snapshot vengono controllati e il ripristino su una copia è testato. Alta disponibilità e più istanze richiederanno un'architettura e un database differenti. Non ci sono email, pagamenti o sincronizzazione bidirezionale dei calendari.

I vecchi script Python e documenti di collaudo precedenti nella cartella di lavoro sono materiale storico; non fanno parte del pacchetto di rilascio e non devono essere usati per rigenerare la versione corrente.
