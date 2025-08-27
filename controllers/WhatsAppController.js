import { makeWASocket, Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, jidNormalizedUser, downloadMediaMessage } from 'baileys'
import P from 'pino'
import QRCode from 'qrcode'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import MessageLog from '../models/WhatsApp.js'

let sock = null
let latestQR = null
let latestQRAt = 0
let connected = false
let initializing = null
let ioRef = null
let photo = ''

const logger = P({ level: 'silent' })

function destinatario(input) {
  
  if (!input) {
    return false;
  }

  const digits = input.replace(/\D/g, '')

  if (!digits) {
    return false;
  }

  return `${digits}@s.whatsapp.net`;
}

async function conectarWhatsApp() {

  if (sock && connected) {
    return sock
  } 

  if (initializing) {
    return initializing
  } 

  initializing = (async () => {

    const { state, saveCreds } = await useMultiFileAuthState('./auth')
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      logger,
      printQRInTerminal: false,
      auth: state,
      version,
      browser: Browsers.appropriate('Chrome')
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

      if (qr && !connected) {

        if (typeof qr !== 'string' || !qr.trim()) return

        latestQR = qr
        latestQRAt = Date.now()
        connected = false
        
        if (ioRef) {

          try {

            const svg = await QRCode.toString(qr, {
              type: 'svg',
              errorCorrectionLevel: 'H',
              margin: 3,
              width: 400
            })

            ioRef.emit('qr', { 
              ts: latestQRAt,
              error: false,
              message: 'WhatsApp não está conectado. Por favor, escaneie o QR Code.',
              svg: svg 
            })

          } catch (e) {
            console.warn('Falha ao gerar SVG do QR:', e?.message || e)
          }
        }
      }

      if (connection === 'open') {

        connected = true
        latestQR = null
        latestQRAt = 0
        console.log('O WhatsApp está conectado.')

        // normaliza: "556191610290:41@s.whatsapp.net" -> "556191610290@s.whatsapp.net"
        const raw   = sock.user?.id || ''
        const meJid = jidNormalizedUser(raw)

        let photoUrl = null
        try {
          photoUrl = await sock.profilePictureUrl(meJid, 'image')
          photo = photoUrl
        } catch {}
        if (!photoUrl) {
          try { 
            photoUrl = await sock.profilePictureUrl(meJid, 'preview') 
            photo = photoUrl
          } catch {}
        }

        if (ioRef) {
          ioRef.emit('connected', {
            error: false,
            message: 'O WhatsApp está conectado.', 
            connected: true,
            sock: sock.user,
            photoUrl: photoUrl
          })
        } 
      }

      if (connection === 'close') {

        connected = false
        latestQR = null
        const code = lastDisconnect?.error?.output?.statusCode
        console.warn('A conexão do WhatsApp foi fechada. statusCode:', code)

        if (ioRef) {
          ioRef.emit('disconnected', { 
            error: true,
            message: 'O WhatsApp está desconectado. Atualize a página para gerar um novo QR Code.', 
            connected: false 
          })
        }

        // Se sessão saiu/loggedOut, apaga credenciais para forçar novo pareamento
        const isLoggedOut = code === DisconnectReason.loggedOut

        if (isLoggedOut) {
          try { fs.rmSync(path.resolve('./auth'), { recursive: true, force: true }) } catch {}
        }

        const shouldReconnect = !isLoggedOut

        if (shouldReconnect) {
          conectarWhatsApp().catch(err => console.error('Reconn error', err))
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {

      try {

        const msg = messages?.[0]
        if (!msg || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const m = msg.message || {}
        const text =
          m.conversation ||
          m.extendedTextMessage?.text ||
          m.imageMessage?.caption ||
          m.videoMessage?.caption ||
          m.documentMessage?.caption ||
          m.templateButtonReplyMessage?.selectedDisplayText || '';

        let imageDataUrl = null
        let imageMime    = null
        let imageCaption = null

        if (m.imageMessage) {
          try {
            // baixa o binário da MÍDIA dessa mesma msg
            const buf = await downloadMediaMessage(msg, 'buffer', {}, { logger })
            imageMime    = m.imageMessage.mimetype || 'image/jpeg'
            imageCaption = m.imageMessage.caption || ''
            imageDataUrl = `data:${imageMime};base64,${buf.toString('base64')}`
          } catch {}
        }

        // descobrir quem é o remetente e pegar a foto
        const isGroup = from.endsWith('@g.us')
        const senderJidRaw = isGroup ? (msg.key.participant || '') : from
        const senderJid = senderJidRaw ? jidNormalizedUser(senderJidRaw) : from

        let photoUrl = null
        try {
          photoUrl = await sock.profilePictureUrl(senderJid, 'image') // pode ser null ou lançar
        } catch {}

        const senderName = msg.pushName || null
        const senderPhone = senderJid?.endsWith('@s.whatsapp.net')
          ? `+${senderJid.split('@')[0]}`
          : null
        // =====================================================

        const meRaw   = sock?.user?.id || ''                         // ex: "556191610290:41@s.whatsapp.net"
        const meJid   = jidNormalizedUser(meRaw)                     // -> "556191610290@s.whatsapp.net"
        const mePhone = meJid?.endsWith('@s.whatsapp.net')
          ? `+${meJid.split('@')[0]}`
          : meJid

        // marca como lida (opcional)
        //try { await sock.readMessages([msg.key]) } catch {}
        
        const dataBot = {
          message: text || '',
          time: new Date().toString(),
          senderId: 3,                  
          indiceArrayNewMessage: null, 
          from,                        
          text,                      
          id: msg.key.id,            
          timestamp: Number(msg.messageTimestamp) * 1000,
          type,
          photoUrl,
          senderJid,
          senderName,
          senderPhone,
          image: imageDataUrl,      
          imageMime,              
          imageCaption                            
        };

        try {

          const base64Payload = imageDataUrl ? imageDataUrl.split(',')[1] : null
          const toField = mePhone || meJid
          const fileName =
            base64Payload && imageMime
              ? `image-${msg.key.id}.${mimeToExt(imageMime)}`
              : null

          await MessageLog.create({
            to: toField,                                  
            message: text || imageCaption || null,       
            name: senderName || null,                      
            userId: senderJid || null,                    
            fileName,                                     
            imageUrl: null,                               
            imageBase64: base64Payload,                  
            indiceArrayNewMessage: null,
            status: 2,                         
            error: null
          })

        } catch (e) {
          console.warn('Erro ao salvar mensagem recebida:', e?.message || e)
        }
   
        if (ioRef) {
          ioRef.emit('bot-response', {
            sender: 'bot',
            content: dataBot
          })
        }

      } catch (e) {
        console.warn('Erro no handler de mensagens:', e?.message || e)
      }
    })

    return sock
  })()

  try {
    await initializing
  } finally {
    initializing = null
  }
  return sock
}

class WhatsAppController {
  
  static async status(req, res) {
    res.json({
      connected,
      hasQR: !!latestQR,
      qrAgeSec: latestQRAt ? Math.round((Date.now() - latestQRAt) / 1000) : null
    })
  }
  
  static async gerarQrCode(req, res) {

    const io = req.app.get('io') || req.io;
    ioRef = io

    try {

      await conectarWhatsApp()

      if (connected) {

        if (ioRef) {

          ioRef.emit('connected', {
            error: false,
            message: 'O WhatsApp está conectado.', 
            connected: true,
            sock: sock.user,
            photoUrl: photo
          })

          return res.json({ 
            status: 'connected',
            error: false,
            message: 'O WhatsApp está conectado.', 
            connected: true,
            sock: sock.user,
            photoUrl: photo
          })
        }
      } 

      if (typeof latestQR !== 'string' || !latestQR.trim()) {
        return res.status(503).json({ error: true, message: 'O QR Code ainda não está disponível. Tente de novo.' })
      }

      if (Date.now() - latestQRAt > 20000) {
        return res.status(503).json({ error: true, message: 'O QR Code está expirado. Aguarde o próximo.' })
      }

      const svg = await QRCode.toString(latestQR, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: 3,
        width: 400
      })

      res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
      })

      return res.send(svg)

    } catch (e) {

      console.error('Erro gerarQrCodeSvg:', e)

      return res.status(500).json({ error: 'Falha ao gerar QR SVG.' })
    }
  }

  static async enviarMensagem(req, res) {

    console.log('req.body', req.body);

    const io = req.app.get('io') || req.io;
    ioRef = io

    const { to, message, name, userId, imageUrl, imageBase64, fileName, indiceArrayNewMessage } = req.body || {}

    if (!to) {
      return res.status(400).json({ error: 'Campo "to" é obrigatório. Ex: +5511999999999' })
    }

    if (!message && !imageUrl && !imageBase64) {
      return res.status(400).json({ error: 'Envie "message" e/ou "imageUrl"/"imageBase64".' })
    }

    try {

      const s = await conectarWhatsApp()

      if (!connected) {
        return res.status(409).json({ error: 'WhatsApp não está conectado. Por favor, escaneie o QR Code.' })
      }

      const jid = destinatario(to)
      let result

      if (imageUrl) {

        const resp = await axios.get(imageUrl, { responseType: 'arraybuffer' })
        const buffer = Buffer.from(resp.data)
        result = await s.sendMessage(jid, {
          image: buffer,
          caption: message || undefined,
          mimetype: 'image/jpeg',
          fileName: fileName || 'image.jpg'
        })

      } else if (imageBase64) {

        const buffer = Buffer.from(
          imageBase64.replace(/^data:\w+\/[\w+.-]+;base64,/, ''),
          'base64'
        )

        result = await s.sendMessage(jid, {
          image: buffer,
          caption: message || undefined,
          mimetype: 'image/jpeg',
          fileName: fileName || 'image.jpg'
        })
        
      } else {
        result = await s.sendMessage(jid, { text: message })
      }

      await MessageLog.create({
        to,
        message: message ?? null,
        name: name ?? null,
        userId: userId ?? null,
        fileName: fileName ?? null,
        imageUrl: imageUrl ?? null,
        imageBase64: imageUrl ? null : (imageBase64 ?? null),
        indiceArrayNewMessage: Number.isInteger(indiceArrayNewMessage) ? indiceArrayNewMessage : null,
        status: 1
      })

      const dataUser = {
        "message": message,
        "time": new Date().toString(),
        "senderId": 1,
        "msgStatus": {
          "isSent": true,
          "isDelivered": true,
          "isSeen": true
        },
        "indiceArrayNewMessage": indiceArrayNewMessage
      }

      io.emit('message-saved', {
        sender: 'user',
        dataUser,
      });

      return res.json({ ok: true, result })

    } catch (err) {

      console.error('Erro enviarMensagem:', err)
      
      return res.status(500).json({ error: 'Falha ao enviar mensagem.' })
    }
  }
}

export default WhatsAppController
