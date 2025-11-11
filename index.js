const express = require('express')
const path = require('path')
const app = express()
const port = 3000

// Middleware untuk melayani file statis dari folder "public"
app.use(express.static(path.join(__dirname, 'public')))

// Endpoint contoh
app.get('/test', (req, res) => {
  res.send('Hello World!')
})

// Rute utama: kirim file index.html dari folder publicc
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`)
})
