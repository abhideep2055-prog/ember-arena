const API_BASE = window.location.origin.startsWith('file') ? '' : '';

const FALLBACK = {
  stats: { playersRegistered: 0, prizePool: 0, matchesToday: 0 },
  leaderboard: [],
  schedule: [],
  news: [],
  kills: []
};

async function apiGet(path, fallbackKey){
  try{
    const res = await fetch(API_BASE + path);
    if(!res.ok) throw new Error('bad response');
    return await res.json();
  }catch(e){
    return FALLBACK[fallbackKey];
  }
}

function initNav(){
  const btn = document.getElementById('hamburger');
  const links = document.getElementById('navLinks');
  if(btn && links){
    btn.addEventListener('click', ()=> links.classList.toggle('open'));
  }
  const current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navlinks a').forEach(a=>{
    if(a.getAttribute('href') === current || (current === '' && a.getAttribute('href') === 'index.html')){
      a.classList.add('active');
    }
  });
}

function scrollToReg(){
  const el = document.getElementById('register');
  if(el) el.scrollIntoView({behavior:'smooth'});
  else window.location.href = 'index.html#register';
}

// ---- Player accounts (login / signup) ----

const TOKEN_KEY = 'ember_token';
const PLAYER_KEY = 'ember_player';

function getToken(){ return localStorage.getItem(TOKEN_KEY); }
function getPlayer(){
  try{ return JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null'); }
  catch(e){ return null; }
}
function setSession(token, player){
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
}
function clearSession(){
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PLAYER_KEY);
}

function injectAuthModal(){
  if(document.getElementById('authModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="authModal" class="auth-overlay">
      <div class="auth-modal">
        <button class="auth-close" onclick="closeAuthModal()" aria-label="Close">&times;</button>
        <div class="auth-tabs">
          <button type="button" class="auth-tab active" id="tabLogin" onclick="switchAuthTab('login')">Log in</button>
          <button type="button" class="auth-tab" id="tabSignup" onclick="switchAuthTab('signup')">Sign up</button>
        </div>
        <form id="loginForm" class="auth-form">
          <div class="form-row"><label for="loginEmail">Email</label><input type="email" id="loginEmail" required></div>
          <div class="form-row"><label for="loginPassword">Password</label><input type="password" id="loginPassword" required></div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Log in</button>
          <div class="form-msg" id="loginMsg"></div>
        </form>
        <form id="signupForm" class="auth-form" style="display:none;">
          <div class="form-row"><label for="signupIgn">In-game name</label><input type="text" id="signupIgn" required></div>
          <div class="form-row"><label for="signupEmail">Email</label><input type="email" id="signupEmail" required></div>
          <div class="form-row"><label for="signupPhone">Phone number</label><input type="tel" id="signupPhone" required></div>
          <div class="form-row"><label for="signupPassword">Password</label><input type="password" id="signupPassword" required minlength="6"></div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Create account</button>
          <div class="form-msg" id="signupMsg"></div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  document.getElementById('authModal').addEventListener('click', function(e){
    if(e.target === this) closeAuthModal();
  });

  document.getElementById('loginForm').addEventListener('submit', async function(e){
    e.preventDefault();
    const msg = document.getElementById('loginMsg');
    const btn = this.querySelector('button[type="submit"]');
    msg.className = 'form-msg'; msg.textContent = '';
    if(btn.disabled) return;
    btn.disabled = true;
    try{
      const res = await fetch(API_BASE + '/api/auth/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          email: document.getElementById('loginEmail').value.trim(),
          password: document.getElementById('loginPassword').value
        })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Login failed.');
      setSession(data.token, data.player);
      refreshAuthUI();
      closeAuthModal();
      this.reset();
    }catch(err){
      msg.textContent = err.message;
      msg.className = 'form-msg err';
    }finally{
      btn.disabled = false;
    }
  });

  document.getElementById('signupForm').addEventListener('submit', async function(e){
    e.preventDefault();
    const msg = document.getElementById('signupMsg');
    const btn = this.querySelector('button[type="submit"]');
    msg.className = 'form-msg'; msg.textContent = '';
    if(btn.disabled) return;
    btn.disabled = true;
    try{
      const res = await fetch(API_BASE + '/api/auth/signup', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          ign: document.getElementById('signupIgn').value.trim(),
          email: document.getElementById('signupEmail').value.trim(),
          phone: document.getElementById('signupPhone').value.trim(),
          password: document.getElementById('signupPassword').value
        })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || 'Sign up failed.');
      setSession(data.token, data.player);
      refreshAuthUI();
      closeAuthModal();
      this.reset();
    }catch(err){
      msg.textContent = err.message;
      msg.className = 'form-msg err';
    }finally{
      btn.disabled = false;
    }
  });
}

function openAuthModal(tab){
  injectAuthModal();
  document.getElementById('authModal').style.display = 'flex';
  switchAuthTab(tab || 'login');
}
function closeAuthModal(){
  const m = document.getElementById('authModal');
  if(m) m.style.display = 'none';
}
function switchAuthTab(tab){
  const isLogin = tab === 'login';
  document.getElementById('loginForm').style.display = isLogin ? 'flex' : 'none';
  document.getElementById('signupForm').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabSignup').classList.toggle('active', !isLogin);
}
function logout(){
  clearSession();
  refreshAuthUI();
}

function refreshAuthUI(){
  const player = getPlayer();
  const greeting = document.getElementById('userGreeting');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const authNotice = document.getElementById('authNotice');
  const notifyBtn = document.getElementById('notifyBtn');
  if(player){
    if(greeting){ greeting.style.display = 'inline'; greeting.textContent = 'Hi, ' + player.ign; }
    if(logoutBtn) logoutBtn.style.display = 'inline-block';
    if(loginBtn) loginBtn.style.display = 'none';
    if(signupBtn) signupBtn.style.display = 'none';
    if(authNotice) authNotice.style.display = 'none';
    if(notifyBtn) notifyBtn.style.display = 'inline-block';
  } else {
    if(greeting) greeting.style.display = 'none';
    if(logoutBtn) logoutBtn.style.display = 'none';
    if(loginBtn) loginBtn.style.display = 'inline-block';
    if(signupBtn) signupBtn.style.display = 'inline-block';
    if(notifyBtn) notifyBtn.style.display = 'none';
    if(authNotice){
      authNotice.style.display = 'block';
      authNotice.className = 'form-msg err';
      authNotice.textContent = 'Log in or sign up to register for a tournament.';
    }
  }
}

// ---- PWA install + push notifications ----

function registerServiceWorker(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }
}

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function enableMatchAlerts(){
  const btn = document.getElementById('notifyBtn');
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    alert('Notifications are not supported in this browser.');
    return;
  }
  if(!getToken()){
    openAuthModal('login');
    return;
  }
  try{
    const permission = await Notification.requestPermission();
    if(permission !== 'granted'){
      alert('Notifications were blocked. You can enable them from your browser/site settings any time.');
      return;
    }
    const keyRes = await fetch(API_BASE + '/api/push/vapid-public-key');
    const keyData = await keyRes.json();
    if(!keyRes.ok) throw new Error(keyData.error || 'Push notifications are not set up yet.');

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
      });
    }
    const res = await fetch(API_BASE + '/api/push/subscribe', {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization': 'Bearer ' + getToken()},
      body: JSON.stringify(sub)
    });
    if(!res.ok){
      const d = await res.json().catch(()=>({}));
      throw new Error(d.error || 'Could not enable alerts.');
    }
    if(btn){ btn.textContent = '🔔 Alerts on'; btn.disabled = true; }
  }catch(err){
    alert(err.message || 'Could not enable match alerts.');
  }
}

async function initTicker(){
  const data = await apiGet('/api/news', 'news');
  const kills = FALLBACK.kills;
  const track = document.getElementById('tickerTrack');
  if(!track) return;
  track.innerHTML = [...kills, ...kills].map(k => `<span><b>KILL FEED</b> — ${k}</span>`).join('');
}

async function initStats(){
  const stats = await apiGet('/api/stats', 'stats');
  const playersEl = document.getElementById('statPlayers');
  const poolEl = document.getElementById('statPool');
  const matchesEl = document.getElementById('statMatches');
  if(playersEl) playersEl.textContent = stats.playersRegistered.toLocaleString('en-IN');
  if(poolEl) poolEl.textContent = '₹' + stats.prizePool.toLocaleString('en-IN');
  if(matchesEl) matchesEl.textContent = stats.matchesToday;
}

async function initLeaderboard(){
  const body = document.getElementById('lbBody');
  if(!body) return;
  const leaderboard = await apiGet('/api/leaderboard', 'leaderboard');
  if(leaderboard.length === 0){
    body.innerHTML = `<tr><td colspan="6" style="color:var(--ash); text-align:center; padding:32px;">No squads on the leaderboard yet — check back after the first tournament.</td></tr>`;
    return;
  }
  body.innerHTML = leaderboard.map((r,i)=>{
    const rankClass = i===0?'r1':i===1?'r2':i===2?'r3':'';
    return `<tr>
      <td><span class="rank ${rankClass}">#${i+1}</span></td>
      <td><div class="squad"><div class="squad-icon">${r.tag}</div>${r.squad}</div></td>
      <td class="mono">${r.matches}</td>
      <td class="mono">${r.booyahs}</td>
      <td class="mono">${r.kills}</td>
      <td class="pts mono">${r.pts}</td>
    </tr>`;
  }).join('');
}

let scheduleCache = [];

function entryLabel(fee){ return fee > 0 ? '₹' + fee : 'Free'; }

async function initSchedule(){
  const list = document.getElementById('matchList');
  const schedule = await apiGet('/api/schedule', 'schedule');
  scheduleCache = schedule;
  if(list){
    if(schedule.length === 0){
      list.innerHTML = `<div style="color:var(--ash); text-align:center; padding:32px; background:var(--panel);">No tournaments scheduled right now — check back soon.</div>`;
    } else {
      const badgeMap = {
        live: '<span class="badge badge-live">Live now</span>',
        open: '<span class="badge badge-open">Registration open</span>',
        soon: '<span class="badge badge-soon">Opens soon</span>'
      };
      list.innerHTML = `<div class="match-row head"><div>Time</div><div>Match</div><div>Map</div><div>Entry</div><div>Status</div></div>` +
        schedule.map(m => `
          <div class="match-row">
            <div class="match-date">${m.day}<br>${m.time}</div>
            <div class="match-name">${m.name}<span class="sub">${m.sub}</span></div>
            <div>${m.map}</div>
            <div class="mono">${entryLabel(m.entryFee)}</div>
            <div>${badgeMap[m.status] || badgeMap.soon}</div>
          </div>
        `).join('');
    }
  }
  const select = document.getElementById('tournament');
  if(select){
    select.innerHTML = schedule.length === 0
      ? `<option value="">No tournaments available yet</option>`
      : schedule.map(m =>
          `<option value="${m.id}">${m.day} ${m.time} — ${m.name} (${entryLabel(m.entryFee)})</option>`
        ).join('');
  }
}

async function initNews(){
  const grid = document.getElementById('newsGrid');
  if(!grid) return;
  const news = await apiGet('/api/news', 'news');
  if(news.length === 0){
    grid.innerHTML = `<div style="color:var(--ash); grid-column:1/-1; text-align:center; padding:32px;">No news yet — updates will show up here.</div>`;
    return;
  }
  grid.innerHTML = news.map(n => `
    <div class="news-card">
      <span class="badge badge-open news-cat">${n.cat}</span>
      <div class="news-date">${n.date}</div>
      <h3>${n.title}</h3>
      <p>${n.body}</p>
    </div>
  `).join('');
}

async function submitRegistration(payload, msg, form){
  const res = await fetch(API_BASE + '/api/register', {
    method:'POST',
    headers:{'Content-Type':'application/json', 'Authorization': 'Bearer ' + getToken()},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(res.status === 401){
    clearSession();
    refreshAuthUI();
    openAuthModal('login');
    throw new Error(data.error || 'Please log in again.');
  }
  if(!res.ok) throw new Error(data.error || 'Registration failed');
  const player = getPlayer();
  msg.textContent = `You're in${player ? ', ' + player.ign : ''}. Room ID and password will be sent by SMS 10 minutes before your match.`;
  msg.className = 'form-msg ok';
  if(data.totalPlayers){
    const playersEl = document.getElementById('statPlayers');
    if(playersEl) playersEl.textContent = data.totalPlayers.toLocaleString('en-IN');
  }
  if(form) form.reset();
}

function loadRazorpayScript(){
  return new Promise((resolve)=>{
    if(window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = ()=> resolve(true);
    script.onerror = ()=> resolve(false);
    document.body.appendChild(script);
  });
}

async function payAndRegister(match, payload, msg, form){
  const loaded = await loadRazorpayScript();
  if(!loaded){
    msg.textContent = 'Could not load the payment gateway. Check your connection and try again.';
    msg.className = 'form-msg err';
    return;
  }
  const player = getPlayer();
  let order;
  try{
    const orderRes = await fetch(API_BASE + '/api/payment/create-order', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ amount: match.entryFee, matchId: match.id })
    });
    order = await orderRes.json();
    if(!orderRes.ok) throw new Error(order.error || 'Could not start payment.');
  }catch(err){
    msg.textContent = err.message;
    msg.className = 'form-msg err';
    return;
  }
  const rzp = new Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    order_id: order.orderId,
    name: 'Ember Arena',
    description: match.name,
    prefill: { name: player ? player.ign : '', email: player ? player.email : '', contact: player ? player.phone : '' },
    theme: { color: '#FF6B1A' },
    handler: async function(response){
      try{
        const verifyRes = await fetch(API_BASE + '/api/payment/verify', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            order_id: response.razorpay_order_id,
            payment_id: response.razorpay_payment_id,
            signature: response.razorpay_signature
          })
        });
        const verifyData = await verifyRes.json();
        if(!verifyRes.ok || !verifyData.verified){
          msg.textContent = 'Payment could not be verified. If money was deducted, contact support with your payment ID.';
          msg.className = 'form-msg err';
          return;
        }
        await submitRegistration({ ...payload, matchId: match.id, paymentId: response.razorpay_payment_id }, msg, form);
      }catch(err){
        msg.textContent = 'Payment succeeded but registration failed. Contact support with your payment ID.';
        msg.className = 'form-msg err';
      }
    },
    modal: {
      ondismiss: function(){
        msg.textContent = 'Payment cancelled. Your slot was not reserved.';
        msg.className = 'form-msg err';
      }
    }
  });
  rzp.on('payment.failed', function(){
    msg.textContent = 'Payment failed. Try again or use a different payment method.';
    msg.className = 'form-msg err';
  });
  rzp.open();
}

function initRegForm(){
  const form = document.getElementById('regForm');
  if(!form) return;
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    const msg = document.getElementById('regMsg');
    const btn = form.querySelector('button[type="submit"]');
    msg.className = 'form-msg';
    msg.textContent = '';
    if(!getToken()){
      openAuthModal('login');
      return;
    }
    if(btn.disabled) return;
    btn.disabled = true;
    const select = document.getElementById('tournament');
    const matchId = select ? select.value : null;
    const match = scheduleCache.find(m => m.id === matchId) || null;
    const payload = {
      uid: document.getElementById('uid').value.trim(),
      mode: document.getElementById('mode').value,
    };
    try{
      if(match && match.entryFee > 0){
        await payAndRegister(match, payload, msg, form);
      }else{
        await submitRegistration({ ...payload, matchId }, msg, form);
      }
    }catch(err){
      msg.textContent = err.message || "Couldn't submit right now. Make sure the backend server is running, then try again.";
      msg.className = 'form-msg err';
    }finally{
      btn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  initNav();
  initTicker();
  initStats();
  initLeaderboard();
  initSchedule();
  initNews();
  initRegForm();
  injectAuthModal();
  refreshAuthUI();
  registerServiceWorker();
});
