const mongoose = require('mongoose');
const crypto = require('crypto');

const DeviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
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
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  accessToken: {
    type: String,
    unique: true,
    required: true
  },
  deviceProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeviceProfile'
  },
  additionalInfo: {
    type: Object,
    default: {}
  },
  firmware: {
    version: {
      type: String,
      default: '1.0.0'
    },
    lastUpdateTime: {
      type: Date
    },
    updateStatus: {
      type: String,
      enum: ['up_to_date', 'update_available', 'updating', 'update_failed'],
      default: 'up_to_date'
    }
  },
  status: {
    active: {
      type: Boolean,
      default: true
    },
    lastActivityTime: {
      type: Date
    },
    lastConnectedTime: {
      type: Date
    },
    lastDisconnectedTime: {
      type: Date
    },
    online: {
      type: Boolean,
      default: false
    }
  },
  attributes: {
    server: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map()
    },
    client: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map()
    },
    shared: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: new Map()
    }
  },
  transportConfiguration: {
    type: {
      type: String,
      enum: ['mqtt', 'http', 'coap'],
      default: 'mqtt'
    },
    mqttConfig: {
      topicFormat: {
        type: String,
        default: 'v1/devices/{deviceId}/{msgType}'
      }
    },
    httpConfig: {
      endpoint: String
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for efficient querying
DeviceSchema.index({ tenantId: 1, name: 1 }, { unique: true });
DeviceSchema.index({ accessToken: 1 }, { unique: true });

// Generate a unique access token before saving if not provided
DeviceSchema.pre('save', function(next) {
  if (!this.accessToken) {
    this.accessToken = crypto.randomBytes(20).toString('hex');
  }
  next();
});

// Set lastActivityTime whenever device data is updated
DeviceSchema.pre('save', function(next) {
  this.status.lastActivityTime = new Date();
  next();
});

// Virtual for full device info
DeviceSchema.virtual('fullInfo').get(function() {
  return {
    id: this._id,
    name: this.name,
    type: this.type,
    label: this.label,
    tenantId: this.tenantId,
    customerId: this.customerId,
    status: this.status,
    firmware: this.firmware,
    attributes: {
      server: Object.fromEntries(this.attributes.server),
      client: Object.fromEntries(this.attributes.client),
      shared: Object.fromEntries(this.attributes.shared)
    },
    transportConfiguration: this.transportConfiguration,
    additionalInfo: this.additionalInfo,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
});

// Method to update device status to online
DeviceSchema.methods.connect = function() {
  this.status.online = true;
  this.status.lastConnectedTime = new Date();
  return this.save();
};

// Method to update device status to offline
DeviceSchema.methods.disconnect = function() {
  this.status.online = false;
  this.status.lastDisconnectedTime = new Date();
  return this.save();
};

// Method to update device attributes
DeviceSchema.methods.updateAttributes = function(scope, attributes) {
  if (!this.attributes[scope]) {
    throw new Error(`Invalid attribute scope: ${scope}`);
  }
  
  for (const [key, value] of Object.entries(attributes)) {
    this.attributes[scope].set(key, value);
  }
  
  return this.save();
};

const Device = mongoose.model('Device', DeviceSchema);

module.exports = Device;