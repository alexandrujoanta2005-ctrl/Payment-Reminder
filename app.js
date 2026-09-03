const STORAGE_KEY='bani_de_primit_v1';
const HISTORY_KEY='bani_de_primit_history_v1';
const NOTIFIED_KEY='bani_de_primit_notified_v1';
const CLOUD_CONFIG_KEY='payment_reminder_cloud_config_v1';
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const state={payments:load(STORAGE_KEY,[]),history:load(HISTORY_KEY,[])};
const cloud={client:null,user:null,ready:false,pushReady:false,busy:false};

function load(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function save({sync=true}={}){localStorage.setItem(STORAGE_KEY,JSON.stringify(state.payments));localStorage.setItem(HISTORY_KEY,JSON.stringify(state.history));renderAll();if(sync)queueCloudSync()}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function fmtMoney(v,c='RON'){try{return new Intl.NumberFormat('ro-RO',{style:'currency',currency:c,maximumFractionDigits:2}).format(Number(v)||0)}catch{return `${v} ${c}`}}
function fmtDate(date,time){const d=new Date(`${date}T${time||'00:00'}`);return d.toLocaleString('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>e.classList.remove('show'),2600)}
function nextDate(date,rec){const d=new Date(`${date}T12:00:00`);if(rec==='monthly')d.setMonth(d.getMonth()+1);if(rec==='yearly')d.setFullYear(d.getFullYear()+1);return d.toISOString().slice(0,10)}
function isOverdue(p){return new Date(`${p.dueDate}T${p.dueTime}`)<new Date()}
function totalByCurrency(items){const map={};items.forEach(p=>map[p.currency]=(map[p.currency]||0)+Number(p.amount||0));return Object.entries(map).map(([c,v])=>fmtMoney(v,c)).join(' + ')||'0 lei'}
function renderAll(){renderHome();renderFriends();renderHistory();updateNotifStatus();updateCloudStatus()}

function renderHome(){const active=[...state.payments].sort((a,b)=>new Date(`${a.dueDate}T${a.dueTime}`)-new Date(`${b.dueDate}T${b.dueTime}`));const overdue=active.filter(isOverdue);$('#totalDue').textContent=totalByCurrency(active);$('#dueCount').textContent=`${active.length} ${active.length===1?'plată activă':'plăți active'}`;$('#overdueTotal').textContent=totalByCurrency(overdue);$('#overdueCount').textContent=`${overdue.length} ${overdue.length===1?'restanță':'restante'}`;const box=$('#upcomingList');box.innerHTML='';if(!active.length){box.innerHTML='<div class="empty">Nu ai nimic de primit. Apasă „Adaugă” și creează prima plată.</div>';return}active.forEach(p=>box.append(paymentCard(p)))}
function paymentCard(p){const el=document.createElement('article');el.className='payment-card'+(isOverdue(p)?' overdue':'');el.dataset.id=p.id;el.innerHTML=`<div><div class="name"></div><div class="service"></div><div class="meta"><span class="chip due"></span><span class="chip recurrence"></span>${isOverdue(p)?'<span class="chip overdue">Restant</span>':''}</div></div><div class="amount"></div><div class="card-actions"><button class="snooze-btn" data-action="snooze">Amintește peste 1h</button><button class="paid-btn" data-action="paid">✓ Plătit</button></div>`;el.querySelector('.name').textContent=p.friend;el.querySelector('.service').textContent=p.service;el.querySelector('.due').textContent=fmtDate(p.dueDate,p.dueTime);el.querySelector('.recurrence').textContent=p.recurrence==='monthly'?'Lunar':p.recurrence==='yearly'?'Anual':'O dată';el.querySelector('.amount').textContent=fmtMoney(p.amount,p.currency);el.addEventListener('click',e=>{const a=e.target.dataset.action;if(a==='paid'){e.stopPropagation();markPaid(p.id)}else if(a==='snooze'){e.stopPropagation();snooze(p.id)}else openDialog(p)});return el}
function renderFriends(){const map={};state.payments.forEach(p=>{if(!map[p.friend])map[p.friend]=[];map[p.friend].push(p)});const box=$('#friendsList');box.innerHTML='';const names=Object.keys(map).sort();if(!names.length){box.innerHTML='<div class="empty">Prietenii vor apărea aici după ce adaugi plăți.</div>';return}names.forEach(n=>{const el=document.createElement('article');el.className='friend-card';el.innerHTML='<div><strong></strong><small></small></div><b></b>';el.querySelector('strong').textContent=n;el.querySelector('small').textContent=`${map[n].length} ${map[n].length===1?'plată':'plăți'} active`;el.querySelector('b').textContent=totalByCurrency(map[n]);box.append(el)})}
function renderHistory(){const box=$('#historyList');box.innerHTML='';const items=[...state.history].sort((a,b)=>new Date(b.paidAt)-new Date(a.paidAt));if(!items.length){box.innerHTML='<div class="empty">Încă nu ai plăți marcate ca primite.</div>';return}items.forEach(h=>{const el=document.createElement('article');el.className='history-card';el.innerHTML='<div class="line"><strong></strong><b></b></div><small></small>';el.querySelector('strong').textContent=`${h.friend} · ${h.service}`;el.querySelector('b').textContent=fmtMoney(h.amount,h.currency);el.querySelector('small').textContent=`Primit la ${new Date(h.paidAt).toLocaleString('ro-RO')}`;box.append(el)})}

function openDialog(p=null){$('#paymentForm').reset();$('#paymentId').value=p?.id||'';$('#dialogTitle').textContent=p?'Modifică plata':'Adaugă plată';$('#deleteBtn').classList.toggle('hidden',!p);if(p){$('#friendName').value=p.friend;$('#serviceName').value=p.service;$('#amount').value=p.amount;$('#currency').value=p.currency;$('#dueDate').value=p.dueDate;$('#dueTime').value=p.dueTime;$('#reminderDate').value=p.reminderDate;$('#reminderTime').value=p.reminderTime;$('#recurrence').value=p.recurrence;$('#note').value=p.note||''}else{const d=new Date();d.setDate(d.getDate()+1);const ds=d.toISOString().slice(0,10);$('#dueDate').value=ds;$('#reminderDate').value=ds;$('#dueTime').value='18:00';$('#reminderTime').value='18:00'}$('#paymentDialog').showModal()}
$('#paymentForm').addEventListener('submit',e=>{e.preventDefault();const data={id:$('#paymentId').value||uid(),friend:$('#friendName').value.trim(),service:$('#serviceName').value.trim(),amount:Number($('#amount').value),currency:$('#currency').value,dueDate:$('#dueDate').value,dueTime:$('#dueTime').value,reminderDate:$('#reminderDate').value,reminderTime:$('#reminderTime').value,recurrence:$('#recurrence').value,note:$('#note').value.trim(),updatedAt:new Date().toISOString()};const i=state.payments.findIndex(x=>x.id===data.id);if(i>=0)state.payments[i]=data;else state.payments.push(data);save({sync:false});syncPayment(data);$('#paymentDialog').close();toast('Plata a fost salvată')});
$('#deleteBtn').addEventListener('click',()=>{const id=$('#paymentId').value;if(!id)return;state.payments=state.payments.filter(p=>p.id!==id);save({sync:false});deleteCloudPayment(id);$('#paymentDialog').close();toast('Plata a fost ștearsă')});
$('#closeDialog').addEventListener('click',()=>$('#paymentDialog').close());
function markPaid(id){const i=state.payments.findIndex(p=>p.id===id);if(i<0)return;const p=state.payments[i];state.history.push({...p,paidAt:new Date().toISOString()});if(p.recurrence==='once'){state.payments.splice(i,1);deleteCloudPayment(id)}else{const nextDue=nextDate(p.dueDate,p.recurrence);const nextRem=nextDate(p.reminderDate,p.recurrence);state.payments[i]={...p,dueDate:nextDue,reminderDate:nextRem,updatedAt:new Date().toISOString()};syncPayment(state.payments[i])}save({sync:false});toast(p.recurrence==='once'?'Marcat ca plătit':'Plătit. Am pregătit următoarea scadență')}
function snooze(id){const p=state.payments.find(x=>x.id===id);if(!p)return;const d=new Date(Date.now()+3600000);p.reminderDate=localDate(d);p.reminderTime=localTime(d);p.updatedAt=new Date().toISOString();save({sync:false});syncPayment(p);toast('Te voi atenționa din nou peste aproximativ o oră')}
function localDate(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function localTime(d){return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}

$$('.bottom-nav button[data-view]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.view;$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.bottom-nav button[data-view]').forEach(x=>x.classList.toggle('active',x===b));window.scrollTo({top:0,behavior:'smooth'})}));
$('#addNavBtn').addEventListener('click',()=>openDialog());$('#addTopBtn').addEventListener('click',()=>openDialog());

function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
async function enableNotifications(){
  if(!('Notification'in window)){toast('Acest browser nu suportă notificări web');return}
  if(isIOS()&&!isStandalone()){toast('Pe iPhone: Adaugă aplicația pe ecranul principal, apoi activează notificările');return}
  const p=await Notification.requestPermission();updateNotifStatus();
  if(p!=='granted'){toast('Permisiunea pentru notificări nu a fost acordată');return}
  toast('Permisiunea este activă');
  if(hasCloudConfig()){
    const ok=await initCloud({subscribe:true,showErrors:true});
    if(ok&&cloud.pushReady)toast('Notificările în fundal sunt active');
  }else{
    await sendNotification('Payment Reminder','Notificările locale sunt active. Configurează Push Cloud pentru notificări cu aplicația închisă.');
  }
}
function updateNotifStatus(){const s=$('#notifStatus');if(!('Notification'in window)){s.textContent='Nesuportate';return}s.textContent=Notification.permission==='granted'?'Permise':Notification.permission==='denied'?'Blocate':'Neactivate'}
async function sendNotification(title,body){if(Notification.permission!=='granted')return;try{const reg=await navigator.serviceWorker.ready;await reg.showNotification(title,{body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:'payment-reminder-local'})}catch{try{new Notification(title,{body})}catch{}}}
$('#notifBtn').addEventListener('click',enableNotifications);$('#enableNotifBtn').addEventListener('click',enableNotifications);
$('#testNotifBtn').addEventListener('click',async()=>{if(Notification.permission!=='granted')await enableNotifications();if(Notification.permission!=='granted')return;if(cloud.pushReady){const ok=await sendCloudTestPush();if(ok){toast('Test push trimis prin server');return}}await sendNotification('💰 Test notificare','Funcționează local. Pentru test cu aplicația închisă configurează Push Cloud.')});

function checkReminders(){if(Notification.permission!=='granted'||cloud.pushReady)return;const now=Date.now();const notified=load(NOTIFIED_KEY,{});let changed=false;state.payments.forEach(p=>{const t=new Date(`${p.reminderDate}T${p.reminderTime}`).getTime();const key=`${p.id}:${p.reminderDate}:${p.reminderTime}`;if(t<=now&&now-t<6*60*60*1000&&!notified[key]){sendNotification(`💰 ${p.friend} trebuie să-ți dea bani`,`${fmtMoney(p.amount,p.currency)} pentru ${p.service}. Scadență: ${fmtDate(p.dueDate,p.dueTime)}.`);notified[key]=Date.now();changed=true}});if(changed)localStorage.setItem(NOTIFIED_KEY,JSON.stringify(notified))}
setInterval(checkReminders,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkReminders()});

$('#exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({payments:state.payments,history:state.history,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`payment-reminder-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)});
$('#importInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.payments)||!Array.isArray(data.history))throw new Error();state.payments=data.payments;state.history=data.history;save();toast('Backup importat')}catch{toast('Fișier de backup invalid')}e.target.value=''});

// ---------- PUSH CLOUD / SUPABASE ----------
function getCloudConfig(){return load(CLOUD_CONFIG_KEY,{supabaseUrl:'',supabaseKey:'',vapidPublicKey:''})}
function cleanCloudConfig(c){return {supabaseUrl:(c.supabaseUrl||'').trim().replace(/\/+$/,''),supabaseKey:(c.supabaseKey||'').trim(),vapidPublicKey:(c.vapidPublicKey||'').trim()}}
function hasCloudConfig(){const c=cleanCloudConfig(getCloudConfig());return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.supabaseUrl)&&c.supabaseKey.length>20&&c.vapidPublicKey.length>20}
function updateCloudStatus(){const s=$('#pushCloudStatus');const b=$('#pushCloudBtn');if(!s||!b)return;if(cloud.pushReady){s.textContent='Activ — notificări și cu aplicația închisă';b.textContent='Configurat'}else if(cloud.ready){s.textContent=Notification.permission==='granted'?'Conectat — activează Push':'Conectat — permite notificările';b.textContent='Editează'}else if(hasCloudConfig()){s.textContent='Configurat — conectare în curs';b.textContent='Editează'}else{s.textContent='Neconfigurat';b.textContent='Configurează'}}
function openCloudDialog(){const c=getCloudConfig();$('#cloudSupabaseUrl').value=c.supabaseUrl||'';$('#cloudSupabaseKey').value=c.supabaseKey||'';$('#cloudVapidKey').value=c.vapidPublicKey||'';$('#cloudDialog').showModal()}
$('#pushCloudBtn').addEventListener('click',openCloudDialog);$('#closeCloudDialog').addEventListener('click',()=>$('#cloudDialog').close());
$('#cloudForm').addEventListener('submit',async e=>{e.preventDefault();const c=cleanCloudConfig({supabaseUrl:$('#cloudSupabaseUrl').value,supabaseKey:$('#cloudSupabaseKey').value,vapidPublicKey:$('#cloudVapidKey').value});localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify(c));cloud.client=null;cloud.user=null;cloud.ready=false;cloud.pushReady=false;$('#cloudDialog').close();updateCloudStatus();const ok=await initCloud({subscribe:Notification.permission==='granted',showErrors:true});if(ok)toast(cloud.pushReady?'Push Cloud este activ':'Supabase conectat. Activează notificările.')});
$('#clearCloudBtn').addEventListener('click',async()=>{try{if(cloud.client&&cloud.user){const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub){await cloud.client.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);await sub.unsubscribe()}}}catch{}localStorage.removeItem(CLOUD_CONFIG_KEY);cloud.client=null;cloud.user=null;cloud.ready=false;cloud.pushReady=false;$('#cloudDialog').close();updateCloudStatus();toast('Configurarea Push Cloud a fost ștearsă')});

async function initCloud({subscribe=false,showErrors=false,merge=true}={}){
  if(cloud.busy)return cloud.ready;
  if(!hasCloudConfig()){updateCloudStatus();return false}
  if(!window.supabase?.createClient){if(showErrors)toast('Biblioteca Supabase nu s-a încărcat. Verifică internetul.');return false}
  cloud.busy=true;
  try{
    const c=cleanCloudConfig(getCloudConfig());
    if(!cloud.client)cloud.client=window.supabase.createClient(c.supabaseUrl,c.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    let {data:{session},error}=await cloud.client.auth.getSession();
    if(error)throw error;
    if(!session){const r=await cloud.client.auth.signInAnonymously();if(r.error)throw r.error;session=r.data.session}
    cloud.user=session?.user||null;
    if(!cloud.user)throw new Error('Nu s-a putut crea sesiunea anonimă');
    cloud.ready=true;
    if(merge)await mergeCloudReminders();
    if(subscribe&&Notification.permission==='granted')await subscribePush();
    updateCloudStatus();
    return true;
  }catch(err){cloud.ready=false;cloud.pushReady=false;console.error('Push Cloud:',err);updateCloudStatus();if(showErrors)toast(cloudErrorMessage(err));return false}finally{cloud.busy=false}
}
function cloudErrorMessage(err){const m=String(err?.message||err||'');if(/anonymous/i.test(m)||/Anonymous sign-ins/i.test(m))return 'În Supabase activează Anonymous Sign-Ins';if(/Failed to fetch|NetworkError/i.test(m))return 'Nu mă pot conecta la Supabase';return `Push Cloud: ${m.slice(0,110)}`}

function paymentToRow(p){return {id:p.id,user_id:cloud.user.id,friend_name:p.friend,service_name:p.service,amount:Number(p.amount||0),currency:p.currency||'RON',due_at:new Date(`${p.dueDate}T${p.dueTime}:00`).toISOString(),remind_at:new Date(`${p.reminderDate}T${p.reminderTime}:00`).toISOString(),recurrence:p.recurrence||'monthly',note:p.note||null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',active:true,last_notified_at:null,updated_at:p.updatedAt||new Date().toISOString()}}
function rowToPayment(r){const due=new Date(r.due_at),rem=new Date(r.remind_at);return {id:r.id,friend:r.friend_name,service:r.service_name,amount:Number(r.amount),currency:r.currency,dueDate:localDate(due),dueTime:localTime(due),reminderDate:localDate(rem),reminderTime:localTime(rem),recurrence:r.recurrence,note:r.note||'',updatedAt:r.updated_at||new Date().toISOString()}}
async function mergeCloudReminders(){if(!cloud.ready)return;const {data,error}=await cloud.client.from('reminders').select('*').eq('active',true);if(error)throw error;const localMap=new Map(state.payments.map(p=>[p.id,p]));for(const r of data||[]){const rp=rowToPayment(r),lp=localMap.get(rp.id);if(!lp||new Date(rp.updatedAt)>new Date(lp.updatedAt||0)){localMap.set(rp.id,rp)}}state.payments=[...localMap.values()];localStorage.setItem(STORAGE_KEY,JSON.stringify(state.payments));renderAll();if(state.payments.length){const rows=state.payments.map(paymentToRow);const up=await cloud.client.from('reminders').upsert(rows,{onConflict:'id'});if(up.error)throw up.error}}
let syncTimer;
function queueCloudSync(){if(!hasCloudConfig())return;clearTimeout(syncTimer);syncTimer=setTimeout(async()=>{if(!cloud.ready)await initCloud();if(!cloud.ready)return;const rows=state.payments.map(paymentToRow);if(rows.length){const {error}=await cloud.client.from('reminders').upsert(rows,{onConflict:'id'});if(error)console.warn(error)}},500)}
async function syncPayment(p){if(!hasCloudConfig())return;if(!cloud.ready)await initCloud();if(!cloud.ready)return;const {error}=await cloud.client.from('reminders').upsert(paymentToRow(p),{onConflict:'id'});if(error)console.warn('syncPayment',error)}
async function deleteCloudPayment(id){if(!hasCloudConfig())return;if(!cloud.ready)await initCloud({merge:false});if(!cloud.ready)return;const {error}=await cloud.client.from('reminders').delete().eq('id',id);if(error)console.warn('deleteCloudPayment',error)}

function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4);const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
async function subscribePush(){
  if(!cloud.ready||Notification.permission!=='granted'||!('PushManager'in window))return false;
  const c=cleanCloudConfig(getCloudConfig());
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub){sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(c.vapidPublicKey)})}
  const json=sub.toJSON();
  const row={user_id:cloud.user.id,endpoint:sub.endpoint,p256dh:json.keys?.p256dh,auth:json.keys?.auth,user_agent:navigator.userAgent,updated_at:new Date().toISOString()};
  const {error}=await cloud.client.from('push_subscriptions').upsert(row,{onConflict:'user_id,endpoint'});
  if(error)throw error;
  cloud.pushReady=true;updateCloudStatus();return true;
}
async function sendCloudTestPush(){
  try{
    if(!cloud.ready)await initCloud({subscribe:true,showErrors:true});
    if(!cloud.pushReady)return false;
    const {data:{session}}=await cloud.client.auth.getSession();
    const c=cleanCloudConfig(getCloudConfig());
    const res=await fetch(`${c.supabaseUrl}/functions/v1/send-reminders`,{method:'POST',headers:{'content-type':'application/json','apikey':c.supabaseKey,'authorization':`Bearer ${session.access_token}`},body:JSON.stringify({mode:'test'})});
    if(!res.ok)throw new Error((await res.text()).slice(0,180));
    return true;
  }catch(err){console.error(err);toast('Testul Push Cloud a eșuat');return false}
}

if('serviceWorker'in navigator)window.addEventListener('load',async()=>{try{await navigator.serviceWorker.register('service-worker.js');if(hasCloudConfig())await initCloud({subscribe:Notification.permission==='granted'})}catch(e){console.warn(e)}});
renderAll();checkReminders();
