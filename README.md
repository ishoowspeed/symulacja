# Gotowa Aplikacja z Bazą Neon.tech (Render.com)

Ten projekt jest gotowy do wdrożenia na platformie **Render.com**. 
Aplikacja automatycznie tworzy potrzebną tabelę w bazie danych PostgreSQL przy pierwszym uruchomieniu.

## Jak wdrożyć projekt na Render.com?

1. Rozpakuj ten plik `.zip`.
2. Wrzuć zawartość folderu do swojego repozytorium na **GitHub**.
3. Wejdź na **[dashboard.render.com](https://dashboard.render.com/)** i utwórz nową usługę **Web Service** powiązaną z tym repozytorium GitHub.
4. W zakładce **Environment** w panelu Render dodaj zmienną środowiskową:
   - **Key (Nazwa):** `DATABASE_URL`
   - **Value (Wartość):** Twój ciąg połączeniowy z Neon.tech (np. `postgresql://user:pass@ep-cool-name.neon.tech/neondb?sslmode=require`)
5. Zapisz zmiany. Render automatycznie zainstaluje zależności (`npm install`) i uruchomi serwer (`npm start`).
