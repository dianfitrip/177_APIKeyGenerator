// ---------------------- IMPORT MODULE ----------------------
const express = require('express')
const path = require('path')
const crypto = require('crypto')
const mysql = require('mysql2')
const bcrypt = require('bcrypt')
const session = require('express-session') // Import session
require('dotenv').config()

const app = express()
const port = 3000
const SALT_ROUNDS = 10 // Untuk bcrypt

// ---------------------- MIDDLEWARE -----------------------
app.use(express.json()) // Untuk parsing body JSON
app.use(express.urlencoded({ extended: true })) // Untuk parsing form-encoded body
app.use(express.static(path.join(__dirname, 'public')))

// Konfigurasi Session
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'rahasia-banget-nih', // Ambil dari .env atau gunakan default
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set 'true' jika Anda menggunakan HTTPS
      maxAge: 1000 * 60 * 60 * 24, // Cookie berlaku 1 hari
    },
  })
)

// ---------------------- KONFIGURASI DATABASE ----------------------
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Df999999999999.',
  database: 'apikey_db',
}).promise() // Gunakan .promise() untuk async/await

// Tes koneksi (opsional, .promise() menangani ini)
db.connect()
  .then(() => console.log('✅ Terhubung ke database MySQL'))
  .catch((err) => console.error('❌ Gagal terhubung ke database:', err))

// ---------------------- ENDPOINT TEST ----------------------
app.get('/test', (req, res) => {
  res.send('Server API Key berjalan normal 🚀')
})

// ---------------------- ENDPOINT USER BARU ----------------------

/**
 * Endpoint ini hanya men-generate API Key dan menyimpannya ke DB.
 * Endpoint ini dipanggil oleh tombol "Create API Key" di index.html.
 */
app.post('/generate-key', async (req, res) => {
  try {
    // Generate 3 bagian random API key
    const apiKey = `sk-sm-v1-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`

    // Hitung tanggal kadaluarsa (1 bulan dari sekarang)
    const outofdate = new Date()
    outofdate.setMonth(outofdate.getMonth() + 1)

    // Simpan ke database
    const query = 'INSERT INTO api_keys (api_key, outofdate) VALUES (?, ?)'
    const [result] = await db.query(query, [apiKey, outofdate])

    console.log('🔑 API Key baru disimpan:', apiKey)
    // Kembalikan API key DAN ID-nya
    res.json({ apiKey, apiKeyId: result.insertId })
  } catch (err) {
    console.error('❌ Gagal menyimpan API key:', err)
    res.status(500).json({ message: 'Gagal menyimpan API key.' })
  }
})

/**
 * Endpoint ini mendaftarkan user baru.
 * Dipanggil oleh tombol "Save" di index.html setelah API key di-generate.
 */
app.post('/register', async (req, res) => {
  const { firstName, lastName, email, apiKeyId } = req.body

  // Validasi input
  if (!firstName || !lastName || !email || !apiKeyId) {
    return res.status(400).json({ message: 'Semua field harus diisi.' })
  }

  try {
    // Cek apakah email sudah terdaftar
    let [users] = await db.query('SELECT * FROM users WHERE email = ?', [email])
    if (users.length > 0) {
      return res.status(409).json({ message: 'Email sudah terdaftar.' })
    }

    // Cek apakah api_key_id sudah terpakai
    let [keys] = await db.query('SELECT * FROM users WHERE api_key_id = ?', [
      apiKeyId,
    ])
    if (keys.length > 0) {
      return res
        .status(409)
        .json({ message: 'API Key ID ini sudah digunakan.' })
    }

    // Simpan user baru
    const query =
      'INSERT INTO users (first_name, last_name, email, api_key_id) VALUES (?, ?, ?, ?)'
    await db.query(query, [firstName, lastName, email, apiKeyId])

    res.status(201).json({ message: 'User berhasil didaftarkan! ✅' })
  } catch (err) {
    console.error('❌ Gagal mendaftarkan user:', err)
    res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
})

// ---------------------- ENDPOINT CEK API KEY (Login User) ----------------------
app.post('/checkapi', async (req, res) => {
  const { apiKey } = req.body

  if (!apiKey) {
    return res
      .status(400)
      .json({ valid: false, message: 'API key tidak boleh kosong.' })
  }

  try {
    const query = 'SELECT * FROM api_keys WHERE api_key = ?'
    const [keys] = await db.query(query, [apiKey])

    if (keys.length > 0) {
      const keyData = keys[0]

      // Cek kadaluarsa
      if (new Date(keyData.outofdate) < new Date()) {
        return res
          .status(401)
          .json({ valid: false, message: 'API key sudah kadaluarsa. ⏳' })
      }

      // Cek apakah key terhubung ke user
      const [users] = await db.query(
        'SELECT first_name, last_name, email FROM users WHERE api_key_id = ?',
        [keyData.id]
      )

      if (users.length > 0) {
        res.json({
          valid: true,
          message: 'API key valid ✅',
          user: users[0],
        })
      } else {
        res.json({
          valid: true,
          message: 'API key valid, tapi belum terhubung ke user.',
          user: null,
        })
      }
    } else {
      res.json({ valid: false, message: 'API key tidak valid ❌' })
    }
  } catch (err) {
    console.error('❌ Gagal mengecek API key:', err)
    res.status(500).json({ valid: false, message: 'Terjadi kesalahan server.' })
  }
})

// ---------------------- RUTE HALAMAN ----------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.get('/admin-register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-register.html'))
})

app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'))
})

// Halaman dashboard, dilindungi oleh middleware
app.get('/admin-dashboard', isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'))
})

// ---------------------- RUTE ADMIN ----------------------

// Middleware untuk proteksi rute admin
function isAdmin(req, res, next) {
  if (req.session.adminId) {
    next() // Lanjut jika admin sudah login
  } else {
    // Jika tidak ada session, redirect ke halaman login
    res.redirect('/admin-login.html')
  }
}

// 1. Registrasi Admin
app.post('/admin/register', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password harus diisi.' })
  }

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

    // Simpan admin ke DB
    const query = 'INSERT INTO admins (email, password) VALUES (?, ?)'
    await db.query(query, [email, hashedPassword])

    res.status(201).json({ message: 'Admin berhasil didaftarkan! ✅' })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email admin sudah ada.' })
    }
    console.error('❌ Gagal registrasi admin:', err)
    res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
})

// 2. Login Admin
app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password harus diisi.' })
  }

  try {
    // Cari admin berdasarkan email
    const query = 'SELECT * FROM admins WHERE email = ?'
    const [admins] = await db.query(query, [email])

    if (admins.length === 0) {
      return res.status(401).json({ message: 'Email atau password salah.' })
    }

    const admin = admins[0]

    // Bandingkan password
    const isMatch = await bcrypt.compare(password, admin.password)

    if (isMatch) {
      // Buat session
      req.session.adminId = admin.id
      req.session.adminEmail = admin.email
      res.json({ message: 'Login berhasil! Mengarahkan ke dashboard...' })
    } else {
      res.status(401).json({ message: 'Email atau password salah.' })
    }
  } catch (err) {
    console.error('❌ Gagal login admin:', err)
    res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
})

// 3. Logout Admin
app.get('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res
        .status(500)
        .json({ message: 'Gagal logout.' })
    }
    res.redirect('/admin-login.html')
  })
})

// 4. API untuk mengambil data user (untuk dashboard)
app.get('/admin/users', isAdmin, async (req, res) => {
  try {
    const query = `
      SELECT 
        u.first_name, 
        u.last_name, 
        u.email, 
        a.api_key, 
        a.outofdate
      FROM users u
      JOIN api_keys a ON u.api_key_id = a.id
      ORDER BY u.created_at DESC
    `
    const [users] = await db.query(query)

    // Tambahkan status kadaluarsa
    const usersWithStatus = users.map((user) => ({
      ...user,
      is_expired: new Date(user.outofdate) < new Date(),
    }))

    res.json(usersWithStatus)
  } catch (err) {
    console.error('❌ Gagal mengambil data user:', err)
    res.status(500).json({ message: 'Terjadi kesalahan server.' })
  }
})

// ---------------------- JALANKAN SERVER ----------------------
app.listen(port, () => {
  console.log(`✅ Server berjalan di http://localhost:${port}`)
})