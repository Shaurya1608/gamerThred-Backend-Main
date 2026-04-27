import geoip from "geoip-lite";

/**
 * Calculates distance between two coordinates in km (Haversine formula)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

/**
 * Checks for login anomalies based on history
 * @param {Object} user - User document with loginHistory
 * @param {String} currentIp - Current IP address
 * @param {String} userAgent - Current User Agent
 * @returns {Object} { isSuspicious, reason, locationData }
 */
export const checkLoginAnomaly = (user, currentIp, userAgent) => {
  // 1. Resolve Location
  const geo = geoip.lookup(currentIp);
  
  const locationData = {
    ip: currentIp,
    city: geo?.city || "Unknown",
    country: geo?.country || "Unknown",
    coordinates: geo?.ll || null, // [lat, long]
    timestamp: new Date()
  };

  // If no history, it's a new device/location but not necessarily an anomaly
  if (!user.loginHistory || user.loginHistory.length === 0) {
    return { isSuspicious: false, reason: "First Login", locationData };
  }

  // Get last login
  const lastLogin = user.loginHistory[user.loginHistory.length - 1];
  
  // 2. Check for Country Change
  if (lastLogin.country !== "Unknown" && locationData.country !== "Unknown" && lastLogin.country !== locationData.country) {
     // Continue to check time difference to see if it's impossible
  }

  // 3. Impossible Travel Check
  if (lastLogin.location?.coordinates && locationData.coordinates) {
    const [lastLat, lastLon] = [lastLogin.location.coordinates[1], lastLogin.location.coordinates[0]]; // stored as [lon, lat] in mongo usually, but geoip returns [lat, lon]
    // Wait, geoip-lite returns [lat, lon]. Mongo GeoJSON expects [lon, lat].
    // Let's standardize: code above says `coordinates: geo?.ll`. geo.ll is [lat, lon].
    
    // User model: `coordinates: [Number] // [longitude, latitude]`
    // So we need to flip them when saving to DB.
    
    // For calculation here:
    const dist = calculateDistance(lastLat, lastLon, locationData.coordinates[0], locationData.coordinates[1]);
    
    const timeDiffHours = (new Date() - new Date(lastLogin.timestamp)) / (1000 * 60 * 60);
    
    if (timeDiffHours > 0) {
        const speed = dist / timeDiffHours;
        
        // If speed > 1000 km/h (approx plane speed) and distance > 500km
        if (speed > 1000 && dist > 500) {
            return {
                isSuspicious: true,
                reason: `Impossible Travel: ${Math.round(dist)}km in ${timeDiffHours.toFixed(2)}h (${Math.round(speed)} km/h)`,
                locationData
            };
        }
    }
  }

  return { isSuspicious: false, reason: null, locationData };
};
