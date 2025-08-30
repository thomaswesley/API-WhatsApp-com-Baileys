import 'dotenv/config'

// === Guardas globais de erro (mantêm o processo vivo) ===
process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err)
})
// =========================================================

import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server as SocketIOServer } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import whatsAppRoutes from './routes/whatsAppRoutes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const server = http.createServer(app)

const FRONTEND = process.env.APP_TWS_SOFTWARE_FRONTEND

app.use(
  cors({
    origin: FRONTEND,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
)

app.use(express.json())

const io = new SocketIOServer(server, {
  cors: {
    origin: FRONTEND,
    methods: ['GET', 'POST'],
    credentials: true
  }
})

io.on('connection', (socket) => {
  //console.log('Cliente conectado ao websocket:', socket.id);

  socket.on('disconnect', () => {
    console.log('Cliente desconectado ao websocket:', socket.id);
  });
});

app.set('io', io);

// Disponibiliza io na request
/*app.use((req, res, next) => {
  req.io = io
  next()
})*/

app.get('/', (req, res) => {
  return res.json({
    message:
      'A API WhatsApp com Baileys informa: Página não encontrada ou acesso não permitido!'
  })
})

app.use(express.static(join(__dirname, 'public')))
app.use('/images', express.static(join(__dirname, 'images')))

app.use('/api/whatsapp', whatsAppRoutes)

const PORT = process.env.PORT || 8081
server.listen(PORT, '0.0.0.0', () => {
  console.log(`API rodando em http://localhost:${PORT}`)
})

// Trata erro de porta ocupada
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Porta ${PORT} já está em uso.`)
  } else {
    console.error('Erro no servidor:', err)
  }
})
