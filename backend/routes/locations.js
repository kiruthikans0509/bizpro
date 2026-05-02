const express = require('express');
const router  = express.Router();
const db      = require('../db');

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function potentialScore(r) {
  const footScore = Math.min((r.foot_traffic||0)/12000, 1);
  const compScore = 1 - (r.competition_index||0.5);
  const rentScore = 1 - Math.min((r.avg_rent_per_sqft||90)/170, 1);
  const incScore  = Math.min((r.avg_income||50000)/120000, 1);
  const sucScore  = (r.success_rate||50)/100;
  const safeScore = (r.safety_index||0.5);
  const poiRaw =
    (r.nearby_schools||0)*3 + (r.nearby_colleges||0)*4 + (r.nearby_universities||0)*5 +
    (r.nearby_hospitals||0)*3 + (r.nearby_clinics||0)*2 + (r.nearby_malls||0)*5 +
    (r.nearby_supermarkets||0)*2 + (r.nearby_offices||0)*2 + (r.nearby_corporates||0)*3 +
    (r.nearby_banks||0)*1 + (r.nearby_courts||0)*1 + (r.nearby_govt_offices||0)*1 +
    (r.nearby_parks||0)*1 + (r.nearby_bus_stops||0)*0.5;
  const poiScore = Math.min(poiRaw/40, 1);
  const raw = footScore*0.20 + compScore*0.18 + rentScore*0.12 + incScore*0.10 + sucScore*0.15 + safeScore*0.10 + poiScore*0.15;
  return Math.round(Math.max(0, Math.min(100, raw*100)));
}

router.get('/', (req, res) => {
  try {
    const { lat, lng, radius=5, business_type, min_success, max_rent, sort='potential', limit=500, offset=0, q } = req.query;
    let rows;

    if (lat && lng) {
      const clat=parseFloat(lat), clng=parseFloat(lng), rKm=parseFloat(radius), delta=rKm*0.013;
      let sql=`SELECT * FROM locations WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`;
      const p=[clat-delta,clat+delta,clng-delta,clng+delta];
      if (business_type) { sql+=' AND business_type=?'; p.push(business_type); }
      if (q)             { sql+=' AND location_name LIKE ?'; p.push(`%${q}%`); }
      if (min_success)   { sql+=' AND success_rate>=?'; p.push(parseFloat(min_success)); }
      if (max_rent)      { sql+=' AND avg_rent_per_sqft<=?'; p.push(parseInt(max_rent)); }
      rows = db.prepare(sql).all(...p)
        .map(r => ({ ...r, distance_km: haversine(clat,clng,r.latitude,r.longitude) }))
        .filter(r => r.distance_km <= rKm)
        .map(r => ({ ...r, potential_score: potentialScore(r) }));
    } else {
      let sql='SELECT * FROM locations WHERE 1=1'; const p=[];
      if (business_type) { sql+=' AND business_type=?'; p.push(business_type); }
      if (q)             { sql+=' AND location_name LIKE ?'; p.push(`%${q}%`); }
      if (min_success)   { sql+=' AND success_rate>=?'; p.push(parseFloat(min_success)); }
      if (max_rent)      { sql+=' AND avg_rent_per_sqft<=?'; p.push(parseInt(max_rent)); }
      rows = db.prepare(sql).all(...p).map(r => ({ ...r, potential_score: potentialScore(r) }));
    }

    if (sort==='potential')  rows.sort((a,b)=>b.potential_score-a.potential_score);
    else if (sort==='success')    rows.sort((a,b)=>(b.success_rate||0)-(a.success_rate||0));
    else if (sort==='rent_asc')   rows.sort((a,b)=>(a.avg_rent_per_sqft||0)-(b.avg_rent_per_sqft||0));
    else if (sort==='rent_desc')  rows.sort((a,b)=>(b.avg_rent_per_sqft||0)-(a.avg_rent_per_sqft||0));
    else if (sort==='traffic')    rows.sort((a,b)=>(b.foot_traffic||0)-(a.foot_traffic||0));
    else if (sort==='comp_asc')   rows.sort((a,b)=>(a.competition_index||0)-(b.competition_index||0));
    else if (sort==='distance' && lat && lng) rows.sort((a,b)=>(a.distance_km||0)-(b.distance_km||0));

    const total = rows.length;
    const paged = rows.slice(parseInt(offset), parseInt(offset)+parseInt(limit));
    const stats = rows.length ? {
      avg_rent:    Math.round(rows.reduce((s,r)=>s+(r.avg_rent_per_sqft||0),0)/rows.length),
      avg_success: +(rows.reduce((s,r)=>s+(r.success_rate||0),0)/rows.length).toFixed(1),
      avg_comp:    +(rows.reduce((s,r)=>s+(r.competition_index||0),0)/rows.length).toFixed(2),
      avg_traffic: Math.round(rows.reduce((s,r)=>s+(r.foot_traffic||0),0)/rows.length),
      top_recommended: (() => {
        const f={}; rows.forEach(r=>{ if(r.recommended_business) f[r.recommended_business]=(f[r.recommended_business]||0)+1; });
        return Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,count])=>({name,count}));
      })()
    } : null;

    res.json({ total, returned: paged.length, stats, locations: paged });
  } catch(e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.get('/areas', (req, res) => {
  res.json(db.prepare(`SELECT location_name, AVG(latitude) AS lat, AVG(longitude) AS lng, COUNT(*) AS count FROM locations GROUP BY location_name ORDER BY location_name`).all());
});

router.get('/business-types', (req, res) => {
  res.json(db.prepare(`SELECT business_type, COUNT(*) AS count FROM locations WHERE business_type IS NOT NULL GROUP BY business_type ORDER BY business_type`).all());
});

router.get('/stats', (req, res) => {
  const totals = db.prepare('SELECT COUNT(*) AS total FROM locations').get();
  const areas  = db.prepare('SELECT COUNT(DISTINCT location_name) AS areas FROM locations').get();
  const btypes = db.prepare('SELECT COUNT(DISTINCT business_type) AS btypes FROM locations').get();
  const rent   = db.prepare('SELECT MIN(avg_rent_per_sqft) AS min_rent, MAX(avg_rent_per_sqft) AS max_rent FROM locations').get();
  const topAreas = db.prepare(`SELECT location_name, AVG(success_rate) AS avg_success, COUNT(*) AS count FROM locations GROUP BY location_name ORDER BY avg_success DESC LIMIT 5`).all();
  const byType   = db.prepare(`SELECT business_type, AVG(success_rate) AS avg_success, COUNT(*) AS count FROM locations GROUP BY business_type ORDER BY avg_success DESC`).all();
  const poiAvg   = db.prepare(`SELECT AVG(nearby_schools) AS schools, AVG(nearby_colleges) AS colleges, AVG(nearby_universities) AS universities, AVG(nearby_hospitals) AS hospitals, AVG(nearby_offices) AS offices, AVG(nearby_corporates) AS corporates, AVG(nearby_malls) AS malls, AVG(nearby_banks) AS banks, AVG(nearby_courts) AS courts, AVG(nearby_govt_offices) AS govt, AVG(nearby_bus_stops) AS bus_stops FROM locations`).get();
  res.json({ total_locations:totals.total, unique_areas:areas.areas, business_types:btypes.btypes, rent_range:rent, top_areas:topAreas, by_business_type:byType, poi_averages:poiAvg });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM locations WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error:'Not found' });
  const nearby = db.prepare(`SELECT * FROM locations WHERE location_name=? AND id!=? LIMIT 5`).all(row.location_name, row.id).map(r=>({...r,potential_score:potentialScore(r)}));
  res.json({ ...row, potential_score: potentialScore(row), nearby_same_area: nearby });
});

router.post('/log-search', (req, res) => {
  try {
    const { query,lat,lng,radius_km,results } = req.body;
    db.prepare('INSERT INTO search_log (query,lat,lng,radius_km,results,searched_at) VALUES (?,?,?,?,?,?)').run(query||null,lat||null,lng||null,radius_km||null,results||0,new Date().toISOString());
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error:e.message }); }
});

module.exports = router;
