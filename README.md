# ELITE - komunikator internetowy

Prosty komunikator internetowy napisany w Node.js (Express + Socket.io).
Bez CSS - czysta funkcjonalnosc: wpisujesz nick, piszesz wiadomosc, wysylasz,
wszyscy podlaczeni widza ja na zywo.

## Uruchomienie lokalne

1. Zainstaluj zaleznosci:
   ```
   npm install
   ```
2. Uruchom serwer:
   ```
   npm start
   ```
3. Otworz w przegladarce:
   ```
   http://localhost:3000
   ```

## Wdrozenie na Render

1. Wrzuc ten folder jako repozytorium na GitHub (albo GitLab/Bitbucket).
2. Wejdz na https://render.com i zaloguj sie / zaloz konto.
3. Kliknij **New +** -> **Web Service**.
4. Wybierz swoje repozytorium z kodem ELITE.
5. Ustawienia:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
6. Kliknij **Create Web Service** - Render sam nada port przez zmienna
   srodowiskowa `PORT`, ktora serwer juz obsluguje.
7. Po zakonczeniu builda dostaniesz publiczny adres URL (np.
   `https://elite-xxxx.onrender.com`) - to Twoj dzialajacy komunikator.

## Uwaga

Wiadomosci sa trzymane tylko w pamieci serwera (max 200 ostatnich) i znikaja
po restarcie/redeployu. Jesli chcesz trwale zapisywanie wiadomosci (np. w
bazie danych), daj znac - moge to dodac.

## Struktura projektu

```
elite-chat/
├── package.json
├── server.js
├── README.md
└── public/
    └── index.html
```
