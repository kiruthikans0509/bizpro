require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();
const PORT    = process.env.PORT || 5000;
const ORIGIN  = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5500';

app.use(cors({
  origin: [ORIGIN,'http://localhost:5500','http://127.0.0.1:5500','http://localhost:3000','http://127.0.0.1:3000'],
  methods: ['GET','POST','DELETE'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json());
app.use((req,_,next) => { console.log(`[${new Date().toISOString().slice(11,19)}] ${req.method} ${req.url}`); next(); });

app.use('/api/locations',    require('./routes/locations'));
app.use('/api/intelligence', require('./routes/intelligence'));
app.get('/api/health', (_,res) => res.json({ status:'ok', time:new Date().toISOString(), version:'2.0.0' }));
app.use((_,res) => res.status(404).json({ error:'Route not found' }));
app.use((err,_,res,__) => { console.error(err.stack); res.status(500).json({ error:'Server error' }); });

app.listen(PORT, () => {
  console.log(`\n✅  BizSpot API v2  →  http://localhost:${PORT}`);
  console.log(`    GET  /api/locations?lat=&lng=&radius=&business_type=&sort=`);
  console.log(`    GET  /api/locations/areas`);
  console.log(`    GET  /api/locations/stats`);
  console.log(`    POST /api/intelligence/analyze  { lat, lng, area_name, radius_km }`);
  console.log(`    GET  /api/intelligence/rent/:area`);
  console.log(`    GET  /api/health\n`);
});
