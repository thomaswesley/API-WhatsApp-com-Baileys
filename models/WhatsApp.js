import { DataTypes, Model } from 'sequelize'
import sequelize from '../db/connectDatabasePostgreSQL.js'

class MessageLog extends Model {}

MessageLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    to: {
      type: DataTypes.STRING,
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    image: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'MessageLog',
    tableName: 'message_logs'
  }
)

export default MessageLog