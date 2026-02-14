/**
 * Geospatial Utility Functions
 *
 * Provides validation and transformation utilities for GeoJSON coordinates
 * and MongoDB geospatial operations.
 */

/**
 * Validate if coordinates are within valid ranges
 *
 * @param {number} lng - Longitude (-180 to 180)
 * @param {number} lat - Latitude (-90 to 90)
 * @returns {boolean} True if coordinates are valid
 */
function isValidCoordinates(lng, lat) {
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    !isNaN(lng) &&
    !isNaN(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * Validate if a coordinate array is valid [longitude, latitude]
 *
 * @param {Array} coords - Coordinate array [lng, lat]
 * @returns {boolean} True if coordinate array is valid
 */
function isValidCoordinateArray(coords) {
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    isValidCoordinates(coords[0], coords[1])
  );
}

/**
 * Create a GeoJSON Point from coordinates
 *
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @returns {Object|null} GeoJSON Point object or null if invalid
 */
function createGeoJSONPoint(lng, lat) {
  if (!isValidCoordinates(lng, lat)) {
    return null;
  }

  return {
    type: "Point",
    coordinates: [lng, lat],
  };
}

/**
 * Extract coordinates from various location formats
 * Supports: GeoJSON Point, array [lng, lat], object {lng, lat}
 *
 * @param {Object|Array} location - Location data in various formats
 * @returns {Array|null} Coordinate array [lng, lat] or null if invalid
 */
function extractCoordinates(location) {
  if (!location) return null;

  // GeoJSON Point
  if (location.type === "Point" && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates;
    if (isValidCoordinates(lng, lat)) {
      return [lng, lat];
    }
  }

  // Nested geometry.coordinates (MongoDB storage format)
  if (location.geometry && location.geometry.coordinates) {
    const [lng, lat] = location.geometry.coordinates;
    if (isValidCoordinates(lng, lat)) {
      return [lng, lat];
    }
  }

  // Array format [lng, lat]
  if (Array.isArray(location) && location.length === 2) {
    const [lng, lat] = location;
    if (isValidCoordinates(lng, lat)) {
      return [lng, lat];
    }
  }

  // Array at location.coordinates
  if (
    Array.isArray(location.coordinates) &&
    location.coordinates.length === 2
  ) {
    const [lng, lat] = location.coordinates;
    if (isValidCoordinates(lng, lat)) {
      return [lng, lat];
    }
  }

  // Object format {lng, lat}
  if (typeof location.lng === "number" && typeof location.lat === "number") {
    const { lng, lat } = location;
    if (isValidCoordinates(lng, lat)) {
      return [lng, lat];
    }
  }

  // Legacy format {coordinates: {lng, lat}}
  if (location.coordinates && typeof location.coordinates === "object") {
    const { lng, lat } = location.coordinates;
    if (isValidCoordinates(lng, lat)) {
      return [lng, lat];
    }
  }

  return null;
}

/**
 * Normalize location data to include proper GeoJSON geometry
 * Preserves city and neighborhood fields
 *
 * @param {Object} location - Location object with city, neighborhood, and coordinates
 * @returns {Object} Normalized location with GeoJSON geometry
 */
function normalizeLocation(location) {
  if (!location || typeof location !== "object") {
    return null;
  }

  const normalized = {
    city: location.city || "",
    neighborhood: location.neighborhood || "",
  };

  const coords = extractCoordinates(location);
  if (coords) {
    normalized.geometry = {
      type: "Point",
      coordinates: coords,
    };
  }

  return normalized;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 *
 * @param {number} lng1 - First point longitude
 * @param {number} lat1 - First point latitude
 * @param {number} lng2 - Second point longitude
 * @param {number} lat2 - Second point latitude
 * @returns {number} Distance in meters
 */
function calculateDistance(lng1, lat1, lng2, lat2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Create a MongoDB $geoWithin polygon query from bounding box
 *
 * @param {number} north - Northern latitude bound
 * @param {number} south - Southern latitude bound
 * @param {number} east - Eastern longitude bound
 * @param {number} west - Western longitude bound
 * @returns {Object|null} MongoDB query object or null if invalid
 */
function createBoundsQuery(north, south, east, west) {
  if (
    !isValidCoordinates(west, south) ||
    !isValidCoordinates(east, north) ||
    north <= south ||
    east <= west
  ) {
    return null;
  }

  return {
    $geoWithin: {
      $geometry: {
        type: "Polygon",
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      },
    },
  };
}

module.exports = {
  isValidCoordinates,
  isValidCoordinateArray,
  createGeoJSONPoint,
  extractCoordinates,
  normalizeLocation,
  calculateDistance,
  createBoundsQuery,
};
