// ---------------------- IMPORT MODULE ----------------------
const express = require('express')
const path = require('path')
const crypto = require('crypto')
const mysql = require('mysql2')    // Import modul untuk koneksi ke MySQL
require('dotenv').config()


const app = express()
const port = 3000

// ---------------------- MIDDLEWARE ----------------------
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// ---------------------- KONFIGURASI DATABASE ----------------------
// Ubah sesuai dengan konfigurasi MySQL kamu
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',          // ubah jika user MySQL kamu berbeda
  password: 'Df999999999999.',          // isi jika ada password MySQL
  database: 'apikey_db'  // nama database yang kita buat di atas
})

// Tes koneksi ke database
db.connect((err) => {
  if (err) {
    console.error('❌ Gagal terhubung ke database:', err)
  } else {
    console.log('✅ Terhubung ke database MySQL')
  }
})

// ---------------------- ENDPOINT TEST ----------------------
app.get('/test', (req, res) => {
  res.send('Server API Key berjalan normal 🚀')
})

// ---------------------- ENDPOINT BUAT API KEY ----------------------
app.post('/create', (req, res) => {
  // Generate 3 bagian random API key
  const apiKey = `sk-sm-v1-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`

  // Simpan ke database
  const query = 'INSERT INTO api_keys (api_key) VALUES (?)'
  db.query(query, [apiKey], (err, result) => {
    if (err) {
      console.error('❌ Gagal menyimpan API key:', err)
      return res.status(500).json({ message: 'Gagal menyimpan API key.' })
    }

    console.log('🔑 API Key baru disimpan:', apiKey)
    res.json({ apiKey })
  })
})

// ---------------------- ENDPOINT CEK API KEY ----------------------
app.post('/checkapi', (req, res) => {
  const { apiKey } = req.body

  // Validasi input
  if (!apiKey) {
    return res.status(400).json({ valid: false, message: 'API key tidak boleh kosong.' })
  }

  // Cari di database
  const query = 'SELECT * FROM api_keys WHERE api_key = ?'
  db.query(query, [apiKey], (err, results) => {
    if (err) {
      console.error('❌ Gagal mengecek API key:', err)
      return res.status(500).json({ valid: false, message: 'Terjadi kesalahan server.' })
    }

    if (results.length > 0) {
      // Jika ditemukan → valid
      res.json({ valid: true, message: 'API key valid ✅' })
    } else {
      // Jika tidak ditemukan → tidak valid
      res.json({ valid: false, message: 'API key tidak valid ❌' })
    }
  })
})

// ---------------------- HALAMAN UTAMA ----------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// ---------------------- JALANKAN SERVER ----------------------
app.listen(port, () => {
  console.log(`✅ Server berjalan di http://localhost:${port}`)
})
