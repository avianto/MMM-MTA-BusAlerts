// node_helper.js

// Ensure these are installed: npm install gtfs-realtime-bindings node-fetch
const NodeHelper = require("node_helper");
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
    },

    // Called when the frontend module sends a notification
    socketNotificationReceived: function(notification, payload) {
        if (notification === "GET_MTA_ALERTS") {
            this.getMTAAlerts(
                payload.busRoutes,
                payload.hideGeneralAlerts,
                payload.generalThresholdRoutes
            );
        }
    },

    // Fetches MTA bus alerts from the GTFS-Realtime feed
    async getMTAAlerts(busRoutes, hideGeneralAlerts, generalThresholdRoutes) {
        const url = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fbus-alerts";

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);
            const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);

            // Parse and filter alerts
            const alerts = this.parseAlerts(feed, busRoutes, hideGeneralAlerts, generalThresholdRoutes);
            this.sendSocketNotification("MTA_ALERTS_DATA", alerts);

        } catch (error) {
            console.error(`[${this.name}] Error fetching MTA alerts:`, error.message);
            this.sendSocketNotification("MTA_ALERTS_ERROR", error.message);
        }
    },

    // Parses the GTFS-Realtime feed and filters alerts based on configuration
    parseAlerts: function(feed, busRoutes, hideGeneralAlerts, generalThresholdRoutes) {
        const alerts = [];

        if (!feed.entity) {
            return alerts; // No entities in the feed
        }

        console.log(`[${this.name}] Filtering: Routes: ${JSON.stringify(busRoutes)}, Hide General: ${hideGeneralAlerts}, General Threshold: ${generalThresholdRoutes}`);

        feed.entity.forEach(entity => {
            if (!entity.alert) return; // Skip if no alert data in this entity

            const alert = entity.alert;
            const alertData = {
                id: entity.id,
                title: this.getTranslatedText(alert.headerText),
                description: this.getTranslatedText(alert.descriptionText),
                url: this.getTranslatedText(alert.url),
                routeNumbers: [], // Stores all affected route IDs
                timestamp: null,  // Alert start timestamp
                isGeneralAlert: false // Determined below
            };

            // Flag to track if ANY specific routeId was found in informedEntity
            let foundSpecificRouteInInformedEntity = false;

            // Extract route information from informedEntity
            if (alert.informedEntity && alert.informedEntity.length > 0) {
                alert.informedEntity.forEach(informedEntity => {
                    if (informedEntity.routeId) {
                        let routeId = informedEntity.routeId;
                        // Clean up route ID (remove agency prefix if present, e.g., "MTA NYCT_B1" -> "B1")
                        if (routeId.includes('_')) {
                            routeId = routeId.split('_').pop();
                        }
                        alertData.routeNumbers.push(routeId);
                        foundSpecificRouteInInformedEntity = true; // Mark that a routeId was found
                    }
                });
            }

            // Remove duplicates from routeNumbers array
            alertData.routeNumbers = [...new Set(alertData.routeNumbers)];

            // --- Determine if the alert is considered "effectively general" ---

            // Method 1: Standard GTFS-Realtime approach (no routeId found)
            if (!foundSpecificRouteInInformedEntity || alertData.routeNumbers.length === 0) {
                alertData.isGeneralAlert = true;
            }
            // Method 2: Heuristic for broad alerts (many affected routes)
            // This applies *only* if the alert wasn't already identified as general by Method 1.
            else if (alertData.routeNumbers.length >= generalThresholdRoutes) {
                alertData.isGeneralAlert = true;
                console.log(`[${this.name}] Alert ${entity.id} marked as general due to exceeding threshold (${alertData.routeNumbers.length} routes).`);
            }

            // Get timestamp from the first active period (start time)
            if (alert.activePeriod && alert.activePeriod.length > 0) {
                const activePeriod = alert.activePeriod[0];
                if (activePeriod.start) {
                    alertData.timestamp = activePeriod.start.toNumber(); // Unix timestamp in seconds
                }
            }

            console.log(`[${this.name}] Alert ${entity.id} affects routes: ${JSON.stringify(alertData.routeNumbers)}, IsGeneral: ${alertData.isGeneralAlert}`);

            // --- Apply Filtering Logic ---

            // 1. Hide effectively general alerts if configured to do so
            if (hideGeneralAlerts && alertData.isGeneralAlert) {
                console.log(`[${this.name}] Skipping general alert ${entity.id} (hideGeneralAlerts = true).`);
                return; // Skip this alert
            }

            // 2. Filter by specific bus routes (if busRoutes config is not empty)
            // This filtering applies *only* to alerts that are NOT effectively general (or if general alerts are being shown)
            if (busRoutes && busRoutes.length > 0) {
                if (!alertData.isGeneralAlert) { // Only filter specific alerts by configured routes
                    const hasMatchingRoute = alertData.routeNumbers.some(alertRoute => {
                        return busRoutes.some(filterRoute => {
                            // *** IMPORTANT CHANGE: Exact match for route numbers ***
                            return alertRoute.toLowerCase() === filterRoute.toLowerCase();
                        });
                    });

                    if (!hasMatchingRoute) {
                        console.log(`[${this.name}] Alert ${entity.id} filtered out (no matching specific bus routes).`);
                        return; // Skip this alert
                    }
                }
            }

            // In this simplified structure, we're not using alertData.routeNumber for display
            // Instead, the frontend directly uses alertData.routeNumbers and joins them.
            // So, no need to set alertData.routeNumber here.

            alerts.push(alertData); // Add the alert to the list
        });

        // Sort alerts by timestamp (newest first)
        alerts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        console.log(`[${this.name}] Returning ${alerts.length} alerts after processing.`);
        return alerts;
    },

    // Helper to extract translated text from GTFS-Realtime TranslatedString
    getTranslatedText: function(translatedText) {
        if (!translatedText || !translatedText.translation) {
            return null;
        }

        // Prioritize English translation
        const englishTranslation = translatedText.translation.find(t =>
            t.language === 'en' || t.language === 'en-US'
        );

        if (englishTranslation) {
            return englishTranslation.text;
        }

        // Fallback to the first available translation if English is not found
        if (translatedText.translation.length > 0) {
            return translatedText.translation[0].text;
        }

        return null;
    }
});