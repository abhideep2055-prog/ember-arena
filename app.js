const API_BASE = window.location.origin.startsWith('file') ? '' : '';

const FALLBACK = {
  stats: { playersRegistered: 0, prizePool: 0, matchesToday: 0 },
  leaderboard: [],
  schedule: [],
  news: [],
  kills: [],
  socialLinks: { instagram:'', youtube:'', discord:'', whatsapp:'', telegram:'' }
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

// ---- Help chatbot (FAQ-based) ----

const CHATBOT_FAQ = [
  { keywords:['register','registration','sign up','join','enter'], q:'How do I register for a tournament?', a:'Log in or sign up first, then go to the Register section, pick a tournament from the dropdown, enter your Free Fire UID and mode, and hit Confirm registration.' },
  { keywords:['uid','free fire uid','id number'], q:'What is Free Fire UID?', a:'It\'s the unique ID number shown on your Free Fire in-game profile page — tap your avatar in-game to find it.' },
  { keywords:['room id','password','room','when will i get','sms'], q:'When do I get the Room ID?', a:'Room ID and password are sent by SMS 10 minutes before your match starts. Make sure your phone number is correct when you sign up.' },
  { keywords:['pay','payment','entry fee','razorpay','upi','money'], q:'How does payment work?', a:'Free tournaments need no payment. Paid ones open a secure Razorpay checkout automatically when you register — pay there and you\'re confirmed instantly.' },
  { keywords:['prize','payout','winning','cash','when do i get paid'], q:'When do I get prize money?', a:'Winning squads are paid out within 24 hours of the final match, straight to the details you registered with. See the Prize Pool section for amounts.' },
  { keywords:['emulator','hack','cheat','ban','fair play'], q:'What counts as cheating?', a:'Emulators, hacks, and teaming with other squads are not allowed and lead to disqualification or a ban. Full details are on the Rules page.' },
  { keywords:['password','forgot','login','can\'t log in','cant log in'], q:'I forgot my password', a:'We don\'t have password reset built in yet — please contact support directly and we\'ll help sort out your account.' },
  { keywords:['contact','support','human','talk to someone','help me','admin'], q:'Talk to a human', a:'Sure — use the social links in the footer (WhatsApp/Discord) to reach the team directly, or check the Rules page for detailed policies.' },
];

function injectChatbot(){
  if(document.getElementById('chatbotWidget')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div id="chatbotWidget">
      <button id="chatbotToggle" aria-label="Help chat">💬</button>
      <div id="chatbotPanel" style="display:none;">
        <div class="chatbot-head">
          <span>Ember Arena Help</span>
          <button id="chatbotClose" aria-label="Close">&times;</button>
        </div>
        <div class="chatbot-body" id="chatbotBody"></div>
        <div class="chatbot-chips" id="chatbotChips"></div>
        <form class="chatbot-input-row" id="chatbotForm">
          <input type="text" id="chatbotInput" placeholder="Type your question..." autocomplete="off">
          <button type="submit" class="btn btn-primary" style="padding:10px 16px;">Send</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  document.getElementById('chatbotToggle').addEventListener('click', ()=>{
    const panel = document.getElementById('chatbotPanel');
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'flex';
    if(!open && document.getElementById('chatbotBody').children.length === 0){
      addBotMessage("Hi! I'm the Ember Arena help bot. Ask me about registration, payments, room IDs, or rules — or tap a topic below.");
      renderChatbotChips();
    }
  });
  document.getElementById('chatbotClose').addEventListener('click', ()=>{
    document.getElementById('chatbotPanel').style.display = 'none';
  });
  document.getElementById('chatbotForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const input = document.getElementById('chatbotInput');
    const text = input.value.trim();
    if(!text) return;
    addUserMessage(text);
    input.value = '';
    answerChatbot(text);
  });
}

function addUserMessage(text){
  const body = document.getElementById('chatbotBody');
  const div = document.createElement('div');
  div.className = 'chatbot-msg user';
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function addBotMessage(text){
  const body = document.getElementById('chatbotBody');
  const div = document.createElement('div');
  div.className = 'chatbot-msg bot';
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function renderChatbotChips(){
  const chips = document.getElementById('chatbotChips');
  chips.innerHTML = CHATBOT_FAQ.slice(0, 4).map((f, i) =>
    `<button type="button" class="chatbot-chip" onclick="askChatbotChip(${i})">${f.q}</button>`
  ).join('');
}

function askChatbotChip(i){
  const f = CHATBOT_FAQ[i];
  addUserMessage(f.q);
  addBotMessage(f.a);
}

function answerChatbot(text){
  const lower = text.toLowerCase();
  let best = null, bestScore = 0;
  for(const f of CHATBOT_FAQ){
    const score = f.keywords.filter(k => lower.includes(k)).length;
    if(score > bestScore){ bestScore = score; best = f; }
  }
  if(best){
    addBotMessage(best.a);
  } else {
    const wa = (window._socialLinks && window._socialLinks.whatsapp) || '';
    addBotMessage(
      wa
        ? "I couldn't find an exact answer. Try the WhatsApp link in the footer to chat with the team directly."
        : "I couldn't find an exact answer for that. Check the Rules page, or look for a contact link in the footer once the team adds one."
    );
  }
}

function registerServiceWorker(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }
}

// ---- Install as app ----

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installBtn');
  if(btn) btn.style.display = 'inline-block';
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById('installBtn');
  if(btn) btn.style.display = 'none';
});

async function installApp(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    const btn = document.getElementById('installBtn');
    if(btn) btn.style.display = 'none';
    return;
  }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if(isIOS){
    alert('iPhone/iPad par install karne ke liye: neeche Share button (⬆️) dabayein, phir "Add to Home Screen" chunein.');
  } else {
    alert('Is browser mein abhi install available nahi hai. Chrome ya Edge try karein, ya browser ke menu (⋮) mein "Install app" / "Add to Home screen" dhoondhein.');
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

const SOCIAL_ICONS = {
  instagram: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 3.3.15 4.7 1.6 4.9 4.9.06 1.3.07 1.6.07 4.8s0 3.6-.07 4.9c-.15 3.3-1.6 4.7-4.9 4.9-1.3.06-1.6.07-4.9.07s-3.6 0-4.9-.07c-3.3-.15-4.7-1.6-4.9-4.9C2.1 15.6 2.1 15.2 2.1 12s0-3.6.07-4.9c.15-3.3 1.6-4.75 4.9-4.9C8.4 2.2 8.8 2.2 12 2.2zM12 7a5 5 0 100 10 5 5 0 000-10zm0 8.2a3.2 3.2 0 110-6.4 3.2 3.2 0 010 6.4zm5.2-8.4a1.15 1.15 0 100-2.3 1.15 1.15 0 000 2.3z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M22 12s0-3.4-.44-5.05a2.8 2.8 0 00-2-2C17.9 4.5 12 4.5 12 4.5s-5.9 0-7.56.45a2.8 2.8 0 00-2 2C2 8.6 2 12 2 12s0 3.4.44 5.05a2.8 2.8 0 002 2c1.66.45 7.56.45 7.56.45s5.9 0 7.56-.45a2.8 2.8 0 002-2C22 15.4 22 12 22 12zM9.9 15.5v-7l6 3.5-6 3.5z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 5.6a17 17 0 00-4.2-1.3l-.2.4a12 12 0 013.6 1.4A15.7 15.7 0 0012 4.3 15.7 15.7 0 004.8 6.1a12 12 0 013.6-1.4l-.2-.4A17 17 0 004 5.6C2.3 8.3 1.8 11 2 13.6a17 17 0 004.9 2.4l.7-1.1a10 10 0 01-1.6-.8l.4-.3a12 12 0 0011.2 0l.4.3a10 10 0 01-1.6.8l.7 1.1a17 17 0 004.9-2.4c.3-3-.3-5.6-2-8zM9.5 13.4c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.3.7 1.3 1.5-.6 1.5-1.3 1.5zm5 0c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.3.7 1.3 1.5-.6 1.5-1.3 1.5z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2.1a9.9 9.9 0 00-8.5 15L2 22l5-1.4A9.9 9.9 0 1012 2.1zm0 18a8 8 0 01-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1112 20.1zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8.9-.2.2-.3.2-.5.1a6.6 6.6 0 01-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.4 0-.5L9.2 8c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-1 1-1 2.3s1 2.7 1.1 2.9c.1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.5-.3z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21.9 4.3L2.9 11.7c-1.3.5-1.3 1.2-.2 1.5l4.9 1.5 1.9 5.8c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.1-2 4.5 3.3c.8.4 1.4.2 1.6-.7l3-13.9c.3-1.2-.5-1.7-1.6-1.2zM8.4 14.6l-1.5-.5 10.4-6.5c.2-.1.4 0 .2.2L9 14.4l-.6 3.4z"/></svg>'
};

async function initSocialLinks(){
  const container = document.getElementById('socialLinks');
  if(!container) return;
  const links = await apiGet('/api/social-links', 'socialLinks');
  const platforms = ['instagram', 'youtube', 'discord', 'whatsapp', 'telegram'];
  const html = platforms
    .filter(p => links[p])
    .map(p => `<a href="${links[p]}" target="_blank" rel="noopener" class="social-icon" aria-label="${p}">${SOCIAL_ICONS[p]}</a>`)
    .join('');
  container.innerHTML = html;
  window._socialLinks = links;
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

async function checkMaintenance(){
  // admin.html manages maintenance mode and must stay reachable even while it's on
  if(window.location.pathname.includes('admin.html')) return false;
  try{
    const res = await fetch(API_BASE + '/api/maintenance');
    const data = await res.json();
    if(data && data.enabled){
      document.body.innerHTML = `
        <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px; background:#0B0B0F; color:#F5F3EF; font-family:'Inter',sans-serif;">
          <div style="max-width:480px;">
            <div style="font-family:'Anton',sans-serif; text-transform:uppercase; font-size:34px; color:#FF6B1A; margin-bottom:16px;">Under maintenance</div>
            <p style="color:#B8B5C0; font-size:15px; line-height:1.6;">${data.message || "We're making some improvements. Please check back shortly."}</p>
          </div>
        </div>
      `;
      return true;
    }
  }catch(e){
    // if the check itself fails, don't block the site — fail open
  }
  return false;
}

document.addEventListener('DOMContentLoaded', async ()=>{
  const blocked = await checkMaintenance();
  if(blocked) return;
  initNav();
  initTicker();
  initStats();
  initLeaderboard();
  initSchedule();
  initNews();
  initSocialLinks();
  initRegForm();
  injectAuthModal();
  refreshAuthUI();
  registerServiceWorker();
  injectChatbot();
});
