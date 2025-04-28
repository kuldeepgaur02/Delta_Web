const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateObjectId } = require('../utils/validator');
const TelemetryService = require('../services/telemetryService');
const RulesEngine = require('../services/rulesEngine');
const logger = require('../utils/logger');

// Initialize services
const rulesEngine = new RulesEngine();
const telemetryService = new TelemetryService(rulesEngine);

/**
 * @route POST /api/telemetry/:deviceId
 * @desc Save telemetry data for a device
 * @access Private
 */
router.post('/:deviceId', auth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Validate deviceId
    if (!validateObjectId(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID format' });
    }
    
    const telemetryData = req.body;
    
    const result = await telemetryService.saveTelemetry(deviceId, telemetryData);
    res.status(201).json(result);
  } catch (error) {
    logger.error('Error saving telemetry:', error);
    res.status(error.message.includes('not found') ? 404 : 400).json({ message: error.message });
  }
});

/**
 * @route GET /api/telemetry/:deviceId/latest
 * @desc Get latest telemetry for a device
 * @access Private
 */
router.get('/:deviceId/latest', auth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { types } = req.query;
    
    // Validate deviceId
    if (!validateObjectId(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID format' });
    }
    
    // Parse types if provided
    const typeArray = types ? types.split(',') : undefined;
    
    const latestData = await telemetryService.getLatestTelemetry(deviceId, typeArray);
    res.json(latestData);
  } catch (error) {
    logger.error('Error fetching latest telemetry:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/telemetry/:deviceId/history
 * @desc Get historical telemetry data
 * @access Private
 */
router.get('/:deviceId/history', auth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { type, startTime, endTime, limit, offset } = req.query;
    
    // Validate deviceId
    if (!validateObjectId(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID format' });
    }
    
    // Validate required parameters
    if (!type) {
      return res.status(400).json({ message: 'Telemetry type is required' });
    }
    
    const limitNum = limit ? parseInt(limit) : 100;
    const offsetNum = offset ? parseInt(offset) : 0;
    
    const historicalData = await telemetryService.getHistoricalData(
      deviceId, 
      type, 
      startTime, 
      endTime, 
      limitNum, 
      offsetNum
    );
    
    res.json(historicalData);
  } catch (error) {
    logger.error('Error fetching historical telemetry:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/telemetry/:deviceId/stats
 * @desc Get statistics for telemetry data
 * @access Private
 */
router.get('/:deviceId/stats', auth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { type, startTime, endTime } = req.query;
    
    // Validate deviceId
    if (!validateObjectId(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID format' });
    }
    
    // Validate required parameters
    if (!type) {
      return res.status(400).json({ message: 'Telemetry type is required' });
    }
    
    const stats = await telemetryService.getStatistics(deviceId, type, startTime, endTime);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching telemetry statistics:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route DELETE /api/telemetry/:deviceId
 * @desc Delete telemetry data for a device
 * @access Private (Admin only)
 */
router.delete('/:deviceId', auth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { type, before } = req.query;
    
    // Validate deviceId
    if (!validateObjectId(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID format' });
    }
    
    // Check if user has admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete telemetry data' });
    }
    
    const result = await telemetryService.deleteTelemetryData(deviceId, type, before);
    res.json(result);
  } catch (error) {
    logger.error('Error deleting telemetry data:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * @route GET /api/telemetry/:deviceId/aggregate
 * @desc Get aggregated telemetry data
 * @access Private
 */
router.get('/:deviceId/aggregate', auth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { type, aggregation, timeWindow, startTime, endTime } = req.query;
    
    // Validate deviceId
    if (!validateObjectId(deviceId)) {
      return res.status(400).json({ message: 'Invalid device ID format' });
    }
    
    // Validate required parameters
    if (!type || !aggregation || !timeWindow) {
      return res.status(400).json({ 
        message: 'Type, aggregation method and time window are required' 
      });
    }
    
    // Validate aggregation parameter
    const validAggregations = ['avg', 'min', 'max', 'sum'];
    if (!validAggregations.includes(aggregation)) {
      return res.status(400).json({ 
        message: `Invalid aggregation method. Use one of: ${validAggregations.join(', ')}` 
      });
    }
    
    // Validate time window parameter
    const validTimeWindows = ['hour', 'day', 'week', 'month'];
    if (!validTimeWindows.includes(timeWindow)) {
      return res.status(400).json({ 
        message: `Invalid time window. Use one of: ${validTimeWindows.join(', ')}` 
      });
    }
    
    const aggregatedData = await telemetryService.aggregateData(
      deviceId,
      type,
      aggregation,
      timeWindow,
      startTime,
      endTime
    );
    
    res.json(aggregatedData);
  } catch (error) {
    logger.error('Error aggregating telemetry data:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;