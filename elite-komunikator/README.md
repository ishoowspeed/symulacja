# ELITE

Wspólny czat działający w czasie rzeczywistym w przeglądarce, zbudowany z Node.js, Express i Socket.IO.

## Uruchomienie

1. Zainstaluj [Node.js](https://nodejs.org/) (wersja LTS).
2. W folderze projektu uruchom `npm install`.
3. Uruchom komunikator poleceniem `npm start`.
4. Otwórz w przeglądarce adres `http://localhost:3000`.

## Publikacja w internecie

Wgraj projekt na hosting obsługujący Node.js (np. Render, Railway lub Fly.io), ustaw polecenie startowe na `npm start` i otwórz otrzymany publiczny adres. Każda osoba korzystająca z tego samego adresu zobaczy wspólny czat.

Historia wiadomości jest obecnie zapisywana w pamięci serwera i znika po jego restarcie. Aby zachować ją na stałe, można w kolejnym kroku dodać bazę danych.
