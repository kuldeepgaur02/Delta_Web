const mongoose = require('mongoose');

const TelemetrySchema = new mongoose.Schema({
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityType: {
    type: String,
    enum: ['DEVICE', 'ASSET', 'ENTITY_VIEW', 'TENANT', 'CUSTOMER', 'USER', 'DASHBOARD'],
    required: true
  },
  key: {
    type: String,
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  ts: {
    type: Number,
    required: true,
    default: () => Date.now()
  }
}, {
  timestamps: true
});

// Compound index for efficient time-series queries
TelemetrySchema.index({ entityId: 1, entityType: 1, key: 1, ts: -1 });

// Expire data after the configured retention period
// Note: TTL index runs as a background task approximately once per minute
TelemetrySchema.index({ createdAt: 1 }, { 
  expireAfterSeconds: 60 * 60 * 24 * 30 // 30 days by default 
});

// Static method to save batch telemetry
TelemetrySchema.statics.saveBatch = async function(entityId, entityType, telemetry) {
  const batch = [];
  for (const key in telemetry) {
    if (Object.prototype.hasOwnProperty.call(telemetry, key)) {
      const values = Array.isArray(telemetry[key]) ? telemetry[key] : [telemetry[key]];
      for (const item of values) {
        let ts = Date.now();
        let value = item;
        
        if (typeof item === 'object' && item !== null) {
          if (item.ts) {
            ts = item.ts;
          }
          if (item.value !== undefined) {
            value = item.value;
          }
        }
        
        batch.push({
          entityId,
          entityType,
          key,
          value,
          ts
        });
      }
    }
  }
  
  return this.insertMany(batch);
};

// Static method to get latest telemetry
TelemetrySchema.statics.getLatest = async function(entityId, entityType, keys) {
  const result = {};
  const keyArray = Array.isArray(keys) ? keys : [keys];
  
  const latestValues = await this.aggregate([
    {
      $match: {
        entityId: mongoose.Types.ObjectId(entityId),
        entityType,
        key: { $in: keyArray }
      }
    },
    {
      $sort: { ts: -1 }
    },
    {
      $group: {
        _id: "$key",
        value: { $first: "$value" },
        ts: { $first: "$ts" }
      }
    }
  ]);
  
  latestValues.forEach(item => {
    result[item._id] = [{ ts: item.ts, value: item.value }];
  });
  
  return result;
};
// Static method to get time series data
TelemetrySchema.statics.getTimeseries = async function(entityId, entityType, keys, startTs, endTs, limit, agg) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const query = {
      entityId: mongoose.Types.ObjectId(entityId),
      entityType,
      key: { $in: keyArray }
    };
    
    if (startTs || endTs) {
      query.ts = {};
      if (startTs) {
        query.ts.$gte = startTs;
      }
      if (endTs) {
        query.ts.$lte = endTs;
      }
    }
    
    // If aggregation is requested
    if (agg && agg !== 'NONE') {
      const interval = Math.floor((endTs - startTs) / limit);
      if (interval > 0) {
        const aggregationPipeline = [
          { $match: query },
          { $sort: { ts: 1 } },
          { 
            $group: {
              _id: {
                key: "$key",
                interval: { 
                  $floor: { 
                    $divide: [
                      { $subtract: ["$ts", startTs] }, 
                      interval
                    ] 
                  }
                }
              },
              ts: { $first: "$ts" },
              // Apply the requested aggregation function
              value: getAggregationOperator(agg)
            }
          },
          { $sort: { "_id.interval": 1 } },
          { $limit: limit }
        ];
        
        const result = {};
        const aggregatedData = await this.aggregate(aggregationPipeline);
        
        aggregatedData.forEach(item => {
          if (!result[item._id.key]) {
            result[item._id.key] = [];
          }
          result[item._id.key].push({
            ts: item.ts,
            value: item.value
          });
        });
        
        return result;
      }
    }
    
    // No aggregation, retrieve raw data with limit
    const result = {};
    for (const key of keyArray) {
      const data = await this.find({
        ...query,
        key
      }).sort({ ts: -1 }).limit(limit);
      
      result[key] = data.map(item => ({
        ts: item.ts,
        value: item.value
      }));
    }
    
    return result;
  };
  
  // Helper function to get the aggregation operator based on the aggregation type
  function getAggregationOperator(aggType) {
    switch (aggType) {
      case 'AVG':
        return { $avg: "$value" };
      case 'SUM':
        return { $sum: "$value" };
      case 'MIN':
        return { $min: "$value" };
      case 'MAX':
        return { $max: "$value" };
      case 'COUNT':
        return { $sum: 1 };
      case 'NONE':
      default:
        return { $first: "$value" };
    }
  }
  
  // Static method to delete telemetry
  TelemetrySchema.statics.deleteTelemetry = async function(entityId, entityType, keys, startTs, endTs) {
    const query = {
      entityId: mongoose.Types.ObjectId(entityId),
      entityType
    };
    
    if (keys && keys.length > 0) {
      query.key = { $in: Array.isArray(keys) ? keys : [keys] };
    }
    
    if (startTs || endTs) {
      query.ts = {};
      if (startTs) {
        query.ts.$gte = startTs;
      }
      if (endTs) {
        query.ts.$lte = endTs;
      }
    }
    
    return this.deleteMany(query);
  };
  
  // Static method to count telemetry entries
  TelemetrySchema.statics.countTelemetry = async function(entityId, entityType, keys, startTs, endTs) {
    const query = {
      entityId: mongoose.Types.ObjectId(entityId),
      entityType
    };
    
    if (keys && keys.length > 0) {
      query.key = { $in: Array.isArray(keys) ? keys : [keys] };
    }
    
    if (startTs || endTs) {
      query.ts = {};
      if (startTs) {
        query.ts.$gte = startTs;
      }
      if (endTs) {
        query.ts.$lte = endTs;
      }
    }
    
    return this.countDocuments(query);
  };
  
  const Telemetry = mongoose.model('Telemetry', TelemetrySchema);
  
  module.exports = Telemetry;