const mqtt = require('mqtt');
const aedes = require('aedes')();
const { createServer } = require('net');
const logger = require('../utils/logger');
const config = require('../Config/mqtt');
const DeviceService = require('./deviceServices');
const TelemetryService = require('./telemetryServices');

class MqttBroker {
  constructor() {
    this.broker = null;
    this.client = null;
    this.telemetryService = null;
    this.port = config.port || 1883;
    this.host = config.host || 'localhost';
    
    // Topics
    this.telemetryTopic = 'v1/devices/+/telemetry';
    this.attributesTopic = 'v1/devices/+/attributes';
    this.rpcRequestTopic = 'v1/devices/+/rpc/request/+';
    this.rpcResponseTopic = 'v1/devices/+/rpc/response/+';
  }

  /**
   * Initialize MQTT Broker
   * @param {Object} telemetryService - Telemetry service instance
   */
  init(telemetryService) {
    this.telemetryService = telemetryService;
    
    // Create MQTT broker server
    this.broker = createServer(aedes.handle);
    
    // Setup authentication
    aedes.authenticate = this.authenticate.bind(this);
    
    // Setup MQTT event handlers
    aedes.on('client', this.handleClientConnect.bind(this));
    aedes.on('clientDisconnect', this.handleClientDisconnect.bind(this));
    aedes.on('subscribe', this.handleSubscribe.bind(this));
    aedes.on('publish', this.handlePublish.bind(this));
    
    // Start the server
    this.broker.listen(this.port, () => {
      logger.info(`MQTT broker started on port ${this.port}`);
    });
    
    // Connect internal client for publishing
    this.connectInternalClient();
  }

  /**
   * Connect internal MQTT client
   */
  connectInternalClient() {
    this.client = mqtt.connect(`mqtt://${this.host}:${this.port}`, {
      clientId: 'iot_platform_internal',
      username: config.internalClient.username,
      password: config.internalClient.password,
      clean: true
    });
    
    this.client.on('connect', () => {
      logger.info('Internal MQTT client connected');
      
      // Subscribe to internal topics
      this.client.subscribe('internal/system/#');
    });
    
    this.client.on('error', (err) => {
      logger.error('Internal MQTT client error:', err);
    });
  }

  /**
   * Authenticate MQTT clients
   * @param {Object} client - MQTT client
   * @param {string} username - Username
   * @param {Buffer} password - Password
   * @param {Function} callback - Authentication callback
   */
  async authenticate(client, username, password, callback) {
    try {
      // Allow internal client
      if (username === config.internalClient.username && 
          password.toString() === config.internalClient.password) {
        client.isInternal = true;
        return callback(null, true);
      }
      
      // Extract device ID from client ID
      const deviceId = client.id;
      if (!deviceId) {
        return callback(new Error('Device ID not provided'), false);
      }
      
      // Authenticate device
      if (!password) {
        return callback(new Error('Access token not provided'), false);
      }
      
      try {
        const device = await DeviceService.authenticateDevice(
          deviceId, 
          password.toString()
        );
        
        // Store device info in client
        client.deviceInfo = {
          id: device._id.toString(),
          type: device.type,
          name: device.name
        };
        
        logger.info(`Device authenticated: ${device.name} (${deviceId})`);
        callback(null, true);
      } catch (error) {
        logger.error(`Device authentication failed: ${deviceId}`, error.message);
        callback(error, false);
      }
    } catch (error) {
      logger.error('MQTT authentication error:', error);
      callback(error, false);
    }
  }

  /**
   * Handle client connections
   * @param {Object} client - Connected client
   */
  handleClientConnect(client) {
    if (client.isInternal) {
      logger.debug('Internal client connected');
      return;
    }
    
    const deviceId = client.id;
    logger.info(`Device connected: ${deviceId}`);
    
    // Publish device connected status
    if (client.deviceInfo) {
      this.publishSystemMessage('device/connected', {
        deviceId,
        timestamp: new Date().toISOString(),
        deviceInfo: client.deviceInfo
      });
    }
  }

  /**
   * Handle client disconnections
   * @param {Object} client - Disconnected client
   */
  handleClientDisconnect(client) {
    if (client.isInternal) {
      logger.debug('Internal client disconnected');
      return;
    }
    
    const deviceId = client.id;
    logger.info(`Device disconnected: ${deviceId}`);
    
    // Publish device disconnected status
    if (client.deviceInfo) {
      this.publishSystemMessage('device/disconnected', {
        deviceId,
        timestamp: new Date().toISOString(),
        deviceInfo: client.deviceInfo
      });
    }
  }

  /**
   * Handle client subscriptions
   * @param {Array} subscriptions - Subscription array
   * @param {Object} client - MQTT client
   */
  handleSubscribe(subscriptions, client) {
    if (client.isInternal) return;
    
    const deviceId = client.id;
    subscriptions.forEach(subscription => {
      logger.debug(`Device ${deviceId} subscribed to: ${subscription.topic}`);
    });
  }

  /**
   * Handle published messages
   * @param {Object} packet - MQTT packet
   * @param {Object} client - MQTT client
   */
  async handlePublish(packet, client) {
    if (client && client.isInternal) return;
    
    // Process message based on topic
    try {
      const topic = packet.topic;
      const payload = this.parsePayload(packet.payload);
      
      // Handle telemetry data
      if (topic.match(this.telemetryTopic)) {
        await this.processTelemetryData(topic, payload, client);
      }
      
      // Handle attribute updates
      else if (topic.match(this.attributesTopic)) {
        await this.processAttributeData(topic, payload, client);
      }
      
      // Handle RPC requests
      else if (topic.match(this.rpcRequestTopic)) {
        await this.processRpcRequest(topic, payload, client);
      }
    } catch (error) {
      logger.error('Error processing MQTT message:', error);
    }
  }

  /**
   * Parse message payload
   * @param {Buffer} payload - Message payload
   * @returns {Object} - Parsed payload
   */
  parsePayload(payload) {
    try {
      if (payload instanceof Buffer) {
        const data = payload.toString();
        return JSON.parse(data);
      }
      return payload;
    } catch (error) {
      logger.error('Error parsing payload:', error);
      return payload.toString();
    }
  }

  /**
   * Process telemetry data
   * @param {string} topic - MQTT topic
   * @param {Object} payload - Message payload
   * @param {Object} client - MQTT client
   */
  async processTelemetryData(topic, payload, client) {
    try {
      // Extract device ID from topic
      const topicParts = topic.split('/');
      const deviceId = topicParts[2];
      
      if (!client.deviceInfo) {
        logger.warn(`Received telemetry from unauthenticated device: ${deviceId}`);
        return;
      }
      
      logger.debug(`Received telemetry from device ${deviceId}:`, payload);
      
      // Process telemetry data
      if (this.telemetryService) {
        await this.telemetryService.saveTelemetry(deviceId, payload);
      }
    } catch (error) {
      logger.error('Error processing telemetry data:', error);
    }
  }

  /**
   * Process attribute data
   * @param {string} topic - MQTT topic
   * @param {Object} payload - Message payload
   * @param {Object} client - MQTT client
   */
  async processAttributeData(topic, payload, client) {
    try {
      // Extract device ID from topic
      const topicParts = topic.split('/');
      const deviceId = topicParts[2];
      
      if (!client.deviceInfo) {
        logger.warn(`Received attributes from unauthenticated device: ${deviceId}`);
        return;
      }
      
      logger.debug(`Received attributes from device ${deviceId}:`, payload);
      
      // Update device attributes (would need deviceAttributeService)
      // await deviceAttributeService.updateDeviceAttributes(deviceId, payload);
      
      // Publish system message for listeners
      this.publishSystemMessage('device/attributes', {
        deviceId,
        timestamp: new Date().toISOString(),
        attributes: payload
      });
    } catch (error) {
      logger.error('Error processing attribute data:', error);
    }
  }

  /**
   * Process RPC requests
   * @param {string} topic - MQTT topic
   * @param {Object} payload - Message payload
   * @param {Object} client - MQTT client
   */
  async processRpcRequest(topic, payload, client) {
    try {
      // Extract device ID and request ID from topic
      // Format: v1/devices/{deviceId}/rpc/request/{requestId}
      const topicParts = topic.split('/');
      const deviceId = topicParts[2];
      const requestId = topicParts[5];
      
      if (!client.deviceInfo) {
        logger.warn(`Received RPC request from unauthenticated device: ${deviceId}`);
        return;
      }
      
      logger.debug(`Received RPC request from device ${deviceId}, requestId: ${requestId}`, payload);
      
      // Publish to system topic for RPC handlers
      this.publishSystemMessage('device/rpc/request', {
        deviceId,
        requestId,
        timestamp: new Date().toISOString(),
        request: payload
      });
    } catch (error) {
      logger.error('Error processing RPC request:', error);
    }
  }

  /**
   * Send RPC request to device
   * @param {string} deviceId - Device ID
   * @param {string} method - RPC method name
   * @param {Object} params - RPC parameters
   * @param {number} timeout - Request timeout in ms
   * @returns {Promise<Object>} - RPC response
   */
  async sendRpcRequest(deviceId, method, params, timeout = 10000) {
    return new Promise((resolve, reject) => {
      try {
        // Generate unique request ID
        const requestId = Date.now().toString();
        
        // Create request payload
        const payload = {
          method,
          params,
          requestId
        };
        
        // Response topic
        const responseTopic = `v1/devices/${deviceId}/rpc/response/${requestId}`;
        
        // Request topic
        const requestTopic = `v1/devices/${deviceId}/rpc/request/${requestId}`;
        
        // Setup timeout
        const timeoutId = setTimeout(() => {
          this.client.unsubscribe(responseTopic);
          reject(new Error(`RPC request timeout for device ${deviceId}, method ${method}`));
        }, timeout);
        
        // Subscribe to response topic
        this.client.subscribe(responseTopic, (err) => {
          if (err) {
            clearTimeout(timeoutId);
            return reject(new Error(`Failed to subscribe to RPC response topic: ${err.message}`));
          }
          
          // Setup message handler for this specific response
          const messageHandler = (topic, message) => {
            if (topic === responseTopic) {
              // Clean up
              clearTimeout(timeoutId);
              this.client.unsubscribe(responseTopic);
              this.client.removeListener('message', messageHandler);
              
              try {
                const response = this.parsePayload(message);
                resolve(response);
              } catch (error) {
                reject(new Error(`Failed to parse RPC response: ${error.message}`));
              }
            }
          };
          
          // Register message handler
          this.client.on('message', messageHandler);
          
          // Publish RPC request
          this.client.publish(requestTopic, JSON.stringify(payload), { qos: 1 }, (pubErr) => {
            if (pubErr) {
              clearTimeout(timeoutId);
              this.client.unsubscribe(responseTopic);
              this.client.removeListener('message', messageHandler);
              reject(new Error(`Failed to publish RPC request: ${pubErr.message}`));
            }
            
            logger.debug(`Sent RPC request to device ${deviceId}, method: ${method}, requestId: ${requestId}`);
          });
        });
      } catch (error) {
        reject(new Error(`Failed to send RPC request: ${error.message}`));
      }
    });
  }

  /**
   * Send RPC response back to platform
   * @param {string} deviceId - Device ID
   * @param {string} requestId - Request ID
   * @param {Object} response - Response data
   * @returns {Promise<void>}
   */
  async sendRpcResponse(deviceId, requestId, response) {
    return new Promise((resolve, reject) => {
      try {
        const responseTopic = `v1/devices/${deviceId}/rpc/response/${requestId}`;
        this.client.publish(responseTopic, JSON.stringify(response), { qos: 1 }, (err) => {
          if (err) {
            logger.error(`Failed to publish RPC response: ${err.message}`);
            return reject(err);
          }
          
          logger.debug(`Sent RPC response for device ${deviceId}, requestId: ${requestId}`);
          resolve();
        });
      } catch (error) {
        logger.error('Error sending RPC response:', error);
        reject(error);
      }
    });
  }

  /**
   * Publish system message to internal topics
   * @param {string} subTopic - Sub-topic under internal/system/
   * @param {Object} message - Message payload
   */
  publishSystemMessage(subTopic, message) {
    try {
      const topic = `internal/system/${subTopic}`;
      this.client.publish(topic, JSON.stringify(message), { qos: 1 });
    } catch (error) {
      logger.error(`Error publishing system message to ${subTopic}:`, error);
    }
  }

  /**
   * Send message to specific device
   * @param {string} deviceId - Device ID
   * @param {string} topic - Topic suffix
   * @param {Object} payload - Message payload
   * @returns {Promise<void>}
   */
  async sendToDevice(deviceId, topic, payload) {
    return new Promise((resolve, reject) => {
      try {
        const fullTopic = `v1/devices/${deviceId}/${topic}`;
        this.client.publish(fullTopic, JSON.stringify(payload), { qos: 1 }, (err) => {
          if (err) {
            logger.error(`Failed to send message to device ${deviceId}: ${err.message}`);
            return reject(err);
          }
          
          logger.debug(`Sent message to device ${deviceId} on topic ${topic}`);
          resolve();
        });
      } catch (error) {
        logger.error(`Error sending message to device ${deviceId}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Close the MQTT broker and cleanup resources
   */
  async close() {
    return new Promise((resolve) => {
      // Disconnect internal client
      if (this.client) {
        this.client.end(true, () => {
          logger.info('Internal MQTT client disconnected');
          
          // Close broker server
          if (this.broker) {
            this.broker.close(() => {
              logger.info('MQTT broker server closed');
              
              // Close Aedes instance
              aedes.close(() => {
                logger.info('Aedes broker closed');
                resolve();
              });
            });
          } else {
            resolve();
          }
        });
      } else if (this.broker) {
        this.broker.close(() => {
          logger.info('MQTT broker server closed');
          
          // Close Aedes instance
          aedes.close(() => {
            logger.info('Aedes broker closed');
            resolve();
          });
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = MqttBroker;