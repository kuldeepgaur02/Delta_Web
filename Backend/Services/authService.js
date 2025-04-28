const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../Models/user');
const config = require('../Config/default');
const logger = require('../utils/logger');

class AuthService {
  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} - Registered user object (without password)
   */
  async registerUser(userData) {
    try {
      const { email, password, firstName, lastName, role = 'user' } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        throw new Error('User already exists with this email');
      }

      // Validate role
      const allowedRoles = ['admin', 'user', 'tenant'];
      if (!allowedRoles.includes(role)) {
        throw new Error(`Invalid role. Allowed roles: ${allowedRoles.join(', ')}`);
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new user
      const user = new User({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role
      });

      await user.save();

      // Return user without password
      const userObject = user.toObject();
      delete userObject.password;
      
      return userObject;
    } catch (error) {
      logger.error('Error registering user:', error);
      throw error;
    }
  }

  /**
   * Authenticate user and generate access token
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} - Auth token and user data
   */
  async loginUser(email, password) {
    try {
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Check if user is active
      if (!user.active) {
        throw new Error('Account is disabled. Please contact administrator');
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        throw new Error('Invalid credentials');
      }

      // Create JWT token
      const payload = {
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      };

      const token = jwt.sign(
        payload,
        config.jwtSecret,
        { expiresIn: config.jwtExpiration || '24h' }
      );

      // Return token and user data (without password)
      const userObject = user.toObject();
      delete userObject.password;

      return {
        token,
        user: userObject
      };
    } catch (error) {
      logger.error('Error logging in user:', error);
      throw error;
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Promise<Object>} - Decoded token data
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      return decoded;
    } catch (error) {
      logger.error('Token verification failed:', error);
      throw new Error('Invalid token');
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - User object (without password)
   */
  async getUserById(userId) {
    try {
      const user = await User.findById(userId).select('-password');
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    } catch (error) {
      logger.error(`Error fetching user with ID ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} - Updated user object
   */
  async updateUser(userId, updateData) {
    try {
      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Remove protected fields
      const { password, role, ...updateFields } = updateData;

      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true }
      ).select('-password');

      return updatedUser;
    } catch (error) {
      logger.error(`Error updating user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} - Success indicator
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Find user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update password
      user.password = hashedPassword;
      await user.save();

      return true;
    } catch (error) {
      logger.error(`Error changing password for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update user role (admin only)
   * @param {string} userId - User ID
   * @param {string} newRole - New role
   * @param {string} adminId - Admin user ID
   * @returns {Promise<Object>} - Updated user object
   */
  async updateUserRole(userId, newRole, adminId) {
    try {
      // Verify admin
      const admin = await User.findById(adminId);
      if (!admin || admin.role !== 'admin') {
        throw new Error('Not authorized to update user roles');
      }

      // Validate role
      const allowedRoles = ['admin', 'user', 'tenant'];
      if (!allowedRoles.includes(newRole)) {
        throw new Error(`Invalid role. Allowed roles: ${allowedRoles.join(', ')}`);
      }

      // Update user role
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { role: newRole },
        { new: true }
      ).select('-password');

      if (!updatedUser) {
        throw new Error('User not found');
      }

      return updatedUser;
    } catch (error) {
      logger.error(`Error updating role for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate/reactivate user account
   * @param {string} userId - User ID
   * @param {boolean} active - Active status
   * @param {string} adminId - Admin user ID
   * @returns {Promise<Object>} - Updated user object
   */
  async setUserActiveStatus(userId, active, adminId) {
    try {
      // Verify admin
      const admin = await User.findById(adminId);
      if (!admin || admin.role !== 'admin') {
        throw new Error('Not authorized to change user status');
      }

      // Update user active status
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { active },
        { new: true }
      ).select('-password');

      if (!updatedUser) {
        throw new Error('User not found');
      }

      return updatedUser;
    } catch (error) {
      logger.error(`Error updating active status for user ${userId}:`, error);
      throw error;
    }
  }
}

module.exports = new AuthService();