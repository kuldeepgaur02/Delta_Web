const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../Models/user');
const config = require('../Config/default');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');
const validator = require('../utils/validator');
const authService = require('../services/authService');

// Login route
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        message: 'Username and password are required' 
      });
    }
    
    // Find user by username or email
    const user = await User.findOne({ 
      $or: [
        { username: username },
        { email: username }
      ] 
    });
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid username or password' 
      });
    }
    
    // Check if user is active
    if (!user.active) {
      return res.status(403).json({ 
        message: 'Account is deactivated' 
      });
    }
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      // Update failed login attempts
      user.failedLoginAttempts += 1;
      await user.save();
      
      return res.status(401).json({ 
        message: 'Invalid username or password' 
      });
    }
    
    // Reset failed login attempts
    user.failedLoginAttempts = 0;
    user.lastLoginTime = new Date();
    await user.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id,
        role: user.role,
        tenantId: user.tenantId,
        customerId: user.customerId
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
    
    logger.info(`User logged in: ${user.username}`);
    
    // Return user info and token
    return res.status(200).json({
      token,
      user: user.toJSON()
    });
    
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    next(error);
  }
});

// Register route (for customer users only)
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password, firstName, lastName, phone } = req.body;
    
    // Validate input
    const validationErrors = validator.validateUserRegistration(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Check if username or email already exists
    const existingUser = await User.findOne({ 
      $or: [
        { username: username },
        { email: email }
      ] 
    });
    
    if (existingUser) {
      return res.status(409).json({ 
        message: 'Username or email already exists' 
      });
    }
    
    // Create new user
    const newUser = new User({
      username,
      email,
      password,
      firstName,
      lastName,
      phone,
      role: 'customer_user',
      // tenantId and customerId would typically be set based on a registration process
      // or they could be passed in as hidden fields from a registration form
    });
    
    // Generate activation token
    const activationToken = authService.generateActivationToken();
    newUser.activationToken = activationToken.token;
    newUser.activationTokenExpiresAt = activationToken.expiresAt;
    newUser.active = false;
    
    await newUser.save();
    
    // Send activation email
    await authService.sendActivationEmail(newUser.email, activationToken.token);
    
    logger.info(`New user registered: ${username}`);
    
    return res.status(201).json({
      message: 'User registered successfully. Please check your email to activate your account.'
    });
    
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    next(error);
  }
});

// Activate account route
router.post('/activate/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({
      activationToken: token,
      activationTokenExpiresAt: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired activation token' 
      });
    }
    
    // Activate user
    user.active = true;
    user.activationToken = undefined;
    user.activationTokenExpiresAt = undefined;
    await user.save();
    
    logger.info(`User activated: ${user.username}`);
    
    return res.status(200).json({
      message: 'Account activated successfully. You can now log in.'
    });
    
  } catch (error) {
    logger.error(`Activation error: ${error.message}`);
    next(error);
  }
});

// Request password reset route
router.post('/password-reset', async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        message: 'Email is required' 
      });
    }
    
    const user = await User.findOne({ email });
    
    // For security reasons, don't reveal if the email exists
    if (user) {
      const resetToken = authService.generateResetToken();
      user.resetPasswordToken = resetToken.token;
      user.resetPasswordTokenExpiresAt = resetToken.expiresAt;
      await user.save();
      
      // Send password reset email
      await authService.sendPasswordResetEmail(email, resetToken.token);
    }
    
    return res.status(200).json({
      message: 'If the email exists in our system, a password reset link has been sent.'
    });
    
  } catch (error) {
    logger.error(`Password reset request error: ${error.message}`);
    next(error);
  }
});

// Reset password route
router.post('/password-reset/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        message: 'New password is required' 
      });
    }
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordTokenExpiresAt: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired password reset token' 
      });
    }
    
    // Update password and clear reset token
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpiresAt = undefined;
    await user.save();
    
    logger.info(`Password reset completed for user: ${user.username}`);
    
    return res.status(200).json({
      message: 'Password has been reset successfully'
    });
    
  } catch (error) {
    logger.error(`Password reset error: ${error.message}`);
    next(error);
  }
});

// Get current user (requires authentication)
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }
    
    return res.status(200).json(user.toJSON());
    
  } catch (error) {
    logger.error(`Get current user error: ${error.message}`);
    next(error);
  }
});

// Change password (requires authentication)
router.post('/change-password', authMiddleware, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'Current password and new password are required' 
      });
    }
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }
    
    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        message: 'Current password is incorrect' 
      });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    logger.info(`Password changed for user: ${user.username}`);
    
    return res.status(200).json({
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    logger.error(`Change password error: ${error.message}`);
    next(error);
  }
});

// Logout - just a placeholder as JWT tokens are stateless
router.post('/logout', authMiddleware, (req, res) => {
  // Client should discard the token
  return res.status(200).json({
    message: 'Logged out successfully'
  });
});

module.exports = router;