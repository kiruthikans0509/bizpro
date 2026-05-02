const BASE = 'http://localhost:5000/api';

async function req(path, opts={}) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers:{'Content-Type':'application/json'}, ...opts });
    if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error||`HTTP ${res.status}`); }
    return res.json();
  } catch(e) {
    if (e.name==='TypeError') throw new Error('Cannot reach backend. Is the server running on port 5000?');
    throw e;
  }
}

export const searchLocations = (params={}) =>
  req(`/locations?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v])=>v!=null&&v!=='')))}`);

export const getAreas         = () => req('/locations/areas');
export const getBusinessTypes = () => req('/locations/business-types');
export const getStats         = () => req('/locations/stats');
export const getLocationById  = id => req(`/locations/${id}`);

export const analyzeLocation  = (body) =>
  req('/intelligence/analyze', { method:'POST', body:JSON.stringify(body) });

export const getRentForArea   = area => req(`/intelligence/rent/${encodeURIComponent(area)}`);

export const logSearch = (payload) =>
  req('/locations/log-search', { method:'POST', body:JSON.stringify(payload) }).catch(()=>{});
