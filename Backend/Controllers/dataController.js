const Device = require('../Model/device');
const DataPoint = require('../Models/datapoint');
const { asyncHandler } = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const plcService = require('../services/plcService');
const dataExtractionService = require('../services/dataExtractionService');
const analysisService = require('../services/analysisService');

// @desc    Get latest data for a device
// @route   GET /api/data/:deviceId/latest
// @access  Private
// FRONTEND NOTE: Use this endpoint to get the latest data for a device
exports.getLatestData = asyncHandler(async (req, res, next) => {
  const device = await Device.findById(req.params.deviceId);

  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.deviceId}`, 404));
  }

  // Make sure user owns the device or is an admin
  if (device.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this device data`, 403));
  }

  // Get latest data from the PLC directly (real-time)
  try {
    const latestData = await dataExtractionService.fetchLatestData(device);
    
    res.status(200).json({
      success: true,
      data: latestData
    });
  } catch (error) {
    return next(new ErrorResponse(`Error fetching data: ${error.message}`, 500));
  }
});

// @desc    Get historical data for a device
// @route   GET /api/data/:deviceId/history
// @access  Private
// FRONTEND NOTE: Use this endpoint to get historical data for charting/analysis
exports.getHistoricalData = asyncHandler(async (req, res, next) => {
  const device = await Device.findById(req.params.deviceId);

  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.deviceId}`, 404));
  }

  // Make sure user owns the device or is an admin
  if (device.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this device data`, 403));
  }

  // Extract query parameters
  const { startDate, endDate, register, limit = 1000 } = req.query;

  // Build query
  const query = { device: req.params.deviceId };
  
  if (startDate && endDate) {
    query.timestamp = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  if (register) {
    query.registerName = register;
  }

  const data = await DataPoint.find(query)
    .sort({ timestamp: -1 })
    .limit(parseInt(limit, 10));

  res.status(200).json({
    success: true,
    count: data.length,
    data
  });
});

// @desc    Get analysis for a device
// @route   GET /api/data/:deviceId/analysis
// @access  Private
// FRONTEND NOTE: Use this endpoint to get analysis results for the device data
exports.getAnalysis = asyncHandler(async (req, res, next) => {
  const device = await Device.findById(req.params.deviceId);

  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.deviceId}`, 404));
  }

  // Make sure user owns the device or is an admin
  if (device.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this device analysis`, 403));
  }

  // Get time period from query parameters
  const { period = '24h' } = req.query;

  try {
    // Analyze the data
    const analysisResult = await analysisService.analyzeDeviceData(device, period);
    
    res.status(200).json({
      success: true,
      data: analysisResult
    });
  } catch (error) {
    return next(new ErrorResponse(`Error performing analysis: ${error.message}`, 500));
  }
});

// @desc    Manually refresh data from PLC
// @route   POST /api/data/:deviceId/refresh
// @access  Private
// FRONTEND NOTE: Use this endpoint to manually refresh data from a PLC
exports.refreshData = asyncHandler(async (req, res, next) => {
  const device = await Device.findById(req.params.deviceId);

  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.deviceId}`, 404));
  }

  // Make sure user owns the device or is an admin
  if (device.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to refresh this device data`, 403));
  }

  try {
    // Force a data refresh
    const data = await dataExtractionService.extractAndSaveData(device);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    return next(new ErrorResponse(`Error refreshing data: ${error.message}`, 500));
  }
});