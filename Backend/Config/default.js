module.exports = {
    server: {
      port: process.env.PORT || 5000,
      env: process.env.NODE_ENV || 'development'
    },
    database: {
      uri: process.env.MONGO_URI || 'mongodb://localhost:27017/delta_automation'
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'development_secret_key',
      expiresIn: process.env.JWT_EXPIRE || '30d'
    },
    plc: {
      connectionTimeout: process.env.PLC_CONNECTION_TIMEOUT || 5000,
      pollingInterval: process.env.PLC_POLLING_INTERVAL || 10000,
      reconnectAttempts: 5,
      reconnectInterval: 3000
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info'
    },
    cors: {
      // Frontend will connect from these origins
      allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000']
    }
  };