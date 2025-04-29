const config = require('./default');

module.exports = {
  // MQTT client options
  clientOptions: {
    clientId: config.mqtt.clientId,
    clean: config.mqtt.clean,
    connectTimeout: config.mqtt.connectTimeout,
    reconnectPeriod: config.mqtt.reconnectPeriod,
    username: config.mqtt.username,
    password: config.mqtt.password
  },
  
  // MQTT topics
  topics: {
    deviceTelemetry: 'v1/devices/+/telemetry',  // For device telemetry data
    deviceAttributes: 'v1/devices/+/attributes', // For device attributes
    deviceStatus: 'v1/devices/+/status',        // For device status updates
    deviceCommands: 'v1/devices/+/commands',    // For sending commands to devices
    deviceResponses: 'v1/devices/+/responses'   // For receiving responses from devices
  },
  
  // MQTT QoS levels
  qos: {
    telemetry: 0,  // At most once delivery
    attributes: 1, // At least once delivery
    commands: 1,   // At least once delivery
    status: 1      // At least once delivery
  }
};