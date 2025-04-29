const jwt = require('jsonwebtoken');
const config = require('../Config/default');
const User = require('../Models/user');
const Device = require('../Models/device');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate users
 */
exports.authenticateUser = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No authentication token provided' });
    }
    
    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Find user by id
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    if (!user.active) {
      return res.status(401).json({ message: 'User account is inactive' });
    }
    
    // Add user to request object
    req.user = user;
    req.userId = user._id;
    req.userRole = user.role;
    req.tenantId = user.tenantId;
    
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

/**
 * Middleware to authenticate devices
 */
exports.authenticateDevice = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('X-Device-Token');
    
    if (!token) {
      return res.status(401).json({ message: 'No device token provided' });
    }
    
    // Find device by access token
    const device = await Device.findOne({ 'credentials.accessToken': token });
    
    if (!device) {
      return res.status(401).json({ message: 'Device not found' });
    }
    
    if (device.status === 'suspended') {
      return res.status(401).json({ message: 'Device is suspended' });
    }
    
    // Check if token is expired
    if (device.credentials.expiresAt < Date.now()) {
      return res.status(401).json({ message: 'Device token has expired' });
    }
    
    // Update last activity time
    device.lastActivity = Date.now();
    await device.save();
    
    // Add device to request object
    req.device = device;
    req.deviceId = device.deviceId;
    
    next();
  } catch (error) {
    logger.error('Device authentication error:', error);
    return res.status(401).json({ message: 'Device authentication failed' });
  }
};

/**
 * Middleware to check admin role
 */
exports.isAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Access denied: Admin role required' });
  }
  next();
};

/**
 * Middleware to check admin or tenant admin role
 */
exports.isAdminOrTenantAdmin = (req, res, next) => {
  if (req.userRole !== 'admin' && req.userRole !== 'tenant_admin') {
    return res.status(403).json({ message: 'Access denied: Admin or Tenant Admin role required' });
  }
  next();
};

/**
 * Middleware to check if user has access to the device
 */
exports.hasDeviceAccess = async (req, res, next) => {
  try {
    const deviceId = req.params.deviceId || req.body.deviceId;
    
    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID is required' });
    }
    
    const device = await Device.findOne({ deviceId });
    
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Admin has access to all devices
    if (req.userRole === 'admin') {
      req.device = device;
      return next();
    }
    
    // Check if user has access to this device
    if (req.userRole === 'tenant_admin') {
      // Tenant admin has access to all devices in their tenant
      if (device.tenantId && device.tenantId.equals(req.tenantId)) {
        req.device = device;
        return next();
      }
    } else {
      // Regular user only has access to their own devices
      if (device.ownerId.equals(req.userId)) {
        req.device = device;
        return next();
      }
    }
    
    return res.status(403).json({ message: 'Access denied: You do not have permission to access this device' });
  } catch (error) {
    logger.error('Device access check error:', error);
    return res.status(500).json({ message: 'Server error checking device access' });
  }
};