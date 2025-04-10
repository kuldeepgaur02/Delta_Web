module.exports = {
    server: {
      port: process.env.PORT || 5000,
      env: process.env.NODE_ENV 
    },
    database: {
      uri: process.env.MONGO_URI 
    },
    jwt: {
      secret: process.env.JWT_SECRET ,
      expiresIn: process.env.JWT_EXPIRE 
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