# ELITE Communicator

Prosty, elegancki komunikator pisemny w fioletowym motywie inspirowany Discordem, stworzony w Node.js, Express i Socket.io.

## Funkcje:
- **Kanał GŁÓWNY**: Ogólny publiczny czat tekstowy dla wszystkich połączonych użytkowników.
- **Wiadomości Prywatne (PW/DM)**: Możliwość rozpoczęcia czatu z konkretnym użytkownikiem po podaniu jego unikalnego ID.
- **Unikalne ID**: Każdy użytkownik po wejściu otrzymuje własne ID (np. `ELITE-A1B2C3`), które może łatwo skopiować ze swojego profilu w lewym dolnym rogu.
- **Mega prosty wygląd CSS**: Brak przeskoczonych bibliotek UI, czysty fioletowy motyw Discorda.

## Jak uruchomić lokalnie:

1. Przejdź do folderu projektu:
   ```bash
   cd ELITE
   ```
2. Zainstaluj zależności:
   ```bash
   npm install
   ```
3. Uruchom serwer:
   ```bash
   npm start
   ```
4. Otwórz w przeglądarce: [http://localhost:3000](http://localhost:3000)

---

## Jak wdrożyć na Render.com:

1. Wgraj folder projektu do swojego repozytorium na **GitHub / GitLab**.
2. Zaloguj się na [Render.com](https://render.com).
3. Kliknij **New +** -> **Web Service**.
4. Połącz swoje repozytorium GitHub z projektem `ELITE`.
5. Ustaw następujące opcje:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Kliknij **Create Web Service**.
7. Twój komunikator ELITE będzie gotowy pod wygenerowanym adresem URL!
