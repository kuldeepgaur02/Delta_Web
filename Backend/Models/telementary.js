const mongoose = require('mongoose');

const TelemetrySchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  key: {
    type: String,
    required: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, {
  timeseries: {
    timeField: 'timestamp',
    metaField: 'deviceId',
    granularity: 'minutes'
  }
});

// Create compound index for efficient querying
TelemetrySchema.index({ deviceId: 1, key: 1, timestamp: -1 });

// Static method to batch insert telemetry
TelemetrySchema.statics.insertBatch = async function(telemetryArray) {
  if (!Array.isArray(telemetryArray) || telemetryArray.length === 0) {
    return [];
  }
  
  return await this.insertMany(telemetryArray);
};

// Static method to query latest telemetry for a device
TelemetrySchema.statics.getLatest = async function(deviceId, keys = []) {
  const query = { deviceId };
  
  if (keys.length > 0) {
    query.key = { $in: keys };
  }
  
  const pipeline = [
    { $match: query },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: '$key',
        value: { $first: '$value' },
        timestamp: { $first: '$timestamp' }
      }
    },
    {
      $project: {
        _id: 0,
        key: '$_id',
        value: 1,
        timestamp: 1
      }
    }
  ];
  
  return await this.aggregate(pipeline);
};

// Static method to get telemetry history for a device
TelemetrySchema.statics.getHistory = async function(deviceId, key, startTime, endTime, interval = 'hour', limit = 1000) {
  const query = {
    deviceId,
    key,
    timestamp: { $gte: new Date(startTime), $lte: new Date(endTime) }
  };
  
  let timeGroup;
  
  // Define time grouping based on interval
  switch(interval) {
    case 'minute':
      timeGroup = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' },
        hour: { $hour: '$timestamp' },
        minute: { $minute: '$timestamp' }
      };
      break;
    case 'hour':
      timeGroup = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' },
        hour: { $hour: '$timestamp' }
      };
      break;
    case 'day':
      timeGroup = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' }
      };
      break;
    default:
      timeGroup = {
        year: { $year: '$timestamp' },
        month: { $month: '$timestamp' },
        day: { $dayOfMonth: '$timestamp' },
        hour: { $hour: '$timestamp' }
      };
  }
  
  const pipeline = [
    { $match: query },
    {
      $group: {
        _id: timeGroup,
        avg: { $avg: { $toDouble: '$value' } },
        min: { $min: { $toDouble: '$value' } },
        max: { $max: { $toDouble: '$value' } },
        count: { $sum: 1 },
        timestamp: { $min: '$timestamp' }
      }
    },
    { $sort: { timestamp: 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        timestamp: 1,
        avg: 1,
        min: 1,
        max: 1,
        count: 1
      }
    }
  ];
  
  return await this.aggregate(pipeline);
};

module.exports = mongoose.model('Telemetry', TelemetrySchema);