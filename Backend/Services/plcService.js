const ModbusRTU = require('modbus-serial');
const config = require('config');
const { logger } = require('../utils/logger');
const Device = require('../models/Device');

// Store active PLC connections
const activeConnections = new Map();

/**
 * Initialize a PLC device connection
 * @param {Object} device - The device document from MongoDB
 */
exports.initializeDevice = async (device) => {
  try {
    // Check if a connection already exists for this device and close it
    if (activeConnections.has(device._id.toString())) {
      await this.closeConnection(device._id);
    }

    // Create a new Modbus client
    const client = new ModbusRTU();
    
    // Connect to the PLC
    const connectionResult = await connectClient(client, {
      ipAddress: device.ipAddress,
      port: device.port,
      unitId: device.modbusConfig.unitId
    });

    if (connectionResult.connected) {
      // Store the client in the active connections map
      activeConnections.set(device._id.toString(), {
        client,
        device,
        lastConnected: new Date()
      });

      // Update device status
      await updateDeviceStatus(device._id, 'online');
      
      logger.info(`Successfully connected to PLC device: ${device.name} (${device.ipAddress}:${device.port})`);
      return true;
    } else {
      logger.error(`Failed to connect to PLC device: ${device.name} (${device.ipAddress}:${device.port}) - ${connectionResult.message}`);
      await updateDeviceStatus(device._id, 'offline');
      return false;
    }
  } catch (error) {
    logger.error(`Error initializing PLC device ${device._id}: ${error.message}`);
    await updateDeviceStatus(device._id, 'error');
    return false;
  }
};

/**
 * Restart a PLC connection
 * @param {Object} device - The device document from MongoDB
 */
exports.restartConnection = async (device) => {
  await this.closeConnection(device._id);
  return await this.initializeDevice(device);
};

/**
 * Close a PLC connection
 * @param {String} deviceId - The device ID
 */
exports.closeConnection = async (deviceId) => {
  try {
    const deviceIdStr = deviceId.toString();
    
    if (activeConnections.has(deviceIdStr)) {
      const { client } = activeConnections.get(deviceIdStr);
      
      // Close the connection
      if (client.isOpen) {
        await client.close();
      }
      
      // Remove from active connections
      activeConnections.delete(deviceIdStr);
      
      logger.info(`Closed connection to PLC device: ${deviceIdStr}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Error closing PLC connection for device ${deviceId}: ${error.message}`);
    return false;
  }
};

/**
 * Test connection to a PLC
 * @param {Object} options - Connection options
 * @param {String} options.ipAddress - The IP address
 * @param {Number} options.port - The port number
 * @param {Number} options.unitId - The Modbus unit ID
 */
exports.testConnection = async (options) => {
  const client = new ModbusRTU();
  try {
    const result = await connectClient(client, options);
    
    if (client.isOpen) {
      await client.close();
    }
    
    return result;
  } catch (error) {
    if (client.isOpen) {
      await client.close();
    }
    
    return {
      connected: false,
      message: `Connection error: ${error.message}`
    };
  }
};

/**
 * Get a PLC client for a device
 * @param {String} deviceId - The device ID
 */
exports.getClient = async (deviceId) => {
  const deviceIdStr = deviceId.toString();
  
  if (!activeConnections.has(deviceIdStr)) {
    // Try to initialize the connection if it doesn't exist
    const device = await Device.findById(deviceId);
    
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    
    const connected = await this.initializeDevice(device);
    
    if (!connected) {
      throw new Error(`Failed to connect to device: ${deviceId}`);
    }
  }
  
  const connection = activeConnections.get(deviceIdStr);
  
  // Check if the connection is still valid
  if (!connection.client.isOpen) {
    logger.warn(`Connection to device ${deviceId} is not open. Attempting to reconnect...`);
    await this.restartConnection(connection.device);
    return activeConnections.get(deviceIdStr).client;
  }
  
  // Update last connected timestamp
  connection.lastConnected = new Date();
  
  return connection.client;
};

/**
 * Read data from a PLC register
 * @param {String} deviceId - The device ID
 * @param {Object} register - The register configuration
 */
exports.readRegister = async (deviceId, register) => {
  try {
    const client = await this.getClient(deviceId);
    
    // Set the ID of the slave
    client.setID(register.unitId || 1);
    
    // Read the register based on type
    let rawValue;
    
    switch (register.type) {
      case 'holdingRegister':
        rawValue = await client.readHoldingRegisters(register.address, 1);
        break;
      case 'inputRegister':
        rawValue = await client.readInputRegisters(register.address, 1);
        break;
      case 'coil':
        rawValue = await client.readCoils(register.address, 1);
        break;
      case 'discreteInput':
        rawValue = await client.readDiscreteInputs(register.address, 1);
        break;
      default:
        throw new Error(`Unsupported register type: ${register.type}`);
    }
    
    // Process the data based on data type
    return processRegisterValue(rawValue.data[0], register);
  } catch (error) {
    logger.error(`Error reading register ${register.name} from device ${deviceId}: ${error.message}`);
    throw error;
  }
};

/**
 * Write data to a PLC register
 * @param {String} deviceId - The device ID
 * @param {Object} register - The register configuration
 * @param {*} value - The value to write
 */
exports.writeRegister = async (deviceId, register, value) => {
  try {
    const client = await this.getClient(deviceId);
    
    // Set the ID of the slave
    client.setID(register.unitId || 1);
    
    // Process the value for writing
    const processedValue = prepareValueForWrite(value, register);
    
    // Write the register based on type
    switch (register.type) {
      case 'holdingRegister':
        await client.writeRegister(register.address, processedValue);
        break;
      case 'coil':
        await client.writeCoil(register.address, processedValue);
        break;
      default:
        throw new Error(`Cannot write to register type: ${register.type}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error writing to register ${register.name} on device ${deviceId}: ${error.message}`);
    throw error;
  }
};

/**
 * Connect a Modbus client to a PLC
 * @private
 */
async function connectClient(client, options) {
  try {
    // Connect to Modbus TCP
    await client.connectTCP(options.ipAddress, { port: options.port });
    
    // Set the slave unit ID
    client.setID(options.unitId || 1);
    
    // Set timeout
    client.setTimeout(config.get('plc.connectionTimeout'));
    
    return {
      connected: true,
      message: 'Successfully connected to PLC'
    };
  } catch (error) {
    return {
      connected: false,
      message: `Failed to connect: ${error.message}`
    };
  }
}

/**
 * Update device status in the database
 * @private
 */
async function updateDeviceStatus(deviceId, status) {
  try {
    await Device.findByIdAndUpdate(deviceId, { 
      status, 
      lastConnected: status === 'online' ? new Date() : undefined 
    });
  } catch (error) {
    logger.error(`Error updating device status: ${error.message}`);
  }
}

/**
 * Process register value based on data type
 * @private
 */
function processRegisterValue(rawValue, register) {
  // Apply scaling if specified
  const scaling = register.scaling || 1;
  
  switch (register.dataType) {
    case 'boolean':
      return Boolean(rawValue);
    case 'int16':
      // Convert to 16-bit signed integer
      return ((rawValue & 0x8000) ? (0xFFFF0000 | rawValue) : rawValue) * scaling;
    case 'uint16':
      return rawValue * scaling;
    case 'int32':
      // Would need to read two registers for this
      return rawValue * scaling;
    case 'uint32':
      // Would need to read two registers for this
      return rawValue * scaling;
    case 'float':
      // Would need to read two registers and convert
      return rawValue * scaling;
    default:
      return rawValue * scaling;
  }
}

/**
 * Prepare a value for writing to a register
 * @private
 */
function prepareValueForWrite(value, register) {
  // Reverse scale the value
  const scaling = register.scaling || 1;
  const scaledValue = value / scaling;
  
  switch (register.dataType) {
    case 'boolean':
      return Boolean(value);
    case 'int16':
    case 'uint16':
      return Math.round(scaledValue);
    case 'int32':
    case 'uint32':
    case 'float':
      return Math.round(scaledValue);
    default:
      return Math.round(scaledValue);
  }
}

// Schedule a periodic check for all connections
setInterval(async () => {
  for (const [deviceId, connection] of activeConnections.entries()) {
    // Check if connection is older than reconnect interval
    const timeSinceLastConnected = new Date() - connection.lastConnected;
    if (timeSinceLastConnected > config.get('plc.reconnectInterval')) {
      try {
        // Ping the device to check connection
        const client = connection.client;
        if (client.isOpen) {
          // Try a simple read operation to verify connection
          client.setID(connection.device.modbusConfig.unitId || 1);
          await client.readHoldingRegisters(0, 1);
        } else {
          // If not open, attempt to reconnect
          await exports.restartConnection(connection.device);
        }
      } catch (error) {
        logger.warn(`Connection check failed for device ${deviceId}, attempting to reconnect...`);
        await exports.restartConnection(connection.device);
      }
    }
  }
}, config.get('plc.pollingInterval'));

module.exports = exports;