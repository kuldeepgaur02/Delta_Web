const config = require('./default');

// MQTT topic formats
const MQTT_TOPICS = {
  // Device telemetry topic format: v1/devices/{deviceId}/telemetry
  TELEMETRY: 'v1/devices/+/telemetry',
  // Device attributes topic format: v1/devices/{deviceId}/attributes
  ATTRIBUTES: 'v1/devices/+/attributes',
  // Device commands topic format: v1/devices/{deviceId}/commands
  COMMANDS: 'v1/devices/+/commands',
  // Device command responses topic format: v1/devices/{deviceId}/commands/response
  COMMAND_RESPONSES: 'v1/devices/+/commands/response'
};

// Helper functions for constructing specific MQTT topics
const createDeviceTelemetryTopic = (deviceId) => `v1/devices/${deviceId}/telemetry`;
const createDeviceAttributesTopic = (deviceId) => `v1/devices/${deviceId}/attributes`;
const createDeviceCommandsTopic = (deviceId) => `v1/devices/${deviceId}/commands`;
const createDeviceCommandResponseTopic = (deviceId) => `v1/devices/${deviceId}/commands/response`;

// Parse device ID from topic
const parseDeviceIdFromTopic = (topic) => {
  const parts = topic.split('/');
  if (parts.length >= 3 && parts[0] === 'v1' && parts[1] === 'devices') {
    return parts[2];
  }
  return null;
};

// Parse message type from topic
const parseMessageTypeFromTopic = (topic) => {
  const parts = topic.split('/');
  if (parts.length >= 4 && parts[0] === 'v1' && parts[1] === 'devices') {
    return parts[3];
  }
  return null;
};

module.exports = {
  mqttOptions: config.mqttOptions,
  topics: MQTT_TOPICS,
  createDeviceTelemetryTopic,
  createDeviceAttributesTopic,
  createDeviceCommandsTopic,
  createDeviceCommandResponseTopic,
  parseDeviceIdFromTopic,
  parseMessageTypeFromTopic
};