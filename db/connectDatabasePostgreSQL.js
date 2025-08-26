import { Sequelize } from 'sequelize'

const makeSequelize = () => {
  if (process.env.DATABASE_URL) {
    return new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      logging: false
    })
  }

  return new Sequelize(
    process.env.PG_DATABASE,
    process.env.PG_USER,
    process.env.PG_PASSWORD,
    {
      host: process.env.PG_HOST,
      port: Number(process.env.PG_PORT),
      dialect: 'postgres',
      logging: false
    }
  )
}

const sequelize = makeSequelize()

// Sincronizar automaticamente
await sequelize.authenticate()
await sequelize.sync()

export default sequelize
