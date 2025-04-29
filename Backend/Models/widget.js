const mongoose = require('mongoose');

const WidgetSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'line_chart', 'bar_chart', 'pie_chart', 'gauge', 'card', 
      'value_display', 'table', 'map', 'device_status', 
      'alarm_table', 'rpc_control', 'html', 'custom'
    ]
  },
  dashboardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dashboard',
    required: true
  },
  config: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  layout: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    w: { type: Number, default: 6 },
    h: { type: Number, default: 4 },
    static: { type: Boolean, default: false }
  },
  dataSources: [{
    type: { 
      type: String, 
      enum: ['device', 'function', 'static'],
      required: true 
    },
    deviceId: { type: String },
    keys: { type: [String] },
    dataKeys: { type: [String] },
    funcBody: { type: String },
    staticData: { type: mongoose.Schema.Types.Mixed }
  }],
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on document update
WidgetSchema.pre('findOneAndUpdate', function() {
  this.set({ updatedAt: Date.now() });
});

module.exports = mongoose.model('Widget', WidgetSchema);