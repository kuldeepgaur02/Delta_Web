const Device = require('../models/device');
const { asyncHandler } = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const plcService = require('../services/plcService');

// @desc    Get all devices for current user
// @route   GET /api/devices
// @access  Private
// FRONTEND NOTE: Use this endpoint to fetch all devices for the current user
exports.getDevices = asyncHandler(async (req, res, next) => {
  let query;

  // Regular users can only see their own devices
  if (req.user.role !== 'admin') {
    query = Device.find({ owner: req.user.id });
  } else {
    // Admins can see all devices
    query = Device.find();
  }

  const devices = await query;

  res.status(200).json({
    success: true,
    count: devices.length,
    data: devices
  });
});

// @desc    Get single device
// @route   GET /api/devices/:id
// @access  Private
// FRONTEND NOTE: Use this endpoint to fetch details of a specific device
exports.getDevice = asyncHandler(async (req, res, next) => {
  const device = await Device.findById(req.params.id);

  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns the device or is an admin
  if (device.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to access this device`, 403));
  }

  res.status(200).json({
    success: true,
    data: device
  });
});

// @desc    Create new device
// @route   POST /api/devices
// @access  Private
// FRONTEND NOTE: Use this endpoint to create a new device
exports.createDevice = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.owner = req.user.id;

  const device = await Device.create(req.body);

  // Initialize PLC service for the new device
  await plcService.initializeDevice(device);

  res.status(201).json({
    success: true,
    data: device
  });
});

// @desc    Update device
// @route   PUT /api/devices/:id
// @access  Private
// FRONTEND NOTE: Use this endpoint to update a device
exports.updateDevice = asyncHandler(async (req, res, next) => {
  let device = await Device.findById(req.params.id);

  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns the device or is an admin
  if (device.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to update this device`, 403));
  }

  device = await Device.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  // Restart PLC connection if IP, port or configuration changed
  if (req.body.ipAddress || req.body.port || req.body.modbusConfig) {
    await plcService.restartConnection(device);
  }

  res.status(200).json({
    success: true,
    data: device
  });
});

// @desc    Delete device
// @route   DELETE /api/devices/:id
// @access  Private
// FRONTEND NOTE: Use this endpoint to delete a device
exports.deleteDevice = asyncHandler(async (req, res, next) => {
  const device = await Device.findById(req.params.id);

  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns the device or is an admin
  if (device.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this device`, 403));
  }

  // Close the PLC connection before deleting
  await plcService.closeConnection(device._id);

  await device.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Test connection to a device
// @route   POST /api/devices/:id/test-connection
// @access  Private
// FRONTEND NOTE: Use this endpoint to test connection to a device
exports.testConnection = asyncHandler(async (req, res, next) => {
  const device = await Device.findById(req.params.id);

  if (!device) {
    return next(new ErrorResponse(`Device not found with id of ${req.params.id}`, 404));
  }

  // Make sure user owns the device or is an admin
  if (device.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`User ${req.user.id} is not authorized to test this device`, 403));
  }

  const connectionResult = await plcService.testConnection({
    ipAddress: device.ipAddress,
    port: device.port,
    unitId: device.modbusConfig.unitId
  });

  res.status(200).json({
    success: true,
    connected: connectionResult.connected,
    message: connectionResult.message
  });
});