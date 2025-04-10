module.exports = {
    server: {
      env: 'production'
    },
    logging: {
      level: 'warn'
    },
    plc: {
      pollingInterval: 30000, // Less frequent polling in production
      reconnectAttempts: 3
    }
  };