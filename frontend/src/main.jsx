import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import * as Icons from 'lucide-react';
import {ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend} from 'recharts';
import {api, API} from './lib/api';
import './styles.css';

const NAV = [
  ['Overview','/','LayoutDashboard'],
  ['Transactions','/transactions','ArrowLeftRight'],
  ['Budget Lab','/budget','WalletCards'],
  ['Investments','/investments','TrendingUp'],
  ['Goals','/goals','Target'],
  ['Net Worth','/net-worth','Gem'],
  ['Simulation','/simulation','Sparkles'],
  ['Reports','/reports','FileText'],
];
const AI_ROUTE='/ai';
const money = n => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const mediaUrl = path => path ? (path.startsWith('http') ? path : `${API.replace(/\/api$/, '')}${path}`) : '';
const pct = n => `${Number(n||0).toFixed(1)}%`;
const pathFromHash = () => {
  const p=(window.location.hash||'#/').slice(1) || '/';
  return p.startsWith('/') ? p : `/${p}`;
};
function navigate(path){
  const next=path.startsWith('/')?path:`/${path}`;
  const target=`#${next}`;
  if(window.location.hash===target){window.dispatchEvent(new PopStateEvent('popstate')); return;}
  window.history.pushState({},'',target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
function useRoute(){
  const [route,setRoute]=useState(pathFromHash);
  useEffect(()=>{
    const sync=()=>setRoute(pathFromHash());
    window.addEventListener('popstate',sync); window.addEventListener('hashchange',sync);
    return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('hashchange',sync)};
  },[]);
  return route;
}
function useData(loader, deps=[]){
  const [state,setState]=useState({data:null,loading:true,error:''});
  const refresh=async()=>{
    setState(s=>({...s,loading:true,error:''}));
    try{const data=await loader();setState({data,loading:false,error:''});}
    catch(e){setState({data:null,loading:false,error:e?.message||'Unable to load this workspace.'});}
  };
  useEffect(()=>{refresh();},deps);
  return {...state,refresh};
}
function Loading({label='Loading workspace…'}){return <div className="loading"><div className="loader"/><span>{label}</span></div>}
function ErrorCard({message,onRetry}){return <div className="inline-error"><div className="error-icon"><Icons.TriangleAlert size={20}/></div><div><b>Couldn’t load this workspace</b><p>{message}</p><button className="primary-btn mini" onClick={onRetry}>Retry</button></div></div>}
function Stat({label,value,change,icon:Icon}){return <div className="stat"><div className="stat-top"><span>{label}</span><div className="stat-icon">{Icon?<Icon size={18}/>:<Icons.Activity size={18}/>}</div></div><strong>{value}</strong>{change&&<span className={'trend '+(String(change).startsWith('-')?'down':'')}>{change}</span>}</div>}
function Panel({title,sub,action,children}){return <section className="panel"><div className="panel-head"><div><h3>{title}</h3>{sub&&<p>{sub}</p>}</div>{action}</div>{children}</section>}
function Empty({text}){return <div className="empty"><Icons.Sparkles size={22}/><span>{text}</span></div>}
function FinSightLogo({size=42,className=""}){
  return <span className={`finsight-logo ${className}`} style={{width:size,height:size}} aria-hidden="true">
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fsLogoStroke" x1="8" y1="10" x2="53" y2="55" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8FAE97"/>
          <stop offset="0.48" stopColor="#6D8E76"/>
          <stop offset="1" stopColor="#A7BDAE"/>
        </linearGradient>
        <linearGradient id="fsLogoFill" x1="14" y1="12" x2="49" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A9BFAF"/>
          <stop offset="0.52" stopColor="#6B8A73"/>
          <stop offset="1" stopColor="#38533F"/>
        </linearGradient>
        <linearGradient id="fsLogoGold" x1="33" y1="25" x2="56" y2="13" gradientUnits="userSpaceOnUse">
          <stop stopColor="#789A82"/>
          <stop offset="1" stopColor="#B9CDBD"/>
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28.5" stroke="url(#fsLogoStroke)" strokeWidth="3.6" opacity=".96"/>
      <path d="M16.4 21.2C18.7 18.7 22.2 17.2 26 17.2h17.8c2.8 0 5.3 1.1 7.1 2.9l-5.1 5.1H28.3c-1.8 0-3.4.7-4.6 1.9l-7.3 7.3V21.2Z" fill="url(#fsLogoFill)"/>
      <path d="M16.4 37.2 24 29.6c1.2-1.2 2.8-1.9 4.6-1.9h14.9l5-5c1.2-1.2 3.1-.4 3.1 1.3v7.2c0 1.1-.9 2-2 2H29.9c-1.8 0-3.4.7-4.6 1.9l-8.9 8.9v-6.8Z" fill="url(#fsLogoFill)" opacity=".98"/>
      <rect x="17" y="42.5" width="4.8" height="8" rx="1.4" fill="#5D7F67"/>
      <rect x="25.1" y="38.6" width="4.8" height="11.9" rx="1.4" fill="#6D8F78"/>
      <rect x="33.2" y="34.8" width="4.8" height="15.7" rx="1.4" fill="#7D9F87"/>
      <path d="M36.5 28.6 47.8 17.5" stroke="url(#fsLogoGold)" strokeWidth="3.2" strokeLinecap="round"/>
      <path d="m47.8 17.5-.6 7.3m.6-7.3-7.1 1" stroke="url(#fsLogoGold)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </span>
}

function inlineFormat(text){
  const parts=String(text||'').split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g);
  return parts.map((part,i)=>{
    if(/^\*\*[^*]+\*\*$/.test(part)||/^__[^_]+__$/.test(part)) return <strong key={i}>{part.replace(/^\*\*|\*\*$|^__|__$|$/g,'').replace(/__$/,'')}</strong>;
    if(/^\*[^*]+\*$/.test(part)||/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1,-1)}</em>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
function RichText({content}){
  const text=String(content||'').replace(/\r/g,'').trim();
  if(!text)return null;
  const lines=text.split('\n');
  const blocks=[]; let i=0;
  const isTable=(idx)=>idx<lines.length && /^\s*\|/.test(lines[idx]) && idx+1<lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[idx+1]);
  while(i<lines.length){
    let line=lines[i].trim();
    if(!line){i++;continue;}
    if(isTable(i)){
      const tableLines=[]; while(i<lines.length && /^\s*\|/.test(lines[i].trim())){tableLines.push(lines[i].trim());i++;}
      const parseRow=(r)=>r.replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim());
      const headers=parseRow(tableLines[0]); const rows=tableLines.slice(2).map(parseRow);
      blocks.push(<div className="rt-table-wrap" key={blocks.length}><table className="rt-table"><thead><tr>{headers.map((h,j)=><th key={j}>{inlineFormat(h)}</th>)}</tr></thead><tbody>{rows.map((r,ri)=><tr key={ri}>{headers.map((_,j)=><td key={j}>{inlineFormat(r[j]||'')}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const heading=line.match(/^#{1,3}\s+(.*)$/);
    if(heading){blocks.push(<h4 className={'rt-heading rt-h'+heading[0].match(/^#+/)[0].length} key={blocks.length}>{inlineFormat(heading[1])}</h4>);i++;continue;}
    if(/^[-*•]\s+/.test(line)){
      const items=[]; while(i<lines.length && /^[-*•]\s+/.test(lines[i].trim())){items.push(lines[i].trim().replace(/^[-*•]\s+/,''));i++;}
      blocks.push(<ul className="rt-list" key={blocks.length}>{items.map((x,j)=><li key={j}>{inlineFormat(x)}</li>)}</ul>);continue;
    }
    if(/^\d+[.)]\s+/.test(line)){
      const items=[]; while(i<lines.length && /^\d+[.)]\s+/.test(lines[i].trim())){items.push(lines[i].trim().replace(/^\d+[.)]\s+/,''));i++;}
      blocks.push(<ol className="rt-list" key={blocks.length}>{items.map((x,j)=><li key={j}>{inlineFormat(x)}</li>)}</ol>);continue;
    }
    const para=[line]; i++;
    while(i<lines.length){const nxt=lines[i].trim(); if(!nxt || /^#{1,3}\s+/.test(nxt)||/^[-*•]\s+/.test(nxt)||/^\d+[.)]\s+/.test(nxt)||isTable(i))break; para.push(nxt);i++;}
    blocks.push(<p className="rt-p" key={blocks.length}>{inlineFormat(para.join(' '))}</p>);
  }
  return <div className="rich-text">{blocks}</div>;
}


function usePublicTheme(){
  const [theme,setTheme]=useState(()=>localStorage.getItem('finsight_theme')||'dark');
  useEffect(()=>{
    const apply=()=>{
      document.documentElement.dataset.theme=theme;
      document.documentElement.dataset.resolvedTheme=theme==='system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark')
        : theme;
      localStorage.setItem('finsight_theme',theme);
    };
    apply();
    if(theme==='system'){
      const mq=window.matchMedia('(prefers-color-scheme: light)');
      const onChange=()=>apply();
      mq.addEventListener?.('change',onChange);
      return()=>mq.removeEventListener?.('change',onChange);
    }
  },[theme]);
  return [theme,setTheme];
}
function PublicThemePicker({theme,setTheme}){
  const [open,setOpen]=useState(false);
  return <div className="public-theme-wrap">
    <button className="public-theme-btn" onClick={()=>setOpen(v=>!v)} aria-label="Choose theme">
      <Icons.SunMoon size={17}/><span>{theme==='dark'?'Dark':theme==='light'?'Light':'System'}</span><Icons.ChevronDown size={14}/>
    </button>
    {open&&<ThemeMenu theme={theme} setTheme={v=>{setTheme(v);setOpen(false)}}/>}
  </div>
}
function Landing({onNavigate}){
  const [theme,setTheme]=usePublicTheme();
  return <div className="landing-page">
    <div className="landing-noise"/>
    <div className="landing-grid"/>
    <header className="landing-nav">
      <div className="brand">
        <FinSightLogo size={46} className="brand-logo-mark"/>
        <div><b>FinSight</b><span>financial intelligence OS</span></div>
      </div>
      <div className="landing-nav-actions">
        <PublicThemePicker theme={theme} setTheme={setTheme}/>
        <button className="landing-login" onClick={()=>onNavigate('/login')}>Sign in</button>
        <button className="primary-btn landing-cta" onClick={()=>onNavigate('/register')}>Get started <Icons.ArrowUpRight size={17}/></button>
      </div>
    </header>
    <main className="landing-main">
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="landing-badge"><span className="pulse"/><span>PRIVATE FINANCIAL INTELLIGENCE</span></div>
          <h1>Your money,<br/><em>finally in focus.</em></h1>
          <p>FinSight turns your transactions, budgets, investments and goals into one calm, intelligent financial command center.</p>
          <div className="landing-actions">
            <button className="primary-btn landing-primary" onClick={()=>onNavigate('/register')}>Create free workspace <Icons.ArrowRight size={18}/></button>
            <button className="landing-secondary" onClick={()=>onNavigate('/login')}><Icons.LogIn size={17}/> I already have an account</button>
          </div>
          <div className="landing-trust"><span><Icons.ShieldCheck size={15}/> Private by design</span><span><Icons.Sparkles size={15}/> AI-powered insights</span><span><Icons.BarChart3 size={15}/> Real-time clarity</span></div>
        </div>
        <div className="landing-visual">
          <div className="landing-orbit orbit-a"/><div className="landing-orbit orbit-b"/>
          <div className="landing-dashboard">
            <div className="dash-top"><div><span>NET WORTH</span><b>₹18,42,650</b></div><div className="dash-chip">+12.8%</div></div>
            <div className="dash-chart"><svg viewBox="0 0 500 180" preserveAspectRatio="none"><defs><linearGradient id="landFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#789582" stopOpacity=".32"/><stop offset="1" stopColor="#789582" stopOpacity="0"/></linearGradient></defs><path d="M0 150 C45 137 55 116 90 124 S135 97 165 109 S207 80 245 93 S290 57 325 73 S365 46 405 58 S450 31 500 39 L500 180 L0 180Z" fill="url(#landFill)"/><path d="M0 150 C45 137 55 116 90 124 S135 97 165 109 S207 80 245 93 S290 57 325 73 S365 46 405 58 S450 31 500 39" fill="none" stroke="#91AD99" strokeWidth="3"/></svg></div>
            <div className="dash-stats"><div><span>Monthly cashflow</span><b>+₹84,320</b></div><div><span>Goal progress</span><b>72%</b></div><div><span>AI signal</span><b className="signal-good">Healthy</b></div></div>
          </div>
          <div className="floating-card floating-ai"><div className="float-icon"><Icons.Bot size={17}/></div><div><span>FIN SIGHT AI</span><b>Spending is 8.4% lower this month</b></div></div>
          <div className="floating-card floating-goal"><div className="goal-ring"><b>72%</b></div><div><span>SAVINGS GOAL</span><b>Emergency fund</b></div></div>
        </div>
      </section>
      <section className="landing-features">
        <div><Icons.LayoutDashboard/><b>One financial command center</b><span>Transactions, budgets, investments and goals in one view.</span></div>
        <div><Icons.Bot/><b>Intelligence that explains</b><span>Ask questions and get practical insights from your own data.</span></div>
        <div><Icons.LockKeyhole/><b>Built around your privacy</b><span>Your financial workspace stays focused, secure and yours.</span></div>
      </section>
    </main>
  </div>
}
function PublicAuth({onDone}){
  const route=useRoute();
  const [theme,setTheme]=usePublicTheme();
  if(route==='/') return <Landing onNavigate={navigate}/>;
  return <div className="public-auth-shell">
    <PublicThemePicker theme={theme} setTheme={setTheme}/>
    <Auth onDone={onDone}/>
  </div>
}

function Auth({onDone}){
  const route=useRoute();
  const routeMode=route==='/register'?'register':route==='/forgot-password'?'forgot':route==='/reset-password'?'reset':'login';
  const [mode,setMode]=useState(routeMode),[form,setForm]=useState({name:'',email:'',password:''}),[reset,setReset]=useState({email:'',code:'',new_password:'',confirm:''}),[err,setErr]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[googleReady,setGoogleReady]=useState(false);
  useEffect(()=>{setMode(routeMode);setErr('');setNotice('')},[routeMode]);
  useEffect(()=>{api('/auth/google/status').then(d=>setGoogleReady(Boolean(d.configured))).catch(()=>setGoogleReady(false))},[]);
  const setPage=(next)=>{setMode(next);setErr('');setNotice('');navigate(next==='login'?'/login':next==='register'?'/register':next==='forgot'?'/forgot-password':'/reset-password')};
  async function submit(e){
    e.preventDefault(); setErr(''); setNotice(''); setBusy(true);
    try{
      const d=await api('/auth/'+mode,{method:'POST',body:{...form}});
      localStorage.setItem('finsight_token',d.access_token); localStorage.setItem('finsight_user',JSON.stringify(d.user)); onDone(d.user); navigate('/');
    }catch(e){setErr(e.message)}finally{setBusy(false)}
  }
  async function requestReset(e){
    e.preventDefault(); setErr(''); setNotice(''); setBusy(true);
    try{await api('/auth/forgot-password',{method:'POST',body:{email:reset.email}});setNotice('If an account exists for that email, a one-time reset code has been sent.');setPage('reset')}catch(e){setErr(e.message)}finally{setBusy(false)}
  }
  async function completeReset(e){
    e.preventDefault(); setErr(''); setNotice('');
    if(reset.new_password!==reset.confirm){setErr('Passwords do not match.');return}
    setBusy(true); try{const d=await api('/auth/reset-password',{method:'POST',body:{email:reset.email,code:reset.code,new_password:reset.new_password}});setNotice(d.message);setReset({email:reset.email,code:'',new_password:'',confirm:''});setPage('login')}catch(e){setErr(e.message)}finally{setBusy(false)}
  }
  const title=mode==='register'?'Create your FinSight account':mode==='forgot'?'Recover your account':mode==='reset'?'Reset your password':'Sign in to FinSight';
  const subtitle=mode==='register'?'Your financial workspace starts here.':mode==='forgot'?'We will email a one-time code to your verified account address.':mode==='reset'?'Enter the one-time code sent to your email.':'Your private financial intelligence workspace.';
  return <div className="auth"><div className="auth-aurora"/><div className="auth-card">
    <div className="brand"><FinSightLogo size={42} className="brand-logo-mark"/><div><b>FinSight</b><span>financial intelligence OS</span></div></div>
    <div className="auth-title"><span className="eyebrow">PRIVATE WEALTH LAYER</span><h1>{title}</h1><p>{subtitle}</p></div>
    {(mode==='login'||mode==='register')&&<>
      <button type="button" className="google-btn" onClick={()=>{if(googleReady) window.location.href=API+'/auth/google/start'}} disabled={!googleReady}><span className="google-g">G</span>{googleReady?'Continue with Google':'Google sign-in not configured'}</button>
      <div className="auth-divider"><span>or continue with email</span></div>
      <form onSubmit={submit}>{mode==='register'&&<input placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>}<input placeholder="Email address" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input placeholder="Password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>{err&&<div className="error">{err}</div>}{notice&&<div className="success-note">{notice}</div>}<button className="primary-btn" disabled={busy}>{busy?'Please wait…':(mode==='login'?'Sign in':'Create account')} <Icons.ArrowUpRight size={18}/></button></form>
      <div className="auth-links"><button className="link-btn" onClick={()=>setPage(mode==='login'?'register':'login')}>{mode==='login'?'Create an account':'Back to sign in'}</button>{mode==='login'&&<button className="link-btn" onClick={()=>setPage('forgot')}>Forgot password?</button>}</div>
    </>}
    {mode==='forgot'&&<form onSubmit={requestReset}><input placeholder="Account email" type="email" value={reset.email} onChange={e=>setReset({...reset,email:e.target.value})}/>{err&&<div className="error">{err}</div>}{notice&&<div className="success-note">{notice}</div>}<button className="primary-btn" disabled={busy}>{busy?'Sending code…':'Send reset code'} <Icons.Mail size={18}/></button></form>}
    {mode==='reset'&&<form onSubmit={completeReset}><input placeholder="Account email" type="email" value={reset.email} onChange={e=>setReset({...reset,email:e.target.value})}/><input placeholder="6-digit OTP" inputMode="numeric" maxLength={6} value={reset.code} onChange={e=>setReset({...reset,code:e.target.value.replace(/\D/g,'').slice(0,6)})}/><input placeholder="New password" type="password" value={reset.new_password} onChange={e=>setReset({...reset,new_password:e.target.value})}/><input placeholder="Confirm new password" type="password" value={reset.confirm} onChange={e=>setReset({...reset,confirm:e.target.value})}/>{err&&<div className="error">{err}</div>}{notice&&<div className="success-note">{notice}</div>}<button className="primary-btn" disabled={busy||reset.code.length!==6}>{busy?'Updating password…':'Reset password'} <Icons.LockKeyhole size={18}/></button></form>}
    {(mode==='forgot'||mode==='reset')&&<button className="link-btn" onClick={()=>setPage('login')}>Back to sign in</button>}
  </div><div className="auth-art"><div className="orb orb1"/><div className="orb orb2"/><div className="glass-panel"><span>PRIVATE FINANCIAL INTELLIGENCE</span><strong>Secure by design</strong><div className="sparkline"><i/><i/><i/><i/><i/><i/><i/><i/></div></div></div></div>
}
function ThemeMenu({theme,setTheme}){
 const options=[['dark','Dark','Moon'],['light','Light','Sun'],['system','System','Monitor']];
 return <div className="theme-menu">{options.map(([value,label,icon])=>{const I=Icons[icon];return <button key={value} className={'theme-option '+(theme===value?'selected':'')} onClick={()=>setTheme(value)}>{I&&<I size={16}/>}<span>{label}</span>{theme===value&&<Icons.Check size={15}/>}</button>})}</div>
}
function Chat({onClose}){
 const [messages,setMessages]=useState([{id:1,role:'assistant',content:'Hi — I’m FinSight AI. Ask me about your spending, savings, forecasts, anomalies, goals, or investments. I’ll use your imported FinSight data to give you a clear, practical answer.',source:'assistant'}]);
 const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[mode,setMode]=useState('fast');
 const nextId=useRef(2);
 const ask=async(text=input)=>{
   const q=text.trim(); if(!q||busy)return;
   const userId=nextId.current++, assistantId=nextId.current++;
   const prior=messages.slice(-6).map(({role,content})=>({role,content:String(content||'').slice(-900)}));
   setMessages(m=>[...m,{id:userId,role:'user',content:q,source:'user'},{id:assistantId,role:'assistant',content:'',pending:true,source:'nvidia'}]);
   setInput(''); setBusy(true);
   const token=localStorage.getItem('finsight_token');
   const headers={'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})};
   try{
     const res=await fetch(API+'/ai/chat',{method:'POST',headers,body:JSON.stringify({message:q,history:prior,mode})});
     const data=await res.json().catch(()=>({}));
     if(!res.ok) throw new Error(data.detail||'AI request failed');
     const reply=String(data.reply||'').trim();
     if(!reply) throw new Error('The AI returned an empty response.');
     setMessages(m=>m.map(x=>x.id===assistantId?{...x,content:reply,pending:false,source:data.source||'nvidia'}:x));
   }catch(e){
     setMessages(m=>m.map(x=>x.id===assistantId?{...x,pending:false,content:'I couldn’t complete that request right now. Please try again in a moment.',aiError:e?.message||'Unknown error'}:x));
   }finally{setBusy(false)}
 };
 const quick=['Where am I overspending?','Predict my next-month cash flow.','How can I save ₹10,000 more each month?','Explain my biggest anomaly.'];
 return <div className="modal-backdrop" onClick={onClose}><div className="pro-chat" onClick={e=>e.stopPropagation()}><div className="pro-chat-head"><div className="chat-brand"><div className="chat-orb"><Icons.Bot size={19}/></div><div><b>FinSight AI</b><span>NVIDIA financial copilot</span></div></div><div className="chat-tools"><span className="online-dot">●</span><button className="icon-btn" onClick={onClose}><Icons.X size={18}/></button></div></div><div className="chat-mode"><button className={mode==='fast'?'active':''} onClick={()=>setMode('fast')} disabled={busy}><Icons.Zap size={14}/> Instant</button><button className={mode==='deep'?'active':''} onClick={()=>setMode('deep')} disabled={busy}><Icons.Sparkles size={14}/> Deep analysis</button><span className="chat-mode-note">Complete answers only — no partial streaming.</span></div><div className="pro-chat-body">{messages.map((m)=><div key={m.id} className={'chat-msg '+m.role}><div className="msg-avatar">{m.role==='assistant'?<Icons.Bot size={14}/>:<Icons.UserRound size={14}/>}</div><div className="msg-bubble">{m.pending?<div className="ai-pending"><span className="thinking-dots">FinSight is analyzing</span><span className="pending-bar"/></div>:<RichText content={m.content}/>} {m.aiError&&<div className="ai-enhance-status muted">{m.aiError}</div>}</div></div>)}{messages.length===1&&<div className="quick-prompts">{quick.map(q=><button key={q} onClick={()=>ask(q)}>{q}</button>)}</div>}</div><div className="pro-chat-input"><textarea rows="1" value={input} disabled={busy} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}}} placeholder={busy?'FinSight is preparing a complete answer…':'Ask anything about your finances…'}/><button className="send-btn" onClick={()=>ask()} disabled={busy||!input.trim()}>{busy?<span className="send-loader"/>:<Icons.Send size={18}/>}</button></div><div className="chat-foot">Powered by your FinSight data and NVIDIA Nemotron. Answers arrive complete — no cut-off messages.</div></div></div>
}
function Shell({user,onLogout}){
 const route=useRoute();const [currentUser,setCurrentUser]=useState(user);const [theme,setTheme]=useState(localStorage.getItem('finsight_theme')||'dark');const [themeOpen,setThemeOpen]=useState(false);const [chat,setChat]=useState(false);
 useEffect(()=>{const onUser=()=>{try{const next=JSON.parse(localStorage.getItem('finsight_user')||'null');if(next)setCurrentUser(next)}catch{}};window.addEventListener('finsight-user-updated',onUser);return()=>window.removeEventListener('finsight-user-updated',onUser)},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;const apply=()=>{document.documentElement.dataset.resolvedTheme=theme==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):theme;localStorage.setItem('finsight_theme',theme)};apply();},[theme]); useEffect(()=>{const open=()=>setChat(true);window.addEventListener('open-finsight-chat',open);return()=>window.removeEventListener('open-finsight-chat',open)},[]);
 const title=route==='/profile'?'Profile':route===AI_ROUTE?'AI Intelligence':NAV.find(x=>x[1]===route)?.[0]||'Workspace';
 return <div className="app"><aside><div className="brand sidebar-brand"><FinSightLogo size={42} className="brand-logo-mark"/><div><b>FinSight</b><span>Intelligence OS</span></div></div><div className="nav-label">WORKSPACE</div>{NAV.map(([label,path,icon])=>{const I=Icons[icon]||Icons.Circle;return <button key={path} className={'nav-item '+(route===path?'active':'')} onClick={()=>navigate(path)}><I size={18}/><span>{label}</span>{path==='/simulation'&&<i className="new-dot">NEW</i>}</button>})}<div className="nav-label ai-label">INTELLIGENCE</div><button className={'nav-item '+(route===AI_ROUTE?'active':'')} onClick={()=>navigate(AI_ROUTE)}><Icons.Bot size={18}/><span>AI Intelligence</span><i className="new-dot">AI</i></button><div className="sidebar-bottom"><div className="health"><span className="pulse"/> Engine online</div><button className="nav-item" onClick={onLogout}><Icons.LogOut size={18}/><span>Sign out</span></button></div></aside><main><header><div><span className="micro">FINANCIAL INTELLIGENCE WORKSPACE</span><h2>{title}</h2></div><div className="header-actions"><div className="theme-wrap"><button className="icon-btn" onClick={()=>setThemeOpen(v=>!v)}><Icons.SunMoon size={18}/><span>Theme</span></button>{themeOpen&&<ThemeMenu theme={theme} setTheme={v=>{setTheme(v);setThemeOpen(false)}}/>}</div><button className="icon-btn ai-launch" onClick={()=>setChat(true)}><Icons.Bot size={18}/><span>Ask FinSight</span></button><button className="avatar profile-avatar-button" onClick={()=>navigate('/profile')} title="Open profile">{currentUser?.avatar_url?<img src={mediaUrl(currentUser.avatar_url)} alt="Profile"/>:<span>{(currentUser?.name||'F').slice(0,1).toUpperCase()}</span>}<i/></button></div></header><div className="page"><Workspace route={route} /></div></main>{chat&&<Chat onClose={()=>setChat(false)}/>}</div>
}
function Workspace({route}){
 const pageMap={
  '/':<Overview/>, '/transactions':<Transactions/>, '/budget':<Budget/>, '/investments':<Investments/>, '/goals':<Goals/>, '/net-worth':<NetWorth/>, '/simulation':<Simulation/>, '/reports':<Reports/>, '/ai':<AILab/>, '/profile':<Profile/>
 };
 return pageMap[route]||<NotFound/>;
}
function Overview(){
 const [year,setYear]=useState(new Date().getFullYear());
 const r=useData(()=>api(`/dashboard?year=${year}`),[year]);
 if(r.loading)return <Loading/>;
 if(r.error)return <ErrorCard message={r.error} onRetry={r.refresh}/>;
 const d=r.data||{},m=d.metrics||{},forecast=d.forecast||{},cats=d.categories||[],ins=d.insights||[];
 const monthly=(d.monthly||[]).map(x=>({...x,label:new Date(`${x.month}-01`).toLocaleString('en-IN',{month:'short'})}));
 const availableYears=(d.available_years||[year]).sort((a,b)=>b-a);
 return <><div className="hero-grid"><div className="hero"><div className="hero-kicker"><span className="status-dot"/> FINANCIAL PULSE</div><h1>Your money has a<br/><em>trajectory.</em></h1><p>Turn financial activity into a living model of where your money is going.</p><button className="primary-btn" onClick={()=>navigate('/simulation')}>Run a what-if <Icons.Sparkles size={17}/></button></div><div className="hero-mini"><span>NEXT-MONTH CASH FLOW</span><strong>{money(forecast.next_month_cashflow)}</strong><div className="mini-progress"><span style={{width:`${Math.min(100,Math.max(8,m.savings_rate||0))}%`}}/></div><small>Based on recent imported behavior</small></div></div><div className="stat-grid"><Stat label="Net worth" value={money(m.net_worth)} change="Live model" icon={Icons.Gem}/><Stat label="Cash flow" value={money(m.cashflow)} change={m.cashflow>=0?'+ Positive':'- Watch this'} icon={Icons.Activity}/><Stat label="Investments" value={money(m.investments)} change="Tracked portfolio" icon={Icons.TrendingUp}/><Stat label="Subscriptions" value={money(m.subscriptions)} change="Recurring spend" icon={Icons.Repeat2}/></div><div className="two-col"><Panel title="Income & Expenses" sub="Monthly financial activity" action={<div className="chart-control"><Icons.CalendarDays size={15}/><select aria-label="Chart year" value={year} onChange={e=>setYear(Number(e.target.value))}>{availableYears.map(y=><option key={y} value={y}>{y}</option>)}</select></div>}><div className="line-chart-wrap"><ResponsiveContainer width="100%" height={320}><LineChart data={monthly} margin={{top:8,right:10,left:4,bottom:4}}><CartesianGrid strokeDasharray="3 5" vertical={true} stroke="var(--chart-grid)"/><XAxis dataKey="label" tick={{fill:'var(--chart-axis)',fontSize:12}} axisLine={{stroke:'var(--chart-axis-line)'}} tickLine={false}/><YAxis tick={{fill:'var(--chart-axis)',fontSize:12}} axisLine={{stroke:'var(--chart-axis-line)'}} tickLine={false} tickFormatter={v=>`₹${Math.round(v/1000)}k`}/><Tooltip content={<FinanceTooltip/>}/><Legend verticalAlign="bottom" height={34} iconType="line" wrapperStyle={{color:'var(--chart-axis)',fontSize:12}}/><Line type="monotone" dataKey="expense" name="Expenses" stroke="#e34b4b" strokeWidth={3} dot={{r:4,fill:'#fff',stroke:'#e34b4b',strokeWidth:3}} activeDot={{r:6,fill:'#fff',stroke:'#e34b4b',strokeWidth:3}}/><Line type="monotone" dataKey="income" name="Income" stroke="#2f9b52" strokeWidth={3} dot={{r:4,fill:'#fff',stroke:'#2f9b52',strokeWidth:3}} activeDot={{r:6,fill:'#fff',stroke:'#2f9b52',strokeWidth:3}}/></LineChart></ResponsiveContainer></div></Panel><Panel title="Where your money goes" sub="Expense concentration"><div className="category-list">{cats.slice(0,7).map((x,i)=><div key={i}><div className="cat-line"><span>{x.category}</span><b>{money(x.value)}</b></div><div className="bar"><span style={{width:`${Math.min(100,(x.value/Math.max(cats[0]?.value||1,1))*100)}%`}}/></div></div>)}{!cats.length&&<Empty text="Import a statement to unlock expense intelligence."/>}</div></Panel></div><div className="two-col"><Panel title="Intelligence feed" sub="Signals from your behavior"><div className="feed">{ins.map((x,i)=><div className="feed-row" key={i}><div className={'severity '+(x.severity||'info')}><Icons.Sparkles size={16}/></div><div><b>{x.title}</b><RichText content={x.detail}/></div></div>)}</div></Panel><Panel title="Fast actions" sub="Jump into your next decision"><div className="action-grid"><button onClick={()=>navigate('/budget')}><Icons.WalletCards/>Build a budget</button><button onClick={()=>navigate('/goals')}><Icons.Target/>Create a goal</button><button onClick={()=>navigate('/simulation')}><Icons.Sparkles/>Run simulation</button><button onClick={()=>window.dispatchEvent(new Event('open-finsight-chat'))}><Icons.Bot/>Ask AI</button></div></Panel></div></>
}
function FinanceTooltip({active,payload,label}){if(!active||!payload?.length)return null;return <div className="finance-tooltip"><div className="finance-tooltip-title">{label}</div>{payload.map((p,i)=><div className="finance-tooltip-row" key={i}><span><i style={{background:p.color}}/>{p.name}</span><b>{money(p.value)}</b></div>)}</div>}
function TransactionModal({mode='single',onClose,onSaved}){
 const blank={date:new Date().toISOString().slice(0,10),description:'',amount:'',type:'expense',category:'',merchant:'',account:'Primary'};
 const [rows,setRows]=useState([blank]); const [busy,setBusy]=useState(false); const [err,setErr]=useState('');
 const setRow=(i,k,v)=>setRows(r=>r.map((x,idx)=>idx===i?{...x,[k]:v}:x));
 const addRow=()=>setRows(r=>[...r,{...blank}]);
 const removeRow=i=>setRows(r=>r.length===1?r:r.filter((_,idx)=>idx!==i));
 async function save(){
   const clean=rows.map(x=>({...x,amount:Number(x.amount)})).filter(x=>x.description.trim() && Number(x.amount)>0);
   if(!clean.length){setErr('Add at least one transaction with a description and amount.');return}
   setBusy(true);setErr('');
   try{
     if(mode==='single') await api('/transactions',{method:'POST',body:clean[0]});
     else await api('/transactions/bulk',{method:'POST',body:{transactions:clean}});
     onSaved(clean.length);onClose();
   }catch(e){setErr(e.message||'Could not save transaction(s).')}finally{setBusy(false)}
 }
 const categories=['Food & Dining','Shopping','Transport','Bills & Utilities','Entertainment','Health','Housing','Education','Investment','Income','Other'];
 return <div className="modal-backdrop" onClick={onClose}><div className="transaction-modal" onClick={e=>e.stopPropagation()}>
   <div className="transaction-modal-head"><div><span className="micro">TRANSACTION CENTER</span><h3>{mode==='single'?'Add transaction':'Add multiple transactions'}</h3><p>{mode==='single'?'Create one clean, categorized financial entry.':'Add several entries in one pass. You can remove rows before saving.'}</p></div><button className="icon-btn" onClick={onClose}><Icons.X size={18}/></button></div>
   <div className="transaction-editor">
    {rows.map((x,i)=><div className="txn-edit-row" key={i}>
      <div className="txn-row-top"><span>Transaction {i+1}</span>{mode==='bulk'&&<button className="row-remove" onClick={()=>removeRow(i)} title="Remove row"><Icons.X size={15}/></button>}</div>
      <div className="txn-fields">
       <label><span>Date</span><input type="date" value={x.date} onChange={e=>setRow(i,'date',e.target.value)}/></label>
       <label className="wide"><span>Description</span><input placeholder="e.g. Salary, Grocery purchase" value={x.description} onChange={e=>setRow(i,'description',e.target.value)}/></label>
       <label><span>Type</span><select value={x.type} onChange={e=>setRow(i,'type',e.target.value)}><option value="expense">Expense / Debit</option><option value="income">Income / Credit</option></select></label>
       <label><span>Amount</span><div className="currency-field"><span>₹</span><input type="number" min="0.01" step="0.01" placeholder="0.00" value={x.amount} onChange={e=>setRow(i,'amount',e.target.value)}/></div></label>
       <label><span>Category</span><select value={x.category} onChange={e=>setRow(i,'category',e.target.value)}><option value="">Auto categorize</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
       <label><span>Merchant</span><input placeholder="Optional" value={x.merchant} onChange={e=>setRow(i,'merchant',e.target.value)}/></label>
      </div>
    </div>)}
    {mode==='bulk'&&<button className="add-row-btn" onClick={addRow}><Icons.Plus size={16}/> Add another row</button>}
   </div>
   {err&&<div className="transaction-form-error"><Icons.TriangleAlert size={16}/>{err}</div>}
   <div className="transaction-modal-foot"><span><Icons.ShieldCheck size={16}/> Saved directly to your FinSight account</span><div><button className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" onClick={save} disabled={busy}>{busy?'Saving…':mode==='single'?'Add transaction':`Add ${rows.length} transactions`} <Icons.Check size={17}/></button></div></div>
 </div></div>
}
function Transactions(){
 const r=useData(()=>api('/transactions'),[]),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[replace,setReplace]=useState(true),[msg,setMsg]=useState(''),[selected,setSelected]=useState([]),[modal,setModal]=useState(null),[deleteBusy,setDeleteBusy]=useState(false);
 const rows=r.data||[];const show=rows.filter(x=>(filter==='all'||x.type===filter)&&(x.description+' '+(x.category||'')+' '+(x.merchant||'')).toLowerCase().includes(search.toLowerCase()));
 const visibleIds=show.map(x=>x.id); const allSelected=visibleIds.length>0&&visibleIds.every(id=>selected.includes(id));
 useEffect(()=>{setSelected(s=>s.filter(id=>rows.some(x=>x.id===id)));},[r.data]);
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 const toggleAll=()=>setSelected(allSelected?s=>s.filter(id=>!visibleIds.includes(id)):s=>Array.from(new Set([...s,...visibleIds])));
 async function upload(e){const file=e.target.files?.[0];if(!file)return;setMsg('Importing…');try{const fd=new FormData();fd.append('file',file);fd.append('replace',String(replace));const d=await api('/transactions/upload',{method:'POST',body:fd});setMsg(d.message);r.refresh()}catch(err){setMsg(err.message)}finally{e.target.value=''}}
 async function clear(){if(!confirm('Clear all transactions? This cannot be undone.'))return;try{await api('/transactions',{method:'DELETE'});setSelected([]);setMsg('Transactions cleared.');r.refresh()}catch(e){setMsg(e.message)}}
 async function deleteSelected(){if(!selected.length)return;if(!confirm(`Delete ${selected.length} selected transaction(s)?`))return;setDeleteBusy(true);try{const d=await api('/transactions/delete-selected',{method:'POST',body:{ids:selected}});setSelected([]);setMsg(d.message);r.refresh()}catch(e){setMsg(e.message)}finally{setDeleteBusy(false)}}
 return <>
  <div className="transactions-hero"><div><span className="eyebrow">TRANSACTION CENTER</span><h1>Every rupee, <em>under control.</em></h1><p>Add, import, select and remove transactions without leaving the workspace.</p></div><div className="transaction-actions"><button className="primary-btn" onClick={()=>setModal('single')}><Icons.Plus size={17}/> Add transaction</button><button className="secondary-btn" onClick={()=>setModal('bulk')}><Icons.CopyPlus size={17}/> Add multiple</button></div></div>
  <div className="toolbar transaction-toolbar"><div className="search"><Icons.Search size={17}/><input placeholder="Search merchant, category or note" value={search} onChange={e=>setSearch(e.target.value)}/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All activity</option><option value="income">Income</option><option value="expense">Expenses</option></select><label className="replace-toggle"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/><span>Replace existing</span></label><label className="upload-btn"><Icons.Upload size={17}/> Import CSV<input hidden type="file" accept=".csv,.xlsx" onChange={upload}/></label><button className="icon-btn danger-action" onClick={clear}><Icons.Trash2 size={16}/><span>Clear all</span></button></div>
  {selected.length>0&&<div className="selection-bar"><span><b>{selected.length}</b> selected</span><div><button className="secondary-btn mini" onClick={()=>setSelected([])}>Clear selection</button><button className="delete-selected-btn" onClick={deleteSelected} disabled={deleteBusy}><Icons.Trash2 size={15}/>{deleteBusy?'Deleting…':'Delete selected'}</button></div></div>}
  {msg&&<div className="notice">{msg}</div>}
  {r.loading?<Loading/>:r.error?<ErrorCard message={r.error} onRetry={r.refresh}/>:<Panel title="Transaction stream" sub={`${show.length} records visible`} action={<span className="table-caption">{selected.length?`${selected.length} selected`: 'Select any rows for bulk actions'}</span>}><div className="table-wrap"><table><thead><tr><th className="checkbox-cell"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible"/></th><th>Date</th><th>Merchant</th><th>Category</th><th>Signal</th><th className="right">Amount</th></tr></thead><tbody>{show.map(x=><tr key={x.id} className={selected.includes(x.id)?'selected-row':''}><td className="checkbox-cell"><input type="checkbox" checked={selected.includes(x.id)} onChange={()=>toggle(x.id)} aria-label={`Select ${x.description}`}/></td><td>{new Date(x.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td><td><div className="merchant"><span>{(x.merchant||'•').slice(0,1)}</span><div><b>{x.merchant||x.description}</b><small>{x.description}</small></div></div></td><td><span className="pill">{x.category}</span></td><td>{x.anomaly&&<span className="signal danger"><Icons.TriangleAlert size={14}/> anomaly</span>}{x.subscription&&<span className="signal"><Icons.Repeat2 size={14}/> recurring</span>}</td><td className={'right amount '+(x.type==='income'?'income':'expense')}>{x.signed_amount>=0?'+':'-'}{money(Math.abs(x.signed_amount ?? x.amount))}</td></tr>)}{!show.length&&<tr><td colSpan="6"><Empty text="No transactions match this filter."/></td></tr>}</tbody></table></div></Panel>}
  {modal&&<TransactionModal mode={modal} onClose={()=>setModal(null)} onSaved={n=>{setMsg(`${n} transaction${n===1?'':'s'} added successfully.`);r.refresh();}}/>
  }</>
}
function Budget(){const r=useData(()=>api('/dashboard'),[]),[f,setF]=useState({category:'Food & Dining',monthly_limit:10000,month:new Date().toISOString().slice(0,7)});if(r.loading)return <Loading/>;if(r.error)return <ErrorCard message={r.error} onRetry={r.refresh}/>;const d=r.data||{},budgets=d.budgets||[],cats=d.categories||[],expense=Number(d.metrics?.expense||0),planned=budgets.reduce((s,x)=>s+Number(x.limit||0),0);async function add(){await api('/budgets',{method:'POST',body:f});r.refresh()}return <><div className="stat-grid"><Stat label="Budget coverage" value={money(planned)} change="Monthly planned cap" icon={Icons.WalletCards}/><Stat label="Actual spend" value={money(expense)} change="Imported history" icon={Icons.CreditCard}/><Stat label="Variance" value={money(planned-expense)} change={planned-expense>=0?'Under plan':'Over plan'} icon={Icons.Scale}/><Stat label="Savings rate" value={pct(d.metrics?.savings_rate)} change="Live model" icon={Icons.Percent}/></div><div className="two-col"><Panel title="Budget lab" sub="Create a monthly guardrail"><div className="form-grid"><select value={f.category} onChange={e=>setF({...f,category:e.target.value})}>{['Food & Dining','Shopping','Transport','Bills & Utilities','Entertainment','Health','Housing','Education','Other'].map(x=><option key={x}>{x}</option>)}</select><input type="number" value={f.monthly_limit} onChange={e=>setF({...f,monthly_limit:+e.target.value})}/><input type="month" value={f.month} onChange={e=>setF({...f,month:e.target.value})}/><button className="primary-btn" onClick={add}>Add budget</button></div></Panel><Panel title="Budget matrix" sub="Plan versus actual"><div className="budget-list">{budgets.map(b=>{const spend=Number(cats.find(x=>x.category===b.category)?.value||0),p=b.limit?spend/b.limit*100:0;return <div className="budget-row" key={b.category}><div><b>{b.category}</b><span>{money(spend)} / {money(b.limit)}</span></div><div className="bar"><span className={p>100?'over':''} style={{width:`${Math.min(100,p)}%`}}/></div><small>{p>100?`${Math.round(p-100)}% over cap`:`${Math.round(100-p)}% room left`}</small></div>})}{!budgets.length&&<Empty text="Create a budget guardrail to see it here."/>}</div></Panel></div></>}
function Investments(){const r=useData(()=>api('/investments'),[]),[f,setF]=useState({asset:'',asset_type:'Mutual Fund',invested_amount:0,current_value:0,units:0});if(r.loading)return <Loading/>;if(r.error)return <ErrorCard message={r.error} onRetry={r.refresh}/>;const rows=r.data||[],invested=rows.reduce((s,x)=>s+Number(x.invested||0),0),current=rows.reduce((s,x)=>s+Number(x.current||0),0),ret=invested?((current-invested)/invested*100):0;async function add(){await api('/investments',{method:'POST',body:f});setF({asset:'',asset_type:'Mutual Fund',invested_amount:0,current_value:0,units:0});r.refresh()}return <><div className="stat-grid"><Stat label="Portfolio value" value={money(current)} change={`${ret>=0?'+':''}${pct(ret)} total`} icon={Icons.BriefcaseBusiness}/><Stat label="Capital deployed" value={money(invested)} change="Tracked assets" icon={Icons.Landmark}/><Stat label="Unrealized gain" value={money(current-invested)} change="Mark-to-model" icon={Icons.TrendingUp}/><Stat label="Positions" value={rows.length} change="Instruments" icon={Icons.Layers3}/></div><div className="two-col"><Panel title="Add position" sub="Mutual funds, equity, gold, ETF, FD"><div className="form-grid"><input placeholder="Asset name" value={f.asset} onChange={e=>setF({...f,asset:e.target.value})}/><select value={f.asset_type} onChange={e=>setF({...f,asset_type:e.target.value})}>{['Mutual Fund','Equity','ETF','Gold','FD'].map(x=><option key={x}>{x}</option>)}</select><input type="number" placeholder="Invested amount" value={f.invested_amount} onChange={e=>setF({...f,invested_amount:+e.target.value})}/><input type="number" placeholder="Current value" value={f.current_value} onChange={e=>setF({...f,current_value:+e.target.value})}/><input type="number" placeholder="Units" value={f.units} onChange={e=>setF({...f,units:+e.target.value})}/><button className="primary-btn" onClick={add}>Track asset</button></div></Panel><Panel title="Portfolio lens" sub="Current tracked positions"><div className="portfolio-list">{rows.map(x=><div className="portfolio-row" key={x.id}><div className="asset-badge">{(x.asset||'?').slice(0,1)}</div><div className="asset-meta"><b>{x.asset}</b><span>{x.type} · {x.units} units</span></div><div className="asset-value"><b>{money(x.current)}</b><span className={x.return_pct>=0?'gain':'loss'}>{x.return_pct>=0?'+':''}{pct(x.return_pct)}</span></div></div>)}{!rows.length&&<Empty text="Add your first tracked position."/>}</div></Panel></div></>}
function Goals(){const r=useData(()=>api('/goals'),[]),[f,setF]=useState({name:'',target_amount:100000,current_amount:0,target_date:''});if(r.loading)return <Loading/>;if(r.error)return <ErrorCard message={r.error} onRetry={r.refresh}/>;const rows=r.data||[];async function add(){await api('/goals',{method:'POST',body:{...f,target_date:f.target_date||null}});setF({name:'',target_amount:100000,current_amount:0,target_date:''});r.refresh()}return <><div className="goal-banner"><div><span className="eyebrow">GOAL ENGINE</span><h1>Give your money<br/><em>a destination.</em></h1><p>Targets become much easier to execute when the monthly runway is visible.</p></div><div className="goal-orbit"><b>{rows.length}</b><span>active goals</span></div></div><div className="two-col"><Panel title="Create goal" sub="Set a target and make the runway visible"><div className="form-grid"><input placeholder="Goal name" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/><input type="number" placeholder="Target amount" value={f.target_amount} onChange={e=>setF({...f,target_amount:+e.target.value})}/><input type="number" placeholder="Already saved" value={f.current_amount} onChange={e=>setF({...f,current_amount:+e.target.value})}/><input type="date" value={f.target_date} onChange={e=>setF({...f,target_date:e.target.value})}/><button className="primary-btn" onClick={add}>Create goal</button></div></Panel><Panel title="Goal runway" sub="Progress at a glance"><div className="goals-grid">{rows.map(g=><div className="goal-card" key={g.id}><div className="goal-icon"><Icons.Target size={20}/></div><div className="goal-top"><b>{g.name}</b><span>{pct(g.progress)}</span></div><div className="bar large"><span style={{width:`${Math.min(100,g.progress||0)}%`}}/></div><div className="goal-bottom"><span>{money(g.current)} saved</span><b>{money(g.target)}</b></div></div>)}{!rows.length&&<Empty text="Your first goal will appear here."/>}</div></Panel></div></>}
function NetWorth(){const r=useData(()=>api('/networth'),[]),[a,setA]=useState({name:'',asset_type:'Cash',value:0}),[l,setL]=useState({name:'',liability_type:'Loan',balance:0});if(r.loading)return <Loading/>;if(r.error)return <ErrorCard message={r.error} onRetry={r.refresh}/>;const d=r.data||{totals:{},assets:[],liabilities:[]},t=d.totals||{};return <><div className="net-hero"><div><span className="eyebrow">WEALTH POSITION</span><h1>{money(t.networth)}</h1><p>Assets minus liabilities, including tracked investments.</p></div><div className="net-orb"><Icons.Gem size={42}/></div></div><div className="three-col"><Panel title="Assets" sub={`${(d.assets||[]).length} tracked`}><div className="simple-list">{(d.assets||[]).map(x=><div key={x.id}><span>{x.name}</span><b>{money(x.value)}</b></div>)}{!(d.assets||[]).length&&<Empty text="No assets yet."/>}</div><div className="form-grid compact"><input placeholder="Asset" value={a.name} onChange={e=>setA({...a,name:e.target.value})}/><input type="number" placeholder="Value" value={a.value} onChange={e=>setA({...a,value:+e.target.value})}/><button className="primary-btn" onClick={async()=>{await api('/networth/assets',{method:'POST',body:a});r.refresh()}}>Add</button></div></Panel><Panel title="Liabilities" sub={`${(d.liabilities||[]).length} tracked`}><div className="simple-list">{(d.liabilities||[]).map(x=><div key={x.id}><span>{x.name}</span><b>{money(x.balance)}</b></div>)}{!(d.liabilities||[]).length&&<Empty text="No liabilities yet."/>}</div><div className="form-grid compact"><input placeholder="Liability" value={l.name} onChange={e=>setL({...l,name:e.target.value})}/><input type="number" placeholder="Balance" value={l.balance} onChange={e=>setL({...l,balance:+e.target.value})}/><button className="primary-btn" onClick={async()=>{await api('/networth/liabilities',{method:'POST',body:l});r.refresh()}}>Add</button></div></Panel><Panel title="Wealth mix" sub="Gross assets versus liabilities"><div className="net-mix"><div className="mix-number">{money(t.assets)}</div><div className="mix-bar"><span style={{width:`${t.assets?Math.min(100,t.liabilities/t.assets*100):0}%`}}/></div><small>Liabilities are {t.assets?pct(t.liabilities/t.assets*100):'0%'} of gross assets.</small></div></Panel></div></>}
function Simulation(){
 const [f,setF]=useState({monthly:10000,years:5,annual_return:12,inflation:6});
 const r=useData(()=>api('/simulate',{method:'POST',body:f}),[f.monthly,f.years,f.annual_return,f.inflation]);
 const d=r.data;
 const update=(key,value)=>setF(prev=>({...prev,[key]:value}));
 if(r.loading&&!d)return <Loading label="Building scenarios…"/>;
 if(r.error&&!d)return <ErrorCard message={r.error} onRetry={r.refresh}/>;
 return <>
  <div className="sim-header">
   <div className="sim-intro">
    <span className="eyebrow">FINANCIAL SIMULATOR</span>
    <h1>Model the life<br/><em>you could afford.</em></h1>
    <p>Set four assumptions, then compare your projected wealth, real purchasing power, and long-term upside in one clean view.</p>
    <div className="sim-highlights">
     <div><Icons.Zap size={15}/><span>Live calculations</span></div>
     <div><Icons.ShieldCheck size={15}/><span>Inflation aware</span></div>
     <div><Icons.TrendingUp size={15}/><span>Scenario driven</span></div>
    </div>
   </div>
   <div className="sim-card">
    <div className="sim-card-head">
      <div><b>Simulation inputs</b><span>Adjust any value — results update instantly.</span></div>
      <div className="sim-live"><i/> LIVE</div>
    </div>
    <div className="sim-controls-grid">
      <label className="sim-field sim-field-wide"><span className="sim-label"><Icons.Wallet size={14}/> Monthly investment</span><div className="sim-input"><b>₹</b><input type="number" min="0" step="500" value={f.monthly} onChange={e=>update('monthly',Math.max(0,+e.target.value||0))}/></div><small>How much you invest every month</small></label>
      <label className="sim-field"><span className="sim-label"><Icons.CalendarDays size={14}/> Time horizon</span><div className="sim-input"><input type="number" min="1" max="60" value={f.years} onChange={e=>update('years',Math.min(60,Math.max(1,+e.target.value||1)))}/><b>yrs</b></div><small>Investment duration</small></label>
      <label className="sim-field"><span className="sim-label"><Icons.TrendingUp size={14}/> Expected return</span><div className="sim-input"><input type="number" min="0" max="50" step="0.5" value={f.annual_return} onChange={e=>update('annual_return',Math.min(50,Math.max(0,+e.target.value||0)))}/><b>%</b></div><small>Expected yearly return</small></label>
      <label className="sim-field"><span className="sim-label"><Icons.Activity size={14}/> Inflation</span><div className="sim-input"><input type="number" min="0" max="25" step="0.5" value={f.inflation} onChange={e=>update('inflation',Math.min(25,Math.max(0,+e.target.value||0)))}/><b>%</b></div><small>Estimated annual inflation</small></label>
    </div>
    <div className="sim-card-foot"><span><Icons.Info size={14}/> Tip: higher returns mean higher uncertainty.</span><span>₹{Number(f.monthly||0).toLocaleString('en-IN')} / month</span></div>
   </div>
  </div>
  {d&&<>
   <div className="scenario-grid">{(d.scenarios||[]).map((s,i)=><div className={'scenario '+(i===1?'featured':'')} key={i}><span>{s.name}</span><strong>{money(s.value)}</strong><small>{(Number(s.rate||0)*100).toFixed(0)}% assumption</small><b>{i===1?'Recommended baseline':i===0?'Conservative path':'Higher-growth path'}</b></div>)}</div>
   <div className="two-col"><Panel title="Compounding trajectory" sub="Base case"><div className="trajectory">{(d.monthly_series||[]).slice(0,24).map((x,i)=><div key={i} style={{height:`${Math.max(6,Math.min(100,Number(x.value||0)/(Math.max(...(d.monthly_series||[]).map(y=>Number(y.value||0)),1))*100))}%`}} title={`${x.month}: ${money(x.value)}`}/>)}</div></Panel><Panel title="FinSight verdict" sub="Model interpretation"><div className="verdict"><div className="verdict-icon"><Icons.Sparkles/></div><div><b>Base case: {money(d.gain_base)} modeled growth.</b><p>You contribute {money(d.invested)} over {f.years} years. Inflation-adjusted modeled value: {money(d.inflation_adjusted_base)}.</p></div></div></Panel></div>
  </>}
 </>
}
function Reports(){const r=useData(()=>api('/report'),[]);if(r.loading)return <Loading/>;if(r.error)return <ErrorCard message={r.error} onRetry={r.refresh}/>;const d=r.data||{categories:{},income:0,expense:0,net:0,anomalies:0};return <><div className="report-cover"><span className="eyebrow">MONTHLY INTELLIGENCE REPORT</span><h1>Your financial<br/><em>signal, condensed.</em></h1><p>Generated from your imported transaction universe.</p><button className="primary-btn" onClick={()=>window.print()}><Icons.Printer size={17}/> Print / Save PDF</button></div><div className="stat-grid"><Stat label="Income" value={money(d.income)} change="Imported" icon={Icons.ArrowDownLeft}/><Stat label="Expense" value={money(d.expense)} change="Imported" icon={Icons.ArrowUpRight}/><Stat label="Net" value={money(d.net)} change="Income minus expense" icon={Icons.Scale}/><Stat label="Anomalies" value={d.anomalies} change="Flagged events" icon={Icons.TriangleAlert}/></div><Panel title="Category intelligence" sub="Where the money went"><div className="report-bars">{Object.entries(d.categories||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=><div key={k}><div><b>{k}</b><span>{money(v)}</span></div><div className="bar"><span style={{width:`${d.expense?Math.min(100,v/d.expense*100):0}%`}}/></div></div>)}</div></Panel></>}
function AILab(){const s=useData(()=>api('/ai/status'),[]),p=useData(()=>api('/ai/predictions'),[]);const [insights,setInsights]=useState(null),[busy,setBusy]=useState(false);async function loadInsights(){setBusy(true);try{setInsights(await api('/ai/insights'))}finally{setBusy(false)}}useEffect(()=>{loadInsights()},[]);return <><div className="ai-hero"><div><span className="eyebrow">NVIDIA AI FINANCIAL INTELLIGENCE</span><h1>Your money,<br/><em>with an AI copilot.</em></h1><p>Ask questions, get explanations, and turn raw activity into concrete next actions.</p><button className="primary-btn ai-open" onClick={()=>window.dispatchEvent(new CustomEvent('open-finsight-chat'))}><Icons.Bot size={17}/> Open AI Chat</button></div><div className="ai-core"><div className="ai-ring"><Icons.Bot size={42}/></div><span>{s.data?.configured?'NVIDIA API CONNECTED':'NVIDIA API NOT CONFIGURED'}</span><small>{s.data?.model||'Add NVIDIA_API_KEY to backend/.env'}</small></div></div><div className="two-col"><Panel title="AI predictions" sub="Fast model-independent signals from your financial history">{p.loading?<Loading/>:p.error?<ErrorCard message={p.error} onRetry={p.refresh}/>:<div className="ai-predictions">{(p.data?.cards||[]).map((x,i)=><div className={'ai-prediction '+(x.severity||'info')} key={i}><div className="prediction-icon"><Icons.TrendingUp size={20}/></div><div><span>{x.label}</span><b>{x.value}</b><p>{x.detail}</p></div></div>)}</div>}</Panel><Panel title="NVIDIA financial readout" sub="Fresh AI interpretation of your current dataset" action={<button className="icon-btn" onClick={loadInsights}><Icons.RefreshCw size={16}/> Refresh</button>}>{busy?<Loading label="NVIDIA is analyzing your data…"/>:<div className="ai-readout">{(insights?.items||[]).map((x,i)=><div key={i} className="readout-item"><div className="severity info"><Icons.Sparkles size={16}/></div><div><b>{x.title}</b><RichText content={x.detail}/></div></div>)}</div>}</Panel></div><Panel title="AI capabilities" sub="Built into the FinSight workspace"><div className="ai-cap-grid"><div><Icons.Activity/><b>Cash-flow prediction</b><span>Estimate the next month from your imported behavior.</span></div><div><Icons.TriangleAlert/><b>Anomaly explanations</b><span>Explain unusual transactions and recurring spend.</span></div><div><Icons.Target/><b>Goal planning</b><span>Translate a target into a contribution plan.</span></div><div><Icons.Sparkles/><b>Scenario reasoning</b><span>Compare financial simulation assumptions conversationally.</span></div></div></Panel></>}
function Profile(){
 const [profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[avatarBusy,setAvatarBusy]=useState(false),[toast,setToast]=useState(''),[error,setError]=useState('');
 const [form,setForm]=useState({name:'',phone:'',date_of_birth:'',occupation:'',location:''});
 const [verify,setVerify]=useState({email:{code:'',busy:false},phone:{code:'',busy:false}});
 const load=async()=>{setLoading(true);setError('');try{const d=await api('/me');setProfile(d);setForm({name:d.name||'',phone:d.phone||'',date_of_birth:d.date_of_birth||'',occupation:d.occupation||'',location:d.location||''});localStorage.setItem('finsight_user',JSON.stringify(d));window.dispatchEvent(new Event('finsight-user-updated'));}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3800);return()=>clearTimeout(t)},[toast]);
 const update=(key,val)=>setForm(prev=>({...prev,[key]:val}));
 async function save(){setSaving(true);setError('');try{const payload={...form,date_of_birth:form.date_of_birth||null};const d=await api('/profile',{method:'PUT',body:payload});setProfile(d);setForm({name:d.name||'',phone:d.phone||'',date_of_birth:d.date_of_birth||'',occupation:d.occupation||'',location:d.location||''});localStorage.setItem('finsight_user',JSON.stringify(d));window.dispatchEvent(new Event('finsight-user-updated'));setToast('Profile details saved successfully.')}catch(e){setError(e.message)}finally{setSaving(false)}}
 async function uploadAvatar(e){const file=e.target.files?.[0];if(!file)return;setAvatarBusy(true);setError('');try{const fd=new FormData();fd.append('file',file);const d=await api('/profile/avatar',{method:'POST',body:fd});setProfile(d.user);localStorage.setItem('finsight_user',JSON.stringify(d.user));window.dispatchEvent(new Event('finsight-user-updated'));setToast('Profile photo updated.')}catch(err){setError(err.message)}finally{setAvatarBusy(false);e.target.value=''}}
 async function removeAvatar(){setAvatarBusy(true);setError('');try{const d=await api('/profile/avatar',{method:'DELETE'});setProfile(d.user);localStorage.setItem('finsight_user',JSON.stringify(d.user));window.dispatchEvent(new Event('finsight-user-updated'));setToast('Profile photo removed.')}catch(err){setError(err.message)}finally{setAvatarBusy(false)}}
 async function sendCode(channel){setVerify(v=>({...v,[channel]:{...v[channel],busy:true}}));setError('');try{const d=await api('/profile/verification/send',{method:'POST',body:{channel}});setVerify(v=>({...v,[channel]:{...v[channel],busy:false}}));setToast(d.message||'Verification code sent.')}catch(e){setVerify(v=>({...v,[channel]:{...v[channel],busy:false}}));setError(e.message)}}
 async function verifyCode(channel){const code=verify[channel].code.trim();if(code.length!==6)return;setVerify(v=>({...v,[channel]:{...v[channel],busy:true}}));setError('');try{const d=await api('/profile/verification/verify',{method:'POST',body:{channel,code}});setProfile(d.user);localStorage.setItem('finsight_user',JSON.stringify(d.user));window.dispatchEvent(new Event('finsight-user-updated'));setVerify(v=>({...v,[channel]:{code:'',busy:false}}));setToast(d.message)}catch(e){setVerify(v=>({...v,[channel]:{...v[channel],busy:false}}));setError(e.message)}}
 if(loading)return <Loading label="Loading your profile…"/>;
 if(error&&!profile)return <ErrorCard message={error} onRetry={load}/>;
 const avatar=profile?.avatar_url?mediaUrl(profile.avatar_url):'';
 return <div className="profile-page">
   <div className="profile-hero-card">
     <div className="profile-avatar-wrap"><div className="profile-avatar-lg">{avatar?<img src={avatar} alt="Profile"/>:<span>{(profile?.name||'F').slice(0,1).toUpperCase()}</span>}{avatarBusy&&<div className="avatar-spinner"><div className="loader small"/></div>}</div><div className="avatar-actions"><label className="avatar-upload" title="Change profile photo"><Icons.Camera size={16}/><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar}/></label>{avatar&&<button className="avatar-remove" title="Remove profile photo" onClick={removeAvatar}><Icons.Trash2 size={16}/></button>}</div></div>
     <div className="profile-hero-copy"><span className="eyebrow">PERSONAL PROFILE</span><h1>{profile?.name||'Your profile'}</h1><p>{profile?.email}</p><div className="profile-badges"><span className={profile?.email_verified?'verified':'pending'}><Icons.MailCheck size={14}/>{profile?.email_verified?'Email verified':'Email not verified'}</span><span className={profile?.phone_verified?'verified':'pending'}><Icons.Phone size={14}/>{profile?.phone_verified?'Phone verified':'Phone not verified'}</span></div></div>
     <div className="profile-hero-action"><button className="secondary-btn" onClick={()=>document.getElementById('personal-details')?.scrollIntoView({behavior:'smooth'})}><Icons.Pencil size={16}/> Edit details</button></div>
   </div>
   <div className="profile-layout">
     <div className="profile-main">
       <Panel title="Personal details" sub="Keep your FinSight identity and contact details up to date.">
        {error&&<div className="error profile-error">{error}</div>}
        <div className="profile-form" id="personal-details">
          <label><span>Full name</span><input value={form.name} onChange={e=>update('name',e.target.value)} placeholder="Your full name"/></label>
          <label><span>Email address</span><div className="input-with-status"><input value={profile?.email||''} readOnly/><i className={profile?.email_verified?'ok':'not-ok'}>{profile?.email_verified?<Icons.BadgeCheck size={16}/>:<Icons.ShieldAlert size={16}/>}</i></div><small>Email is your login identity and cannot be changed here.</small></label>
          <label><span>Mobile number</span><input value={form.phone} onChange={e=>update('phone',e.target.value)} placeholder="e.g. +91 98XXXXXX12"/></label>
          <label><span>Date of birth</span><input type="date" value={form.date_of_birth} onChange={e=>update('date_of_birth',e.target.value)}/></label>
          <label><span>Occupation</span><input value={form.occupation} onChange={e=>update('occupation',e.target.value)} placeholder="e.g. Sales Officer"/></label>
          <label><span>City / location</span><input value={form.location} onChange={e=>update('location',e.target.value)} placeholder="e.g. Mumbai, India"/></label>
        </div>
        <div className="profile-form-foot"><span><Icons.LockKeyhole size={15}/> Your profile details are stored in your FinSight PostgreSQL account.</span><button className="primary-btn" onClick={save} disabled={saving}>{saving?'Saving…':'Save changes'}<Icons.Check size={17}/></button></div>
       </Panel>
     </div>
     <div className="profile-side">
       <Panel title="Verification center" sub="Verify the contact methods used for account security.">
        <div className="verify-card"><div className="verify-icon"><Icons.MailCheck size={19}/></div><div className="verify-copy"><div><b>Email address</b>{profile?.email_verified?<span className="verify-status success">Verified</span>:<span className="verify-status">Pending</span>}</div><small>{profile?.email}</small>{!profile?.email_verified&&<div className="verify-actions"><button className="secondary-btn mini" onClick={()=>sendCode('email')} disabled={verify.email.busy}>{verify.email.busy?'Sending…':'Send verification code'}</button><div className="verify-input"><input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={verify.email.code} onChange={e=>setVerify(v=>({...v,email:{...v.email,code:e.target.value.replace(/\D/g,'').slice(0,6)}}))}/><button className="primary-btn mini" onClick={()=>verifyCode('email')} disabled={verify.email.busy||verify.email.code.length!==6}>Verify</button></div></div>}</div></div>
        <div className="verify-card"><div className="verify-icon"><Icons.PhoneCall size={19}/></div><div className="verify-copy"><div><b>Mobile number</b>{profile?.phone_verified?<span className="verify-status success">Verified</span>:<span className="verify-status">Pending</span>}</div><small>{profile?.phone||'Add a phone number in Personal details.'}</small>{!profile?.phone_verified&&profile?.phone&&<div className="verify-actions"><button className="secondary-btn mini" onClick={()=>sendCode('phone')} disabled={verify.phone.busy}>{verify.phone.busy?'Sending…':'Send SMS code'}</button><div className="verify-input"><input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={verify.phone.code} onChange={e=>setVerify(v=>({...v,phone:{...v.phone,code:e.target.value.replace(/\D/g,'').slice(0,6)}}))}/><button className="primary-btn mini" onClick={()=>verifyCode('phone')} disabled={verify.phone.busy||verify.phone.code.length!==6}>Verify</button></div></div>}</div></div>
       </Panel>
       <Panel title="Account security" sub="FinSight account metadata.">
         <div className="security-list"><div><span>Account status</span><b><i className="status-dot"/> Active</b></div><div><span>Member since</span><b>{profile?.created_at?new Date(profile.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}</b></div><div><span>Authentication</span><b>JWT + secure hash</b></div></div>
       </Panel>
     </div>
   </div>
   {toast&&<div className="profile-toast"><Icons.CheckCircle2 size={18}/><span>{toast}</span><button onClick={()=>setToast('')}><Icons.X size={15}/></button></div>}
 </div>
}

function NotFound(){return <div className="inline-error"><div className="error-icon"><Icons.Compass size={20}/></div><div><b>Workspace not found</b><p>This route does not exist.</p><button className="primary-btn mini" onClick={()=>navigate('/')}>Go to overview</button></div></div>}
function App(){
  const route=useRoute();
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('finsight_user')||'null')}catch{return null}});
  const [oauthBusy,setOauthBusy]=useState(route==='/oauth/callback');
  const [oauthError,setOauthError]=useState('');
  useEffect(()=>{
    if(!route.startsWith('/oauth/callback')) return;
    const hash=window.location.hash||''; const q=hash.includes('?')?hash.split('?')[1]:''; const params=new URLSearchParams(q); const token=params.get('token'); const error=params.get('error');
    if(error){setOauthBusy(false);setOauthError(error);navigate('/');return;}
    if(!token){setOauthBusy(false);setOauthError('Google sign-in did not return a valid session.');navigate('/');return;}
    localStorage.setItem('finsight_token',token);
    api('/me').then(d=>{localStorage.setItem('finsight_user',JSON.stringify(d));setUser(d);navigate('/')}).catch(e=>{localStorage.removeItem('finsight_token');setOauthError(e.message||'Could not finish Google sign-in.');navigate('/')}).finally(()=>setOauthBusy(false));
  },[route]);
  if(oauthBusy)return <div className="loading auth-loading"><div className="loader"/><span>Completing secure Google sign-in…</span></div>;
  if(!user)return <PublicAuth onDone={setUser}/>;
  const logout=()=>{localStorage.removeItem('finsight_token');localStorage.removeItem('finsight_user');setUser(null);navigate('/')};
  return <Shell user={user} onLogout={logout}/>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
