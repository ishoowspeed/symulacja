const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Polaczenie z baza Neon pobierane ze zmiennej środowiskowej DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Tworzenie tabeli automatycznie przy starcie, jesli jeszcze nie istnieje
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tabela users jest gotowa.');
  } catch (err) {
    console.error('Blad podczas inicjalizacji bazy danych:', err);
  }
}
initDb();

// Endpoint Rejestracji
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Podaj nazwe uzytkownika i haslo.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );
    res.status(201).json({ success: true, message: 'Konto utworzone pomyslnie!', user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // Unikalnosc nazwy uzytkownika
      return res.status(400).json({ success: false, message: 'Uzytkownik o takiej nazwie juz istnieje.' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Blad serwera podczas rejestracji.' });
  }
});

// Endpoint Logowania
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, username FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      res.json({ success: true, message: 'Zalogowano pomyslnie!', user: result.rows[0] });
    } else {
      res.status(401).json({ success: false, message: 'Nieprawidlowy login lub haslo.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Blad serwera podczas logowania.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serwer dziala na porcie ${PORT}`);
});
