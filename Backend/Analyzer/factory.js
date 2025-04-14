const waterTreatmentAnalyzer = require('./waterTreatment');
const hvacAnalyzer = require('./hvac');
const { logger } = require('../utils/logger');

/**
 * Factory for getting the appropriate analyzer based on device type
 */
class AnalyzerFactory {
  /**
   * Get an analyzer instance for a specific device type
   * @param {String} deviceType - Type of device
   * @returns {Object} Analyzer instance
   */
  getAnalyzer(deviceType) {
    switch (deviceType) {
      case 'water_treatment':
        return waterTreatmentAnalyzer;
      case 'hvac':
        return hvacAnalyzer;
      case 'manufacturing':
        // For now, use basic analyzer - can be extended later
        return this.getBasicAnalyzer();
      case 'energy':
        // For now, use basic analyzer - can be extended later
        return this.getBasicAnalyzer();
      case 'other':
        return this.getBasicAnalyzer();
      default:
        logger.warn(`No specific analyzer for device type: ${deviceType}, using basic analyzer`);
        return this.getBasicAnalyzer();
    }
  }

  /**
   * Get a basic analyzer that works with any device type
   * @returns {Object} Basic analyzer
   */
  getBasicAnalyzer() {
    return {
      analyze: async (device, data, options) => {
        // Group data by register
        const groupedData = this.groupDataByRegister(data);
        
        // Calculate basic statistics for each register
        const stats = {};
        
        for (const [registerName, values] of Object.entries(groupedData)) {
          stats[registerName] = this.calculateBasicStats(values);
        }
        
        return {
          registersAnalyzed: Object.keys(stats).length,
          dataPointsAnalyzed: data.length,
          statistics: stats
        };
      },
      
      calculatePerformanceMetrics: async (device, data, options) => {
        // Basic metrics calculation
        return {
          dataPointsCount: data.length,
          availability: this.calculateAvailability(data, options.startDate, options.endDate),
          lastDataPoint: data.length > 0 ? data[data.length - 1].timestamp : null
        };
      },
      
      detectAnomalies: async (device, data) => {
        // Simple anomaly detection based on standard deviation
        const groupedData = this.groupDataByRegister(data);
        const anomalies = {};
        
        for (const [registerName, values] of Object.entries(groupedData)) {
          const stats = this.calculateBasicStats(values);
          
          // Detect values outside of 3 standard deviations
          const anomalyThreshold = stats.mean + (3 * stats.stdDev);
          const anomalousPoints = values.filter(point => 
            Math.abs(point.value - stats.mean) > anomalyThreshold
          );
          
          if (anomalousPoints.length > 0) {
            anomalies[registerName] = anomalousPoints;
          }
        }
        
        return {
          anomaliesDetected: Object.keys(anomalies).length > 0,
          anomalies
        };
      },
      
      generateRecommendations: async (device, data) => {
        // Basic recommendations
        return {
          generalRecommendations: [
            "Regularly check device connection status",
            "Ensure PLC firmware is up to date",
            "Verify physical connections to sensors"
          ],
          specificRecommendations: []
        };
      }
    };
  }
  
  /**
   * Group data points by register name
   * @private
   */
  groupDataByRegister(data) {
    const grouped = {};
    
    for (const point of data) {
      if (!grouped[point.registerName]) {
        grouped[point.registerName] = [];
      }
      
      grouped[point.registerName].push(point);
    }
    
    return grouped;
  }
  
  /**
   * Calculate basic statistics for a set of data points
   * @private
   */
  calculateBasicStats(dataPoints) {
    if (dataPoints.length === 0) {
      return {
        count: 0,
        min: null,
        max: null,
        mean: null,
        stdDev: null
      };
    }
    
    const values = dataPoints.map(point => Number(point.value));
    
    // Filter out NaN values
    const validValues = values.filter(value => !isNaN(value));
    
    if (validValues.length === 0) {
      return {
        count: dataPoints.length,
        min: null,
        max: null,
        mean: null,
        stdDev: null
      };
    }
    
    const min = Math.min(...validValues);
    const max = Math.max(...validValues);
    const sum = validValues.reduce((a, b) => a + b, 0);
    const mean = sum / validValues.length;
    
    // Calculate standard deviation
    const squaredDiffs = validValues.map(value => Math.pow(value - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / validValues.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      count: dataPoints.length,
      validCount: validValues.length,
      min,
      max,
      range: max - min,
      mean,
      stdDev
    };
  }
  
  /**
   * Calculate data availability percentage
   * @private
   */
  calculateAvailability(data, startDate, endDate) {
    if (data.length === 0) {
      return 0;
    }
    
    // Get unique timestamps
    const timestamps = [...new Set(data.map(point => point.timestamp.getTime()))];
    
    // Calculate expected number of data points
    // Assuming data should be collected every minute
    const timeRange = endDate.getTime() - startDate.getTime();
    const expectedPoints = Math.ceil(timeRange / (60 * 1000));
    
    return Math.min((timestamps.length / expectedPoints) * 100, 100);
  }
}

module.exports = new AnalyzerFactory();