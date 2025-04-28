const Device = require('../Models/device');
const User = require('../Models/user');
const Telemetry = require('../Models/telemetry');
const logger = require('../utils/logger');
const { generateToken } = require('../utils/tokenGenerator');

class DeviceService {
  /**
   * Create a new device
   * @param {Object} deviceData - Device data
   * @param {string} ownerId - User ID of device owner
   * @returns {Promise<Object>} - Created device
   */
  async createDevice(deviceData, ownerId) {
    try {
      // Verify owner exists
      const owner = await User.findById(ownerId);
      if (!owner) {
        throw new Error('Owner not found');
      }

      // Generate access token for device
      const accessToken = generateToken(32);

      // Create device
      const device = new Device({
        ...deviceData,
        owner: ownerId,
        accessToken
      });

      await device.save();
      return device;
    } catch (error) {
      logger.error('Error creating device:', error);
      throw error;
    }
  }

  /**
   * Get device by ID
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} - Device object
   */
  async getDeviceById(deviceId, userId) {
    try {
      const device = await Device.findById(deviceId)
        .populate('owner', 'email firstName lastName')
        .lean();

      if (!device) {
        throw new Error('Device not found');
      }

      // Check authorization
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Allow access if user is admin or device owner
      if (user.role !== 'admin' && device.owner._id.toString() !== userId) {
        throw new Error('Not authorized to access this device');
      }

      return device;
    } catch (error) {
      logger.error(`Error fetching device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Get devices for user (owned or accessible)
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @param {number} limit - Max number of devices to return
   * @param {number} offset - Number of devices to skip
   * @returns {Promise<Object>} - Paginated devices
   */
  async getUserDevices(userId, filters = {}, limit = 10, offset = 0) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Build query
      let query = {};

      // Admin can see all devices, others only see their own
      if (user.role !== 'admin') {
        query.owner = userId;
      } else if (filters.owner) {
        query.owner = filters.owner;
      }

      // Apply additional filters
      if (filters.type) {
        query.type = filters.type;
      }

      if (filters.active !== undefined) {
        query.active = filters.active;
      }

      if (filters.search) {
        query.$or = [
          { name: { $regex: filters.search, $options: 'i' } },
          { label: { $regex: filters.search, $options: 'i' } }
        ];
      }

      // Get total count
      const total = await Device.countDocuments(query);

      // Get devices
      const devices = await Device.find(query)
        .populate('owner', 'email firstName lastName')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

      return {
        devices,
        pagination: {
          total,
          limit,
          offset,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error(`Error fetching devices for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update device
   * @param {string} deviceId - Device ID
   * @param {Object} updateData - Data to update
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} - Updated device
   */
  async updateDevice(deviceId, updateData, userId) {
    try {
      // Get device and check permissions
      const device = await Device.findById(deviceId);
      if (!device) {
        throw new Error('Device not found');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user has permission to update
      if (user.role !== 'admin' && device.owner.toString() !== userId) {
        throw new Error('Not authorized to update this device');
      }

      // Remove protected fields
      const { owner, accessToken, ...updateFields } = updateData;

      // Update device
      const updatedDevice = await Device.findByIdAndUpdate(
        deviceId,
        { $set: updateFields },
        { new: true }
      ).populate('owner', 'email firstName lastName');

      return updatedDevice;
    } catch (error) {
      logger.error(`Error updating device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Delete device
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID (for authorization)
   * @param {boolean} deleteData - Whether to delete associated telemetry data
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteDevice(deviceId, userId, deleteData = false) {
    try {
      // Get device and check permissions
      const device = await Device.findById(deviceId);
      if (!device) {
        throw new Error('Device not found');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user has permission to delete
      if (user.role !== 'admin' && device.owner.toString() !== userId) {
        throw new Error('Not authorized to delete this device');
      }

      // Delete associated telemetry data if requested
      let telemetryDeleteResult = { deletedCount: 0 };
      if (deleteData) {
        telemetryDeleteResult = await Telemetry.deleteMany({ deviceId });
      }

      // Delete device
      await Device.findByIdAndDelete(deviceId);

      return { 
        success: true, 
        message: 'Device deleted successfully',
        telemetryDeleted: telemetryDeleteResult.deletedCount
      };
    } catch (error) {
      logger.error(`Error deleting device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Regenerate device access token
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} - Updated token
   */
  async regenerateAccessToken(deviceId, userId) {
    try {
      // Get device and check permissions
      const device = await Device.findById(deviceId);
      if (!device) {
        throw new Error('Device not found');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user has permission
      if (user.role !== 'admin' && device.owner.toString() !== userId) {
        throw new Error('Not authorized to manage this device');
      }

      // Generate new token
      const newAccessToken = generateToken(32);

      // Update device
      device.accessToken = newAccessToken;
      await device.save();

      return {
        deviceId,
        accessToken: newAccessToken
      };
    } catch (error) {
      logger.error(`Error regenerating token for device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Authenticate device using access token
   * @param {string} deviceId - Device ID
   * @param {string} accessToken - Device access token
   * @returns {Promise<Object>} - Device if authenticated
   */
  async authenticateDevice(deviceId, accessToken) {
    try {
      const device = await Device.findOne({ 
        _id: deviceId,
        accessToken
      });

      if (!device) {
        throw new Error('Invalid device credentials');
      }

      if (!device.active) {
        throw new Error('Device is inactive');
      }

      return device;
    } catch (error) {
      logger.error('Device authentication failed:', error);
      throw error;
    }
  }

  /**
   * Get device types summary
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Device types summary
   */
  async getDeviceTypesSummary(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Build query
      let matchStage = {};
      
      // Admin sees all, others only see their own
      if (user.role !== 'admin') {
        matchStage.owner = user._id;
      }

      const summary = await Device.aggregate([
        { $match: matchStage },
        { $group: {
          _id: '$type',
          count: { $sum: 1 },
          active: { $sum: { $cond: ['$active', 1, 0] } },
          inactive: { $sum: { $cond: ['$active', 0, 1] } }
        }},
        { $project: {
          _id: 0,
          type: '$_id',
          count: 1,
          active: 1,
          inactive: 1
        }},
        { $sort: { count: -1 } }
      ]);

      return summary;
    } catch (error) {
      logger.error(`Error getting device types summary for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Bulk update devices
   * @param {Array} deviceIds - Array of device IDs
   * @param {Object} updateData - Data to update
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object>} - Update result
   */
  async bulkUpdateDevices(deviceIds, updateData, userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Build query
      let query = { _id: { $in: deviceIds } };
      
      // Non-admins can only update their own devices
      if (user.role !== 'admin') {
        query.owner = userId;
      }

      // Remove protected fields
      const { owner, accessToken, ...updateFields } = updateData;

      // Update devices
      const result = await Device.updateMany(
        query,
        { $set: updateFields }
      );

      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      logger.error('Error bulk updating devices:', error);
      throw error;
    }
  }
}

module.exports = new DeviceService();