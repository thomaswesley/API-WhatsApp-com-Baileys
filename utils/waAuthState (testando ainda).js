// utils/waAuthState.js
import { DataTypes, Op } from 'sequelize'
import {
  initAuthCreds,
  BufferJSON,
  makeCacheableSignalKeyStore,
} from 'baileys'

// helpers: convertem qualquer estrutura (com Buffers) em objeto JSON-safe e vice-versa
const toJSONish   = (v) => JSON.parse(JSON.stringify(v, BufferJSON.replacer))
const fromJSONish = (v) => JSON.parse(JSON.stringify(v), BufferJSON.reviver)

/**
 * Auth State em Postgres (tabela EXISTENTE wa_auth: key TEXT PK, value JSONB)
 * - Creds: `${sessionId}:creds`  (fallback lê 'creds' para compatibilidade)
 * - Keys : `${sessionId}:keys:<type>:<id>`
 */
export async function useWaAuthState(sequelize, sessionId = 'default') {
  const WaAuth = sequelize.define('wa_auth', {
    key:   { type: DataTypes.TEXT,  primaryKey: true },
    value: { type: DataTypes.JSONB, allowNull: false },
  }, { tableName: 'wa_auth', timestamps: false })

  const getKV = async (k, fallbackKey) => {
    const row = await WaAuth.findByPk(k)
    if (row) return row.value
    if (fallbackKey) {
      const fb = await WaAuth.findByPk(fallbackKey)
      if (fb) return fb.value
    }
    return undefined
  }

  const setKV = async (k, v) => {
    await WaAuth.upsert({ key: k, value: v })
  }

  const delPrefix = async (prefix) => {
    await WaAuth.destroy({ where: { key: { [Op.like]: `${prefix}%` } } })
  }

  // ---- Creds ----
  const credsKey  = `${sessionId}:creds`
  const credsRaw  = await getKV(credsKey, 'creds')
  const creds     = credsRaw ? fromJSONish(credsRaw) : initAuthCreds()
  const saveCreds = async () => { await setKV(credsKey, toJSONish(creds)) }

  // ---- Keys (Signal store) ----
  const state = {
    creds,
    keys: makeCacheableSignalKeyStore(
      {
        get: async (type, ids) => {
          const out = {}
          for (const id of ids) {
            const k   = `${sessionId}:keys:${type}:${id}`
            const raw = await getKV(k)
            out[id] = raw ? fromJSONish(raw) : undefined
          }
          return out
        },
        set: async (data) => {
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              const k = `${sessionId}:keys:${type}:${id}`
              if (typeof value !== 'undefined') {
                await setKV(k, toJSONish(value))
              }
            }
          }
        },
        clear: async () => {
          await delPrefix(`${sessionId}:keys:`)
        },
      }
      // nada de segundo argumento aqui; na sua versão é (store, logger?) opcional
    ),
  }

  const wipe = async () => { await delPrefix(`${sessionId}:`) }

  return { state, saveCreds, wipe }
}
