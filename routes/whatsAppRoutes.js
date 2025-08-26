import { Router } from 'express'
import WhatsAppController from '../controllers/WhatsAppController.js'

const router = Router()

router.get('/gerar-qr-code', WhatsAppController.gerarQrCode)
router.post('/enviar-mensagem', WhatsAppController.enviarMensagem)

export default router