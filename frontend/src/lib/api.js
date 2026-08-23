const API=(import.meta.env.VITE_API_URL||'http://localhost:8000/api').replace(/\/$/,'');
export async function api(path, opts={}){
  const token=localStorage.getItem('finsight_token');
  const headers={...(opts.headers||{})};
  if(token) headers.Authorization=`Bearer ${token}`;
  let body=opts.body;
  if(body && !(body instanceof FormData)) { headers['Content-Type']='application/json'; body=JSON.stringify(body); }
  let res;
  try{
    res=await fetch(`${API}${path}`,{...opts,headers,body,mode:'cors'});
  }catch(err){
    const hint=location.hostname==='127.0.0.1' && API.includes('localhost')
      ? 'Frontend is using 127.0.0.1 while the API is configured for localhost. Set VITE_API_URL=http://127.0.0.1:8000/api or open the frontend on localhost.'
      : 'Make sure the FinSight backend is running on http://localhost:8000 and that CORS_ORIGINS includes your frontend origin.';
    throw new Error(`Unable to reach FinSight API. ${hint}`);
  }
  const data=await res.json().catch(()=>({detail:'Unexpected server response'}));
  if(!res.ok) throw new Error(data.detail||`Request failed (${res.status})`);
  return data;
}
export {API};
