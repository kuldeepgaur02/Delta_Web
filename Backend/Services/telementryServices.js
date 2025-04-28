const Telemetry = require('../models/telemetry');
const Device = require('../models/device');
const logger = require('../utils/logger');
const { EventEmitter } = require('events');

class TelemetryService {
  constructor(rulesEngineService) {
    this.rulesEngineService = rulesEngineService;
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Save telemetry data for a device
   * @param {string} deviceId - Device identifier
   * @param {Object} data - Telemetry data object with type and value properties
   * @returns {Promise<Object>} - Saved telemetry record
   */
  async saveTelemetry(deviceId, data) {
    try {
      // Verify the device exists
      const device = await Device.findById(deviceId);
      if (!device) {
        throw new Error(`Device not found: ${deviceId}`);
      }

      // Check if device is active
      if (!device.active) {
        logger.warn(`Telemetry received for inactive device: ${deviceId}`);
      }

      // If data is a simple value, convert to object
      if (typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Telemetry data must be an object with type and value');
      }

      // Process multiple telemetry points if needed
      if (Array.isArray(data.values)) {
        const results = [];
        for (const item of data.values) {
          if (!item.type || !('value' in item)) {
            throw new Error('Each telemetry item must contain type and value');
          }

          const telemetry = new Telemetry({
            deviceId,
            type: item.type,
            value: item.value,
            timestamp: item.timestamp || new Date(),
            metadata: item.metadata || {}
          });

          const savedTelemetry = await telemetry.save();
          results.push(savedTelemetry);

          // Emit event for real-time updates and rules processing
          this.emitTelemetryEvent(device, savedTelemetry);
        }
        return results;
      } else {
        // Process single telemetry point
        if (!data.type || !('value' in data)) {
          throw new Error('Telemetry must contain type and value');
        }

        const telemetry = new Telemetry({
          deviceId,
          type: data.type,
          value: data.value,
          timestamp: data.timestamp || new Date(),
          metadata: data.metadata || {}
        });

        const savedTelemetry = await telemetry.save();

        // Emit event for real-time updates and rules processing
        this.emitTelemetryEvent(device, savedTelemetry);

        return savedTelemetry;
      }
    } catch (error) {
      logger.error('Error saving telemetry data:', error);
      throw error;
    }
  }

  /**
   * Process telemetry events
   * @private
   * @param {Object} device - Device object
   * @param {Object} telemetry - Telemetry data
   */
  emitTelemetryEvent(device, telemetry) {
    this.eventEmitter.emit('telemetry', { device, telemetry });
    
    // Process through rules engine if available
    if (this.rulesEngineService) {
      this.rulesEngineService.processTelemetry(device, telemetry)
        .catch(err => logger.error('Error processing telemetry in rules engine:', err));
    }
  }

  /**
   * Get latest telemetry for a device
   * @param {string} deviceId - Device identifier
   * @param {Array<string>} [types] - Optional array of telemetry types to filter
   * @returns {Promise<Array>} - Latest telemetry values
   */
  async getLatestTelemetry(deviceId, types) {
    try {
      return await Telemetry.getLatestByDevice(deviceId, types);
    } catch (error) {
      logger.error(`Error getting latest telemetry for device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Get historical telemetry data
   * @param {string} deviceId - Device identifier
   * @param {string} type - Telemetry type
   * @param {Date|string} [startTime] - Start time for data retrieval
   * @param {Date|string} [endTime] - End time for data retrieval
   * @param {number} [limit=100] - Maximum number of records to return
   * @param {number} [offset=0] - Number of records to skip
   * @returns {Promise<Array>} - Historical telemetry data
   */
  async getHistoricalData(deviceId, type, startTime, endTime, limit = 100, offset = 0) {
    try {
      return await Telemetry.getHistorical(deviceId, type, startTime, endTime, limit, offset);
    } catch (error) {
      logger.error(`Error fetching historical data for device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Get statistics for telemetry data
   * @param {string} deviceId - Device identifier
   * @param {string} type - Telemetry type
   * @param {Date|string} [startTime] - Start time for data analysis
   * @param {Date|string} [endTime] - End time for data analysis
   * @returns {Promise<Object>} - Statistics object
   */
  async getStatistics(deviceId, type, startTime, endTime) {
    try {
      const stats = await Telemetry.getStats(deviceId, type, startTime, endTime);
      return stats.length > 0 ? stats[0] : { count: 0 };
    } catch (error) {
      logger.error(`Error calculating statistics for device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Subscribe to real-time telemetry updates
   * @param {Function} callback - Callback function for telemetry events
   * @returns {Function} - Unsubscribe function
   */
  subscribeToUpdates(callback) {
    this.eventEmitter.on('telemetry', callback);
    
    // Return unsubscribe function
    return () => {
      this.eventEmitter.off('telemetry', callback);
    };
  }

  /**
   * Delete telemetry data for a device
   * @param {string} deviceId - Device identifier
   * @param {string} [type] - Optional telemetry type to delete
   * @param {Date|string} [before] - Delete data before this time
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteTelemetryData(deviceId, type, before) {
    try {
      const query = { deviceId };
      
      if (type) {
        query.type = type;
      }
      
      if (before) {
        query.timestamp = { $lt: new Date(before) };
      }
      
      const result = await Telemetry.deleteMany(query);
      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error(`Error deleting telemetry data for device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Aggregate telemetry data
   * @param {string} deviceId - Device identifier
   * @param {string} type - Telemetry type
   * @param {string} aggregation - Aggregation type (avg, min, max, sum)
   * @param {string} timeWindow - Time window for aggregation (hour, day, week, month)
   * @param {Date|string} startTime - Start time
   * @param {Date|string} endTime - End time
   * @returns {Promise<Array>} - Aggregated data
   */
  async aggregateData(deviceId, type, aggregation, timeWindow, startTime, endTime) {
    try {
      // Determine time grouping format
      let timeGroup;
      switch (timeWindow) {
        case 'hour':
          timeGroup = { 
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' },
            hour: { $hour: '$timestamp' }
          };
          break;
        case 'day':
          timeGroup = { 
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          };
          break;
        case 'week':
          timeGroup = { 
            year: { $year: '$timestamp' },
            week: { $week: '$timestamp' }
          };
          break;
        case 'month':
          timeGroup = { 
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' }
          };
          break;
        default:
          timeGroup = { 
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' },
            hour: { $hour: '$timestamp' }
          };
      }

      // Build query
      const query = { deviceId, type };
      if (startTime || endTime) {
        query.timestamp = {};
        if (startTime) query.timestamp.$gte = new Date(startTime);
        if (endTime) query.timestamp.$lte = new Date(endTime);
      }

      // Determine aggregation operator
      let aggregationOp;
      switch (aggregation) {
        case 'avg':
          aggregationOp = { $avg: { $toDouble: '$value' } };
          break;
        case 'min':
          aggregationOp = { $min: { $toDouble: '$value' } };
          break;
        case 'max':
          aggregationOp = { $max: { $toDouble: '$value' } };
          break;
        case 'sum':
          aggregationOp = { $sum: { $toDouble: '$value' } };
          break;
        default:
          aggregationOp = { $avg: { $toDouble: '$value' } };
      }

      // Run aggregation
      const result = await Telemetry.aggregate([
        { $match: query },
        { 
          $group: {
            _id: timeGroup,
            value: aggregationOp,
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1, '_id.week': 1 } },
        {
          $project: {
            _id: 0,
            timestamp: {
              $dateFromParts: {
                year: '$_id.year',
                month: { $ifNull: ['$_id.month', 1] },
                day: { $ifNull: ['$_id.day', 1] },
                hour: { $ifNull: ['$_id.hour', 0] }
              }
            },
            value: 1,
            count: 1
          }
        }
      ]);

      return result;
    } catch (error) {
      logger.error(`Error aggregating telemetry data for device ${deviceId}:`, error);
      throw error;
    }
  }
}

module.exports = TelemetryService;