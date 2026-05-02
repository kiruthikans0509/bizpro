/**
 * poiService.js
 * Live POI data from OpenStreetMap Overpass API — FREE, no API key needed
 * Results are cached in SQLite for 30 days to avoid repeat queries
 *
 * Also provides research-based commercial rent estimates for Coimbatore areas
 */
const db = require('../db');

db.exec(`
  CREATE TABLE IF NOT EXISTS poi_cache (
    cache_key  TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at TEXT NOT NULL
  );
`);

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/**
 * Fetch all POIs within radiusKm of a lat/lng point from OpenStreetMap.
 * Returns counts and names for 20 place categories.
 */
async function fetchPOIs(lat, lng, radiusKm = 1.5) {
  const cacheKey = `poi_${lat.toFixed(4)}_${lng.toFixed(4)}_${radiusKm}`;

  const cached = db.prepare('SELECT data, fetched_at FROM poi_cache WHERE cache_key = ?').get(cacheKey);
  if (cached) {
    const ageDays = (Date.now() - new Date(cached.fetched_at).getTime()) / 86400000;
    if (ageDays < 30) return JSON.parse(cached.data);
  }

  const R = radiusKm * 1000; // metres for "around" query
  const query = `
[out:json][timeout:25];
(
  node["amenity"="school"](around:${R},${lat},${lng});
  node["amenity"="college"](around:${R},${lat},${lng});
  node["amenity"="university"](around:${R},${lat},${lng});
  node["amenity"="hospital"](around:${R},${lat},${lng});
  node["amenity"="clinic"](around:${R},${lat},${lng});
  node["shop"="mall"](around:${R},${lat},${lng});
  node["shop"="supermarket"](around:${R},${lat},${lng});
  node["office"](around:${R},${lat},${lng});
  node["amenity"="bank"](around:${R},${lat},${lng});
  node["amenity"="courthouse"](around:${R},${lat},${lng});
  node["office"="government"](around:${R},${lat},${lng});
  node["amenity"="police"](around:${R},${lat},${lng});
  node["amenity"="restaurant"](around:${R},${lat},${lng});
  node["amenity"="cafe"](around:${R},${lat},${lng});
  node["tourism"="hotel"](around:${R},${lat},${lng});
  node["amenity"="fuel"](around:${R},${lat},${lng});
  node["leisure"="park"](around:${R},${lat},${lng});
  node["highway"="bus_stop"](around:${R},${lat},${lng});
  node["amenity"="atm"](around:${R},${lat},${lng});
  node["amenity"="pharmacy"](around:${R},${lat},${lng});
);
out body;
  `.trim();

  let elements = [];
  let success  = false;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BizSpot/2.0 (https://github.com/bizspot)' },
        body:    'data=' + encodeURIComponent(query),
        signal:  AbortSignal.timeout(22000),
      });
      if (!res.ok) { console.warn(`[POI] ${endpoint} HTTP ${res.status}`); continue; }
      const json = await res.json();
      elements   = json.elements || [];
      success    = true;
      console.log(`[POI] ${endpoint} → ${elements.length} elements (${lat.toFixed(4)},${lng.toFixed(4)} r=${radiusKm}km)`);
      break;
    } catch (e) {
      console.warn(`[POI] ${endpoint} failed: ${e.message}`);
    }
  }

  if (!success) throw new Error('All Overpass endpoints unavailable');

  // Tally counts and collect names
  const counts = {
    schools:0, colleges:0, universities:0, hospitals:0, clinics:0,
    malls:0, supermarkets:0, offices:0, corporates:0, banks:0,
    courts:0, govt:0, police:0, restaurants:0, cafes:0,
    hotels:0, fuel:0, parks:0, bus_stops:0, atms:0, pharmacies:0,
  };
  const names = {};
  const addName = (cat, name) => { if (name) (names[cat] = names[cat] || []).push(name); };

  for (const el of elements) {
    const t = el.tags || {};
    const n = t.name || null;
    if (t.amenity === 'school')      { counts.schools++;      addName('schools', n); }
    if (t.amenity === 'college')     { counts.colleges++;     addName('colleges', n); }
    if (t.amenity === 'university')  { counts.universities++; addName('universities', n); }
    if (t.amenity === 'hospital')    { counts.hospitals++;    addName('hospitals', n); }
    if (t.amenity === 'clinic')      { counts.clinics++;      addName('clinics', n); }
    if (t.shop    === 'mall')        { counts.malls++;        addName('malls', n); }
    if (t.shop    === 'supermarket') { counts.supermarkets++; addName('supermarkets', n); }
    if (t.office)                    { counts.offices++;      }
    if (t.office  === 'company')     { counts.corporates++;   addName('corporates', n); }
    if (t.amenity === 'bank')        { counts.banks++;        addName('banks', n); }
    if (t.amenity === 'courthouse')  { counts.courts++;       addName('courts', n); }
    if (t.office  === 'government')  { counts.govt++;         addName('govt', n); }
    if (t.amenity === 'police')      { counts.police++;       }
    if (t.amenity === 'restaurant')  { counts.restaurants++;  }
    if (t.amenity === 'cafe')        { counts.cafes++;        }
    if (t.tourism === 'hotel')       { counts.hotels++;       addName('hotels', n); }
    if (t.amenity === 'fuel')        { counts.fuel++;         }
    if (t.leisure === 'park')        { counts.parks++;        addName('parks', n); }
    if (t.highway === 'bus_stop')    { counts.bus_stops++;    }
    if (t.amenity === 'atm')         { counts.atms++;         }
    if (t.amenity === 'pharmacy')    { counts.pharmacies++;   addName('pharmacies', n); }
  }

  const result = { counts, names, total: elements.length, fetched_at: new Date().toISOString() };
  db.prepare('INSERT OR REPLACE INTO poi_cache (cache_key, data, fetched_at) VALUES (?,?,?)')
    .run(cacheKey, JSON.stringify(result), result.fetched_at);

  return result;
}

/**
 * Recommend top businesses based on POI mix
 */
function recommendBusinesses(counts) {
  const c   = counts;
  const edu = c.schools + c.colleges + c.universities;
  const med = c.hospitals + c.clinics;
  const work= c.offices + c.corporates;
  const rec = [];

  if (edu >= 2)          rec.push({ type: 'Cafe / Study Lounge',        score: edu * 10,     reason: `${edu} educational institutions nearby` });
  if (edu >= 2)          rec.push({ type: 'Stationery & Bookstore',     score: edu * 8,      reason: 'Student demand zone' });
  if (work >= 3)         rec.push({ type: 'Co-working Space',           score: work * 8,     reason: `${work} offices/corporates nearby` });
  if (work >= 3)         rec.push({ type: 'Quick Service Restaurant',   score: work * 7,     reason: 'Lunch crowd demand from offices' });
  if (med >= 2)          rec.push({ type: 'Pharmacy / Medical Shop',    score: med * 12,     reason: `${med} hospitals/clinics nearby` });
  if (med >= 1)          rec.push({ type: 'Healthy Food Cafe',          score: med * 7,      reason: 'Health-conscious clientele' });
  if (c.malls >= 1)      rec.push({ type: 'Clothing Boutique',          score: c.malls * 12, reason: 'Shopping district — fashion demand' });
  if (c.hotels >= 1)     rec.push({ type: 'Restaurant / Takeaway',      score: c.hotels * 14,reason: `${c.hotels} hotels = tourist traffic` });
  if (c.bus_stops >= 5)  rec.push({ type: 'Grocery / Convenience',      score: c.bus_stops*6,reason: 'Commuter hotspot' });
  if (c.parks >= 1)      rec.push({ type: 'Fitness Centre / Gym',       score: c.parks * 12, reason: 'Park proximity, active lifestyle area' });
  if (c.courts + c.govt >= 1) rec.push({ type: 'Printing & Documentation', score: (c.courts + c.govt) * 14, reason: 'Govt/court visitors need docs' });
  if (c.banks >= 3)      rec.push({ type: 'Financial Services',         score: c.banks * 8,  reason: `${c.banks} banks = financial hub` });
  if (c.supermarkets >= 2) rec.push({ type: 'Specialty Food Store',    score: c.supermarkets*7, reason: 'Retail competition — go niche' });

  if (!rec.length) rec.push({ type: 'General Grocery Store', score: 30, reason: 'Essential community service' });
  return rec.sort((a,b) => b.score - a.score).slice(0, 3);
}

// ── Coimbatore commercial rent data ──────────────────────────────────────
// Compiled from NoBroker, MagicBricks, 99acres listings (Apr 2025)
// ₹ per sqft per month — ground-floor commercial/retail space
const RENT_DATA = {
  'Gandhipuram':     { min:80,  max:150, avg:108, tier:'Prime CBD',    note:'Central bus stand, highest footfall in city' },
  'RS Puram':        { min:90,  max:160, avg:118, tier:'Prime',        note:'Upmarket residential + commercial, Brooke Bond area' },
  'Race Course':     { min:100, max:170, avg:130, tier:'Prime',        note:'CODISSIA, luxury residential, corporate offices' },
  'Town Hall':       { min:65,  max:120, avg:88,  tier:'Commercial',   note:'Wholesale market, textile hubs, high density' },
  'Peelamedu':       { min:60,  max:115, avg:82,  tier:'IT Corridor',  note:'Tidel Park, airport road, tech companies' },
  'Saravanampatti':  { min:55,  max:100, avg:70,  tier:'Growing IT',   note:'PSG Tech, expanding IT suburb' },
  'Saibaba Colony':  { min:60,  max:105, avg:78,  tier:'Upmarket',     note:'Premium residential, clean wide roads' },
  'Singanallur':     { min:45,  max:88,  avg:62,  tier:'Mid',          note:'Residential + light commercial' },
  'Ukkadam':         { min:40,  max:82,  avg:57,  tier:'Mid',          note:'Traditional market area, dense' },
  'Ganapathy':       { min:48,  max:88,  avg:63,  tier:'Mid',          note:'North Coimbatore, growing residential' },
  'Hope College':    { min:50,  max:92,  avg:68,  tier:'Mid',          note:'PSG group institutions, strong student market' },
  'Kalapatti':       { min:40,  max:78,  avg:56,  tier:'Outer-Mid',    note:'KMCH hospital zone, fast developing' },
  'Ramanathapuram':  { min:42,  max:80,  avg:58,  tier:'Outer-Mid',    note:'East Coimbatore, industrial proximity' },
  'Kavundampalayam': { min:38,  max:72,  avg:52,  tier:'Outer',        note:'Suburban residential' },
  'Vadavalli':       { min:38,  max:72,  avg:52,  tier:'Outer',        note:'Suburban, near city limits' },
  'Eachanari':       { min:35,  max:65,  avg:47,  tier:'Outer',        note:'Developing suburb' },
  'Thudiyalur':      { min:35,  max:68,  avg:48,  tier:'Outer',        note:'Northwest, colleges nearby' },
  'Podanur':         { min:32,  max:62,  avg:44,  tier:'Outer',        note:'Railway junction, industrial area' },
  'Sulur':           { min:28,  max:58,  avg:40,  tier:'Outer',        note:'Near international airport' },
  'Kurichi':         { min:30,  max:60,  avg:42,  tier:'Outer',        note:'South suburb, textile proximity' },
  'Sundarapuram':    { min:32,  max:62,  avg:44,  tier:'Outer',        note:'South suburb' },
  'Koundampalayam':  { min:28,  max:55,  avg:38,  tier:'Outer',        note:'Southwest suburb' },
  'Madukkarai':      { min:25,  max:52,  avg:36,  tier:'Fringe',       note:'Outer ring, low density' },
  'Kinathukadavu':   { min:22,  max:48,  avg:32,  tier:'Fringe',       note:'Rural fringe' },
  'Perur':           { min:22,  max:48,  avg:32,  tier:'Fringe',       note:'Temple town, pilgrimage traffic' },
};

function getRent(areaName) {
  return RENT_DATA[areaName] || { min:35, max:70, avg:50, tier:'Unknown', note:'Estimate' };
}

module.exports = { fetchPOIs, getRent, recommendBusinesses, RENT_DATA };
