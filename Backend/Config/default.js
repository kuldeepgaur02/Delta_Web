module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/iot-platform',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:8080'],
  logLevel: process.env.LOG_LEVEL || 'info',
  passwordSaltRounds: 10,
  telemetryRetentionDays: 30,
  mqttOptions: {
    host: process.env.MQTT_HOST || 'localhost',
    port: parseInt(process.env.MQTT_PORT || '1883'),
    clientId: `iot-platform-server-${Math.random().toString(16).substr(2, 8)}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    protocol: process.env.MQTT_PROTOCOL || 'mqtt',
    keepalive: 60,
    reconnectPeriod: 1000,
    clean: true
  },
  deviceAccessTokenLength: 20,
  defaultAdminUser: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin'
  },
  timeSeriesDb: {
    type: process.env.TIMESERIES_DB_TYPE || 'mongodb', // Options: 'mongodb', 'influxdb', 'timescaledb'
    influxDb: {
      url: process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: process.env.INFLUXDB_TOKEN,
      org: process.env.INFLUXDB_ORG || 'iot-platform',
      bucket: process.env.INFLUXDB_BUCKET || 'device-telemetry'
    }
  },
  notifications: {
    email: {
      enabled: process.env.EMAIL_ENABLED === 'true' || false,
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      defaultFrom: process.env.EMAIL_FROM || 'no-reply@iot-platform.com'
    }
  }
};