const API_BASE = window.location.origin.startsWith('file') ? '' : '';

const FALLBACK = {
  stats: { playersRegistered: 18420, prizePool: 1250000, matchesToday: 2 },
  leaderboard: [
    {squad:"TridentFF", tag:"TFF", matches:24, booyahs:9, kills:212, pts:1840},
    {squad:"NoMercySquad", tag:"NMS", matches:22, booyahs:7, kills:198, pts:1705},
    {squad:"Alpha7", tag:"A7", matches:25, booyahs:6, kills:220, pts:1690},
    {squad:"IceKingFF", tag:"ICE", matches:20, booyahs:6, kills:175, pts:1520},
    {squad:"VenomRiders", tag:"VR", matches:21, booyahs:5, kills:180, pts:1465},
    {squad:"GhostProtocol", tag:"GP", matches:19, booyahs:4, kills:160, pts:1310},
    {squad:"Blitzkrieg", tag:"BLZ", matches:18, booyahs:4, kills:150, pts:1260},
    {squad:"Nightfall", tag:"NF", matches:17, booyahs:3, kills:140, pts:1105},
  ],
  schedule: [
    {id:"m1", day:"TODAY", time:"18:00", name:"Bermuda Squad Clash", sub:"Squad · 48 slots", map:"Bermuda", entryFee:0, status:"live"},
    {id:"m2", day:"TODAY", time:"20:30", name:"Purgatory Duo Showdown", sub:"Duo · 24 slots", map:"Purgatory", entryFee:20, status:"open"},
    {id:"m3", day:"TOMORROW", time:"17:00", name:"Bermuda Solo Sprint", sub:"Solo · 50 slots", map:"Bermuda", entryFee:0, status:"open"},
    {id:"m4", day:"TOMORROW", time:"21:00", name:"Kalahari Squad Finals", sub:"Squad · 12 slots", map:"Kalahari", entryFee:50, status:"soon"},
    {id:"m5", day:"SAT", time:"19:00", name:"Weekend Grand Booyah", sub:"Squad · 48 slots", map:"Bermuda", entryFee:100, status:"soon"},
  ],
  news: [
    {date:"12 JUL 2026", cat:"Update", title:"Season 4 leaderboard reset", body:"Points reset for all squads. New season runs through August with a bigger prize pool."},
    {date:"09 JUL 2026", cat:"Announcement", title:"Weekend Grand Booyah added", body:"A new weekly squad tournament with a ₹87,500 combined payout for the top 3."},
    {date:"03 JUL 2026", cat:"Fair play", title:"Emulator detection upgraded", body:"Stricter checks are now live across all ranked matches to keep the leaderboard fair."},
  ],
  kills: [
    "SHADOWX eliminated GHOST_99 in Bermuda",
    "Squad TridentFF secured a Booyah in Purgatory",
    "VENOM.RJ hit a headshot double-kill in Kalahari",
    "NoMercySquad wiped 3 players in the final zone",
    "IceKingFF took MVP with 11 kills",
    "Team Alpha7 clutched a 1v3 in the last circle"
  ]
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
    msg.className = 'form-msg'; msg.textContent = '';
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
    }
  });

  document.getElementById('signupForm').addEventListener('submit', async function(e){
    e.preventDefault();
    const msg = document.getElementById('signupMsg');
    msg.className = 'form-msg'; msg.textContent = '';
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
  if(player){
    if(greeting){ greeting.style.display = 'inline'; greeting.textContent = 'Hi, ' + player.ign; }
    if(logoutBtn) logoutBtn.style.display = 'inline-block';
    if(loginBtn) loginBtn.style.display = 'none';
    if(signupBtn) signupBtn.style.display = 'none';
    if(authNotice) authNotice.style.display = 'none';
  } else {
    if(greeting) greeting.style.display = 'none';
    if(logoutBtn) logoutBtn.style.display = 'none';
    if(loginBtn) loginBtn.style.display = 'inline-block';
    if(signupBtn) signupBtn.style.display = 'inline-block';
    if(authNotice){
      authNotice.style.display = 'block';
      authNotice.className = 'form-msg err';
      authNotice.textContent = 'Log in or sign up to register for a tournament.';
    }
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
  const select = document.getElementById('tournament');
  if(select){
    select.innerHTML = schedule.map(m =>
      `<option value="${m.id}">${m.day} ${m.time} — ${m.name} (${entryLabel(m.entryFee)})</option>`
    ).join('');
  }
}

async function initNews(){
  const grid = document.getElementById('newsGrid');
  if(!grid) return;
  const news = await apiGet('/api/news', 'news');
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
    msg.className = 'form-msg';
    msg.textContent = '';
    if(!getToken()){
      openAuthModal('login');
      return;
    }
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
});
