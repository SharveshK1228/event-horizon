// All requests stay same-origin; Vite proxies /api during development.
async function request(path, body, signal) {
 const response = await fetch('/api'+path,{signal,method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 if(!response.ok) throw new Error(`Backend returned ${response.status}`);
 return response.json();
}
export const api={
 async snapshot(signal){
  const [health,cameras,incidents]=await Promise.all([request('/healthz',null,signal),request('/cameras',null,signal),request('/incidents',null,signal)]);
  if(!Array.isArray(cameras)||!Array.isArray(incidents))throw new Error('Unexpected backend response schema');
  return {health,cameras,incidents};
 },
 status:(id,signal)=>request(`/cameras/${encodeURIComponent(id)}/status`,null,signal),
 sop:(id,signal)=>request(`/sops/${encodeURIComponent(id)}`,null,signal),
 acknowledge:id=>request(`/incidents/${encodeURIComponent(id)}/acknowledge`,{local_only:false}),
 ask:body=>request('/assistant',body)
};
