const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  type: {
    type: String,
    required: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Create compound index for efficient queries
telemetrySchema.index({ deviceId: 1, type: 1, timestamp: -1 });

// Helper method to get latest telemetry for a device
telemetrySchema.statics.getLatestByDevice = async function(deviceId, types) {
  const query = { deviceId };
  
  if (types && types.length > 0) {
    query.type = { $in: types };
  }
  
  const aggregation = [
    { $match: query },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: { deviceId: '$deviceId', type: '$type' },
        latestTimestamp: { $first: '$timestamp' },
        latestValue: { $first: '$value' },
        metadata: { $first: '$metadata' }
      }
    },
    {
      $project: {
        _id: 0,
        type: '$_id.type',
        timestamp: '$latestTimestamp',
        value: '$latestValue',
        metadata: 1
      }
    }
  ];
  
  return this.aggregate(aggregation);
};

// Method to retrieve historical data with pagination
telemetrySchema.statics.getHistorical = async function(deviceId, type, startTime, endTime, limit = 100, offset = 0) {
  const query = { 
    deviceId,
    type
  };
  
  if (startTime || endTime) {
    query.timestamp = {};
    if (startTime) query.timestamp.$gte = new Date(startTime);
    if (endTime) query.timestamp.$lte = new Date(endTime);
  }
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .skip(offset)
    .limit(limit);
};

// Method to get statistics for a time period
telemetrySchema.statics.getStats = async function(deviceId, type, startTime, endTime) {
  const query = { 
    deviceId,
    type
  };
  
  if (startTime || endTime) {
    query.timestamp = {};
    if (startTime) query.timestamp.$gte = new Date(startTime);
    if (endTime) query.timestamp.$lte = new Date(endTime);
  }
  
  return this.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        avg: { $avg: { $toDouble: '$value' } },
        min: { $min: { $toDouble: '$value' } },
        max: { $max: { $toDouble: '$value' } },
        sum: { $sum: { $toDouble: '$value' } },
        firstTimestamp: { $min: '$timestamp' },
        lastTimestamp: { $max: '$timestamp' }
      }
    }
  ]);
};

module.exports = mongoose.model('Telemetry', telemetrySchema);