/**
 * Earth Echo — Global Location Reference & Geocoding Service
 *
 * Provides comprehensive offline location identification for the 3D Earth,
 * enabling immediate, scientifically grounded geographic resolution without
 * relying on external network dependencies.
 */

export const WORLD_LOCATIONS = [
  // ── Asia ──
  { name: 'Mumbai', country: 'India', region: 'South Asia', lat: 19.0760, lon: 72.8777 },
  { name: 'New Delhi', country: 'India', region: 'South Asia', lat: 28.6139, lon: 77.2090 },
  { name: 'Bengaluru', country: 'India', region: 'South Asia', lat: 12.9716, lon: 77.5946 },
  { name: 'Kolkata', country: 'India', region: 'South Asia', lat: 22.5726, lon: 88.3639 },
  { name: 'Tokyo', country: 'Japan', region: 'East Asia', lat: 35.6762, lon: 139.6503 },
  { name: 'Osaka', country: 'Japan', region: 'East Asia', lat: 34.6937, lon: 135.5023 },
  { name: 'Beijing', country: 'China', region: 'East Asia', lat: 39.9042, lon: 116.4074 },
  { name: 'Shanghai', country: 'China', region: 'East Asia', lat: 31.2304, lon: 121.4737 },
  { name: 'Guangzhou', country: 'China', region: 'East Asia', lat: 23.1291, lon: 113.2644 },
  { name: 'Hong Kong', country: 'China', region: 'East Asia', lat: 22.3193, lon: 114.1694 },
  { name: 'Seoul', country: 'South Korea', region: 'East Asia', lat: 37.5665, lon: 126.9780 },
  { name: 'Singapore', country: 'Singapore', region: 'Southeast Asia', lat: 1.3521, lon: 103.8198 },
  { name: 'Bangkok', country: 'Thailand', region: 'Southeast Asia', lat: 13.7563, lon: 100.5018 },
  { name: 'Jakarta', country: 'Indonesia', region: 'Southeast Asia', lat: -6.2088, lon: 106.8456 },
  { name: 'Manila', country: 'Philippines', region: 'Southeast Asia', lat: 14.5995, lon: 120.9842 },
  { name: 'Kuala Lumpur', country: 'Malaysia', region: 'Southeast Asia', lat: 3.1390, lon: 101.6869 },
  { name: 'Hanoi', country: 'Vietnam', region: 'Southeast Asia', lat: 21.0285, lon: 105.8542 },
  { name: 'Dhaka', country: 'Bangladesh', region: 'South Asia', lat: 23.8103, lon: 90.4125 },
  { name: 'Karachi', country: 'Pakistan', region: 'South Asia', lat: 24.8607, lon: 67.0011 },
  { name: 'Dubai', country: 'United Arab Emirates', region: 'Middle East', lat: 25.2048, lon: 55.2708 },
  { name: 'Riyadh', country: 'Saudi Arabia', region: 'Middle East', lat: 24.7136, lon: 46.6753 },
  { name: 'Tehran', country: 'Iran', region: 'Middle East', lat: 35.6892, lon: 51.3890 },
  { name: 'Istanbul', country: 'Turkey', region: 'Eurasia', lat: 41.0082, lon: 28.9784 },
  { name: 'Tel Aviv', country: 'Israel', region: 'Middle East', lat: 32.0853, lon: 34.7818 },
  { name: 'Baghdad', country: 'Iraq', region: 'Middle East', lat: 33.3152, lon: 44.3661 },
  { name: 'Almaty', country: 'Kazakhstan', region: 'Central Asia', lat: 43.2220, lon: 76.8512 },
  { name: 'Tashkent', country: 'Uzbekistan', region: 'Central Asia', lat: 41.2995, lon: 69.2401 },

  // ── Europe ──
  { name: 'London', country: 'United Kingdom', region: 'Western Europe', lat: 51.5074, lon: -0.1278 },
  { name: 'Paris', country: 'France', region: 'Western Europe', lat: 48.8566, lon: 2.3522 },
  { name: 'Berlin', country: 'Germany', region: 'Central Europe', lat: 52.5200, lon: 13.4050 },
  { name: 'Rome', country: 'Italy', region: 'Southern Europe', lat: 41.9028, lon: 12.4964 },
  { name: 'Madrid', country: 'Spain', region: 'Southern Europe', lat: 40.4168, lon: -3.7038 },
  { name: 'Amsterdam', country: 'Netherlands', region: 'Western Europe', lat: 52.3676, lon: 4.9041 },
  { name: 'Brussels', country: 'Belgium', region: 'Western Europe', lat: 50.8503, lon: 4.3517 },
  { name: 'Vienna', country: 'Austria', region: 'Central Europe', lat: 48.2082, lon: 16.3738 },
  { name: 'Zurich', country: 'Switzerland', region: 'Central Europe', lat: 47.3769, lon: 8.5417 },
  { name: 'Stockholm', country: 'Sweden', region: 'Northern Europe', lat: 59.3293, lon: 18.0686 },
  { name: 'Oslo', country: 'Norway', region: 'Northern Europe', lat: 59.9139, lon: 10.7522 },
  { name: 'Helsinki', country: 'Finland', region: 'Northern Europe', lat: 60.1699, lon: 24.9384 },
  { name: 'Copenhagen', country: 'Denmark', region: 'Northern Europe', lat: 55.6761, lon: 12.5683 },
  { name: 'Warsaw', country: 'Poland', region: 'Eastern Europe', lat: 52.2297, lon: 21.0122 },
  { name: 'Prague', country: 'Czech Republic', region: 'Central Europe', lat: 50.0755, lon: 14.4378 },
  { name: 'Athens', country: 'Greece', region: 'Southern Europe', lat: 37.9838, lon: 23.7275 },
  { name: 'Dublin', country: 'Ireland', region: 'Western Europe', lat: 53.3498, lon: -6.2603 },
  { name: 'Lisbon', country: 'Portugal', region: 'Southern Europe', lat: 38.7223, lon: -9.1393 },
  { name: 'Kyiv', country: 'Ukraine', region: 'Eastern Europe', lat: 50.4501, lon: 30.5234 },
  { name: 'Moscow', country: 'Russia', region: 'Eastern Europe', lat: 55.7558, lon: 37.6173 },
  { name: 'Saint Petersburg', country: 'Russia', region: 'Eastern Europe', lat: 59.9343, lon: 30.3351 },
  { name: 'Reykjavik', country: 'Iceland', region: 'Northern Europe', lat: 64.1466, lon: -21.9426 },

  // ── North America ──
  { name: 'New York City', country: 'United States', region: 'North America', lat: 40.7128, lon: -74.0060 },
  { name: 'Los Angeles', country: 'United States', region: 'North America', lat: 34.0522, lon: -118.2437 },
  { name: 'Chicago', country: 'United States', region: 'North America', lat: 41.8781, lon: -87.6298 },
  { name: 'Houston', country: 'United States', region: 'North America', lat: 29.7604, lon: -95.3698 },
  { name: 'Miami', country: 'United States', region: 'North America', lat: 25.7617, lon: -80.1918 },
  { name: 'San Francisco', country: 'United States', region: 'North America', lat: 37.7749, lon: -122.4194 },
  { name: 'Seattle', country: 'United States', region: 'North America', lat: 47.6062, lon: -122.3321 },
  { name: 'Washington D.C.', country: 'United States', region: 'North America', lat: 38.9072, lon: -77.0369 },
  { name: 'Toronto', country: 'Canada', region: 'North America', lat: 43.6532, lon: -79.3832 },
  { name: 'Montreal', country: 'Canada', region: 'North America', lat: 45.5017, lon: -73.5673 },
  { name: 'Vancouver', country: 'Canada', region: 'North America', lat: 49.2827, lon: -123.1207 },
  { name: 'Mexico City', country: 'Mexico', region: 'North America', lat: 19.4326, lon: -99.1332 },
  { name: 'Guadalajara', country: 'Mexico', region: 'North America', lat: 20.6597, lon: -103.3496 },
  { name: 'Havana', country: 'Cuba', region: 'Caribbean', lat: 23.1136, lon: -82.3666 },
  { name: 'Anchorage', country: 'United States', region: 'Alaska', lat: 61.2181, lon: -149.9003 },
  { name: 'Honolulu', country: 'United States', region: 'Hawaii', lat: 21.3069, lon: -157.8583 },

  // ── South America ──
  { name: 'São Paulo', country: 'Brazil', region: 'South America', lat: -23.5505, lon: -46.6333 },
  { name: 'Rio de Janeiro', country: 'Brazil', region: 'South America', lat: -22.9068, lon: -43.1729 },
  { name: 'Brasília', country: 'Brazil', region: 'South America', lat: -15.7975, lon: -47.8919 },
  { name: 'Manaus (Amazon)', country: 'Brazil', region: 'Amazon Basin', lat: -3.1190, lon: -60.0217 },
  { name: 'Buenos Aires', country: 'Argentina', region: 'South America', lat: -34.6037, lon: -58.3816 },
  { name: 'Santiago', country: 'Chile', region: 'South America', lat: -33.4489, lon: -70.6693 },
  { name: 'Bogotá', country: 'Colombia', region: 'South America', lat: 4.7110, lon: -74.0721 },
  { name: 'Lima', country: 'Peru', region: 'South America', lat: -12.0464, lon: -77.0428 },
  { name: 'Caracas', country: 'Venezuela', region: 'South America', lat: 10.4806, lon: -66.9036 },
  { name: 'Quito', country: 'Ecuador', region: 'South America', lat: -0.1807, lon: -78.4678 },

  // ── Africa ──
  { name: 'Cairo', country: 'Egypt', region: 'North Africa', lat: 30.0444, lon: 31.2357 },
  { name: 'Alexandria', country: 'Egypt', region: 'North Africa', lat: 31.2001, lon: 29.9187 },
  { name: 'Lagos', country: 'Nigeria', region: 'West Africa', lat: 6.5244, lon: 3.3792 },
  { name: 'Nairobi', country: 'Kenya', region: 'East Africa', lat: -1.2921, lon: 36.8219 },
  { name: 'Johannesburg', country: 'South Africa', region: 'Southern Africa', lat: -26.2041, lon: 28.0473 },
  { name: 'Cape Town', country: 'South Africa', region: 'Southern Africa', lat: -33.9249, lon: 18.4241 },
  { name: 'Casablanca', country: 'Morocco', region: 'North Africa', lat: 33.5731, lon: -7.5898 },
  { name: 'Addis Ababa', country: 'Ethiopia', region: 'East Africa', lat: 9.0300, lon: 38.7400 },
  { name: 'Accra', country: 'Ghana', region: 'West Africa', lat: 5.6037, lon: -0.1870 },
  { name: 'Kinshasa (Congo)', country: 'DR Congo', region: 'Central Africa', lat: -4.4419, lon: 15.2663 },

  // ── Oceania ──
  { name: 'Sydney', country: 'Australia', region: 'Oceania', lat: -33.8688, lon: 151.2093 },
  { name: 'Melbourne', country: 'Australia', region: 'Oceania', lat: -37.8136, lon: 144.9631 },
  { name: 'Brisbane', country: 'Australia', region: 'Oceania', lat: -27.4698, lon: 153.0251 },
  { name: 'Perth', country: 'Australia', region: 'Oceania', lat: -31.9505, lon: 115.8605 },
  { name: 'Auckland', country: 'New Zealand', region: 'Oceania', lat: -36.8485, lon: 174.7633 },
  { name: 'Wellington', country: 'New Zealand', region: 'Oceania', lat: -41.2865, lon: 174.7762 },
  { name: 'Suva', country: 'Fiji', region: 'South Pacific', lat: -18.1248, lon: 178.4501 },

  // ── Polar & Oceanic Regions ──
  { name: 'North Atlantic Ocean', country: 'International Waters', region: 'Atlantic', lat: 35.0, lon: -40.0 },
  { name: 'South Atlantic Ocean', country: 'International Waters', region: 'Atlantic', lat: -25.0, lon: -15.0 },
  { name: 'North Pacific Ocean', country: 'International Waters', region: 'Pacific', lat: 30.0, lon: -160.0 },
  { name: 'South Pacific Ocean', country: 'International Waters', region: 'Pacific', lat: -25.0, lon: -120.0 },
  { name: 'Indian Ocean', country: 'International Waters', region: 'Indian Ocean', lat: -10.0, lon: 75.0 },
  { name: 'Southern Ocean', country: 'International Waters', region: 'Antarctic', lat: -60.0, lon: 0.0 },
  { name: 'Arctic Ocean', country: 'International Waters', region: 'Arctic', lat: 80.0, lon: 0.0 },
  { name: 'McMurdo Station', country: 'Antarctica', region: 'Antarctica', lat: -77.8460, lon: 166.6680 },
  { name: 'Svalbard', country: 'Norway', region: 'High Arctic', lat: 78.2232, lon: 15.6267 }
];

/**
 * Calculates great-circle distance between two coordinates in kilometers.
 */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the nearest known geographical feature to a given coordinate.
 */
export function findNearestLocation(lat, lon) {
  let nearest = WORLD_LOCATIONS[0];
  let minDistance = Infinity;

  for (const loc of WORLD_LOCATIONS) {
    const dist = haversineDistanceKm(lat, lon, loc.lat, loc.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = loc;
    }
  }

  // Format latitude and longitude labels
  const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;

  // If within 600km, identify directly as that city / country
  if (minDistance <= 650) {
    return {
      name: nearest.name,
      country: nearest.country,
      region: nearest.region,
      lat,
      lon,
      latStr,
      lonStr,
      distanceKm: minDistance,
      isApproximate: minDistance > 80
    };
  }

  // If further away, label by country or oceanic region
  const label = nearest.country.includes('International') || nearest.name.includes('Ocean')
    ? nearest.name
    : `Vicinity of ${nearest.name}, ${nearest.country}`;

  return {
    name: label,
    country: nearest.country,
    region: nearest.region,
    lat,
    lon,
    latStr,
    lonStr,
    distanceKm: minDistance,
    isApproximate: true
  };
}

/**
 * Searches the location catalog by name, country, region, or coordinates string.
 */
export function searchLocations(query) {
  if (!query || typeof query !== 'string') return [];
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return [];

  // Check for direct coordinate input, e.g. "19.07, 72.87" or "19.076N, 72.87E"
  const coordMatch = trimmed.match(/^([-+]?\d+(?:\.\d+)?)\s*[,/ ]\s*([-+]?\d+(?:\.\d+)?)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const nearest = findNearestLocation(lat, lon);
      return [{
        name: `Coordinates [${nearest.latStr}, ${nearest.lonStr}]`,
        country: nearest.country,
        region: nearest.region,
        lat,
        lon,
        isCustomCoord: true
      }];
    }
  }

  return WORLD_LOCATIONS.filter((loc) =>
    loc.name.toLowerCase().includes(trimmed) ||
    loc.country.toLowerCase().includes(trimmed) ||
    loc.region.toLowerCase().includes(trimmed)
  ).slice(0, 8);
}
