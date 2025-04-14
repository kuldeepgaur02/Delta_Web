const DataPoint = require('../models/DataPoint');
const plcService = require('./plcService');
const { logger } = require('../utils/logger');

/**
 * Fetch latest data from a PLC device
 * @param {Object} device - The device document
 * @returns {Promise<Array>} - Array of latest data values
 */
exports.fetchLatestData = async (device) => {
  try {
    if (!device.modbusConfig || !device.modbusConfig.registers || device.modbusConfig.registers.length === 0) {
      throw new Error('Device has no registers configured');
    }

    const results = [];

    // Read each configured register
    for (const register of device.modbusConfig.registers) {
      try {
        // Read the register value via Modbus
        const value = await plcService.readRegister(device._id, register);
        
        results.push({
          name: register.name,
          address: register.address,
          value: value,
          timestamp: new Date()
        });
      } catch (error) {
        logger.error(`Error reading register ${register.name}: ${error.message}`);
        results.push({
          name: register.name,
          address: register.address,
          error: error.message,
          timestamp: new Date()
        });
      }
    }

    return results;
  } catch (error) {
    logger.error(`Error fetching data from device ${device._id}: ${error.message}`);
    throw error;
  }
};

/**
 * Extract data from PLC and save to database
 * @param {Object} device - The device document
 * @returns {Promise<Array>} - Array of extracted data points
 */
exports.extractAndSaveData = async (device) => {
  try {
    // Get the latest data from the PLC
    const dataPoints = await exports.fetchLatestData(device);
    
    // Save valid data points to the database
    const savedDataPoints = [];
    
    for (const point of dataPoints) {
      if (!point.error && point.value !== undefined) {
        const dataPoint = new DataPoint({
          device: device._id,
          registerName: point.name,
          registerAddress: point.address,
          value: point.value,
          rawValue: point.rawValue,
          timestamp: point.timestamp
        });
        
        await dataPoint.save();
        savedDataPoints.push(dataPoint);
      }
    }

    // Emit the data via socket.io if available
    emitDataUpdate(device._id, dataPoints);
    
    return dataPoints;
  } catch (error) {
    logger.error(`Error extracting and saving data from device ${device._id}: ${error.message}`);
    throw error;
  }
};

/**
 * Start polling data from a device at regular intervals
 * @param {Object} device - The device document
 * @param {Number} interval - Polling interval in milliseconds
 */
exports.startPolling = async (device, interval) => {
  // Generate a unique identifier for this polling task
  const pollingId = `polling:${device._id}`;
  
  // Clear any existing interval for this device
  if (global[pollingId]) {
    clearInterval(global[pollingId]);
  }
  
  // Set up the polling interval
  global[pollingId] = setInterval(async () => {
    try {
      await exports.extractAndSaveData(device);
      logger.debug(`Successfully polled data from device: ${device.name}`);
    } catch (error) {
      logger.error(`Error polling data from device ${device.name}: ${error.message}`);
    }
  }, interval || device.pollingInterval || 30000);
  
  logger.info(`Started polling data from device ${device.name} at ${interval || device.pollingInterval || 30000}ms intervals`);
};

/**
 * Stop polling data from a device
 * @param {String} deviceId - The device ID
 */
exports.stopPolling = (deviceId) => {
  const pollingId = `polling:${deviceId}`;
  
  if (global[pollingId]) {
    clearInterval(global[pollingId]);
    delete global[pollingId];
    logger.info(`Stopped polling data from device: ${deviceId}`);
    return true;
  }
  
  return false;
};

/**
 * Emit data update via Socket.IO
 * @private
 */
function emitDataUpdate(deviceId, data) {
  try {
    // Get the Express app
    const app = require('../app');
    
    // Get the Socket.IO instance if available
    const io = app.get('io');
    
    if (io) {
      // Emit the data to all clients subscribed to this device
      io.to(`device:${deviceId}`).emit('dataUpdate', {
        deviceId,
        data,
        timestamp: new Date()
      });
    }
  } catch (error) {
    logger.error(`Error emitting data update: ${error.message}`);
  }
}

module.exports = exports;