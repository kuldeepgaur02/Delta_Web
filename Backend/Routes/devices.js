const express = require('express');
const router = express.Router();
const Device = require('../models/device');
const authMiddleware = require('../middleware/auth');
const deviceService = require('../services/deviceService');
const logger = require('../utils/logger');
const validator = require('../utils/validator');

// Middleware to check permissions
const checkDeviceAccess = async (req, res, next) => {
  try {
    const deviceId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userTenantId = req.user.tenantId;
    const userCustomerId = req.user.customerId;
    
    // Admin has access to all devices
    if (userRole === 'admin') {
      return next();
    }
    
    const device = await Device.findById(deviceId);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Tenant admin has access to all devices in their tenant
    if (userRole === 'tenant_admin' && device.tenantId.equals(userTenantId)) {
      return next();
    }
    
    // Customer user has access to devices assigned to their customer
    if (userRole === 'customer_user' && 
        device.tenantId.equals(userTenantId) && 
        device.customerId && 
        device.customerId.equals(userCustomerId)) {
      return next();
    }
    
    return res.status(403).json({ message: 'Access denied' });
    
  } catch (error) {
    logger.error(`Device access check error: ${error.message}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all devices (with pagination and filtering)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, type, name, status, customerId } = req.query;
    const skip = (page - 1) * limit;
    
    // Build query based on user role and filters
    const query = {};
    
    // Apply role-based restrictions
    if (req.user.role === 'tenant_admin') {
      query.tenantId = req.user.tenantId;
    } else if (req.user.role === 'customer_user') {
      query.tenantId = req.user.tenantId;
      query.customerId = req.user.customerId;
    }
    
    // Apply filters
    if (type) query.type = type;
    if (name) query.name = { $regex: name, $options: 'i' };
    if (status === 'active') query['status.active'] = true;
    if (status === 'inactive') query['status.active'] = false;
    if (status === 'online') query['status.online'] = true;
    if (status === 'offline') query['status.online'] = false;
    if (customerId && req.user.role !== 'customer_user') query.customerId = customerId;
    
    // Execute query with pagination
    const devices = await Device.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    // Get total count for pagination
    const total = await Device.countDocuments(query);
    
    return res.status(200).json({
      devices,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error(`Get devices error: ${error.message}`);
    next(error);
  }
});

// Get device by ID
router.get('/:id', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const device = await Device.findById(req.params.id);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    return res.status(200).json(device.fullInfo);
    
  } catch (error) {
    logger.error(`Get device error: ${error.message}`);
    next(error);
  }
});

// Create new device
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { name, type, label, customerId } = req.body;
    
    // Validate input
    const validationErrors = validator.validateDevice(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Check user permissions
    if (req.user.role === 'customer_user') {
      return res.status(403).json({ message: 'Customer users cannot create devices' });
    }
    
    // Set tenant based on user role
    let tenantId = req.body.tenantId;
    if (req.user.role === 'tenant_admin') {
      tenantId = req.user.tenantId; // Force tenant ID to be the user's tenant
    }
    
    // Check if device name already exists for this tenant
    const existingDevice = await Device.findOne({ 
      tenantId,
      name: name 
    });
    
    if (existingDevice) {
      return res.status(409).json({ 
        message: 'Device with this name already exists'
      });
    }
    
    // Create new device
    const device = new Device({
      name,
      type,
      label,
      tenantId,
      customerId,
      createdBy: req.user.id,
      // Other fields will use default values or be updated later
    });
    
    await device.save();
    
    logger.info(`Device created: ${device.name} (ID: ${device._id})`);
    
    return res.status(201).json(device);
    
  } catch (error) {
    logger.error(`Create device error: ${error.message}`);
    next(error);
  }
});

// Update device
router.put('/:id', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { name, label, additionalInfo, transportConfiguration, deviceProfileId } = req.body;
    
    const device = await Device.findById(req.params.id);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Update allowed fields
    if (name) device.name = name;
    if (label !== undefined) device.label = label;
    if (additionalInfo) device.additionalInfo = additionalInfo;
    if (transportConfiguration) device.transportConfiguration = transportConfiguration;
    if (deviceProfileId) device.deviceProfileId = deviceProfileId;
    
    // Only admin and tenant_admin can change customer assignment
    if (req.body.customerId && ['admin', 'tenant_admin'].includes(req.user.role)) {
      device.customerId = req.body.customerId;
    }
    
    await device.save();
    
    logger.info(`Device updated: ${device.name} (ID: ${device._id})`);
    
    return res.status(200).json(device);
    
  } catch (error) {
    logger.error(`Update device error: ${error.message}`);
    next(error);
  }
});

// Delete device
router.delete('/:id', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    // Only admin and tenant_admin can delete devices
    if (!['admin', 'tenant_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const device = await Device.findById(req.params.id);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    await device.remove();
    
    logger.info(`Device deleted: ${device.name} (ID: ${device._id})`);
    
    return res.status(200).json({ message: 'Device deleted successfully' });
    
  } catch (error) {
    logger.error(`Delete device error: ${error.message}`);
    next(error);
  }
});

// Get device credentials
router.get('/:id/credentials', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const device = await Device.findById(req.params.id);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    return res
      .status(200)
      .json({ 
        deviceId: device._id,
        accessToken: device.accessToken 
      });
    
  } catch (error) {
    logger.error(`Get device credentials error: ${error.message}`);
    next(error);
  }
});

// Update device credentials
router.post('/:id/credentials', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    // Only admin and tenant_admin can update credentials
    if (!['admin', 'tenant_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const device = await Device.findById(req.params.id);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Generate new access token
    device.accessToken = undefined; // This will trigger pre-save hook to generate new token
    await device.save();
    
    logger.info(`Device credentials updated: ${device.name} (ID: ${device._id})`);
    
    return res.status(200).json({ 
      deviceId: device._id,
      accessToken: device.accessToken 
    });
    
  } catch (error) {
    logger.error(`Update device credentials error: ${error.message}`);
    next(error);
  }
});

// Send command to device
router.post('/:id/command', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { command, params, timeout = 30000 } = req.body;
    
    if (!command) {
      return res.status(400).json({ message: 'Command is required' });
    }
    
    const device = await Device.findById(req.params.id);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Check if device is online
    if (!device.status.online) {
      return res.status(409).json({ message: 'Device is offline' });
    }
    
    try {
      // Send command to device via MQTT
      const response = await deviceService.sendDeviceCommand(
        device._id, 
        command, 
        params || {}, 
        timeout
      );
      
      return res.status(200).json({
        commandId: response.commandId,
        status: response.status,
        response: response.data
      });
      
    } catch (commandError) {
      if (commandError.code === 'TIMEOUT') {
        return res.status(504).json({ message: 'Command timed out' });
      }
      throw commandError;
    }
    
  } catch (error) {
    logger.error(`Device command error: ${error.message}`);
    next(error);
  }
});

// Get device attributes
router.get('/:id/attributes', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { scope = 'all' } = req.query;
    
    const device = await Device.findById(req.params.id);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    const attributes = {};
    
    // Return requested attribute scopes
    if (scope === 'all' || scope === 'client') {
      attributes.client = Object.fromEntries(device.attributes.client);
    }
    
    if (scope === 'all' || scope === 'server') {
      attributes.server = Object.fromEntries(device.attributes.server);
    }
    
    if (scope === 'all' || scope === 'shared') {
      attributes.shared = Object.fromEntries(device.attributes.shared);
    }
    
    return res.status(200).json({ attributes });
    
  } catch (error) {
    logger.error(`Get device attributes error: ${error.message}`);
    next(error);
  }
});

// Update device attributes
router.post('/:id/attributes', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { scope, attributes } = req.body;
    
    if (!scope || !attributes || typeof attributes !== 'object') {
      return res.status(400).json({ 
        message: 'Scope and attributes object are required' 
      });
    }
    
    // Only server attributes can be updated via API
    if (scope !== 'server') {
      return res.status(400).json({ 
        message: 'Only server attributes can be updated via this endpoint' 
      });
    }
    
    const device = await Device.findById(req.params.id);
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Update server attributes
    await device.updateAttributes(scope, attributes);
    
    logger.info(`Device attributes updated: ${device.name} (ID: ${device._id})`);
    
    return res.status(200).json({ 
      message: 'Attributes updated successfully',
      attributes: Object.fromEntries(device.attributes[scope])
    });
    
  } catch (error) {
    logger.error(`Update device attributes error: ${error.message}`);
    next(error);
  }
});

module.exports = router;