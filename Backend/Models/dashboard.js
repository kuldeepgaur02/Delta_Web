const mongoose = require('mongoose');

const DashboardSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
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
  configuration: {
    description: {
      type: String,
      trim: true
    },
    settings: {
      stateControllerId: {
        type: String,
        default: 'entity'
      },
      showTitle: {
        type: Boolean,
        default: true
      },
      showDashboardsSelect: {
        type: Boolean,
        default: true
      },
      showEntitiesSelect: {
        type: Boolean,
        default: true
      },
      showFilters: {
        type: Boolean,
        default: true
      },
      showDashboardTimewindow: {
        type: Boolean,
        default: true
      },
      showDashboardExport: {
        type: Boolean,
        default: true
      },
      toolbarAlwaysOpen: {
        type: Boolean,
        default: false
      },
      gridSettings: {
        backgroundColor: {
          type: String,
          default: '#f0f0f0'
        },
        color: {
          type: String,
          default: 'rgba(0,0,0,0.870588)'
        },
        columns: {
          type: Number,
          default: 24
        },
        margin: {
          type: Number,
          default: 10
        },
        backgroundSizeMode: {
          type: String,
          default: '100%'
        },
        gridType: {
          type: String,
          enum: ['fixed', 'fit'],
          default: 'fit'
        },
        autoFillHeight: {
          type: Boolean,
          default: true
        }
      },
      widgets: {},
      states: {
        default: {}
      }
    },
    timewindow: {
      displayValue: {
        type: String,
        default: ''
      },
      selectedTab: {
        type: Number,
        default: 0
      },
      realtime: {
        type: Object,
        default: {
          interval: 1000,
          timewindowMs: 60000
        }
      },
      history: {
        type: Object,
        default: {
          historyType: 0,
          interval: 1000,
          timewindowMs: 60000,
          fixedTimewindow: {
            startTimeMs: 0,
            endTimeMs: 0
          }
        }
      },
      aggregation: {
        type: Object,
        default: {
          type: 'AVG',
          limit: 25000
        }
      }
    }
  },
  layouts: {
    main: {
      type: [{
        widgetId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Widget'
        },
        x: Number,
        y: Number,
        width: Number,
        height: Number,
        mobileHeight: Number,
        mobileOrder: Number
      }],
      default: []
    },
    right: {
      type: [{
        widgetId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Widget'
        },
        x: Number,
        y: Number,
        width: Number,
        height: Number,
        mobileHeight: Number,
        mobileOrder: Number
      }],
      default: []
    }
  },
  widgets: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Widget'
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  publicLink: {
    type: String
  },
  image: {
    type: String
  },
  assignedToEdge: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for efficient querying
DashboardSchema.index({ tenantId: 1, title: 1 });
DashboardSchema.index({ customerId: 1 });

// Generate public link for public dashboards
DashboardSchema.pre('save', function(next) {
  if (this.isPublic && !this.publicLink) {
    this.publicLink = `${this._id}-${Math.random().toString(36).substring(2, 10)}`;
  }
  next();
});

const Dashboard = mongoose.model('Dashboard', DashboardSchema);

module.exports = Dashboard;