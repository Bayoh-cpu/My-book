// =====================================================
// ONLINE BACKUP (Supabase)
// Paste your two Supabase details between the quotes.
// Leave them empty and the app keeps working on this phone only.
// =====================================================
const SUPABASE_URL = '';        // e.g. https://abcdxyz.supabase.co
const SUPABASE_ANON_KEY = '';   // the anon (public) key, never the secret key

(function(){
  const STORAGE_KEY = 'people';
  let people = [];
  let addItemTargetId = null;

  const listEl = document.getElementById('list');
  const searchBox = document.getElementById('searchBox');
  const toastEl = document.getElementById('toast');

  document.getElementById('dateNow').textContent = new Date().toLocaleDateString('en-KE', {day:'numeric', month:'short', year:'numeric'});

  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(()=> toastEl.classList.remove('show'), 1600);
  }

  function fmt(n){
    return 'KSh ' + Number(n||0).toLocaleString('en-KE');
  }

  function uid(){
    return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  function loadPeople(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      people = raw ? JSON.parse(raw) : [];
    }catch(e){
      people = [];
    }
    render();
  }

  function savePeople(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
      stampData();
      scheduleCloudPush();
    }catch(e){
      showToast('Could not save — storage may be full or blocked');
    }
  }

  function personTotals(person){
    let outstanding = 0, cleared = 0;
    (person.items||[]).forEach(it=>{
      const amt = Number(it.amount||0);
      const paid = Number(it.paid||0);
      if(it.cleared){
        cleared += amt;
      } else {
        cleared += Math.min(paid, amt);
        outstanding += Math.max(0, amt - paid);
      }
    });
    return {outstanding, cleared};
  }

  function renderSummary(filtered){
    let totalOwed = 0, totalCleared = 0;
    filtered.forEach(p=>{
      const t = personTotals(p);
      totalOwed += t.outstanding;
      totalCleared += t.cleared;
    });
    document.getElementById('totalOwed').textContent = fmt(totalOwed);
    document.getElementById('totalCleared').textContent = fmt(totalCleared);
  }

  function renderDashboard(){
    const acc = getAccount() || {};
    const biz = (acc.business || '').trim() || (acc.name ? acc.name.trim().split(' ')[0] : '') || 'there';
    document.getElementById('dashBiz').textContent = biz;
    document.getElementById('dashWelcome').textContent = acc.business
      ? "Welcome back! Here's your debt book for today."
      : "Welcome back! Add your hotel or shop name in ⚙ Settings.";

    const total = people.length;
    let owing = 0;
    people.forEach(p => { if(personTotals(p).outstanding > 0) owing++; });
    document.getElementById('chipPeople').textContent = total + (total === 1 ? ' customer' : ' customers');
    document.getElementById('chipOwing').textContent = owing + ' with balance';
    document.getElementById('chipCleared').textContent = (total - owing) + ' settled';

    // nudge a backup when there is data and no backup in the last 7 days
    const last = Number(localStorage.getItem('deni_book_last_backup') || 0);
    const stale = !last || (Date.now() - last) > 7 * 24 * 60 * 60 * 1000;
    document.getElementById('chipBackup').classList.toggle('hidden-chip', !(total > 0 && stale && !hasCloud()));
    renderCloudChip();
  }

  function render(){
    renderDashboard();
    const q = searchBox.value.trim().toLowerCase();
    const filtered = people.filter(p => p.name.toLowerCase().includes(q));
    renderSummary(filtered);

    if(filtered.length === 0){
      listEl.innerHTML = `<div class="empty-state">
        <div class="big">${people.length === 0 ? 'No one on the book yet' : 'No matches'}</div>
        <div>${people.length === 0 ? 'Tap + to add the first person and what they took.' : 'Try a different name.'}</div>
      </div>`;
      return;
    }

    // Sort: highest outstanding first
    filtered.sort((a,b) => personTotals(b).outstanding - personTotals(a).outstanding);

    listEl.innerHTML = filtered.map(p => {
      const t = personTotals(p);
      const items = (p.items||[]).map(it => {
        const amt = Number(it.amount||0);
        const paid = Number(it.paid||0);
        const balance = Math.max(0, amt - paid);
        const partiallyPaid = !it.cleared && paid > 0;
        return `
        <div class="item-row" data-item="${it.id}">
          <div class="item-info">
            <div class="item-name">${escapeHtml(it.name)}</div>
            <div class="item-date">${it.date}${partiallyPaid ? ` · Paid ${fmt(paid)} of ${fmt(amt)}` : ''}</div>
          </div>
          <div class="item-right">
            <div style="text-align:right;">
              <div class="item-amt amount">${it.cleared ? fmt(amt) : fmt(balance)}</div>
              ${partiallyPaid ? `<div class="item-balance-label">balance</div>` : ''}
            </div>
            <div class="status-badge ${it.cleared ? 'cleared' : 'debt'}"><span class="dot"></span>${it.cleared ? 'Cleared' : 'Debt'}</div>
            <button class="kebab-btn" data-action="openMenu" data-person="${p.id}" data-item="${it.id}" aria-label="Item options">⋮</button>
          </div>
        </div>
      `;
      }).join('');

      return `
      <div class="person-card">
        <div class="person-head" data-toggle="${p.id}">
          <div class="who">
            <div class="name">${escapeHtml(p.name)}</div>
            ${p.phone ? `<div class="phone">${escapeHtml(p.phone)}</div>` : ''}
          </div>
          <div class="totals">
            <div class="outstanding ${t.outstanding > 0 ? 'pos' : 'zero'}">${t.outstanding > 0 ? fmt(t.outstanding) : 'Settled'}</div>
            <div class="caption">${(p.items||[]).length} item${(p.items||[]).length===1?'':'s'}</div>
          </div>
        </div>
        <div class="items" style="display:${p.open ? 'block':'none'}">
          ${items}
          <div class="add-item-row">
            <button data-action="addItem" data-person="${p.id}">+ Add another item</button>
          </div>
        </div>
        <div class="person-actions" style="display:${p.open ? 'flex':'none'}">
          <button data-action="deletePerson" data-person="${p.id}">Remove person</button>
        </div>
      </div>`;
    }).join('');
  }

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  listEl.addEventListener('click', function(e){
    const head = e.target.closest('[data-toggle]');
    if(head && !e.target.closest('button')){
      const id = head.getAttribute('data-toggle');
      const p = people.find(x=>x.id===id);
      if(p){ p.open = !p.open; render(); }
      return;
    }
    const btn = e.target.closest('button[data-action]');
    if(!btn) return;
    const action = btn.getAttribute('data-action');
    const personId = btn.getAttribute('data-person');
    const p = people.find(x=>x.id===personId);
    if(!p) return;

    if(action === 'openMenu'){
      const itemId = btn.getAttribute('data-item');
      openItemMenu(btn, personId, itemId);
    } else if(action === 'deletePerson'){
      requestPinFor('delete', personId);
    } else if(action === 'addItem'){
      addItemTargetId = personId;
      document.getElementById('iItemName').value = '';
      document.getElementById('iItemAmt').value = '';
      document.getElementById('itemSheetBackdrop').classList.add('open');
    }
  });

  // ---------- Item options popover (3-dot menu) ----------
  const itemMenuEl = document.getElementById('itemMenu');

  function closeItemMenu(){
    itemMenuEl.style.display = 'none';
    itemMenuEl.innerHTML = '';
  }

  function openItemMenu(anchorBtn, personId, itemId){
    const p = people.find(x=>x.id===personId);
    const it = p && (p.items||[]).find(x=>x.id===itemId);
    if(!it) return;

    const paid = Number(it.paid||0);

    itemMenuEl.innerHTML = `
      ${it.cleared
        ? `<button class="menu-current"><span class="dot" style="background:var(--cleared);"></span>Currently cleared</button>
           <button class="menu-debt" data-maction="debt"><span class="dot"></span>Mark as debt</button>`
        : `<button class="menu-current"><span class="dot" style="background:var(--debt);"></span>Currently debt${paid > 0 ? ' (partly paid)' : ''}</button>
           <button class="menu-pay" data-maction="pay"><span class="dot"></span>Record a payment</button>
           <button class="menu-clear" data-maction="clear"><span class="dot"></span>Mark as fully cleared</button>`
      }
      <button class="menu-delete" data-maction="delete">Remove item</button>
    `;

    itemMenuEl.style.display = 'block';
    const r = anchorBtn.getBoundingClientRect();
    const menuWidth = 190;
    let left = r.right - menuWidth;
    if(left < 8) left = 8;
    let top = r.bottom + 6;
    itemMenuEl.style.left = left + 'px';
    itemMenuEl.style.top = top + 'px';

    // Flip above the button if it would overflow the bottom of the screen
    requestAnimationFrame(()=>{
      const menuRect = itemMenuEl.getBoundingClientRect();
      if(menuRect.bottom > window.innerHeight - 10){
        itemMenuEl.style.top = (r.top - menuRect.height - 6) + 'px';
      }
    });

    itemMenuEl.dataset.person = personId;
    itemMenuEl.dataset.item = itemId;
  }

  itemMenuEl.addEventListener('click', (e)=>{
    const b = e.target.closest('button[data-maction]');
    if(!b) return;
    const maction = b.getAttribute('data-maction');
    const personId = itemMenuEl.dataset.person;
    const itemId = itemMenuEl.dataset.item;
    const p = people.find(x=>x.id===personId);
    if(!p) { closeItemMenu(); return; }
    const it = (p.items||[]).find(x=>x.id===itemId);

    if(maction === 'pay'){
      closeItemMenu();
      openPaymentSheet(personId, itemId);
      return;
    } else if(maction === 'clear' || maction === 'debt'){
      if(it){
        it.cleared = (maction === 'clear');
        it.paid = (maction === 'clear') ? Number(it.amount||0) : 0;
        savePeople();
        render();
        showToast(it.cleared ? `Marked "${it.name}" as cleared` : `Marked "${it.name}" as debt`);
      }
    } else if(maction === 'delete'){
      p.items = (p.items||[]).filter(x=>x.id!==itemId);
      savePeople();
      render();
    }
    closeItemMenu();
  });

  document.addEventListener('click', (e)=>{
    if(itemMenuEl.style.display === 'block' && !itemMenuEl.contains(e.target) && !e.target.closest('.kebab-btn')){
      closeItemMenu();
    }
  });
  window.addEventListener('scroll', closeItemMenu, true);
  window.addEventListener('resize', closeItemMenu);

  // ---------- Record a payment sheet ----------
  let paymentTargetPersonId = null;
  let paymentTargetItemId = null;
  const paymentSheet = document.getElementById('paymentSheetBackdrop');

  function openPaymentSheet(personId, itemId){
    const p = people.find(x=>x.id===personId);
    const it = p && (p.items||[]).find(x=>x.id===itemId);
    if(!it) return;
    paymentTargetPersonId = personId;
    paymentTargetItemId = itemId;
    const amt = Number(it.amount||0);
    const paid = Number(it.paid||0);
    const balance = Math.max(0, amt - paid);
    document.getElementById('paymentContext').textContent =
      `${it.name} — balance ${fmt(balance)} of ${fmt(amt)}${paid > 0 ? ` (already paid ${fmt(paid)})` : ''}`;
    document.getElementById('paymentAmtInput').value = '';
    document.getElementById('paymentError').textContent = '';
    paymentSheet.classList.add('open');
    setTimeout(()=> document.getElementById('paymentAmtInput').focus(), 50);
  }

  document.getElementById('cancelPaymentSheet').addEventListener('click', ()=> paymentSheet.classList.remove('open'));
  paymentSheet.addEventListener('click', (e)=>{ if(e.target === paymentSheet) paymentSheet.classList.remove('open'); });

  document.getElementById('savePaymentSheet').addEventListener('click', ()=>{
    const val = Number(document.getElementById('paymentAmtInput').value);
    const errEl = document.getElementById('paymentError');
    if(!val || val <= 0){ errEl.textContent = 'Enter an amount greater than 0'; return; }

    const p = people.find(x=>x.id===paymentTargetPersonId);
    const it = p && (p.items||[]).find(x=>x.id===paymentTargetItemId);
    if(!it){ paymentSheet.classList.remove('open'); return; }

    const amt = Number(it.amount||0);
    const currentPaid = Number(it.paid||0);
    const newPaid = Math.min(amt, currentPaid + val);
    it.paid = newPaid;
    const fullySettled = newPaid >= amt;
    it.cleared = fullySettled;

    savePeople();
    render();
    paymentSheet.classList.remove('open');

    const remaining = Math.max(0, amt - newPaid);
    showToast(fullySettled
      ? `Fully paid — "${it.name}" marked cleared`
      : `Payment recorded — balance now ${fmt(remaining)}`);
  });

  searchBox.addEventListener('input', render);

  // Add person sheet
  const personSheet = document.getElementById('personSheetBackdrop');
  document.getElementById('openAddPerson').addEventListener('click', ()=>{
    document.getElementById('pName').value = '';
    document.getElementById('pPhone').value = '';
    document.getElementById('pItemName').value = '';
    document.getElementById('pItemAmt').value = '';
    personSheet.classList.add('open');
  });
  document.getElementById('cancelAddPerson').addEventListener('click', ()=> personSheet.classList.remove('open'));
  personSheet.addEventListener('click', (e)=>{ if(e.target === personSheet) personSheet.classList.remove('open'); });

  document.getElementById('saveAddPerson').addEventListener('click', ()=>{
    const name = document.getElementById('pName').value.trim();
    const phone = document.getElementById('pPhone').value.trim();
    const itemName = document.getElementById('pItemName').value.trim();
    const amt = Number(document.getElementById('pItemAmt').value) || 0;

    if(!name){ showToast('Enter a name first'); return; }

    const newPerson = {
      id: uid(),
      name,
      phone,
      open: true,
      items: []
    };
    if(itemName){
      newPerson.items.push({
        id: uid(),
        name: itemName,
        amount: amt,
        paid: 0,
        cleared: false,
        date: new Date().toLocaleDateString('en-KE', {day:'numeric', month:'short'})
      });
    }
    people.push(newPerson);
    savePeople();
    render();
    personSheet.classList.remove('open');
    showToast(`Added ${name}`);
  });

  // Add item sheet
  const itemSheet = document.getElementById('itemSheetBackdrop');
  document.getElementById('cancelAddItem').addEventListener('click', ()=> itemSheet.classList.remove('open'));
  itemSheet.addEventListener('click', (e)=>{ if(e.target === itemSheet) itemSheet.classList.remove('open'); });

  document.getElementById('saveAddItem').addEventListener('click', ()=>{
    const name = document.getElementById('iItemName').value.trim();
    const amt = Number(document.getElementById('iItemAmt').value) || 0;
    if(!name){ showToast('Enter an item first'); return; }
    const p = people.find(x=>x.id===addItemTargetId);
    if(p){
      p.items = p.items || [];
      p.items.push({
        id: uid(),
        name,
        amount: amt,
        paid: 0,
        cleared: false,
        date: new Date().toLocaleDateString('en-KE', {day:'numeric', month:'short'})
      });
      savePeople();
      render();
    }
    itemSheet.classList.remove('open');
  });

  // ---------- Account / login system (replaces the PIN lock) ----------
  const ACCOUNT_KEY = 'deni_book_account';
  const RECOVERY_EMAIL_KEY = 'recovery_email';
  const EMAILJS_CONFIG_KEY = 'emailjs_config';

  // ---- Stay signed in ----
  const SESSION_KEY = 'deni_book_session';
  const AUTO_LOCK_MINUTES = 30;   // change this number to stay signed in longer or shorter
  const AUTO_LOCK_MS = AUTO_LOCK_MINUTES * 60 * 1000;
  let lastStamp = 0;

  function touchSession(force){
    const now = Date.now();
    if(!force && now - lastStamp < 15000) return; // save at most every 15 seconds
    lastStamp = now;
    localStorage.setItem(SESSION_KEY, String(now));
  }
  function sessionValid(){
    const t = Number(localStorage.getItem(SESSION_KEY) || 0);
    return !!t && (Date.now() - t) < AUTO_LOCK_MS;
  }
  function clearSession(){
    localStorage.removeItem(SESSION_KEY);
    lastStamp = 0;
  }

  const authView = document.getElementById('authView');
  const authForm = document.getElementById('authForm');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  const authRegisterFields = document.getElementById('authRegisterFields');
  const authMainFields = document.getElementById('authMainFields');
  const authOtpFields = document.getElementById('authOtpFields');
  const authForgotRow = document.getElementById('authForgotRow');
  const authSubmit = document.getElementById('authSubmit');
  const authName = document.getElementById('authName');
  const authBiz = document.getElementById('authBiz');
  const authPhone = document.getElementById('authPhone');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authOtp = document.getElementById('authOtp');
  const authTogglePass = document.getElementById('authTogglePass');

  let authMode = 'login';     // 'login' | 'register'
  let pendingSignup = null;   // holds details while waiting for the email OTP

  function getAccount(){
    try{ return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null'); }catch(e){ return null; }
  }
  function saveAccount(a){ localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)); }

  async function hashPassword(pw){
    // Real SHA-256 where available; simple fallback so the app never breaks.
    if(window.crypto && window.crypto.subtle){
      try{
        const enc = new TextEncoder().encode('deni-book-pw:' + pw);
        const buf = await window.crypto.subtle.digest('SHA-256', enc);
        return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
      }catch(e){ /* fall through */ }
    }
    return 'enc:' + btoa(unescape(encodeURIComponent('deni-book-pw:' + pw)));
  }

  async function verifyPassword(pw){
    const acc = getAccount();
    if(!acc || !acc.passHash) return false;
    return (await hashPassword(pw)) === acc.passHash;
  }

  async function setStoredPassword(pw){
    const acc = getAccount();
    if(!acc) return;
    acc.passHash = await hashPassword(pw);
    saveAccount(acc);
  }

  function emailOK(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function normPhone(v){
    let n = String(v||'').replace(/[\s\-()]/g,'');
    if(n.startsWith('+254')) n = '0' + n.slice(4);
    else if(n.startsWith('254')) n = '0' + n.slice(3);
    return n;
  }
  function phoneOK(v){ return /^(07\d{8}|01\d{8})$/.test(normPhone(v)); }
  function genCode(){ return String(Math.floor(100000 + Math.random() * 900000)); }

  function authErr(id, msg){ document.getElementById(id).textContent = msg || ''; }
  function clearAuthErrors(){
    ['authNameError','authBizError','authPhoneError','authEmailError','authPassError','authOtpError'].forEach(id => authErr(id, ''));
  }

  function getEmailConfig(){
    try{
      const raw = localStorage.getItem(EMAILJS_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function hasEmailConfig(){
    const c = getEmailConfig();
    return !!(c && c.serviceId && c.templateId && c.publicKey);
  }

  async function sendCodeEmail(toEmail, code){
    const cfg = getEmailConfig();
    if(!toEmail || !cfg) return false;
    try{
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: cfg.serviceId,
          template_id: cfg.templateId,
          user_id: cfg.publicKey,
          template_params: {
            to_email: toEmail,
            reset_code: code,
            otp_code: code,
            verification_code: code,
            app_name: 'Deni Book'
          }
        })
      });
      return res.ok;
    }catch(e){
      return false;
    }
  }

  function setAuthMode(mode){
    authMode = mode;
    pendingSignup = null;
    const isReg = mode === 'register';
    document.querySelectorAll('.a-toggle-btn').forEach(b => {
      const on = b.getAttribute('data-mode') === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    authRegisterFields.classList.toggle('a-hide', !isReg);
    authMainFields.classList.remove('a-hide');
    authOtpFields.classList.add('a-hide');
    authForgotRow.classList.toggle('a-hide', isReg);
    authTitle.textContent = isReg ? 'REGISTER' : 'LOGIN';
    authSubtitle.textContent = isReg ? 'Create your Deni Book account' : 'Welcome back to Deni Book';
    authSubmit.textContent = isReg ? 'Create account' : 'Login';
    authSubmit.disabled = false;
    authPassword.autocomplete = isReg ? 'new-password' : 'current-password';
    clearAuthErrors();
  }

  document.querySelectorAll('.a-toggle-btn').forEach(b => {
    b.addEventListener('click', () => setAuthMode(b.getAttribute('data-mode')));
  });

  authTogglePass.addEventListener('click', () => {
    const hidden = authPassword.type === 'password';
    authPassword.type = hidden ? 'text' : 'password';
    authTogglePass.textContent = hidden ? 'Hide' : 'Show';
  });

  function unlockApp(){
    touchSession(true);
    renderDashboard();
    authView.classList.add('a-gone');
    authPassword.value = '';
    authPassword.type = 'password';
    authTogglePass.textContent = 'Show';
    authOtp.value = '';
  }

  function lockApp(full){
    clearSession();
    if(full && hasCloud()){
      // send the last changes online, then forget the online login on this phone
      clearTimeout(pushTimer);
      cloudPush().then(()=> setCloudSession(null), ()=> setCloudSession(null));
    }
    authView.classList.remove('a-gone');
    initAuth();
  }

  async function finishRegistration(info){
    // create (or link) the online account first, when online backup is switched on
    if(CLOUD_ON){
      authSubmit.textContent = 'Creating account...';
      const failBack = (msg)=>{ setAuthMode('register'); authErr('authEmailError', msg); return false; };
      const up = await cloudSignUp(info.email, info.password, { name: info.name, business: info.business, phone: info.phone });
      if(up.ok){
        setCloudSession(up.session);
      } else if(up.exists){
        const inn = await cloudSignIn(info.email, info.password);
        if(inn.ok){ setCloudSession(inn.session); }
        else { return failBack('This email already has an account. Use Login, or Forgot Password.'); }
      } else if(up.needsConfirm){
        return failBack('Almost done: check your email to confirm your account, then Login.');
      } else if(up.network){
        // offline: create it on this phone now, it links online at the next login
      } else {
        return failBack(up.error || 'Could not create the online account. Try again.');
      }
    }
    const existing = getAccount();
    saveAccount({
      name: info.name,
      business: info.business || (existing && existing.business) || '',
      phone: info.phone,
      email: info.email,
      passHash: info.passHash,
      createdAt: (existing && existing.createdAt) || Date.now()
    });
    // keep the reset email in step with the account email
    if(!localStorage.getItem(RECOVERY_EMAIL_KEY)) localStorage.setItem(RECOVERY_EMAIL_KEY, info.email);
    pendingSignup = null;
    unlockApp();
    showToast('Welcome, ' + info.name.split(' ')[0]);
    if(hasCloud()) cloudReconcile();
    return true;
  }

  authForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    clearAuthErrors();

    // ----- Step 2 of register: confirm the email OTP -----
    if(authMode === 'register' && pendingSignup){
      const val = authOtp.value.trim();
      if(Date.now() > pendingSignup.expiresAt){ authErr('authOtpError', 'OTP has expired. Go back and try again.'); return; }
      if(!/^\d{6}$/.test(val) || val !== pendingSignup.code){ authErr('authOtpError', 'Incorrect OTP.'); return; }
      authSubmit.disabled = true;
      await finishRegistration(pendingSignup);
      authSubmit.disabled = false;
      return;
    }

    const email = authEmail.value.trim();
    const password = authPassword.value;
    let ok = true;

    if(!emailOK(email)){ authErr('authEmailError', 'Enter a valid email address.'); ok = false; }
    if(password.length < 6){ authErr('authPassError', 'Password must be at least 6 characters.'); ok = false; }

    // ----- Register -----
    if(authMode === 'register'){
      const name = authName.value.trim();
      const phone = normPhone(authPhone.value.trim());
      const business = authBiz.value.trim();
      if(name.length < 2){ authErr('authNameError', 'Enter your full name.'); ok = false; }
      if(business.length < 2){ authErr('authBizError', 'Enter your hotel or shop name.'); ok = false; }
      if(!phoneOK(phone)){ authErr('authPhoneError', 'Enter a valid Safaricom number.'); ok = false; }
      if(!ok) return;

      const existing = getAccount();
      if(existing && existing.passHash){
        authErr('authEmailError', 'An account already exists on this phone. Please login.');
        return;
      }
      if(existing && existing.email && existing.email.toLowerCase() !== email.toLowerCase()){
        authErr('authEmailError', 'Use the email you signed up with: ' + existing.email);
        return;
      }

      authSubmit.disabled = true;
      const passHash = await hashPassword(password);
      const info = { name, business, phone, email, passHash, password };

      // If EmailJS is set up, confirm the email with an OTP first
      if(hasEmailConfig()){
        authSubmit.textContent = 'Sending OTP...';
        const code = genCode();
        const sent = await sendCodeEmail(email, code);
        if(!sent){
          authSubmit.disabled = false;
          authSubmit.textContent = 'Create account';
          authErr('authEmailError', 'OTP could not be sent. Check your EmailJS settings.');
          return;
        }
        pendingSignup = Object.assign({ code, expiresAt: Date.now() + 10 * 60 * 1000 }, info);
        document.getElementById('authOtpEmail').textContent = email;
        authRegisterFields.classList.add('a-hide');
        authMainFields.classList.add('a-hide');
        authOtpFields.classList.remove('a-hide');
        authSubmit.textContent = 'Verify OTP & Create Account';
        authSubmit.disabled = false;
        authOtp.focus();
        return;
      }

      await finishRegistration(info);
      authSubmit.disabled = false;
      return;
    }

    // ----- Login -----
    if(!ok) return;
    const acc = getAccount();
    const emailMatch = !!(acc && acc.email && acc.email.toLowerCase() === email.toLowerCase());
    let offline = false;

    if(CLOUD_ON){
      authSubmit.disabled = true;
      authSubmit.textContent = 'Signing in...';
      const inn = await cloudSignIn(email, password);
      authSubmit.disabled = false;
      authSubmit.textContent = 'Login';

      if(inn.ok){
        setCloudSession(inn.session);
        const meta = inn.session.meta || {};
        const passHash = await hashPassword(password);
        if(!emailMatch){
          // a new phone (or another account): build the local account from the online one
          if(acc){
            try{ localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(DATA_STAMP_KEY); }catch(e){}
            people = [];
          }
          saveAccount({
            name: meta.name || '',
            business: meta.business || '',
            phone: meta.phone || '',
            email: inn.session.email || email,
            passHash: passHash,
            createdAt: Date.now()
          });
        } else {
          acc.passHash = passHash;   // keep this phone's password in step with the online one
          saveAccount(acc);
        }
        unlockApp();
        cloudReconcile();
        return;
      }

      if(inn.network){
        offline = true;
      } else {
        // the online account said no: maybe an older phone-only account that needs linking
        if(emailMatch && acc.passHash && await verifyPassword(password)){
          const up = await cloudSignUp(email, password, { name: acc.name, business: acc.business, phone: acc.phone });
          if(up.ok){
            setCloudSession(up.session);
            unlockApp();
            cloudReconcile();
            showToast('Online backup is now on');
            return;
          }
          unlockApp();
          showToast('Logged in. Online backup is not linked: the password differs from the online account.');
          return;
        }
        authErr('authPassError', 'Wrong email or password.');
        return;
      }
    }

    // local login (online backup off, or no internet)
    if(!acc){
      authErr('authEmailError', offline ? 'No internet connection. Connect to log in on this phone.' : 'No account found. Please register first.');
      return;
    }
    if(!acc.passHash){
      authErr('authEmailError', 'Please register once to set a password.');
      return;
    }
    authSubmit.disabled = true;
    const pwOk = await verifyPassword(password);
    authSubmit.disabled = false;
    if(!emailMatch || !pwOk){ authErr('authPassError', 'Wrong email or password.'); return; }
    if(offline) showToast('No internet: showing the book saved on this phone');
    unlockApp();
  });

  function initAuth(){
    const acc = getAccount();
    authPassword.value = '';
    if(acc && acc.passHash){
      setAuthMode('login');
      authEmail.value = acc.email || '';
    } else if(acc){
      // older account that only had a PIN: ask them to set a password
      setAuthMode('register');
      authEmail.value = acc.email || '';
      authName.value = acc.name || '';
      authBiz.value = acc.business || '';
      authPhone.value = acc.phone || '';
      authSubtitle.textContent = 'Set a password to continue';
    } else {
      setAuthMode(CLOUD_ON ? 'login' : 'register');
      if(CLOUD_ON) authSubtitle.textContent = 'New phone? Login to restore your book';
    }
  }

  document.getElementById('authForgot').addEventListener('click', ()=>{ showResetScreen(); });

  // ---------- Email-based password reset ----------
  const resetScreenEl = document.getElementById('resetScreen');
  const resetContentEl = document.getElementById('resetContent');
  let resetStep = 'choice';
  let resetError = '';
  let resetCodeState = null; // { code, expiresAt }
  let resetEmailSent = '';

  function resetTargetEmail(){
    const acc = getAccount();
    return (acc && acc.email) || localStorage.getItem(RECOVERY_EMAIL_KEY) || '';
  }

  async function sendResetCodeEmail(){
    const email = resetTargetEmail();
    if(!email || !hasEmailConfig()) return false;
    const code = genCode();
    resetCodeState = { code, expiresAt: Date.now() + 10 * 60 * 1000 };
    return await sendCodeEmail(email, code);
  }

  function showResetScreen(){
    resetStep = CLOUD_ON ? 'cloudAsk' : 'choice';
    resetError = '';
    resetScreenEl.style.display = 'flex';
    renderResetStep();
  }

  function hideResetScreen(){
    resetScreenEl.style.display = 'none';
  }

  function renderCloudReset(){
    if(resetStep === 'cloudAsk'){
      const prefill = (authEmail.value || resetTargetEmail() || '').trim();
      resetContentEl.innerHTML = `
        <div class="lock-sub">Enter your account email. We will send you a link to set a new password.</div>
        <div class="field" style="margin-top:12px;">
          <label for="resetEmailInput">Email</label>
          <input type="email" id="resetEmailInput" value="${escapeHtml(prefill)}" placeholder="you@example.com" autocomplete="email">
        </div>
        <div class="lock-error">${resetError || ''}</div>
        <div class="sheet-actions" style="flex-direction:column; gap:10px;">
          <button class="btn-primary" data-raction="cloudSend">Send reset link</button>
          <button class="lock-reset-link" data-raction="close">Cancel</button>
        </div>`;
    } else if(resetStep === 'cloudSending'){
      resetContentEl.innerHTML = `<div class="lock-sub" style="text-align:center; margin-top:16px;">Sending...</div>`;
    } else if(resetStep === 'cloudSent'){
      resetContentEl.innerHTML = `
        <div class="lock-sub" style="text-align:center;">If that email has an account, a link is on its way to<br><strong style="color:var(--paper);">${escapeHtml(resetEmailSent)}</strong>.<br><br>Open the link on this phone. It brings you back here to set a new password.</div>
        <div class="sheet-actions" style="flex-direction:column; gap:10px; margin-top:14px;">
          <button class="btn-secondary" data-raction="cloudBack">Use a different email</button>
          <button class="lock-reset-link" data-raction="close">Close</button>
        </div>`;
    } else if(resetStep === 'cloudNew'){
      resetContentEl.innerHTML = `
        <div class="lock-sub" style="text-align:center;">Set a new password.</div>
        <div class="field" style="margin-top:14px;">
          <label for="resetNewPw">New password</label>
          <input type="password" id="resetNewPw" placeholder="At least 6 characters" autocomplete="new-password">
        </div>
        <div class="field">
          <label for="resetConfirmPw">Confirm new password</label>
          <input type="password" id="resetConfirmPw" placeholder="Enter it again" autocomplete="new-password">
        </div>
        <div class="lock-error">${resetError || ''}</div>
        <div class="sheet-actions">
          <button class="btn-primary" data-raction="cloudSave" style="width:100%;">Save new password</button>
        </div>`;
    }
  }

  function renderResetStep(){
    if(resetStep.indexOf('cloud') === 0){ renderCloudReset(); return; }
    const email = resetTargetEmail();
    const canEmail = !!(email && hasEmailConfig() && getAccount());

    if(resetStep === 'choice'){
      resetContentEl.innerHTML = `
        <div class="lock-sub">Reset your password using your email.</div>
        <div class="sheet-actions" style="flex-direction:column; gap:10px; margin-top:10px;">
          <button class="btn-primary" data-raction="sendCode" ${canEmail ? '' : 'disabled style="opacity:0.5;"'}>Send reset code to my email</button>
          <button class="lock-reset-link" data-raction="close" style="margin-top:2px;">Cancel</button>
        </div>
        ${canEmail ? '' : `<div class="lock-sub" style="margin-top:16px; font-size:11.5px;">No reset email is set up yet. After you're in, go to ⚙ Settings → Password reset email to enable this.</div>`}
      `;
    } else if(resetStep === 'sending'){
      resetContentEl.innerHTML = `<div class="lock-sub" style="text-align:center; margin-top:16px;">Sending code to ${escapeHtml(email)}...</div>`;
    } else if(resetStep === 'enterCode'){
      resetContentEl.innerHTML = `
        <div class="lock-sub" style="text-align:center;">We sent a 6-digit code to<br><strong style="color:var(--paper);">${escapeHtml(email)}</strong></div>
        <div class="field" style="margin-top:14px;">
          <label for="resetCodeInput">Enter code</label>
          <input type="text" inputmode="numeric" maxlength="6" id="resetCodeInput" placeholder="000000">
        </div>
        <div class="lock-error">${resetError || ''}</div>
        <div class="sheet-actions" style="flex-direction:column; gap:10px;">
          <button class="btn-primary" data-raction="verifyCode">Verify code</button>
          <button class="btn-secondary" data-raction="resend">Resend code</button>
          <button class="lock-reset-link" data-raction="backChoice">Back</button>
        </div>
      `;
    } else if(resetStep === 'newPassword'){
      resetContentEl.innerHTML = `
        <div class="lock-sub" style="text-align:center;">Code verified. Set a new password.</div>
        <div class="field" style="margin-top:14px;">
          <label for="resetNewPw">New password</label>
          <input type="password" id="resetNewPw" placeholder="At least 6 characters" autocomplete="new-password">
        </div>
        <div class="field">
          <label for="resetConfirmPw">Confirm new password</label>
          <input type="password" id="resetConfirmPw" placeholder="Enter it again" autocomplete="new-password">
        </div>
        <div class="lock-error">${resetError || ''}</div>
        <div class="sheet-actions">
          <button class="btn-primary" data-raction="saveNewPassword" style="width:100%;">Save new password</button>
        </div>
      `;
    }
  }

  resetContentEl.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-raction]');
    if(!btn || btn.disabled) return;
    const action = btn.getAttribute('data-raction');

    if(action === 'cloudSend'){
      const em = (document.getElementById('resetEmailInput').value || '').trim();
      if(!emailOK(em)){ resetError = 'Enter a valid email address'; renderResetStep(); return; }
      resetStep = 'cloudSending';
      renderResetStep();
      try{
        const r = await sbFetch('/auth/v1/recover', { method: 'POST', body: JSON.stringify({ email: em }) });
        if(r.ok){ resetEmailSent = em; resetError = ''; resetStep = 'cloudSent'; }
        else { resetError = errMsg(r.body) || 'Could not send the email. Try again later.'; resetStep = 'cloudAsk'; }
      }catch(e){
        resetError = 'No internet connection.';
        resetStep = 'cloudAsk';
      }
      renderResetStep();
    } else if(action === 'cloudBack'){
      resetError = '';
      resetStep = 'cloudAsk';
      renderResetStep();
    } else if(action === 'cloudSave'){
      const p1 = document.getElementById('resetNewPw').value;
      const p2 = document.getElementById('resetConfirmPw').value;
      if(p1.length < 6){ resetError = 'Password must be at least 6 characters'; renderResetStep(); return; }
      if(p1 !== p2){ resetError = "Passwords didn't match"; renderResetStep(); return; }
      try{
        const r = await sbFetch('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: p1 }) }, recoveryToken);
        if(r.ok){
          const em = (r.body && r.body.email) || '';
          const acc = getAccount();
          if(acc && acc.email && em && acc.email.toLowerCase() === em.toLowerCase()){
            acc.passHash = await hashPassword(p1);
            saveAccount(acc);
          }
          recoveryToken = null;
          hideResetScreen();
          if(em) authEmail.value = em;
          setAuthMode('login');
          showToast('Password updated. Please login.');
        } else {
          resetError = errMsg(r.body) || 'Could not update the password. The link may have expired.';
          renderResetStep();
        }
      }catch(e){
        resetError = 'No internet connection.';
        renderResetStep();
      }
    } else if(action === 'close'){
      hideResetScreen();
    } else if(action === 'sendCode' || action === 'resend'){
      resetStep = 'sending';
      renderResetStep();
      const ok = await sendResetCodeEmail();
      if(ok){
        resetError = '';
        resetStep = 'enterCode';
      } else {
        resetStep = 'choice';
        alert('Could not send the email. Check your internet connection and reset email settings.');
      }
      renderResetStep();
    } else if(action === 'verifyCode'){
      const val = document.getElementById('resetCodeInput').value.trim();
      if(!resetCodeState || Date.now() > resetCodeState.expiresAt){
        resetError = 'Code expired — send a new one.';
        renderResetStep();
        return;
      }
      if(val === resetCodeState.code){
        resetError = '';
        resetStep = 'newPassword';
      } else {
        resetError = 'Incorrect code.';
      }
      renderResetStep();
    } else if(action === 'saveNewPassword'){
      const p1 = document.getElementById('resetNewPw').value;
      const p2 = document.getElementById('resetConfirmPw').value;
      if(p1.length < 6){ resetError = 'Password must be at least 6 characters'; renderResetStep(); return; }
      if(p1 !== p2){ resetError = "Passwords didn't match"; renderResetStep(); return; }
      await setStoredPassword(p1);
      resetCodeState = null;
      hideResetScreen();
      unlockApp();
      showToast('Password reset — you\'re in');
    } else if(action === 'backChoice'){
      resetError = '';
      resetStep = 'choice';
      renderResetStep();
    }
  });

  // ---------- Password sheet (used for delete confirmation & changing password) ----------
  const pinSheet = document.getElementById('pinSheetBackdrop');
  const pinSheetTitle = document.getElementById('pinSheetTitle');
  const pinSheetLabel = document.getElementById('pinSheetLabel');
  const pinSheetInput = document.getElementById('pinSheetInput');
  const pinSheetConfirmWrap = document.getElementById('pinSheetConfirmWrap');
  const pinSheetConfirmInput = document.getElementById('pinSheetConfirmInput');
  const pinSheetError = document.getElementById('pinSheetError');

  let pinSheetMode = null; // 'delete' | 'changeVerify' | 'changeSetup'
  let pinSheetPayload = null;

  function openPinSheet(mode, payload){
    pinSheetMode = mode;
    pinSheetPayload = payload || null;
    pinSheetInput.value = '';
    pinSheetConfirmInput.value = '';
    pinSheetError.textContent = '';
    pinSheetConfirmWrap.style.display = 'none';

    if(mode === 'delete'){
      pinSheetTitle.textContent = 'Confirm password to delete';
      pinSheetLabel.textContent = 'Enter your password';
    } else if(mode === 'changeVerify'){
      pinSheetTitle.textContent = 'Enter current password';
      pinSheetLabel.textContent = 'Current password';
    }
    pinSheet.classList.add('open');
    setTimeout(()=> pinSheetInput.focus(), 50);
  }

  function closePinSheet(){
    pinSheet.classList.remove('open');
    pinSheetMode = null;
    pinSheetPayload = null;
  }

  // name kept so the delete button elsewhere in the app still works
  function requestPinFor(type, payload){
    openPinSheet(type, payload);
  }

  document.getElementById('cancelPinSheet').addEventListener('click', closePinSheet);
  pinSheet.addEventListener('click', (e)=>{ if(e.target === pinSheet) closePinSheet(); });

  document.getElementById('changePinBtn').addEventListener('click', ()=>{
    document.getElementById('settingsSheetBackdrop').classList.add('open');
  });

  // ---------- Settings sheet ----------
  const settingsSheet = document.getElementById('settingsSheetBackdrop');
  document.getElementById('cancelSettingsSheet').addEventListener('click', ()=> settingsSheet.classList.remove('open'));
  settingsSheet.addEventListener('click', (e)=>{
    if(e.target === settingsSheet){ settingsSheet.classList.remove('open'); return; }
    const b = e.target.closest('[data-saction]');
    if(!b) return;
    const act = b.getAttribute('data-saction');
    settingsSheet.classList.remove('open');
    if(act === 'backup'){
      openBackupSheet();
    } else if(act === 'businessName'){
      openBizSheet();
    } else if(act === 'changePassword'){
      requestPinFor('changeVerify');
    } else if(act === 'resetEmail'){
      openEmailConfigSheet();
    } else if(act === 'logout'){
      lockApp(true);
    }
  });

  // ---------- Online backup (Supabase) ----------
  const CLOUD_ON = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  const CLOUD_SESSION_KEY = 'deni_cloud_session';
  const DATA_STAMP_KEY = 'deni_data_updated';   // when the book on this phone last changed
  const CLOUD_SYNC_KEY = 'deni_cloud_synced';   // last successful online sync
  let cloudState = 'off';                       // off | synced | pending | offline
  let pushTimer = null;
  let recoveryToken = null;

  function getCloudSession(){
    try{ return JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY) || 'null'); }catch(e){ return null; }
  }
  function setCloudSession(s){
    if(s) localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(CLOUD_SESSION_KEY);
    renderCloudChip();
  }
  function hasCloud(){ return CLOUD_ON && !!getCloudSession(); }
  function stampData(){ localStorage.setItem(DATA_STAMP_KEY, String(Date.now())); }
  function dataStamp(){ return Number(localStorage.getItem(DATA_STAMP_KEY) || 0); }

  function errMsg(body){
    if(!body) return '';
    return String(body.msg || body.error_description || body.message || body.error || '');
  }

  async function sbFetch(path, opts, token){
    const headers = Object.assign({ apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
    if(token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(SUPABASE_URL.replace(/\/+$/, '') + path, Object.assign({}, opts, { headers }));
    let body = null;
    try{ body = await res.json(); }catch(e){}
    return { ok: res.ok, status: res.status, body };
  }

  function sessionFromAuth(body){
    const u = body.user || {};
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: body.expires_at || (Math.floor(Date.now() / 1000) + (body.expires_in || 3600)),
      user_id: u.id,
      email: u.email,
      meta: u.user_metadata || {}
    };
  }

  async function cloudSignIn(email, password){
    try{
      const r = await sbFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
      if(r.ok && r.body && r.body.access_token) return { ok: true, session: sessionFromAuth(r.body) };
      return { ok: false, status: r.status, error: errMsg(r.body) };
    }catch(e){
      return { ok: false, network: true };
    }
  }

  async function cloudSignUp(email, password, meta){
    try{
      const r = await sbFetch('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password, data: meta }) });
      if(r.ok && r.body && r.body.access_token) return { ok: true, session: sessionFromAuth(r.body) };
      if(r.ok && r.body){
        // no session came back: email already used (hidden), or email confirmation is required
        const hidden = Array.isArray(r.body.identities) && r.body.identities.length === 0;
        return hidden ? { ok: false, exists: true } : { ok: false, needsConfirm: true };
      }
      const msg = errMsg(r.body).toLowerCase();
      if(msg.indexOf('already') !== -1) return { ok: false, exists: true };
      return { ok: false, error: errMsg(r.body) };
    }catch(e){
      return { ok: false, network: true };
    }
  }

  // returns a session with a valid access token, refreshing it when it is about to expire
  async function cloudToken(){
    let s = getCloudSession();
    if(!s) return null;
    if(s.expires_at - 60 > Date.now() / 1000) return s;
    try{
      const r = await sbFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token }) });
      if(r.ok && r.body && r.body.access_token){
        s = Object.assign({}, s, sessionFromAuth(r.body));
        setCloudSession(s);
        return s;
      }
      if(r.status === 400 || r.status === 401) setCloudSession(null);   // login expired for good
    }catch(e){}
    return null;
  }

  function renderCloudChip(){
    const chip = document.getElementById('chipCloud');
    if(!chip) return;
    if(!hasCloud()){ chip.classList.add('hidden-chip'); return; }
    chip.classList.remove('hidden-chip', 'is-pending', 'is-offline');
    if(cloudState === 'pending'){ chip.textContent = '☁ Syncing...'; chip.classList.add('is-pending'); }
    else if(cloudState === 'offline'){ chip.textContent = '☁ Not synced yet'; chip.classList.add('is-offline'); }
    else { chip.textContent = '☁ Synced'; }
  }
  function setCloudState(state){
    cloudState = state;
    renderCloudChip();
  }

  async function cloudPush(){
    if(!hasCloud()) return false;
    const s = await cloudToken();
    if(!s){ setCloudState('offline'); return false; }
    const acc = getAccount() || {};
    const row = {
      user_id: s.user_id,
      data: { people: people, business: acc.business || '', stamp: dataStamp() || Date.now() },
      updated_at: new Date().toISOString()
    };
    try{
      const r = await sbFetch('/rest/v1/books?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row)
      }, s.access_token);
      if(r.ok){
        localStorage.setItem(CLOUD_SYNC_KEY, String(Date.now()));
        setCloudState('synced');
        return true;
      }
    }catch(e){}
    setCloudState('offline');
    return false;
  }

  async function cloudPull(){
    const s = await cloudToken();
    if(!s) return { ok: false };
    try{
      const r = await sbFetch('/rest/v1/books?select=data,updated_at&limit=1', { method: 'GET' }, s.access_token);
      if(r.ok && Array.isArray(r.body)) return { ok: true, row: r.body[0] || null };
    }catch(e){}
    return { ok: false };
  }

  function applyCloudData(d, stamp){
    if(people.length){
      try{ localStorage.setItem('people_before_restore', JSON.stringify(people)); }catch(e){}
    }
    people = d.people
      .filter(p => p && typeof p.name === 'string' && p.id)
      .map(p => Object.assign({}, p, { items: p.items || [] }));
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(people)); }catch(e){}
    localStorage.setItem(DATA_STAMP_KEY, String(stamp));
    const acc = getAccount();
    if(acc && d.business && acc.business !== d.business){ acc.business = d.business; saveAccount(acc); }
    render();
  }

  // Compare this phone with the online copy: the newer one wins.
  async function cloudReconcile(){
    if(!hasCloud()) return;
    setCloudState('pending');
    const res = await cloudPull();
    if(!res.ok){ setCloudState('offline'); return; }
    const d = res.row && res.row.data;
    const cloudHas = !!(d && Array.isArray(d.people));
    const cloudStamp = cloudHas ? (Number(d.stamp) || Date.parse(res.row.updated_at) || 0) : 0;
    if(cloudHas && cloudStamp > dataStamp()){
      applyCloudData(d, cloudStamp);
      localStorage.setItem(CLOUD_SYNC_KEY, String(Date.now()));
      setCloudState('synced');
      showToast('Your book was restored from online backup');
    } else {
      await cloudPush();
    }
  }

  function scheduleCloudPush(){
    if(!hasCloud()) return;
    setCloudState('pending');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(()=>{ cloudPush(); }, 1500);
  }

  window.addEventListener('online', ()=>{
    if(hasCloud() && cloudState !== 'synced') cloudReconcile();
  });

  // The reset-password email link brings people back here with a token in the address
  function checkRecoveryLink(){
    if(!CLOUD_ON || !location.hash || location.hash.length < 2) return;
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const clean = ()=>{ try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){} };
    if(params.get('error_description')){
      clean();
      showToast('That reset link has expired. Please ask for a new one.');
      return;
    }
    if(params.get('type') === 'recovery' && params.get('access_token')){
      recoveryToken = params.get('access_token');
      clean();
      resetStep = 'cloudNew';
      resetError = '';
      resetScreenEl.style.display = 'flex';
      renderResetStep();
    }
  }

  // ---------- Backup and restore ----------
  const LAST_BACKUP_KEY = 'deni_book_last_backup';
  const backupSheet = document.getElementById('backupSheetBackdrop');
  const restoreFile = document.getElementById('restoreFile');

  function refreshCloudLine(){
    const line = document.getElementById('cloudLine');
    const row = document.getElementById('syncRow');
    const note = document.getElementById('backupNote');
    if(!CLOUD_ON){
      line.textContent = 'Online backup is not set up yet.';
      row.style.display = 'none';
      return;
    }
    if(!hasCloud()){
      line.textContent = 'Online backup is off on this phone. Log in with internet to turn it on.';
      row.style.display = 'none';
      return;
    }
    const last = Number(localStorage.getItem(CLOUD_SYNC_KEY) || 0);
    line.textContent = '☁ Online backup is ON · ' + (last
      ? 'Last synced: ' + new Date(last).toLocaleString('en-KE', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})
      : 'not synced yet');
    row.style.display = 'flex';
    note.textContent = 'Your book is also saved online. To use it on another phone, log in with the same email and password. You can still download a file copy below.';
  }

  function refreshBackupLabel(){
    refreshCloudLine();
    const last = Number(localStorage.getItem(LAST_BACKUP_KEY) || 0);
    document.getElementById('backupLast').textContent = last
      ? 'Last backup: ' + new Date(last).toLocaleString('en-KE', {day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'})
      : 'No backup yet';
  }
  function openBackupSheet(){
    refreshBackupLabel();
    backupSheet.classList.add('open');
  }
  document.getElementById('chipBackup').addEventListener('click', openBackupSheet);
  document.getElementById('closeBackup').addEventListener('click', ()=> backupSheet.classList.remove('open'));
  backupSheet.addEventListener('click', (e)=>{ if(e.target === backupSheet) backupSheet.classList.remove('open'); });

  document.getElementById('downloadBackup').addEventListener('click', ()=>{
    const acc = getAccount() || {};
    const data = {
      app: 'deni-book',
      version: 1,
      exportedAt: new Date().toISOString(),
      business: acc.business || '',
      people: people
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deni-book-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 3000);
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    refreshBackupLabel();
    renderDashboard();
    showToast('Backup downloaded');
  });

  document.getElementById('chooseRestore').addEventListener('click', ()=> restoreFile.click());

  document.getElementById('syncNow').addEventListener('click', async ()=>{
    const btn = document.getElementById('syncNow');
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    await cloudReconcile();
    btn.disabled = false;
    btn.textContent = 'Sync now';
    refreshBackupLabel();
    showToast(cloudState === 'synced' ? 'Synced' : 'Could not sync. Check your internet.');
  });

  restoreFile.addEventListener('change', ()=>{
    const file = restoreFile.files && restoreFile.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onerror = ()=>{ showToast('Could not read that file'); };
    reader.onload = ()=>{
      let list = null, biz = '';
      try{
        const parsed = JSON.parse(reader.result);
        list = Array.isArray(parsed) ? parsed : (parsed && parsed.app === 'deni-book' ? parsed.people : null);
        biz = (parsed && parsed.business) || '';
      }catch(e){ list = null; }

      const valid = Array.isArray(list) && list.every(p => p && typeof p.name === 'string' && p.id && (p.items === undefined || Array.isArray(p.items)));
      if(!valid){ showToast('That is not a Deni Book backup file'); restoreFile.value = ''; return; }

      const msg = 'Replace the ' + people.length + ' people on this phone with the ' + list.length + ' from this backup?';
      if(!confirm(msg)){ restoreFile.value = ''; return; }

      // keep a safety copy of what was here before
      try{ localStorage.setItem('people_before_restore', JSON.stringify(people)); }catch(e){}

      people = list.map(p => Object.assign({}, p, { items: p.items || [] }));
      savePeople();

      const acc = getAccount();
      if(acc && !acc.business && biz){ acc.business = biz; saveAccount(acc); }

      render();
      backupSheet.classList.remove('open');
      restoreFile.value = '';
      showToast('Restored ' + people.length + (people.length === 1 ? ' person' : ' people'));
    };
    reader.readAsText(file);
  });

  // ---------- Business name sheet ----------
  const bizSheet = document.getElementById('bizSheetBackdrop');
  const bizInput = document.getElementById('bizInput');
  const bizError = document.getElementById('bizError');
  function openBizSheet(){
    const acc = getAccount() || {};
    bizInput.value = acc.business || '';
    bizError.textContent = '';
    bizSheet.classList.add('open');
    setTimeout(()=> bizInput.focus(), 50);
  }
  document.getElementById('cancelBiz').addEventListener('click', ()=> bizSheet.classList.remove('open'));
  bizSheet.addEventListener('click', (e)=>{ if(e.target === bizSheet) bizSheet.classList.remove('open'); });
  document.getElementById('saveBiz').addEventListener('click', ()=>{
    const val = bizInput.value.trim();
    if(val.length < 2){ bizError.textContent = 'Enter your hotel or shop name'; return; }
    const acc = getAccount();
    if(!acc) return;
    acc.business = val;
    saveAccount(acc);
    renderDashboard();
    bizSheet.classList.remove('open');
    showToast('Business name saved');
  });

  // ---------- Coming soon sheet ----------
  const soonSheet = document.getElementById('soonSheetBackdrop');
  document.getElementById('soonBtn').addEventListener('click', ()=> soonSheet.classList.add('open'));
  document.getElementById('closeSoon').addEventListener('click', ()=> soonSheet.classList.remove('open'));
  soonSheet.addEventListener('click', (e)=>{ if(e.target === soonSheet) soonSheet.classList.remove('open'); });

  // ---------- Reset email config sheet ----------
  const emailConfigSheet = document.getElementById('emailConfigSheetBackdrop');
  function openEmailConfigSheet(){
    const email = localStorage.getItem(RECOVERY_EMAIL_KEY) || '';
    const cfg = getEmailConfig() || {};
    document.getElementById('recEmailInput').value = email;
    document.getElementById('ejsServiceId').value = cfg.serviceId || '';
    document.getElementById('ejsTemplateId').value = cfg.templateId || '';
    document.getElementById('ejsPublicKey').value = cfg.publicKey || '';
    document.getElementById('emailConfigError').textContent = '';
    emailConfigSheet.classList.add('open');
  }
  document.getElementById('cancelEmailConfig').addEventListener('click', ()=> emailConfigSheet.classList.remove('open'));
  emailConfigSheet.addEventListener('click', (e)=>{ if(e.target === emailConfigSheet) emailConfigSheet.classList.remove('open'); });

  document.getElementById('saveEmailConfig').addEventListener('click', ()=>{
    const email = document.getElementById('recEmailInput').value.trim();
    const sid = document.getElementById('ejsServiceId').value.trim();
    const tid = document.getElementById('ejsTemplateId').value.trim();
    const pk = document.getElementById('ejsPublicKey').value.trim();
    const errEl = document.getElementById('emailConfigError');

    if(!email){ errEl.textContent = 'Enter a password reset email'; return; }
    if(!/^\S+@\S+\.\S+$/.test(email)){ errEl.textContent = 'Enter a valid email address'; return; }

    if(sid || tid || pk){
      if(!sid || !tid || !pk){
        errEl.textContent = 'Fill in all three EmailJS fields, or leave all three blank';
        return;
      }
      localStorage.setItem(EMAILJS_CONFIG_KEY, JSON.stringify({ serviceId: sid, templateId: tid, publicKey: pk }));
    } else {
      localStorage.removeItem(EMAILJS_CONFIG_KEY);
    }

    localStorage.setItem(RECOVERY_EMAIL_KEY, email);
    emailConfigSheet.classList.remove('open');
    showToast('Password reset email saved');
  });

  document.getElementById('confirmPinSheet').addEventListener('click', async ()=>{
    const val = pinSheetInput.value;

    if(pinSheetMode === 'delete'){
      if(!val){ pinSheetError.textContent = 'Enter your password'; return; }
      const ok = await verifyPassword(val);
      if(ok){
        const p = people.find(x=>x.id===pinSheetPayload);
        people = people.filter(x=>x.id!==pinSheetPayload);
        savePeople();
        render();
        closePinSheet();
        showToast(p ? `Removed ${p.name}` : 'Removed');
      } else {
        pinSheetError.textContent = 'Incorrect password';
        pinSheetInput.value = '';
      }
    } else if(pinSheetMode === 'changeVerify'){
      const ok = await verifyPassword(val);
      if(ok){
        pinSheetMode = 'changeSetup';
        pinSheetTitle.textContent = 'Set a new password';
        pinSheetLabel.textContent = 'New password';
        pinSheetConfirmWrap.style.display = 'block';
        pinSheetInput.value = '';
        pinSheetError.textContent = '';
        pinSheetInput.focus();
      } else {
        pinSheetError.textContent = 'Incorrect password';
        pinSheetInput.value = '';
      }
    } else if(pinSheetMode === 'changeSetup'){
      const newPw = pinSheetInput.value;
      const confirmPw = pinSheetConfirmInput.value;
      if(newPw.length < 6){ pinSheetError.textContent = 'Password must be at least 6 characters'; return; }
      if(newPw !== confirmPw){ pinSheetError.textContent = "Passwords didn't match"; return; }
      await setStoredPassword(newPw);
      closePinSheet();
      if(hasCloud()){
        let updated = false;
        const s = await cloudToken();
        if(s){
          try{
            const r = await sbFetch('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password: newPw }) }, s.access_token);
            updated = r.ok;
          }catch(e){}
        }
        showToast(updated ? 'Password updated' : 'Changed on this phone only. Connect to the internet and change it again to update online.');
      } else {
        showToast('Password updated');
      }
    }
  });

  initAuth();
  if(sessionValid()) unlockApp();   // still signed in from a moment ago

  // keep the session alive while the app is being used
  ['click','touchstart','keydown','scroll'].forEach(ev =>
    document.addEventListener(ev, ()=>{ if(authView.classList.contains('a-gone')) touchSession(false); }, { passive:true })
  );

  // lock only after the app has been idle (or closed) longer than AUTO_LOCK_MINUTES
  function checkAutoLock(){
    if(authView.classList.contains('a-gone') && !sessionValid()) lockApp();
  }
  setInterval(checkAutoLock, 30000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) checkAutoLock(); });

  loadPeople();
  checkRecoveryLink();
  window.addEventListener('hashchange', checkRecoveryLink);
  if(hasCloud()) cloudReconcile();

})();
