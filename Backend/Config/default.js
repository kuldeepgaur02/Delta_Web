const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  database: {
    url: process.env.MONGODB_URI || 'mongodb://localhost:27017/iot-platform',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  mqtt: {
    broker: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    clientId: process.env.MQTT_CLIENT_ID || `iot-platform-server-${Math.random().toString(16).slice(2, 10)}`,
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000
  },
  telemetry: {
    retention: {
      days: process.env.TELEMETRY_RETENTION_DAYS || 30
    },
    batchSize: process.env.TELEMETRY_BATCH_SIZE || 1000
  }
};