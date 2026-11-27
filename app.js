const STORAGE_KEY='bani_de_primit_v1';
const HISTORY_KEY='bani_de_primit_history_v1';
const NOTIFIED_KEY='bani_de_primit_notified_v1';
const CLOUD_CONFIG_KEY='payment_reminder_cloud_config_v1';
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const state={payments:load(STORAGE_KEY,[]),history:load(HISTORY_KEY,[])};
const cloud={client:null,user:null,ready:false,pushReady:false,busy:false};

function load(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function save({sync=true}={}){localStorage.setItem(STORAGE_KEY,JSON.stringify(state.payments));localStorage.setItem(HISTORY_KEY,JSON.stringify(state.history));renderAll();if(sync)queueCloudSync();queueAppSync()}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
function fmtMoney(v,c='RON'){try{return new Intl.NumberFormat('ro-RO',{style:'currency',currency:c,maximumFractionDigits:2}).format(Number(v)||0)}catch{return `${v} ${c}`}}
function fmtDate(date,time){const d=new Date(`${date}T${time||'00:00'}`);return d.toLocaleString('ro-RO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>e.classList.remove('show'),2600)}
function nextDate(date,rec){const d=new Date(`${date}T12:00:00`);if(rec==='monthly')d.setMonth(d.getMonth()+1);if(rec==='yearly')d.setFullYear(d.getFullYear()+1);return d.toISOString().slice(0,10)}
function isOverdue(p){return new Date(`${p.dueDate}T${p.dueTime}`)<new Date()}
function totalByCurrency(items){const map={};items.forEach(p=>map[p.currency]=(map[p.currency]||0)+Number(p.amount||0));return Object.entries(map).map(([c,v])=>fmtMoney(v,c)).join(' + ')||'0 lei'}

const PIN_KEY='payment_reminder_pin_v1', THEME_KEY='payment_reminder_theme_v1';
function renderPro(){
 const now=new Date(), m=now.getMonth(), y=now.getFullYear();
 const month=state.payments.filter(p=>{const d=new Date(p.dueDate+'T12:00:00');return d.getMonth()===m&&d.getFullYear()===y});
 $('#monthStats').innerHTML=`<div class="mini-stat"><small>Scadențe luna aceasta</small><b>${month.length}</b></div><div class="mini-stat"><small>Total luna aceasta</small><b>${totalByCurrency(month)}</b></div><div class="mini-stat"><small>Încasate (istoric)</small><b>${totalByCurrency(state.history.filter(p=>{const d=new Date(p.paidAt);return d.getMonth()===m&&d.getFullYear()===y}))}</b></div>`;
}
function renderCalendar(){
 const panel=$('#calendarPanel');panel.classList.toggle('hidden');if(panel.classList.contains('hidden'))return;
 const now=new Date(),y=now.getFullYear(),m=now.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();
 const counts={};state.payments.forEach(p=>{if(p.dueDate.startsWith(`${y}-${String(m+1).padStart(2,'0')}`))counts[Number(p.dueDate.slice(-2))]=(counts[Number(p.dueDate.slice(-2))]||0)+1});
 panel.innerHTML=`<h3>${now.toLocaleDateString('ro-RO',{month:'long',year:'numeric'})}</h3><div class="calendar-grid">${['L','M','M','J','V','S','D'].map(x=>`<span class="weekday">${x}</span>`).join('')}${Array((first+6)%7).fill('<span></span>').join('')}${Array.from({length:days},(_,i)=>{let d=i+1;return `<span class="day ${counts[d]?'has-payment':''}">${d}${counts[d]?`<small>${counts[d]}</small>`:''}</span>`}).join('')}</div><small>Bulina violetă indică plăți programate.</small>`;
}
function exportReport(){
 const rows=[...state.payments].map(p=>`${p.friend} | ${p.service} | ${p.dueDate} | ${fmtMoney(p.amount,p.currency)} | ${isOverdue(p)?'RESTANT':'Activ'}`).join('\n');
 const w=window.open('','_blank');if(!w){toast('Permite ferestrele pop-up pentru raport');return}
 w.document.write(`<html><head><title>Raport Payment Reminder</title><style>body{font:16px system-ui;padding:30px}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #ddd;text-align:left}</style></head><body><h1>Payment Reminder – Raport</h1><p>Generat ${new Date().toLocaleDateString('ro-RO')}</p><pre>${rows.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
}
function shareWhatsApp(p){
 const tpl=localStorage.getItem('pr_default_wa_text')||'Salut {nume}, îți reamintesc de {abonament}: {suma}, scadent {data}. Mulțumesc!';
 const text=tpl.replaceAll('{nume}',p.friend).replaceAll('{abonament}',p.service).replaceAll('{suma}',fmtMoney(p.amount,p.currency)).replaceAll('{data}',p.dueDate);
 window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');
}

const MSG_KEY='payment_reminder_scheduled_whatsapp_v1';
let scheduledMessages=load(MSG_KEY,[]);
function persistMessages(){localStorage.setItem(MSG_KEY,JSON.stringify(scheduledMessages));renderScheduledMessages();queueAppSync();}
function renderScheduledMessages(){
 let box=document.getElementById('scheduledMessagesList');if(!box)return;
 box.innerHTML=scheduledMessages.length?scheduledMessages.map(m=>`<article class="payment-card"><div><b>${escapeHtml(m.person)}</b><small>${escapeHtml(m.phone)} · ${escapeHtml(m.date)} ${escapeHtml(m.time)}</small><p>${escapeHtml(m.text)}</p><div class="row-actions"><button class="secondary" data-sendmsg="${m.id}">Deschide WhatsApp</button><button class="danger" data-delmsg="${m.id}">Șterge</button></div></div></article>`).join(''):'<p class="empty">Nu ai mesaje programate.</p>';
 box.querySelectorAll('[data-sendmsg]').forEach(b=>b.onclick=()=>openScheduledWhatsApp(b.dataset.sendmsg));
 box.querySelectorAll('[data-delmsg]').forEach(b=>b.onclick=()=>{scheduledMessages=scheduledMessages.filter(x=>x.id!==b.dataset.delmsg);persistMessages()});
}
function escapeHtml(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function openScheduledWhatsApp(id){const m=scheduledMessages.find(x=>x.id===id);if(!m)return;window.open('https://wa.me/'+m.phone.replace(/\D/g,'')+'?text='+encodeURIComponent(m.text),'_blank')}
function checkScheduledMessages(){
 const now=Date.now();scheduledMessages.forEach(m=>{const t=new Date(m.date+'T'+m.time).getTime();if(t<=now&&!m.notified){m.notified=true;try{if(Notification.permission==='granted')new Notification('Mesaj WhatsApp programat',{body:'Pentru '+m.person+'. Apasă pentru a deschide WhatsApp.',tag:'wa-'+m.id})}catch{};if(!m.notifiedAt)m.notifiedAt=new Date().toISOString();}});
 localStorage.setItem(MSG_KEY,JSON.stringify(scheduledMessages));renderScheduledMessages();
}
document.getElementById('scheduleMsgBtn').addEventListener('click',()=>{
 const dlg=document.getElementById('messageDialog');document.getElementById('messageForm').reset();document.getElementById('messageId').value='';
 document.getElementById('messageDate').value=new Date().toISOString().slice(0,10);
 document.getElementById('messageTime').value='18:00';dlg.showModal();
});
document.getElementById('closeMessageDialog').addEventListener('click',()=>document.getElementById('messageDialog').close());
document.getElementById('messageForm').addEventListener('submit',e=>{
 e.preventDefault();const phone=document.getElementById('messagePhone').value.trim().replace(/\D/g,'');
 if(phone.length<8){toast('Introdu un număr WhatsApp valid, cu prefix țară.');return}
 const m={id:uid(),person:document.getElementById('messagePerson').value.trim(),phone,text:document.getElementById('messageText').value.trim(),date:document.getElementById('messageDate').value,time:document.getElementById('messageTime').value,notified:false};
 scheduledMessages.push(m);persistMessages();document.getElementById('messageDialog').close();toast('Mesaj programat! La ora aleasă primești notificare.');
});


const PREFS_KEY='payment_reminder_preferences_v1';
function loadPreferences(){const p=load(PREFS_KEY,{});$('#profileName').value=p.profileName||'';$('#defaultCurrency').value=p.currency||'RON';$('#defaultReminderTime').value=p.reminderTime||'18:00';$('#defaultWaText').value=localStorage.getItem('pr_default_wa_text')||''}
$('#savePreferences').addEventListener('click',()=>{const p={profileName:$('#profileName').value.trim(),currency:$('#defaultCurrency').value,reminderTime:$('#defaultReminderTime').value||'18:00'};localStorage.setItem(PREFS_KEY,JSON.stringify(p));localStorage.setItem('pr_default_wa_text',$('#defaultWaText').value.trim());queueAppSync();toast('Acceptat — preferințele au fost salvate')});
$('#resetPreferences').addEventListener('click',()=>{if(!confirm('Resetezi preferințele?'))return;localStorage.removeItem(PREFS_KEY);localStorage.removeItem('pr_default_wa_text');loadPreferences();toast('Preferințe resetate')});
$('#refreshAppBtn').addEventListener('click',()=>{renderAll();renderScheduledMessages();toast('Date reîmprospătate')});
$('#clearLocalBtn').addEventListener('click',()=>{if(!confirm('Ștergi toate plățile, istoricul și mesajele programate local? Această acțiune nu poate fi anulată.'))return;state.payments=[];state.history=[];scheduledMessages=[];save({sync:false});persistMessages();localStorage.removeItem(NOTIFIED_KEY);toast('Date locale șterse')});

function setupPin(){
 const gate=$('#pinGate'),input=$('#pinGateInput'),submit=$('#pinGateSubmit');
 const existing=localStorage.getItem(PIN_KEY);
 if(!sessionStorage.getItem('pin_ok')){
   gate.classList.add('visible');
   if(existing){$('#pinGateEyebrow').textContent='BINE AI REVENIT';$('#pinGateTitle').textContent='Introdu PIN-ul';$('#pinGateSubtitle').textContent='Introdu codul tău pentru a accesa aplicația.'}
   else{$('#pinGateEyebrow').textContent='CONFIGURARE INIȚIALĂ';$('#pinGateTitle').textContent='Creează un PIN';$('#pinGateSubtitle').textContent='Alege un cod de 4–6 cifre pentru a-ți proteja aplicația.'}
 }
 function unlock(){
   const value=input.value.trim();
   if(!existing && !localStorage.getItem(PIN_KEY)){
     if(!/^\d{4,6}$/.test(value)){$('#pinGateError').textContent='PIN-ul trebuie să conțină 4–6 cifre.';return}
     localStorage.setItem(PIN_KEY,value);sessionStorage.setItem('pin_ok','1');gate.classList.remove('visible');$('#pinStatus').textContent='Activ — blocare la pornire';toast('PIN configurat cu succes');return;
   }
   if(value===localStorage.getItem(PIN_KEY)){sessionStorage.setItem('pin_ok','1');gate.classList.remove('visible');$('#pinGateError').textContent='';}
   else{$('#pinGateError').textContent='PIN incorect. Încearcă din nou.';input.value='';input.focus()}
 }
 submit.addEventListener('click',unlock);input.addEventListener('keydown',e=>{if(e.key==='Enter')unlock()});

 // Recuperare PIN: butonul este prezent direct în index.html.
 const forgotPinButton=$('#pinForgotBtn');
 if(forgotPinButton){
 forgotPinButton.onclick=async(event)=>{
   event.preventDefault();
   if(forgotPinButton.disabled)return;
   forgotPinButton.disabled=true;
   const oldText=forgotPinButton.textContent;
   forgotPinButton.textContent='Verific contul…';
   try{
     const {data,error}=await appClient().auth.getSession();
     if(error)throw error;
     const user=data.session?.user||null;
     setAccountUi(user);
     if(!user||user.is_anonymous||!user.email){
       toast('Pentru resetarea PIN-ului trebuie să fii conectat cu un cont Google cu e-mail.');
       return;
     }
     const confirmed=window.confirm(`Vom trimite un cod de verificare la ${user.email}. Continui?`);
     if(!confirmed)return;
     forgotPinButton.textContent='Se trimite codul…';
     const {error:sendError}=await appClient().auth.signInWithOtp({
       email:user.email,
       options:{shouldCreateUser:false}
     });
     if(sendError)throw sendError;
     const otp=window.prompt(`Introdu codul primit pe e-mailul ${user.email}:`);
     if(otp===null)return;
     if(!/^\d{6}$/.test(otp.trim())){
       toast('Cod invalid. Introdu codul de 6 cifre primit pe e-mail.');
       return;
     }
     forgotPinButton.textContent='Se verifică codul…';
     const {data:verified,error:verifyError}=await appClient().auth.verifyOtp({
       email:user.email,
       token:otp.trim(),
       type:'email'
     });
     if(verifyError)throw verifyError;
     if(!verified.user||verified.user.id!==user.id){
       toast('Codul nu aparține contului conectat. PIN-ul nu a fost modificat.');
       return;
     }
     $('#newPinInput').value='';
     $('#confirmPinInput').value='';
     $('#pinManageDialog').showModal();
   }catch(err){
     console.error('PIN recovery:',err);
     const message='Nu am putut verifica autentificarea: '+(err?.message||'verifică internetul și încearcă din nou.');
     if(pinMessage)pinMessage.textContent=message;
     toast(message);
   }finally{
     forgotPinButton.disabled=false;
     forgotPinButton.textContent=oldText;
   }
 };
 }
 $('#pinBtn').addEventListener('click',()=>{$('#newPinInput').value='';$('#confirmPinInput').value='';$('#pinManageDialog').showModal()});
 $('#closePinManage').addEventListener('click',()=>$('#pinManageDialog').close());
 $('#pinManageForm').addEventListener('submit',e=>{e.preventDefault();const a=$('#newPinInput').value,b=$('#confirmPinInput').value;if(!/^\d{4,6}$/.test(a)){toast('PIN-ul trebuie să aibă 4–6 cifre');return}if(a!==b){toast('PIN-urile nu coincid');return}localStorage.setItem(PIN_KEY,a);sessionStorage.setItem('pin_ok','1');$('#pinStatus').textContent='Activ — blocare la pornire';$('#pinManageDialog').close();toast('PIN actualizat')});
 $('#exportBackupBtn').addEventListener('click',()=>{const backup={version:2,exportedAt:new Date().toISOString(),payments:state.payments,history:state.history,messages:scheduledMessages,preferences:load(PREFS_KEY,{}),waText:localStorage.getItem('pr_default_wa_text')||''};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='payment-reminder-backup.json';a.click();URL.revokeObjectURL(a.href);toast('Backup exportat')});
 $('#importBackupInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const b=JSON.parse(await file.text());if(!Array.isArray(b.payments)||!Array.isArray(b.history))throw new Error('invalid');state.payments=b.payments;state.history=b.history;scheduledMessages=Array.isArray(b.messages)?b.messages:[];localStorage.setItem(PREFS_KEY,JSON.stringify(b.preferences||{}));localStorage.setItem('pr_default_wa_text',b.waText||'');save({sync:false});persistMessages();loadPreferences();toast('Backup importat cu succes')}catch{toast('Fișier de backup invalid')}e.target.value=''});
 $('#calendarBtn').addEventListener('click',renderCalendar);$('#reportBtn').addEventListener('click',exportReport);
 $('#themeBtn').addEventListener('click',()=>{const light=document.body.classList.toggle('light-theme');localStorage.setItem(THEME_KEY,light?'light':'dark');$('#themeBtn').textContent=light?'🌙 Temă întunecată':'☀️ Temă luminoasă'});
 if(localStorage.getItem(THEME_KEY)==='light')document.body.classList.add('light-theme');
 if(localStorage.getItem(PIN_KEY))$('#pinStatus').textContent='Activ — blocare la pornire';else $('#pinStatus').textContent='Neconfigurat — configurează la prima deschidere';
}

function renderAll(){renderHome();renderFriends();renderHistory();renderPro();updateNotifStatus();updateCloudStatus()}

function renderHome(){const active=[...state.payments].sort((a,b)=>new Date(`${a.dueDate}T${a.dueTime}`)-new Date(`${b.dueDate}T${b.dueTime}`));const overdue=active.filter(isOverdue);$('#totalDue').textContent=totalByCurrency(active);$('#dueCount').textContent=`${active.length} ${active.length===1?'plată activă':'plăți active'}`;$('#overdueTotal').textContent=totalByCurrency(overdue);$('#overdueCount').textContent=`${overdue.length} ${overdue.length===1?'restanță':'restante'}`;const q=($('#paymentSearch')?.value||'').trim().toLocaleLowerCase('ro');const onlyOverdue=$('#overdueFilter')?.dataset.active==='true';const visible=active.filter(p=>(!q||`${p.friend} ${p.service} ${p.note||''}`.toLocaleLowerCase('ro').includes(q))&&(!onlyOverdue||isOverdue(p)));const box=$('#upcomingList');box.innerHTML='';if(!visible.length){box.innerHTML='<div class="empty">Nu ai nimic de primit. Apasă „Adaugă” și creează prima plată.</div>';return}visible.forEach(p=>box.append(paymentCard(p)))}
function paymentCard(p){const el=document.createElement('article');el.className='payment-card'+(isOverdue(p)?' overdue':'');el.dataset.id=p.id;el.innerHTML=`<div><div class="name"></div><div class="service"></div><div class="meta"><span class="chip due"></span><span class="chip recurrence"></span>${isOverdue(p)?'<span class="chip overdue">Restant</span>':''}</div></div><div class="amount"></div><div class="card-actions"><button class="snooze-btn" data-action="snooze">Amintește peste 1h</button><button class="snooze-btn" data-action="whatsapp">WhatsApp</button><button class="paid-btn" data-action="paid">✓ Plătit</button></div>`;el.querySelector('.name').textContent=p.friend;el.querySelector('.service').textContent=p.service;el.querySelector('.due').textContent=fmtDate(p.dueDate,p.dueTime);el.querySelector('.recurrence').textContent=p.recurrence==='monthly'?'Lunar':p.recurrence==='yearly'?'Anual':'O dată';el.querySelector('.amount').textContent=fmtMoney(p.amount,p.currency);el.addEventListener('click',e=>{const a=e.target.dataset.action;if(a==='paid'){e.stopPropagation();markPaid(p.id)}else if(a==='whatsapp'){e.stopPropagation();shareWhatsApp(p)}else if(a==='snooze'){e.stopPropagation();snooze(p.id)}else openDialog(p)});return el}
function renderFriends(){const map={};state.payments.forEach(p=>{if(!map[p.friend])map[p.friend]=[];map[p.friend].push(p)});const box=$('#friendsList');box.innerHTML='';const names=Object.keys(map).sort();if(!names.length){box.innerHTML='<div class="empty">Prietenii vor apărea aici după ce adaugi plăți.</div>';return}names.forEach(n=>{const el=document.createElement('article');el.className='friend-card';el.innerHTML='<div><strong></strong><small></small></div><b></b>';el.querySelector('strong').textContent=n;el.querySelector('small').textContent=`${map[n].length} ${map[n].length===1?'plată':'plăți'} active`;el.querySelector('b').textContent=totalByCurrency(map[n]);box.append(el)})}
function renderHistory(){const box=$('#historyList');box.innerHTML='';const items=[...state.history].sort((a,b)=>new Date(b.paidAt)-new Date(a.paidAt));if(!items.length){box.innerHTML='<div class="empty">Încă nu ai plăți marcate ca primite.</div>';return}items.forEach(h=>{const el=document.createElement('article');el.className='history-card';el.innerHTML='<div class="line"><strong></strong><b></b></div><small></small>';el.querySelector('strong').textContent=`${h.friend} · ${h.service}`;el.querySelector('b').textContent=fmtMoney(h.amount,h.currency);el.querySelector('small').textContent=`Primit la ${new Date(h.paidAt).toLocaleString('ro-RO')}`;box.append(el)})}

function openDialog(p=null){$('#paymentForm').reset();$('#paymentId').value=p?.id||'';$('#dialogTitle').textContent=p?'Modifică plata':'Adaugă plată';$('#deleteBtn').classList.toggle('hidden',!p);if(p){$('#friendName').value=p.friend;$('#serviceName').value=p.service;$('#amount').value=p.amount;$('#currency').value=p.currency;$('#dueDate').value=p.dueDate;$('#dueTime').value=p.dueTime;$('#reminderDate').value=p.reminderDate;$('#reminderTime').value=p.reminderTime;$('#recurrence').value=p.recurrence;$('#note').value=p.note||''}else{const d=new Date();d.setDate(d.getDate()+1);const ds=d.toISOString().slice(0,10);$('#dueDate').value=ds;$('#reminderDate').value=ds;$('#dueTime').value='18:00';$('#reminderTime').value=(load(PREFS_KEY,{}).reminderTime||'18:00');$('#currency').value=(load(PREFS_KEY,{}).currency||'RON')}$('#paymentDialog').showModal()}
$('#paymentForm').addEventListener('submit',e=>{e.preventDefault();const data={id:$('#paymentId').value||uid(),friend:$('#friendName').value.trim(),service:$('#serviceName').value.trim(),amount:Number($('#amount').value),currency:$('#currency').value,dueDate:$('#dueDate').value,dueTime:$('#dueTime').value,reminderDate:$('#reminderDate').value,reminderTime:$('#reminderTime').value,recurrence:$('#recurrence').value,note:$('#note').value.trim(),updatedAt:new Date().toISOString()};const i=state.payments.findIndex(x=>x.id===data.id);if(i>=0)state.payments[i]=data;else state.payments.push(data);save({sync:false});syncPayment(data);$('#paymentDialog').close();toast('Plata a fost salvată')});
$('#deleteBtn').addEventListener('click',()=>{const id=$('#paymentId').value;if(!id)return;state.payments=state.payments.filter(p=>p.id!==id);save({sync:false});deleteCloudPayment(id);$('#paymentDialog').close();toast('Plata a fost ștearsă')});
$('#closeDialog').addEventListener('click',()=>$('#paymentDialog').close());
function markPaid(id){const i=state.payments.findIndex(p=>p.id===id);if(i<0)return;const p=state.payments[i];state.history.push({...p,paidAt:new Date().toISOString()});if(p.recurrence==='once'){state.payments.splice(i,1);deleteCloudPayment(id)}else{const nextDue=nextDate(p.dueDate,p.recurrence);const nextRem=nextDate(p.reminderDate,p.recurrence);state.payments[i]={...p,dueDate:nextDue,reminderDate:nextRem,updatedAt:new Date().toISOString()};syncPayment(state.payments[i])}save({sync:false});toast(p.recurrence==='once'?'Marcat ca plătit':'Plătit. Am pregătit următoarea scadență')}
function snooze(id){const p=state.payments.find(x=>x.id===id);if(!p)return;const d=new Date(Date.now()+3600000);p.reminderDate=localDate(d);p.reminderTime=localTime(d);p.updatedAt=new Date().toISOString();save({sync:false});syncPayment(p);toast('Te voi atenționa din nou peste aproximativ o oră')}
function localDate(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function localTime(d){return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}

$$('.bottom-nav button[data-view]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.view;$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.bottom-nav button[data-view]').forEach(x=>x.classList.toggle('active',x===b));window.scrollTo({top:0,behavior:'smooth'})}));
$('#addNavBtn').addEventListener('click',()=>openDialog());$('#addTopBtn').addEventListener('click',()=>openDialog());
$('#paymentSearch').addEventListener('input',renderHome);
$('#overdueFilter').addEventListener('click',()=>{const b=$('#overdueFilter');const on=b.dataset.active!=='true';b.dataset.active=String(on);b.setAttribute('aria-pressed',String(on));b.classList.toggle('filter-active',on);b.textContent=on?'✓ Doar restante':'Restante';renderHome()});

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
    if(ok&&cloud.pushReady)toast('Notificările sunt active');
  }else{
    await sendNotification('Payment Reminder','Notificările locale sunt active. Notificările locale sunt active.');
  }
}
function updateNotifStatus(){const s=$('#notifStatus');if(!('Notification'in window)){if(s)s.textContent='Nesuportate';return}if(s)s.textContent=Notification.permission==='granted'?'Permise':Notification.permission==='denied'?'Blocate':'Neactivate';const b=$('#pushBadge');if(b){b.textContent=Notification.permission==='granted'?'Permise':'Oprite';b.classList.toggle('on',Notification.permission==='granted')}}
async function sendNotification(title,body){if(!('Notification' in window)||Notification.permission!=='granted')return;try{const reg=await navigator.serviceWorker.ready;await reg.showNotification(title,{body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:'payment-reminder-local'})}catch{try{new Notification(title,{body})}catch{}}}
$('#notifBtn').addEventListener('click',enableNotifications);$('#enableNotifBtn').addEventListener('click',enableNotifications);
$('#testNotifBtn')?.addEventListener('click',async()=>{if(!('Notification'in window)){toast('Browserul nu suportă notificări');return}if(Notification.permission!=='granted')await enableNotifications();if(Notification.permission!=='granted')return;if(cloud.pushReady){const ok=await sendCloudTestPush();if(ok){toast('Cererea de test push a fost trimisă');return}}await sendNotification('💰 Payment Reminder','Notificarea de test funcționează pe acest dispozitiv.');toast('Notificare de test afișată local');});

function checkReminders(){if(!('Notification' in window)||Notification.permission!=='granted'||cloud.pushReady)return;const now=Date.now();const notified=load(NOTIFIED_KEY,{});let changed=false;state.payments.forEach(p=>{const t=new Date(`${p.reminderDate}T${p.reminderTime}`).getTime();const key=`${p.id}:${p.reminderDate}:${p.reminderTime}`;if(t<=now&&now-t<6*60*60*1000&&!notified[key]){sendNotification(`💰 ${p.friend} trebuie să-ți dea bani`,`${fmtMoney(p.amount,p.currency)} pentru ${p.service}. Scadență: ${fmtDate(p.dueDate,p.dueTime)}.`);notified[key]=Date.now();changed=true}});if(changed)localStorage.setItem(NOTIFIED_KEY,JSON.stringify(notified))}
setInterval(checkReminders,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkReminders()});

$('#exportBtn')?.addEventListener('click',()=>{const blob=new Blob([JSON.stringify({payments:state.payments,history:state.history,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`payment-reminder-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)});
$('#importInput')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.payments)||!Array.isArray(data.history))throw new Error();state.payments=data.payments;state.history=data.history;save();toast('Backup importat')}catch{toast('Fișier de backup invalid')}e.target.value=''});



// ---------- CONT AUTH + SINCRONIZARE DATE ----------
const APP_SUPABASE_URL='https://mmgclcdmywnumvdmvlhi.supabase.co';
const APP_SUPABASE_KEY='sb_publishable_-sCDXSyqX8rJ5IAXMwQwSw_875YOJJT';
let appAuthClient=null, appUser=null, appSyncBusy=false;
function appClient(){
 if(!window.supabase?.createClient)throw new Error('Nu s-a încărcat biblioteca Supabase. Verifică internetul și reîncarcă aplicația.');
 if(!appAuthClient)appAuthClient=window.supabase.createClient(APP_SUPABASE_URL,APP_SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 return appAuthClient;
}
function setAccountUi(user){
 appUser=user||null;
 const gate=$('#accountGate');
 if(gate)gate.classList.toggle('visible',!user);
 const label=$('#accountLabel'),status=$('#accountStatus'),btn=$('#accountActionBtn');
 if(label)label.textContent=user?(user.is_anonymous?'Utilizare fără cont':(user.email||'Conectat cu Google')):'Neconectat';
 if(status)status.textContent=user?.is_anonymous?'Date pe acest dispozitiv; sesiune anonimă.':user?'Sincronizare cloud activă':'Date locale pe acest dispozitiv';
 if(btn){btn.textContent=user&&!user.is_anonymous?'Deconectare':'Conectare Google';}
 const avatar=$('#settingsAvatar'),name=$('#settingsProfileName'),email=$('#settingsProfileEmail');
 const meta=user?.user_metadata||{};
 const picture=meta.avatar_url||meta.picture||meta.photo_url||'icons/icon-192.png';
 if(avatar){avatar.src=picture;avatar.onerror=()=>{avatar.src='icons/icon-192.png'}}
 if(name)name.textContent=user?(meta.full_name||meta.name||user.email?.split('@')[0]||'Cont Payment Reminder'):'Payment Reminder';
 if(email)email.textContent=user?.email||(user?.is_anonymous?'Cont temporar pe acest dispozitiv':'Conectează-te cu Google pentru fotografia și e-mailul contului.');
 const badge=$('#pushBadge');
 if(badge){badge.textContent=(typeof Notification!=='undefined'&&Notification.permission==='granted'&&cloud.pushReady)?'Active':'Oprite';badge.classList.toggle('on',badge.textContent==='Active')}
}
function localAppPayload(){return {payments:state.payments,history:state.history,messages:scheduledMessages,preferences:load(PREFS_KEY,{}),waText:localStorage.getItem('pr_default_wa_text')||'',updatedAt:new Date().toISOString()}}
function applyAppPayload(p){
 if(!p)return;
 if(Array.isArray(p.payments))state.payments=p.payments;
 if(Array.isArray(p.history))state.history=p.history;
 if(Array.isArray(p.messages))scheduledMessages=p.messages;
 if(p.preferences)localStorage.setItem(PREFS_KEY,JSON.stringify(p.preferences));
 if(typeof p.waText==='string')localStorage.setItem('pr_default_wa_text',p.waText);
 localStorage.setItem(STORAGE_KEY,JSON.stringify(state.payments));localStorage.setItem(HISTORY_KEY,JSON.stringify(state.history));localStorage.setItem(MSG_KEY,JSON.stringify(scheduledMessages));
 loadPreferences();renderAll();renderScheduledMessages();
}
async function syncWholeApp(){
 if(!appUser||appUser.is_anonymous||appSyncBusy)return;
 appSyncBusy=true;
 try{
  const c=appClient(),payload=localAppPayload();
  const {error}=await c.from('user_app_data').upsert({user_id:appUser.id,payload,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)throw error;
  if($('#accountStatus'))$('#accountStatus').textContent='Sincronizat în cloud ✓';
 }catch(e){console.error('App sync',e);toast('Nu s-a putut sincroniza: '+(e.message||'verifică tabelul user_app_data'))}
 finally{appSyncBusy=false}
}
let appSyncTimer;
function queueAppSync(){if(!appUser||appUser.is_anonymous)return;clearTimeout(appSyncTimer);appSyncTimer=setTimeout(syncWholeApp,700)}
async function loadCloudAppData(){
 if(!appUser||appUser.is_anonymous)return;
 const c=appClient();const {data,error}=await c.from('user_app_data').select('payload').eq('user_id',appUser.id).maybeSingle();
 if(error)throw error;
 if(data?.payload){applyAppPayload(data.payload);toast('Datele contului au fost încărcate')}
 else{await syncWholeApp();toast('Datele locale au fost salvate în contul Google')}
}
async function continueAsGuest(){
 try{const c=appClient();const {data,error}=await c.auth.signInAnonymously();if(error)throw error;setAccountUi(data.user);$('#accountGate').classList.remove('visible');toast('Continui fără cont');}
 catch(e){$('#accountError').textContent=/anonymous/i.test(e.message)?'Activează Anonymous Sign-Ins în Supabase → Authentication → Providers → Anonymous.':e.message}
}
async function continueWithGoogle(){
 try{const c=appClient();const {error}=await c.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://alexandrujoanta2005-ctrl.github.io/Payment-Reminder/'}});if(error)throw error}
 catch(e){$('#accountError').textContent=e.message||'Conectarea Google nu a reușit'}
}
async function initAppAccount(){
 try{
  const c=appClient();const {data,error}=await c.auth.getSession();if(error)throw error;
  const user=data.session?.user;
  if(!user){setAccountUi(null);return}
  setAccountUi(user);
  if(!user.is_anonymous)await loadCloudAppData();
 }catch(e){console.error('Auth init',e);setAccountUi(null);$('#accountError').textContent='Conectarea la Supabase nu a reușit: '+e.message}
}
function showAccountError(message){
 const el=$('#accountError');
 if(el)el.textContent=message;
}
function bindAccountButtons(){
 const googleBtn=$('#googleSignInBtn');
 const guestBtn=$('#guestSignInBtn');
 if(googleBtn&&!googleBtn.dataset.bound){
  googleBtn.dataset.bound='1';
  googleBtn.addEventListener('click',async(event)=>{
   event.preventDefault(); showAccountError('');
   googleBtn.disabled=true; googleBtn.textContent='Se conectează…';
   try{await continueWithGoogle()}
   finally{googleBtn.disabled=false;googleBtn.innerHTML='<span>G</span> Continuă cu Google'}
  });
 }
 if(guestBtn&&!guestBtn.dataset.bound){
  guestBtn.dataset.bound='1';
  guestBtn.addEventListener('click',async(event)=>{
   event.preventDefault(); showAccountError('');
   guestBtn.disabled=true; guestBtn.textContent='Se pregătește…';
   try{await continueAsGuest()}
   finally{guestBtn.disabled=false;guestBtn.textContent='Continuă fără cont'}
  });
 }
}
bindAccountButtons();
$('#accountActionBtn').addEventListener('click',async()=>{
 if(appUser&&!appUser.is_anonymous){if(!confirm('Te deconectezi din contul Google? Datele rămân în cloud.'))return;await appClient().auth.signOut();setAccountUi(null)}
 else{continueWithGoogle()}
});
if(window.supabase?.createClient){
 appClient().auth.onAuthStateChange(async(_event,session)=>{
  const user=session?.user||null;setAccountUi(user);
  if(user&&!user.is_anonymous&&_event==='SIGNED_IN'){try{await loadCloudAppData()}catch(e){console.error(e);toast('Eroare la încărcarea datelor din cont')}}
 });
}

// ---------- PUSH CLOUD / SUPABASE ----------
function getCloudConfig(){return load(CLOUD_CONFIG_KEY,{supabaseUrl:'',supabaseKey:'',vapidPublicKey:''})}
function cleanCloudConfig(c){return {supabaseUrl:(c.supabaseUrl||'').trim().replace(/\/+$/,''),supabaseKey:(c.supabaseKey||'').trim(),vapidPublicKey:(c.vapidPublicKey||'').trim()}}
function hasCloudConfig(){const c=cleanCloudConfig(getCloudConfig());return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(c.supabaseUrl)&&c.supabaseKey.length>20&&c.vapidPublicKey.length>20}
function updateCloudStatus(){const s=$('#pushCloudStatus');const b=$('#pushCloudBtn');if(!s||!b)return;if(cloud.pushReady){s.textContent='Activ — notificări și cu aplicația închisă';b.textContent='Activat'}else if(cloud.ready){s.textContent=('Notification'in window&&Notification.permission==='granted')?'Conectat — activează Push':'Conectat — permite notificările';b.textContent='Activează'}else if(hasCloudConfig()){s.textContent='Configurat — conectare în curs';b.textContent='Activează'}else{s.textContent='Neconfigurat';b.textContent='Configurează'}}
function loadCloudConfigUi(){
 const c=cleanCloudConfig(getCloudConfig());
 const url=$('#pushSupabaseUrl'),key=$('#pushSupabaseKey'),vapid=$('#pushVapidPublicKey');
 if(url)url.value=c.supabaseUrl;
 if(key)key.value=c.supabaseKey;
 if(vapid)vapid.value=c.vapidPublicKey;
 updateCloudStatus();
}
$('#pushCloudBtn')?.addEventListener('click',async()=>{
 const config=cleanCloudConfig({
  supabaseUrl:$('#pushSupabaseUrl')?.value||'',
  supabaseKey:$('#pushSupabaseKey')?.value||'',
  vapidPublicKey:$('#pushVapidPublicKey')?.value||''
 });
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl)||config.supabaseKey.length<20||config.vapidPublicKey.length<20){
  toast('Completează URL-ul Supabase, cheia Publishable și cheia publică VAPID.');
  return;
 }
 localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify(config));
 cloud.ready=false;cloud.pushReady=false;cloud.client=null;cloud.user=null;
 updateCloudStatus();
 const button=$('#pushCloudBtn');if(button){button.disabled=true;button.textContent='Se conectează…'}
 try{
  const ok=await initCloud({subscribe:('Notification'in window&&Notification.permission==='granted'),showErrors:true});
  if(ok)toast(cloud.pushReady?'Push Cloud este activ.':'Conectat. Activează permisiunea notificărilor.');
 }finally{
  if(button)button.disabled=false;
  updateCloudStatus();
 }
});

async function initCloud({subscribe=false,showErrors=false,merge=true}={}){
  if(cloud.busy)return cloud.ready;
  if(!hasCloudConfig()){updateCloudStatus();return false}
  if(!window.supabase?.createClient){if(showErrors)toast('Biblioteca Supabase nu s-a încărcat. Verifică internetul.');return false}
  cloud.busy=true;
  try{
    const c=cleanCloudConfig(getCloudConfig());
    if(!cloud.client)cloud.client=window.supabase.createClient(c.supabaseUrl,c.supabaseKey,{auth:{storageKey:'payment-reminder-push-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
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

if('serviceWorker'in navigator)window.addEventListener('load',async()=>{try{await navigator.serviceWorker.register('./service-worker.js');if(hasCloudConfig())await initCloud({subscribe:Notification.permission==='granted'})}catch(e){console.warn(e)}});
loadCloudConfigUi();renderAll();renderScheduledMessages();loadPreferences();setupPin();initAppAccount();checkReminders();checkScheduledMessages();setInterval(checkScheduledMessages,30000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkScheduledMessages()});

// ---------- INSTALARE PWA (fără modificări la fluxul de notificări) ----------
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const btn = document.getElementById('installAppBtn');
  if (btn) btn.textContent = 'Instalează';
});
const installAppButton = document.getElementById('installAppBtn');
if (installAppButton) installAppButton.addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    toast('Pe iPhone: deschide în Safari → Partajare → Adaugă la ecranul principal.');
  } else {
    toast('În browser, deschide meniul ⋮ și alege „Instalează aplicația” sau „Adaugă la ecranul principal”.');
  }
});
const iosInstallHelpButton = document.getElementById('iosInstallHelpBtn');
if (iosInstallHelpButton) iosInstallHelpButton.addEventListener('click', () => {
  toast('Pe iPhone: deschide în Safari → Partajare → Adaugă la ecranul principal. Pentru profil: descarcă fișierul .mobileconfig, apoi Configurări → Profil descărcat → Instalează.');
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if (installAppButton) installAppButton.textContent = 'Instalată';
  toast('Payment Reminder a fost instalată!');
});
