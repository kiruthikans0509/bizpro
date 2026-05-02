export function potentialColor(score) {
  if (score >= 75) return '#16a34a';
  if (score >= 50) return '#ca8a04';
  return '#dc2626';
}
export function potentialTag(score) {
  if (score >= 75) return { cls:'tag-green',  label:'Excellent' };
  if (score >= 50) return { cls:'tag-yellow', label:'Good' };
  return                  { cls:'tag-red',    label:'Low' };
}
export function competitionTag(comp) {
  if (comp <= 0.35) return { cls:'tag-green',  label:'Low competition' };
  if (comp <= 0.65) return { cls:'tag-yellow', label:'Moderate' };
  return                   { cls:'tag-red',    label:'High competition' };
}
export function rentTag(rent) {
  if (rent <= 60)  return { cls:'tag-green',  label:`₹${rent}/sqft` };
  if (rent <= 100) return { cls:'tag-yellow', label:`₹${rent}/sqft` };
  return                  { cls:'tag-red',    label:`₹${rent}/sqft` };
}
export function escHtml(s) {
  return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function toast(msg, type='') {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) { wrap=document.createElement('div'); wrap.id='toastWrap'; wrap.style.cssText='position:fixed;top:64px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.style.cssText=`background:${type==='error'?'#991b1b':type==='success'?'#166534':'#1a3d2b'};color:#fff;padding:9px 15px;border-radius:8px;font-size:12px;font-family:system-ui,sans-serif;pointer-events:auto;animation:slideIn .2s ease`;
  el.textContent=msg; wrap.appendChild(el); setTimeout(()=>el.remove(),3000);
}
export function downloadCSV(rows, name='bizspot.csv') {
  const headers=['id','location_name','latitude','longitude','business_type','avg_rent_per_sqft','competition_index','success_rate','foot_traffic','avg_income','nearby_schools','nearby_colleges','nearby_hospitals','nearby_offices','nearby_corporates','recommended_business','safety_index','potential_score'];
  const lines=[headers.join(','),...rows.map(r=>headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))];
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download=name; document.body.appendChild(a); a.click(); a.remove();
}
