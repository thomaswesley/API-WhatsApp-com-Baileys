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
      type: DataTypes.STRING(64),
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
    
    name: { type: DataTypes.STRING(255), allowNull: true },
    userId: { type: DataTypes.STRING(64), allowNull: true, field: 'user_id' },
    fileName: { type: DataTypes.TEXT, allowNull: true, field: 'file_name' },
    imageUrl: { type: DataTypes.TEXT, allowNull: true, field: 'image_url' },
    imageBase64: { type: DataTypes.TEXT, allowNull: true, field: 'image_base64' },
    indiceArrayNewMessage: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'indice_array_new_message'
    },

    status: {
      type: DataTypes.STRING(16),
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
    tableName: 'message_logs',
    timestamps: true
  }
)

export default MessageLog
