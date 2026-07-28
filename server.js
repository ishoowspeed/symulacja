# Mini Komunikator

Prosty komunikator internetowy: jeden plik HTML (frontend) + Node.js z Socket.io (backend).
Wiadomości są przesyłane w czasie rzeczywistym do wszystkich osób na stronie.

## Struktura plików

```
komunikator/
├── server.js          ← serwer Node.js
├── package.json        ← zależności
└── public/
    ├── index.html        ← ekran logowania (styl fioletowy)
    └── chat.html         ← właściwy czat
```

## Ekran logowania

- Strona startowa (`index.html`) to teraz ekran logowania w stylu fioletowym.
- Pole **Nazwa** zapisuje nick w przeglądarce (localStorage) i po kliknięciu **Zaloguj się** przenosi od razu do czatu (`chat.html`) — nie trzeba już wpisywać nicku na czacie.
- Pole **Hasło**, link **Nie pamiętasz hasła?** oraz **Zarejestruj się** są na razie tylko wizualne — nic jeszcze nie robią (zgodnie z ustaleniami, można to dorobić później: prawdziwe konta, hasła, baza użytkowników itd.).
- Jeśli ktoś wejdzie na `chat.html` bez zapisanego nicku, zostanie automatycznie przekierowany z powrotem do ekranu logowania.

## Uruchomienie lokalnie (test)

1. Zainstaluj [Node.js](https://nodejs.org) (wersja 18+).
2. W folderze projektu wpisz:
   ```
   npm install
   npm start
   ```
3. Otwórz w przeglądarce: `http://localhost:3000`

## Wdrożenie na darmowy hosting (Render.com)

Render.com ma darmowy plan dla aplikacji Node.js i jest najprostszy w konfiguracji.

1. Załóż konto na **render.com** (może być przez GitHub).
2. Wrzuć ten folder jako repozytorium na GitHub (albo użyj przycisku "Upload" w Render, jeśli wspiera wgrywanie zip — w razie potrzeby wgraj ręcznie na GitHub: nowe repo → "Add file" → "Upload files").
3. W Render: **New +** → **Web Service** → wybierz swoje repozytorium.
4. Ustawienia:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Kliknij **Create Web Service**. Po chwili dostaniesz publiczny adres typu:
   `https://twoja-nazwa.onrender.com`

Uwaga: darmowy plan Render usypia aplikację po ok. 15 minutach bez ruchu — pierwsze wejście po przerwie może potrwać do 30-50 sekund.

## Alternatywy (też darmowe)

- **Railway.app** – podobny proces jak Render, limit godzin w darmowym planie.
- **Cyclic.sh** / **Fly.io** – też obsługują Node.js za darmo.
- **Glitch.com** – można wgrać pliki bezpośrednio bez GitHuba (przeciągnij i upuść), dobre na szybki test.

## Jak to działa

- `server.js` uruchamia serwer Express, który serwuje plik `index.html`, oraz nasłuchuje połączeń przez Socket.io.
- Gdy ktoś wejdzie na stronę, podaje nick i dołącza do wspólnego pokoju czatu.
- Każda wysłana wiadomość trafia przez serwer do wszystkich podłączonych użytkowników.
- Wiadomości NIE są zapisywane w bazie danych — po restarcie serwera historia znika (to jest wersja "mega prosta"). Jeśli chcesz historię wiadomości zapisywaną na stałe, daj znać — można dodać prostą bazę (np. plik JSON lub SQLite).
