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

  function render(){
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
    ['authNameError','authPhoneError','authEmailError','authPassError','authOtpError'].forEach(id => authErr(id, ''));
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
    authView.classList.add('a-gone');
    authPassword.value = '';
    authPassword.type = 'password';
    authTogglePass.textContent = 'Show';
    authOtp.value = '';
  }

  function lockApp(){
    clearSession();
    authView.classList.remove('a-gone');
    initAuth();
  }

  async function finishRegistration(info){
    const existing = getAccount();
    saveAccount({
      name: info.name,
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
      if(name.length < 2){ authErr('authNameError', 'Enter your full name.'); ok = false; }
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
      const info = { name, phone, email, passHash };

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
    if(!acc){ authErr('authEmailError', 'No account found. Please register first.'); return; }
    if(!acc.passHash){
      authErr('authEmailError', 'Please register once to set a password.');
      return;
    }
    authSubmit.disabled = true;
    const emailMatch = acc.email && acc.email.toLowerCase() === email.toLowerCase();
    const pwOk = await verifyPassword(password);
    authSubmit.disabled = false;
    if(!emailMatch || !pwOk){ authErr('authPassError', 'Wrong email or password.'); return; }
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
      authPhone.value = acc.phone || '';
      authSubtitle.textContent = 'Set a password to continue';
    } else {
      setAuthMode('register');
    }
  }

  document.getElementById('authForgot').addEventListener('click', ()=>{ showResetScreen(); });

  // ---------- Email-based password reset ----------
  const resetScreenEl = document.getElementById('resetScreen');
  const resetContentEl = document.getElementById('resetContent');
  let resetStep = 'choice';
  let resetError = '';
  let resetCodeState = null; // { code, expiresAt }

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
    resetStep = 'choice';
    resetError = '';
    resetScreenEl.style.display = 'flex';
    renderResetStep();
  }

  function hideResetScreen(){
    resetScreenEl.style.display = 'none';
  }

  function renderResetStep(){
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

    if(action === 'close'){
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
    if(act === 'changePassword'){
      requestPinFor('changeVerify');
    } else if(act === 'resetEmail'){
      openEmailConfigSheet();
    } else if(act === 'logout'){
      lockApp();
    }
  });

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
      showToast('Password updated');
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

})();
