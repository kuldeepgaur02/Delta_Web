const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const DeviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  deviceId: {
    type: String,
    required: true,
    unique: true,
    default: () => uuidv4()
  },
  type: {
    type: String,
    required: true,
    trim: true
  },
  label: {
    type: String,
    trim: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null
  },
  credentials: {
    accessToken: {
      type: String,
      default: () => uuidv4()
    },
    refreshToken: {
      type: String,
      default: () => uuidv4()
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
    }
  },
  attributes: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  lastActivity: {
    type: Date
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'inactive'
  },
  firmwareVersion: {
    type: String
  },
  softwareVersion: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Update timestamp on document update
DeviceSchema.pre('findOneAndUpdate', function() {
  this.set({ updatedAt: Date.now() });
});

// Method to generate new access token
DeviceSchema.methods.generateAccessToken = function() {
  this.credentials.accessToken = uuidv4();
  return this.credentials.accessToken;
};

// Method to update device status
DeviceSchema.methods.updateStatus = function(status) {
  this.status = status;
  this.lastActivity = Date.now();
  return this.save();
};

// Method to update device attributes
DeviceSchema.methods.updateAttributes = function(attributes) {
  for (const [key, value] of Object.entries(attributes)) {
    this.attributes.set(key, value);
  }
  return this.save();
};

module.exports = mongoose.model('Device', DeviceSchema);