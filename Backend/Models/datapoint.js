const mongoose = require('mongoose');

const DataPointSchema = new mongoose.Schema({
  device: {
    type: mongoose.Schema.ObjectId,
    ref: 'Device',
    required: true
  },
  registerName: {
    type: String,
    required: true
  },
  registerAddress: {
    type: Number,
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  rawValue: {
    type: Number
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Create compound index for efficient querying
DataPointSchema.index({ device: 1, timestamp: -1 });
DataPointSchema.index({ device: 1, registerName: 1, timestamp: -1 });

// Add a TTL index to automatically delete old data points (e.g., after 30 days)
// This can be adjusted based on your data retention policies
DataPointSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('DataPoint', DataPointSchema);