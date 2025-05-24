Module.register('MMM-MTA-BusAlerts', {
  // Default module config
  defaults: {
    updateInterval: 5 * 60 * 1000, // 5 minutes (in milliseconds)
    busRoutes: [], // Array of bus routes to filter (e.g., ["M15", "M34"]). Empty means show all specific alerts.
    maxAlerts: 10, // Maximum number of alerts to display
    showRouteNumber: true, // Show the bus route number as a badge
    showTimestamp: true, // Show the alert's start time
    animationSpeed: 1000, // Speed of DOM updates (in milliseconds)
    header: 'MTA Bus Alerts', // Module header text
    hideGeneralAlerts: false, // Set to true to hide system-wide/effectively general alerts
    generalThresholdRoutes: 20, // If an alert affects more than this many routes, consider it "general"
  },

  // Required version of MagicMirror
  requiresVersion: '2.1.0',

  // Initial setup when the module starts
  start: function () {
    Log.info(`Starting module: ${this.name}`)
    this.alerts = [] // Array to store fetched alerts
    this.loaded = false // Flag to indicate if data has been loaded
    this.scheduleUpdate() // Start the update cycle
  },

  // Define CSS files to be loaded
  getStyles: function () {
    return ['mta-busalerts.css']
  },

  // Define scripts to be loaded (none needed for this module directly)
  getScripts: function () {
    return []
  },

  // Override the default header for the module
  getHeader: function () {
    return this.config.header
  },

  // Generate the DOM structure for the module
  getDom: function () {
    const wrapper = document.createElement('div')
    wrapper.className = 'mta-bus-alerts' // Main container for styling

    if (!this.loaded) {
      wrapper.innerHTML = 'Loading MTA bus alerts...'
      wrapper.className = 'dimmed light small' // Styles for loading state
      return wrapper
    }

    if (this.alerts.length === 0) {
      wrapper.innerHTML = 'No bus alerts at this time'
      wrapper.className = 'dimmed light small' // Styles for no alerts state
      return wrapper
    }

    const alertsList = document.createElement('div')
    alertsList.className = 'alerts-list'

    // Limit the number of alerts displayed based on config.maxAlerts
    const displayAlerts = this.alerts.slice(0, this.config.maxAlerts)

    displayAlerts.forEach((alert) => {
      const alertItem = document.createElement('div')
      alertItem.className = 'alert-item'

      // Route number badges (plural!)
      if (this.config.showRouteNumber) {
        const badgeContainer = document.createElement('div')
        badgeContainer.className = 'badge-container'
        if (alert.isGeneralAlert) {
          // Single badge for "System Wide" general alerts
          const routeBadge = document.createElement('span')
          routeBadge.className = 'route-badge general-alert-badge' // Apply both classes
          routeBadge.innerHTML = 'System Wide'
          badgeContainer.appendChild(routeBadge)
        }
        else if (alert.routeNumbers && alert.routeNumbers.length > 0) {
          // Create a separate badge for each affected route number
          alert.routeNumbers.forEach((routeNum) => {
            const routeBadge = document.createElement('span')
            routeBadge.className = 'route-badge' // Standard route badge class
            routeBadge.innerHTML = routeNum
            badgeContainer.appendChild(routeBadge)
          })
        }
        else {
          // Fallback for alerts with no route number and not classified as general
          const routeBadge = document.createElement('span')
          routeBadge.className = 'route-badge'
          routeBadge.innerHTML = '?'
          badgeContainer.appendChild(routeBadge)
        }
        alertItem.appendChild(badgeContainer)
      }

      // Alert content container
      const alertContent = document.createElement('div')
      alertContent.className = 'alert-content'

      // Alert Title
      const title = document.createElement('div')
      title.className = 'alert-title'
      title.innerHTML = alert.title
      alertContent.appendChild(title)

      // Alert Description (optional)
      if (alert.description) {
        const description = document.createElement('div')
        description.className = 'alert-description'
        description.innerHTML = alert.description
        alertContent.appendChild(description)
      }

      // Timestamp (optional)
      if (this.config.showTimestamp && alert.timestamp) {
        const timestamp = document.createElement('div')
        timestamp.className = 'alert-timestamp'
        timestamp.innerHTML = this.formatTimestamp(alert.timestamp)
        alertContent.appendChild(timestamp)
      }

      alertItem.appendChild(alertContent)
      alertsList.appendChild(alertItem)
    })

    wrapper.appendChild(alertsList)
    return wrapper
  },

  // Schedule the data update interval
  scheduleUpdate: function () {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
    }
    this.updateTimer = setInterval(() => {
      this.getData()
    }, this.config.updateInterval)
    this.getData() // Initial data fetch immediately
  },

  // Request data from the node_helper
  getData: function () {
    this.sendSocketNotification('GET_MTA_ALERTS', {
      busRoutes: this.config.busRoutes,
      hideGeneralAlerts: this.config.hideGeneralAlerts,
      generalThresholdRoutes: this.config.generalThresholdRoutes,
    })
  },

  // Handle notifications received from the node_helper
  socketNotificationReceived: function (notification, payload) {
    if (notification === 'MTA_ALERTS_DATA') {
      Log.info(`[${this.name}] Received ${payload.length} alerts from helper.`)
      this.alerts = payload
      this.loaded = true
      this.updateDom(this.config.animationSpeed) // Update the display
    }
    else if (notification === 'MTA_ALERTS_ERROR') {
      Log.error(`[${this.name}] Error fetching MTA alerts:`, payload)
      this.alerts = [] // Clear alerts on error
      this.loaded = true // Still mark as loaded to show error/no data
      this.updateDom(this.config.animationSpeed) // Update display to show no data
    }
  },

  // Format UNIX timestamp to a human-readable date and time string
  formatTimestamp: function (timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp * 1000) // Convert seconds to milliseconds
    // Use toLocaleString for both date and time with more readable options
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short', // 'short' for "May", 'long' for "May", 'numeric' for "5"
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    })
  },
})
