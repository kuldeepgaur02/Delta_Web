const DataPoint = require('../Models/datapoint');
const Device = require("../models/device");
const { logger } = require('../utils/logger');
const analysisFactory = require('../analyzers/factory');

/**
 * Analyze device data based on device type
 * @param {Object} device - The device document
 * @param {String} period - Time period for analysis (e.g. '24h', '7d', '30d')
 * @returns {Object} Analysis results
 */
exports.analyzeDeviceData = async (device, period = '24h') => {
  try {
    // Get the appropriate analyzer for this device type
    const analyzer = analysisFactory.getAnalyzer(device.type);
    
    if (!analyzer) {
      throw new Error(`No analyzer available for device type: ${device.type}`);
    }
    
    // Calculate the date range based on the period
    const endDate = new Date();
    const startDate = calculateStartDate(endDate, period);
    
    // Get historical data for the device
    const data = await fetchHistoricalData(device._id, startDate, endDate);
    
    // Run the analysis
    const analysisResult = await analyzer.analyze(device, data, { startDate, endDate });
    
    // Append metadata
    return {
      deviceId: device._id,
      deviceName: device.name,
      deviceType: device.type,
      period,
      startDate,
      endDate,
      analysisTimestamp: new Date(),
      results: analysisResult
    };
  } catch (error) {
    logger.error(`Error analyzing data for device ${device._id}: ${error.message}`);
    throw error;
  }
};

/**
 * Get performance metrics for a device
 * @param {Object} device - The device document
 * @param {String} period - Time period for metrics
 */
exports.getPerformanceMetrics = async (device, period = '24h') => {
  try {
    // Get the appropriate analyzer
    const analyzer = analysisFactory.getAnalyzer(device.type);
    
    if (!analyzer) {
      throw new Error(`No analyzer available for device type: ${device.type}`);
    }
    
    // Calculate the date range
    const endDate = new Date();
    const startDate = calculateStartDate(endDate, period);
    
    // Get recent data
    const data = await fetchHistoricalData(device._id, startDate, endDate);
    
    // Calculate performance metrics
    return await analyzer.calculatePerformanceMetrics(device, data, { startDate, endDate });
  } catch (error) {
    logger.error(`Error calculating performance metrics for device ${device._id}: ${error.message}`);
    throw error;
  }
};

/**
 * Detect anomalies in device data
 * @param {Object} device - The device document
 */
exports.detectAnomalies = async (device) => {
  try {
    // Get the appropriate analyzer
    const analyzer = analysisFactory.getAnalyzer(device.type);
    
    if (!analyzer) {
      throw new Error(`No analyzer available for device type: ${device.type}`);
    }
    
    // Get recent data (last 24 hours by default)
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (24 * 60 * 60 * 1000));
    const data = await fetchHistoricalData(device._id, startDate, endDate);
    
    // Detect anomalies
    return await analyzer.detectAnomalies(device, data);
  } catch (error) {
    logger.error(`Error detecting anomalies for device ${device._id}: ${error.message}`);
    throw error;
  }
};

/**
 * Generate recommendations based on device data
 * @param {Object} device - The device document
 */
exports.generateRecommendations = async (device) => {
  try {
    // Get the appropriate analyzer
    const analyzer = analysisFactory.getAnalyzer(device.type);
    
    if (!analyzer) {
      throw new Error(`No analyzer available for device type: ${device.type}`);
    }
    
    // Get recent data
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000)); // Last 7 days
    const data = await fetchHistoricalData(device._id, startDate, endDate);
    
    // Generate recommendations
    return await analyzer.generateRecommendations(device, data);
  } catch (error) {
    logger.error(`Error generating recommendations for device ${device._id}: ${error.message}`);
    throw error;
  }
};

/**
 * Calculate start date based on period string
 * @private
 */
function calculateStartDate(endDate, period) {
  const end = new Date(endDate);
  
  switch (period) {
    case '1h':
      return new Date(end.getTime() - (1 * 60 * 60 * 1000));
    case '6h':
      return new Date(end.getTime() - (6 * 60 * 60 * 1000));
    case '12h':
      return new Date(end.getTime() - (12 * 60 * 60 * 1000));
    case '24h':
    case '1d':
      return new Date(end.getTime() - (24 * 60 * 60 * 1000));
    case '7d':
      return new Date(end.getTime() - (7 * 24 * 60 * 60 * 1000));
    case '30d':
      return new Date(end.getTime() - (30 * 24 * 60 * 60 * 1000));
    case '90d':
      return new Date(end.getTime() - (90 * 24 * 60 * 60 * 1000));
    default:
      // Default to 24 hours
      return new Date(end.getTime() - (24 * 60 * 60 * 1000));
  }
}

/**
 * Fetch historical data for a device
 * @private
 */
async function fetchHistoricalData(deviceId, startDate, endDate) {
  try {
    return await DataPoint.find({
      device: deviceId,
      timestamp: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ timestamp: 1 });
  } catch (error) {
    logger.error(`Error fetching historical data: ${error.message}`);
    throw error;
  }
}

module.exports = exports;