const mongoose = require('mongoose');

const DeviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a device name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  ipAddress: {
    type: String,
    required: [true, 'Please add an IP address'],
    match: [/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Please add a valid IP address']
  },
  port: {
    type: Number,
    required: [true, 'Please add a port number'],
    default: 502, // Default Modbus TCP port
    min: [1, 'Port must be at least 1'],
    max: [65535, 'Port must be at most 65535']
  },
  type: {
    type: String,
    enum: ['water_treatment', 'hvac', 'manufacturing', 'energy', 'other'],
    required: [true, 'Please specify the PLC application type']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  location: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'error', 'maintenance'],
    default: 'offline'
  },
  lastConnected: {
    type: Date
  },
  modbusConfig: {
    unitId: {
      type: Number,
      default: 1
    },
    timeout: {
      type: Number,
      default: 5000 // ms
    },
    registers: [{
      name: {
        type: String,
        required: true
      },
      address: {
        type: Number,
        required: true
      },
      type: {
        type: String,
        enum: ['holdingRegister', 'inputRegister', 'coil', 'discreteInput'],
        default: 'holdingRegister'
      },
      dataType: {
        type: String,
        enum: ['int16', 'uint16', 'int32', 'uint32', 'float', 'boolean'],
        default: 'int16'
      },
      scaling: {
        type: Number,
        default: 1
      },
      description: String
    }]
  },
  owner: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
DeviceSchema.index({ owner: 1, ipAddress: 1 });

module.exports = mongoose.model('Device', DeviceSchema);