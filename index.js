// ---------------------- IMPORT MODULE ----------------------
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// ---------------------- MIDDLEWARE ----------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------- KONFIG DATABASE ----------------------
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'Df999999999999.', 
  database: process.env.DB_NAME || 'apikey_db'
});

db.connect(err => {
  if (err) console.error("❌ DB ERROR:", err);
  else console.log("✅ Terkoneksi ke MySQL");
});

// ---------------------- TEST ----------------------
app.get('/test', (req, res) => {
  res.send("Server berjalan normal");
});

// ---------------------- CREATE API KEY ----------------------
app.post('/create', (req, res) => {
  const apiKey = `sk-sm-v1-${crypto.randomBytes(16).toString('hex')}`;
  const statusToInsert = null; // FIX: Menggunakan NULL untuk TIMESTAMP

  // FIX: Menggunakan `api_key` dan `outofdate`
  const query = "INSERT INTO api_keys (api_key, outofdate) VALUES (?, ?)"; 
  
  db.query(query, [apiKey, statusToInsert], (err) => {
    if (err) {
      console.error("Error INSERT API Key:", err); 
      return res.status(500).json({ success: false, message: "Gagal menyimpan key ke database." }); 
    }
    res.status(201).json({ success: true, apiKey });
  });
});

// ---------------------- SAVE USER + API KEY FK ----------------------
app.post('/save-user', (req, res) => {
  const { apiKey, first_name, last_name, email } = req.body;

  if (!apiKey || !first_name || !last_name || !email) {
    return res.json({ success: false, message: "Data belum lengkap!" });
  }

  // FIX: Menggunakan `api_key`
  const findKey = "SELECT id FROM api_keys WHERE api_key = ?";
  
  db.query(findKey, [apiKey], (err, keyResult) => {
    if (err || keyResult.length === 0) {
      return res.json({ success: false, message: "API Key tidak ditemukan!" });
    }

    const apiKeyId = keyResult[0].id;
    const insertUser = "INSERT INTO users (first_name, last_name, email, api_key_id) VALUES (?, ?, ?, ?)";

    db.query(insertUser, [first_name, last_name, email, apiKeyId], (err) => {
      if (err) {
        return res.json({ success: false, message: "Email sudah terdaftar!" });
      }
      res.json({ success: true, message: "User berhasil disimpan!" });
    });
  });
});

// ---------------------- ADMIN REGISTER ----------------------
app.post('/admin/register', async (req, res) => {
  const { email, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  // FIX: Menggunakan tabel `admins`
  db.query("INSERT INTO admins (email, password) VALUES (?, ?)",
    [email, hashed],
    (err) => {
      if (err && err.code === 'ER_DUP_ENTRY') { 
        return res.json({ success: false, message: "Email Admin sudah terdaftar!" }); 
      } else if (err) {
        console.error("Error Register Admin:", err);
        return res.status(500).json({ success: false, message: "Pendaftaran gagal. Cek koneksi DB/tabel." });
      }
      res.json({ success: true, message: "Admin berhasil dibuat!" });
    });
});

// ---------------------- ADMIN LOGIN ----------------------
app.post('/admin/login', (req, res) => {
  const { email, password } = req.body;

  // FIX: Menggunakan tabel `admins`
  db.query("SELECT * FROM admins WHERE email = ?", [email], async (err, result) => {
    if (err) {
      console.error("Error Login Admin:", err);
      return res.status(500).json({ success: false, message: "Terjadi kesalahan server saat login." });
    }
    
    if (result.length === 0) {
      return res.json({ success: false, message: "Admin tidak ditemukan!" });
    }

    const admin = result[0];
    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res.json({ success: false, message: "Password salah!" });
    }

    res.json({ success: true, message: "Login berhasil!" });
  });
});

// ---------------------- DASHBOARD: GET ALL USERS (FINAL FIX: created_at) ----------------------
app.get('/admin/users', (req, res) => {
  // FIX: Mengubah `api_keys.createdAt` menjadi `api_keys.created_at AS createdAt`
  const query = `
    SELECT users.id, users.first_name, users.last_name, users.email, 
           api_keys.api_key AS 'key', 
           api_keys.created_at AS createdAt, 
           api_keys.outofdate AS out_of_date 
    FROM users 
    LEFT JOIN api_keys ON users.api_key_id = api_keys.id
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error("Error Get Users:", err); 
      return res.json({ success: false, message: "Gagal mengambil data user." });
    }

    // PROSES LOGIKA 30 HARI DI SINI
    const finalData = result.map(user => {
      let status = 'ON'; // Default aktif

      if (!user.key) {
        status = 'OFF';
      } else {
        const createdDate = new Date(user.createdAt);
        const now = new Date();
        const diffTime = Math.abs(now - createdDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        if (user.out_of_date !== null || diffDays > 30) {
          status = 'OFF';
        }
      }
      return { ...user, status };
    });

    res.json({ success: true, data: finalData });
  });
});

// ---------------------- ADMIN DELETE USER ----------------------
app.delete('/admin/delete-user/:id', (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM users WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).json({ message: "Gagal menghapus" });
    res.json({ message: "User berhasil dihapus" });
  });
});

// ---------------------- ROUTING FILE HTML ----------------------
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/admin/login', (req, res) => {
  res.sendFile(__dirname + '/public/admin/login.html');
});

app.get('/admin/register', (req, res) => {
  res.sendFile(__dirname + '/public/admin/register.html');
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/admin/dashboard.html');
});

// ---------------------- RUN SERVER ----------------------
app.listen(port, () => {
  console.log(`Server running → http://localhost:${port}`);
});