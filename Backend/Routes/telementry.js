const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const telemetryService = require('../services/telemetryService');
const deviceService = require('../services/deviceService');
const logger = require('../utils/logger');
const validator = require('../utils/validator');

// Middleware to check device access permissions
const checkDeviceAccess = async (req, res, next) => {
  try {
    const deviceId = req.params.deviceId;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userTenantId = req.user.tenantId;
    const userCustomerId = req.user.customerId;
    
    // Admin has access to all devices
    if (userRole === 'admin') {
      return next();
    }
    
    // Get device details
    const device = await deviceService.getDeviceById(deviceId);
    
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
    
    // Public access check for shared devices
    if (req.query.publicKey && device.publicAccess && 
        device.publicKey === req.query.publicKey) {
      req.publicAccess = true; // Flag for limited access
      return next();
    }
    
    return res.status(403).json({ message: 'Access denied' });
    
  } catch (error) {
    logger.error(`Device access check error: ${error.message}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get latest telemetry for a device
router.get('/device/:deviceId/latest', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { keys } = req.query;
    
    // Parse keys if provided
    const keysList = keys ? keys.split(',') : [];
    
    const latestTelemetry = await telemetryService.getLatestTelemetry(deviceId, keysList);
    
    return res.status(200).json(latestTelemetry);
    
  } catch (error) {
    logger.error(`Get latest telemetry error: ${error.message}`);
    next(error);
  }
});

// Get historical telemetry for a device
router.get('/device/:deviceId/history', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { 
      startTime, 
      endTime, 
      keys, 
      limit, 
      aggregation, 
      interval 
    } = req.query;
    
    // Validate time parameters
    if (startTime && !validator.isValidDate(startTime)) {
      return res.status(400).json({ message: 'Invalid startTime format' });
    }
    
    if (endTime && !validator.isValidDate(endTime)) {
      return res.status(400).json({ message: 'Invalid endTime format' });
    }
    
    // Parse query parameters
    const options = {
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : new Date(),
      keys: keys ? keys.split(',') : [],
      limit: limit ? parseInt(limit) : 1000,
      aggregation: aggregation,
      interval: interval
    };
    
    // Check for specific telemetry requirements when using public access
    if (req.publicAccess) {
      const device = await deviceService.getDeviceById(deviceId);
      if (!device.publicTelemetryKeys || !Array.isArray(device.publicTelemetryKeys)) {
        return res.status(403).json({ message: 'No public telemetry keys configured' });
      }
      
      // Filter requested keys based on public access configuration
      if (options.keys.length > 0) {
        options.keys = options.keys.filter(key => device.publicTelemetryKeys.includes(key));
        if (options.keys.length === 0) {
          return res.status(403).json({ message: 'None of the requested keys are publicly accessible' });
        }
      } else {
        // If no keys specified, use all public keys
        options.keys = device.publicTelemetryKeys;
      }
    }
    
    // Get historical data
    const telemetryData = await telemetryService.queryTelemetry(deviceId, options);
    
    return res.status(200).json({
      deviceId,
      timeRange: {
        start: options.startTime,
        end: options.endTime
      },
      data: telemetryData
    });
    
  } catch (error) {
    logger.error(`Get telemetry history error: ${error.message}`);
    next(error);
  }
});

// Save telemetry for a device
router.post('/device/:deviceId', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const telemetryData = req.body;
    
    // Validate telemetry data
    const validationErrors = validator.validateTelemetry(telemetryData);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Public access cannot submit telemetry
    if (req.publicAccess) {
      return res.status(403).json({ message: 'Public access cannot submit telemetry data' });
    }
    
    // Save telemetry
    const savedTelemetry = await telemetryService.saveTelemetry(deviceId, telemetryData, {
      source: 'api',
      userId: req.user.id
    });
    
    return res.status(201).json({
      message: 'Telemetry saved successfully',
      timestamp: savedTelemetry.timestamp,
      id: savedTelemetry._id
    });
    
  } catch (error) {
    logger.error(`Save telemetry error: ${error.message}`);
    next(error);
  }
});

// Save batch telemetry for multiple devices
router.post('/batch', authMiddleware, async (req, res, next) => {
  try {
    const { items } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Batch items must be an array and cannot be empty' });
    }
    
    // Only admin and tenant_admin can submit batch telemetry
    if (!['admin', 'tenant_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only admins and tenant admins can submit batch telemetry' });
    }
    
    // Process batch
    const result = await telemetryService.saveBatchTelemetry(items, {
      source: 'api',
      userId: req.user.id
    });
    
    return res.status(201).json(result);
    
  } catch (error) {
    logger.error(`Save batch telemetry error: ${error.message}`);
    next(error);
  }
});

// Delete telemetry data for a device
router.delete('/device/:deviceId', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { startTime, endTime, keys } = req.query;
    
    // Only admin and tenant_admin can delete telemetry
    if (!['admin', 'tenant_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only admins and tenant admins can delete telemetry data' });
    }
    
    // Validate time parameters if provided
    if (startTime && !validator.isValidDate(startTime)) {
      return res.status(400).json({ message: 'Invalid startTime format' });
    }
    
    if (endTime && !validator.isValidDate(endTime)) {
      return res.status(400).json({ message: 'Invalid endTime format' });
    }
    
    // Prepare options
    const options = {
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      keys: keys ? keys.split(',') : []
    };
    
    // Delete telemetry
    const result = await telemetryService.deleteTelemetry(deviceId, options);
    
    return res.status(200).json(result);
    
  } catch (error) {
    logger.error(`Delete telemetry error: ${error.message}`);
    next(error);
  }
});

// Get aggregated telemetry statistics for a device
router.get('/device/:deviceId/stats', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { 
      startTime, 
      endTime, 
      keys,
      aggregation = 'avg',
      interval = '1h'
    } = req.query;
    
    // Validate parameters
    if (!startTime || !validator.isValidDate(startTime)) {
      return res.status(400).json({ message: 'Valid startTime is required for statistics' });
    }
    
    if (endTime && !validator.isValidDate(endTime)) {
      return res.status(400).json({ message: 'Invalid endTime format' });
    }
    
    // Validate aggregation
    const validAggregations = ['avg', 'min', 'max', 'sum', 'count'];
    if (!validAggregations.includes(aggregation.toLowerCase())) {
      return res.status(400).json({ 
        message: `Invalid aggregation. Supported values: ${validAggregations.join(', ')}` 
      });
    }
    
    // Validate interval
    if (!validator.isValidInterval(interval)) {
      return res.status(400).json({ 
        message: 'Invalid interval format. Examples: 5s, 10m, 1h, 1d' 
      });
    }
    
    // Parse query parameters
    const options = {
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : new Date(),
      keys: keys ? keys.split(',') : [],
      aggregation: aggregation.toLowerCase(),
      interval
    };
    
    // Filter keys for public access
    if (req.publicAccess) {
      const device = await deviceService.getDeviceById(deviceId);
      if (!device.publicTelemetryKeys || !Array.isArray(device.publicTelemetryKeys)) {
        return res.status(403).json({ message: 'No public telemetry keys configured' });
      }
      
      if (options.keys.length > 0) {
        options.keys = options.keys.filter(key => device.publicTelemetryKeys.includes(key));
        if (options.keys.length === 0) {
          return res.status(403).json({ message: 'None of the requested keys are publicly accessible' });
        }
      } else {
        options.keys = device.publicTelemetryKeys;
      }
    }
    
    // Get aggregated data
    const stats = await telemetryService.aggregateTelemetry(deviceId, options);
    
    return res.status(200).json({
      deviceId,
      timeRange: {
        start: options.startTime,
        end: options.endTime
      },
      interval: options.interval,
      aggregation: options.aggregation,
      data: stats
    });
    
  } catch (error) {
    logger.error(`Get telemetry stats error: ${error.message}`);
    next(error);
  }
});

// Export telemetry data
router.get('/device/:deviceId/export', authMiddleware, checkDeviceAccess, async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { 
      startTime, 
      endTime, 
      keys,
      format = 'json' // json or csv
    } = req.query;
    
    // Validate parameters
    if (!startTime || !validator.isValidDate(startTime)) {
      return res.status(400).json({ message: 'Valid startTime is required for export' });
    }
    
    if (!endTime || !validator.isValidDate(endTime)) {
      return res.status(400).json({ message: 'Valid endTime is required for export' });
    }
    
    // Check date range (limit to reasonable range to prevent huge downloads)
    const start = new Date(startTime);
    const end = new Date(endTime);
    const maxExportDays = 30; // Maximum range in days
    
    const daysDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    if (daysDiff > maxExportDays) {
      return res.status(400).json({ 
        message: `Export limited to ${maxExportDays} days. Please reduce your time range.` 
      });
    }
    
    // Parse query parameters
    const options = {
      startTime: start,
      endTime: end,
      keys: keys ? keys.split(',') : [],
      limit: 100000 // Hard limit on export size
    };
    
    // Get telemetry data
    const telemetryData = await telemetryService.queryTelemetry(deviceId, options);
    
    // Format response based on requested format
    if (format.toLowerCase() === 'csv') {
      // Generate CSV
      const device = await deviceService.getDeviceById(deviceId);
      const csvData = await telemetryService.convertToCsv(telemetryData, device.name);
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=telemetry-${deviceId}-${start.toISOString().slice(0,10)}.csv`);
      
      return res.send(csvData);
    } else {
      // Default to JSON
      return res.status(200).json({
        deviceId,
        exportedAt: new Date(),
        timeRange: {
          start: options.startTime,
          end: options.endTime
        },
        count: telemetryData.length,
        data: telemetryData
      });
    }
    
  } catch (error) {
    logger.error(`Export telemetry error: ${error.message}`);
    next(error);
  }
});

// Get latest telemetry for multiple devices
router.post('/latest/devices', authMiddleware, async (req, res, next) => {
  try {
    const { deviceIds, keys } = req.body;
    
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      return res.status(400).json({ message: 'deviceIds must be an array and cannot be empty' });
    }
    
    // Parse keys if provided
    const keysList = keys ? (Array.isArray(keys) ? keys : [keys]) : [];
    
    // Get user info for access control
    const userRole = req.user.role;
    const userTenantId = req.user.tenantId;
    const userCustomerId = req.user.customerId;
    
    // Process each device
    const results = {};
    const accessibleDeviceIds = [];
    
    // Filter accessible devices first
    for (const deviceId of deviceIds) {
      try {
        // Skip invalid IDs
        if (!mongoose.Types.ObjectId.isValid(deviceId)) {
          continue;
        }
        
        const device = await deviceService.getDeviceById(deviceId);
        
        if (!device) {
          continue;
        }
        
        // Check access based on role
        let hasAccess = false;
        
        if (userRole === 'admin') {
          hasAccess = true;
        } else if (userRole === 'tenant_admin' && device.tenantId.equals(userTenantId)) {
          hasAccess = true;
        } else if (userRole === 'customer_user' && 
                  device.tenantId.equals(userTenantId) && 
                  device.customerId && 
                  device.customerId.equals(userCustomerId)) {
          hasAccess = true;
        }
        
        if (hasAccess) {
          accessibleDeviceIds.push(deviceId);
        }
      } catch (error) {
        logger.warn(`Error checking access for device ${deviceId}: ${error.message}`);
      }
    }
    
    // Get telemetry data for accessible devices
    for (const deviceId of accessibleDeviceIds) {
      try {
        const telemetry = await telemetryService.getLatestTelemetry(deviceId, keysList);
        results[deviceId] = telemetry;
      } catch (error) {
        logger.warn(`Error getting telemetry for device ${deviceId}: ${error.message}`);
        results[deviceId] = { error: 'Failed to retrieve telemetry' };
      }
    }
    
    return res.status(200).json(results);
    
  } catch (error) {
    logger.error(`Get latest telemetry for multiple devices error: ${error.message}`);
    next(error);
  }
});

// Websocket endpoint info (documentation only)
router.get('/websocket/info', (req, res) => {
  return res.status(200).json({
    message: 'Websocket endpoints for real-time telemetry',
    endpoints: [
      {
        url: '/api/ws/telemetry',
        description: 'Subscribe to real-time telemetry updates',
        authentication: 'JWT token required as query parameter: ?token=your_jwt_token',
        subscriptionFormat: {
          type: 'subscribe',
          deviceId: 'device_id',
          keys: ['temperature', 'humidity'] // Optional, all keys if omitted
        },
        unsubscribeFormat: {
          type: 'unsubscribe',
          deviceId: 'device_id'
        }
      }
    ]
  });
});

module.exports = router;