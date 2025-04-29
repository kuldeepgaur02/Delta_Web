const mongoose = require('mongoose');

const DashboardSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  configuration: {
    type: Object,
    default: {
      gridSettings: {
        columns: 24,
        rowHeight: 50,
        margin: [10, 10]
      },
      backgroundColor: '#f0f2f5',
      mobileHidden: false,
      mobileOrder: []
    }
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
  isPublic: {
    type: Boolean,
    default: false
  },
  description: {
    type: String,
    trim: true
  },
  image: {
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
DashboardSchema.pre('findOneAndUpdate', function() {
  this.set({ updatedAt: Date.now() });
});

// Virtual for widgets relationship
DashboardSchema.virtual('widgets', {
  ref: 'Widget',
  localField: '_id',
  foreignField: 'dashboardId'
});

module.exports = mongoose.model('Dashboard', DashboardSchema);