/**
 * /api/intelligence — Live real-world location analysis
 * Queries OpenStreetMap for actual nearby places, returns business recommendations
 */
const express = require('express');
const router  = express.Router();
const { fetchPOIs, getRent, recommendBusinesses } = require('../services/poiService');

/**
 * POST /api/intelligence/analyze
 * { lat, lng, area_name, radius_km }
 */
router.post('/analyze', async (req, res) => {
  const { lat, lng, area_name = '', radius_km = 1.5 } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  try {
    const clat = parseFloat(lat), clng = parseFloat(lng), r = parseFloat(radius_km);
    const [pois, rent] = await Promise.all([
      fetchPOIs(clat, clng, Math.min(r, 2)),   // cap at 2km for POI query speed
      Promise.resolve(getRent(area_name)),
    ]);

    const c = pois.counts;

    // Demand score
    const demand = Math.min(100, Math.round(
      (c.schools + c.colleges + c.universities) * 4 +
      (c.hospitals + c.clinics) * 3 +
      (c.offices + c.corporates) * 2.5 +
      (c.malls + c.supermarkets) * 4 +
      c.bus_stops * 1.5 +
      (c.banks + c.atms) * 1 +
      (c.restaurants + c.cafes) * 0.3 +
      c.hotels * 2 + c.parks * 0.5
    ));

    // Competition (based on food/retail density)
    const comp = Math.min(0.95, Math.round((c.restaurants + c.cafes + c.supermarkets + c.malls) / 30 * 100) / 100);

    // Foot traffic estimate
    const traffic = Math.min(15000, Math.round(
      c.bus_stops * 900 + c.schools * 700 + c.colleges * 1000 + c.universities * 1500 +
      c.hospitals * 500 + c.offices * 350 + c.corporates * 600 + c.malls * 2000 +
      c.supermarkets * 800 + c.restaurants * 150 + c.cafes * 100 + c.hotels * 200 + c.banks * 120
    ));

    // Safety proxy
    const safety = Math.min(0.95, Math.round((
      0.5 + (c.police > 0 ? 0.15 : 0) + (c.banks > 0 ? 0.10 : 0) +
      (c.hospitals > 0 ? 0.05 : 0) + ((c.schools + c.colleges) > 0 ? 0.10 : 0) +
      Math.min(c.parks * 0.02, 0.06) - comp * 0.15
    ) * 100) / 100);

    const recommendations = recommendBusinesses(c);

    // POI summary for display
    const poiSummary = [
      { icon:'🏫', label:'Schools',       count: c.schools,      names: pois.names.schools || [] },
      { icon:'🎓', label:'Colleges',      count: c.colleges + c.universities, names: [...(pois.names.colleges||[]), ...(pois.names.universities||[])] },
      { icon:'🏥', label:'Hospitals',     count: c.hospitals,    names: pois.names.hospitals || [] },
      { icon:'🏨', label:'Clinics',       count: c.clinics,      names: [] },
      { icon:'🏢', label:'Offices',       count: c.offices,      names: [] },
      { icon:'🏙️', label:'Corporates',    count: c.corporates,   names: pois.names.corporates || [] },
      { icon:'🛍️', label:'Malls',         count: c.malls,        names: pois.names.malls || [] },
      { icon:'🛒', label:'Supermarkets',  count: c.supermarkets, names: [] },
      { icon:'🏦', label:'Banks',         count: c.banks,        names: pois.names.banks || [] },
      { icon:'⚖️', label:'Courts',        count: c.courts,       names: pois.names.courts || [] },
      { icon:'🏛️', label:'Govt Offices',  count: c.govt,         names: pois.names.govt || [] },
      { icon:'👮', label:'Police',        count: c.police,       names: [] },
      { icon:'🚌', label:'Bus Stops',     count: c.bus_stops,    names: [] },
      { icon:'🌳', label:'Parks',         count: c.parks,        names: pois.names.parks || [] },
      { icon:'🏨', label:'Hotels',        count: c.hotels,       names: pois.names.hotels || [] },
      { icon:'💊', label:'Pharmacies',    count: c.pharmacies,   names: pois.names.pharmacies || [] },
    ].filter(p => p.count > 0);

    res.json({
      location:        { lat: clat, lng: clng, area: area_name },
      radius_km:       r,
      poi_summary:     poiSummary,
      poi_counts:      c,
      total_pois:      pois.total,
      rent,
      demand_score:    demand,
      competition_index: comp,
      foot_traffic_est:  traffic,
      safety_score:    safety,
      recommendations,
      data_source:     'OpenStreetMap Overpass API',
      cached:          pois.fetched_at.slice(0,10) !== new Date().toISOString().slice(0,10),
    });

  } catch(e) {
    console.error('[intelligence]', e.message);
    res.status(503).json({ error: 'Live POI lookup failed', detail: e.message, fallback: true });
  }
});

/**
 * GET /api/intelligence/rent/:area
 */
router.get('/rent/:area', (req, res) => {
  res.json(getRent(decodeURIComponent(req.params.area)));
});

/**
 * DELETE /api/intelligence/cache
 * Clear POI cache (force refetch)
 */
router.delete('/cache', (req, res) => {
  const db = require('../db');
  const { changes } = db.prepare('DELETE FROM poi_cache').run();
  res.json({ cleared: changes });
});

module.exports = router;
