const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const config = require('../config/default');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['admin', 'tenant_admin', 'customer_user'],
    default: 'customer_user'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: function() {
      return this.role !== 'admin';
    }
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: function() {
      return this.role === 'customer_user';
    }
  },
  phone: {
    type: String,
    trim: true
  },
  avatar: {
    type: String
  },
  settings: {
    type: Object,
    default: {}
  },
  active: {
    type: Boolean,
    default: true
  },
  lastLoginTime: {
    type: Date
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  activationToken: {
    type: String
  },
  activationTokenExpiresAt: {
    type: Date
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordTokenExpiresAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, config.passwordSaltRounds);
  }
  next();
});

// Method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to return user object without sensitive information
UserSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.activationToken;
  delete user.activationTokenExpiresAt;
  delete user.resetPasswordToken;
  delete user.resetPasswordTokenExpiresAt;
  delete user.failedLoginAttempts;
  return user;
};

const User = mongoose.model('User', UserSchema);

module.exports = User;