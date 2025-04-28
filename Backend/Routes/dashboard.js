const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Dashboard = require('../models/dashboard');
const Widget = require('../models/widget');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');
const validator = require('../utils/validator');

// Middleware to check dashboard access permissions
const checkDashboardAccess = async (req, res, next) => {
  try {
    const dashboardId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userTenantId = req.user.tenantId;
    const userCustomerId = req.user.customerId;
    
    // Skip access check for public dashboards if it's a GET request
    if (req.method === 'GET' && req.query.publicId) {
      const dashboard = await Dashboard.findOne({
        publicLink: req.query.publicId,
        isPublic: true
      });
      
      if (dashboard) {
        req.dashboard = dashboard; // Attach dashboard to request
        return next();
      }
      
      return res.status(404).json({ message: 'Dashboard not found' });
    }
    
    // Admin has access to all dashboards
    if (userRole === 'admin') {
      return next();
    }
    
    const dashboard = await Dashboard.findById(dashboardId);
    
    if (!dashboard) {
      return res.status(404).json({ message: 'Dashboard not found' });
    }
    
    // Tenant admin has access to all dashboards in their tenant
    if (userRole === 'tenant_admin' && dashboard.tenantId.equals(userTenantId)) {
      return next();
    }
    
    // Customer user has access to dashboards assigned to their customer
    if (userRole === 'customer_user' && 
        dashboard.tenantId.equals(userTenantId) && 
        dashboard.customerId && 
        dashboard.customerId.equals(userCustomerId)) {
      return next();
    }
    
    return res.status(403).json({ message: 'Access denied' });
    
  } catch (error) {
    logger.error(`Dashboard access check error: ${error.message}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all dashboards (with pagination and filtering)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, title, customerId } = req.query;
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
    if (title) query.title = { $regex: title, $options: 'i' };
    if (customerId && req.user.role !== 'customer_user') query.customerId = customerId;
    
    // Execute query with pagination
    const dashboards = await Dashboard.find(query)
      .select('-configuration.settings.widgets') // Exclude widget configurations to reduce response size
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
    // Get total count for pagination
    const total = await Dashboard.countDocuments(query);
    
    return res.status(200).json({
      dashboards,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error(`Get dashboards error: ${error.message}`);
    next(error);
  }
});

// Get dashboard by ID
router.get('/:id', authMiddleware, checkDashboardAccess, async (req, res, next) => {
  try {
    // If dashboard was attached by the middleware, use it
    const dashboard = req.dashboard || await Dashboard.findById(req.params.id)
      .populate({
        path: 'widgets',
        select: '-tenantId' // Exclude tenant ID from widgets
      });
    
    if (!dashboard) {
      return res.status(404).json({ message: 'Dashboard not found' });
    }
    
    return res.status(200).json(dashboard);
    
  } catch (error) {
    logger.error(`Get dashboard error: ${error.message}`);
    next(error);
  }
});

// Create new dashboard
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { title, configuration, customerId } = req.body;
    
    // Validate input
    const validationErrors = validator.validateDashboard(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Check user permissions
    if (req.user.role === 'customer_user') {
      return res.status(403).json({ message: 'Customer users cannot create dashboards' });
    }
    
    // Set tenant based on user role
    let tenantId = req.body.tenantId;
    if (req.user.role === 'tenant_admin') {
      tenantId = req.user.tenantId; // Force tenant ID to be the user's tenant
    }
    
    // Create new dashboard
    const dashboard = new Dashboard({
      title,
      configuration: configuration || {},
      tenantId,
      customerId,
      layouts: req.body.layouts || { main: [], right: [] },
      createdBy: req.user.id
    });
    
    await dashboard.save();
    
    logger.info(`Dashboard created: ${dashboard.title} (ID: ${dashboard._id})`);
    
    return res.status(201).json(dashboard);
    
  } catch (error) {
    logger.error(`Create dashboard error: ${error.message}`);
    next(error);
  }
});

// This continues from where the provided code ended
router.put('/:id', authMiddleware, checkDashboardAccess, async (req, res, next) => {
    try {
      const { title, configuration, layouts, isPublic } = req.body;
      
      const dashboard = await Dashboard.findById(req.params.id);
      
      if (!dashboard) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }
      
      // Update allowed fields
      if (title) dashboard.title = title;
      if (configuration) dashboard.configuration = configuration;
      if (layouts) dashboard.layouts = layouts;
      if (isPublic !== undefined) dashboard.isPublic = isPublic;
      
      // Only admin and tenant_admin can change customer assignment
      if (req.body.customerId && ['admin', 'tenant_admin'].includes(req.user.role)) {
        dashboard.customerId = req.body.customerId;
      }
      
      await dashboard.save();
      
      logger.info(`Dashboard updated: ${dashboard.title} (ID: ${dashboard._id})`);
      
      return res.status(200).json(dashboard);
      
    } catch (error) {
      logger.error(`Update dashboard error: ${error.message}`);
      next(error);
    }
  });
  
  // Delete dashboard
  router.delete('/:id', authMiddleware, checkDashboardAccess, async (req, res, next) => {
    try {
      const dashboard = await Dashboard.findById(req.params.id);
      
      if (!dashboard) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }
      
      // Find and delete associated widgets
      await Widget.deleteMany({ dashboardId: req.params.id });
      
      // Delete the dashboard
      await Dashboard.findByIdAndDelete(req.params.id);
      
      logger.info(`Dashboard deleted: ${dashboard.title} (ID: ${dashboard._id})`);
      
      return res.status(200).json({ message: 'Dashboard and associated widgets deleted successfully' });
      
    } catch (error) {
      logger.error(`Delete dashboard error: ${error.message}`);
      next(error);
    }
  });
  
  // Generate or update public link for dashboard
  router.post('/:id/public-link', authMiddleware, checkDashboardAccess, async (req, res, next) => {
    try {
      const dashboard = await Dashboard.findById(req.params.id);
      
      if (!dashboard) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }
      
      // Only admin and tenant_admin can generate public links
      if (!['admin', 'tenant_admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only admins and tenant admins can manage public links' });
      }
      
      // Generate a random public ID if one doesn't exist
      if (!dashboard.publicLink) {
        dashboard.publicLink = mongoose.Types.ObjectId().toString();
      }
      
      // Set dashboard to public
      dashboard.isPublic = true;
      
      await dashboard.save();
      
      logger.info(`Public link generated for dashboard: ${dashboard._id}`);
      
      return res.status(200).json({
        publicLink: dashboard.publicLink,
        shareableUrl: `${req.protocol}://${req.get('host')}/dashboards/public/${dashboard.publicLink}`
      });
      
    } catch (error) {
      logger.error(`Generate public link error: ${error.message}`);
      next(error);
    }
  });
  
  // Remove public link for dashboard
  router.delete('/:id/public-link', authMiddleware, checkDashboardAccess, async (req, res, next) => {
    try {
      const dashboard = await Dashboard.findById(req.params.id);
      
      if (!dashboard) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }
      
      // Only admin and tenant_admin can remove public links
      if (!['admin', 'tenant_admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Only admins and tenant admins can manage public links' });
      }
      
      dashboard.publicLink = null;
      dashboard.isPublic = false;
      
      await dashboard.save();
      
      logger.info(`Public link removed for dashboard: ${dashboard._id}`);
      
      return res.status(200).json({ message: 'Public link removed successfully' });
      
    } catch (error) {
      logger.error(`Remove public link error: ${error.message}`);
      next(error);
    }
  });
  
  // Clone a dashboard
  router.post('/:id/clone', authMiddleware, checkDashboardAccess, async (req, res, next) => {
    try {
      const sourceDashboard = await Dashboard.findById(req.params.id);
      
      if (!sourceDashboard) {
        return res.status(404).json({ message: 'Dashboard not found' });
      }
      
      // Create a new dashboard with source properties
      const clonedDashboard = new Dashboard({
        title: `${sourceDashboard.title} (Clone)`,
        configuration: sourceDashboard.configuration,
        layouts: sourceDashboard.layouts,
        tenantId: sourceDashboard.tenantId,
        customerId: sourceDashboard.customerId,
        createdBy: req.user.id
      });
      
      await clonedDashboard.save();
      
      // Clone associated widgets
      const sourceWidgets = await Widget.find({ dashboardId: req.params.id });
      
      for (const widget of sourceWidgets) {
        const clonedWidget = new Widget({
          title: widget.title,
          type: widget.type,
          configuration: widget.configuration,
          dashboardId: clonedDashboard._id,
          tenantId: widget.tenantId,
          customerId: widget.customerId,
          createdBy: req.user.id
        });
        
        await clonedWidget.save();
      }
      
      logger.info(`Dashboard cloned: ${sourceDashboard._id} to ${clonedDashboard._id}`);
      
      return res.status(201).json(clonedDashboard);
      
    } catch (error) {
      logger.error(`Clone dashboard error: ${error.message}`);
      next(error);
    }
  });
  
  module.exports = router;