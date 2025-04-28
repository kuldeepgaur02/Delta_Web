const mongoose = require('mongoose');

const WidgetSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true
  },
  bundleAlias: {
    type: String,
    required: true
  },
  typeAlias: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String
  },
  image: {
    type: String
  },
  description: {
    type: String
  },
  config: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isSystemType: {
    type: Boolean,
    default: false
  },
  deprecated: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    enum: [
      'latest', 'time-series', 'rpc', 'alarm', 'static',
      'map', 'timeseries-table', 'device-state', 'chart'
    ],
    required: true
  },
  datasources: [{
    type: {
      type: String,
      enum: ['device', 'function', 'entity'],
      required: true
    },
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Device'
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId
    },
    entityType: {
      type: String,
      enum: ['DEVICE', 'ASSET', 'ENTITY_VIEW', 'TENANT', 'CUSTOMER', 'USER', 'DASHBOARD']
    },
    dataKeys: [{
      name: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['timeseries', 'attribute', 'function', 'alarm'],
        required: true
      },
      label: String,
      color: String,
      funcBody: String,
      settings: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
    }]
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for efficient querying
WidgetSchema.index({ tenantId: 1, bundleAlias: 1, typeAlias: 1 });

const Widget = mongoose.model('Widget', WidgetSchema);

module.exports = Widget;