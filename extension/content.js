(() => {
  globalThis.__authenticatorCompanion?.dispose?.();
  const runtime=chrome.runtime,version=runtime.getManifest().version;
  let target, host, panel, lastInfo,disposed=false,requestSequence=0;
  let dismissed=new WeakSet();
  const ask = async (op, values={}) => {
    const result = await runtime.sendMessage({op,...values});
    if (!result?.ok) throw new Error(result?.error?.message || 'Otvori Authenticator u Chromeu.');
    return result.data;
  };
  function visible(input) {const r=input.getBoundingClientRect();return r.width>2 && r.height>2 && !input.disabled && !input.readOnly && getComputedStyle(input).visibility!=='hidden';}
  function otpInput(input) {
    if (!(input instanceof HTMLInputElement) || !visible(input) || ['password','hidden','email','checkbox','radio','submit'].includes(input.type)) return false;
    if (input.autocomplete === 'one-time-code') return true;
    const label = [input.name,input.id,input.placeholder,input.getAttribute('aria-label'),...Array.from(input.labels || [],label=>label.textContent)].join(' ');
    if (/otp|totp|two.?factor|2fa|mfa|verification.?code|authenticat.{0,20}code|security.?code|kod.{0,15}potvr|potvrd.{0,15}kod/i.test(label)) return true;
    if (input.maxLength===1 && (input.inputMode==='numeric' || input.type==='tel' || input.pattern==='[0-9]*')) return true;
    return false;
  }
  function candidates() {return Array.from(document.querySelectorAll('input')).filter(otpInput);}
  function setInput(input,value) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function fill(code) {
    const inputs=candidates(), active=otpInput(document.activeElement) ? document.activeElement : target && otpInput(target) ? target : inputs[0];
    if (!active) return false;
    if (active.maxLength===1) {
      const group=inputs.filter(input=>input.maxLength===1 && input.form===active.form);
      if (group.length!==code.length) return false;
      group.forEach((input,index)=>setInput(input,code[index]));group[group.length-1].focus();
    } else {active.focus();setInput(active,code);}
    dismiss(true);return true;
  }
  function dismiss(suppress=false) {if(suppress){requestSequence++;if(target)dismissed.add(target);}host?.remove();host=panel=null;}
  function position() {
    if (!host || !target || !visible(target)) {dismiss();return;}
    const rect=target.getBoundingClientRect(), width=Math.min(320,innerWidth-20);
    host.style.width=width+'px';host.style.left=Math.max(10,Math.min(rect.left,innerWidth-width-10))+'px';
    host.style.top=Math.max(10,Math.min(rect.bottom+7,innerHeight-200))+'px';
  }
  async function show(input) {
    target=input;const sequence=++requestSequence;let info;
    try {info=await ask('siteInfo');} catch {if(sequence===requestSequence)dismiss();return;}
    if(disposed || sequence!==requestSequence || target!==input)return;
    render(input,info);
  }
  function render(input,info) {
    target=input;lastInfo=info;
    if(disposed || !visible(input) || (!lastInfo.accounts.length && !lastInfo.known)){dismiss();return;}
    dismiss();host=document.createElement('div');host.style.cssText='all:initial;position:fixed;z-index:2147483647;display:block;';
    const shadow=host.attachShadow({mode:'closed'}), style=document.createElement('style');
    style.textContent='*{box-sizing:border-box}.panel{font:13px/1.4 system-ui,sans-serif;background:#fff;color:#18362a;border:1px solid #ccddd4;border-radius:12px;box-shadow:0 8px 32px #102e2426;padding:9px;max-height:240px;overflow:auto}header{display:flex;align-items:center;justify-content:space-between;padding:4px 7px 8px;font-size:11px;color:#667970;font-weight:600}button{font:inherit;cursor:pointer;border:0}header button{background:transparent;color:#6b7b73;font-size:18px;padding:0 3px}.account{display:block;text-align:left;width:100%;background:#f0f6f2;border-radius:7px;margin-top:5px;padding:9px;color:#173e2a}.account:hover{background:#e1efe6}.account strong,.account span{display:block}.account span{font-size:11px;color:#5d7466;overflow:hidden;text-overflow:ellipsis}.error{color:#9a3424;padding:8px;font-size:12px}';
    shadow.append(style);panel=document.createElement('div');panel.className='panel';shadow.append(panel);
    const header=document.createElement('header');header.append(document.createTextNode('Authenticator Companion'));
    const close=document.createElement('button');close.textContent='×';close.ariaLabel='Zatvori ponudu';close.addEventListener('click',()=>dismiss(true));header.append(close);panel.append(header);
    if (lastInfo.locked) {
      const unlock=document.createElement('button');unlock.className='account';unlock.textContent='Otključaj Authenticator';
      unlock.addEventListener('click',event=>{if(event.isTrusted)ask('openUI').catch(()=>{});});panel.append(unlock);
    } else for (const account of lastInfo.accounts) {
      const button=document.createElement('button');button.className='account';
      const strong=document.createElement('strong');strong.textContent=account.issuer || '2FA račun';
      const label=document.createElement('span');label.textContent=account.account;button.append(strong,label);
      button.addEventListener('click',async event=>{
        if(!event.isTrusted)return;
        button.disabled=true;
        try {const data=await ask('siteCode',{id:account.id});if(Date.now()>=data.expiresAt || !fill(data.code))throw new Error('Odaberi polje za 2FA i pokušaj ponovno.');}
        catch(error){const note=document.createElement('div');note.className='error';note.textContent=error.message;panel?.append(note);button.disabled=false;}
      });panel.append(button);
    }
    document.documentElement.append(host);position();
  }
  function onFocus(event){if(otpInput(event.target)){dismissed.delete(event.target);show(event.target);}}
  function onKey(event){if(event.key==='Escape')dismiss(true);}
  function onPointer(event){if(host && !event.composedPath().includes(host) && event.target!==target)dismiss(true);}
  document.addEventListener('focusin',onFocus,true);
  document.addEventListener('keydown',onKey,true);
  document.addEventListener('pointerdown',onPointer,true);
  addEventListener('resize',position);addEventListener('scroll',position,true);
  let scanTimer;
  const observer=new MutationObserver(()=>{clearTimeout(scanTimer);scanTimer=setTimeout(()=>{if(!disposed && !host){const input=candidates().find(input=>!dismissed.has(input));if(input)show(input);}},350);});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  function onMessage(message,_sender,respond){
    if(message.type==='companion:ping'){respond({ready:true,version});return;}
    if(message.type==='companion:fill'){respond({filled:Date.now()<message.expiresAt && fill(message.code)});return;}
    if(message.type==='companion:refresh'){
      if(message.origin!==location.origin || !Array.isArray(message.info?.accounts)){respond({ready:false});return;}
      requestSequence++;dismissed=new WeakSet();
      const input=otpInput(document.activeElement)?document.activeElement:target && otpInput(target)?target:candidates()[0];
      dismiss();if(input)render(input,message.info);respond({ready:true});return;
    }
    if(message.type==='companion:changed'){const input=target && otpInput(target)?target:candidates()[0];dismiss();if(input)show(input);respond({ready:true});}
  }
  runtime.onMessage.addListener(onMessage);
  const control={version,dispose(){
    disposed=true;requestSequence++;observer.disconnect();clearTimeout(scanTimer);dismiss();
    document.removeEventListener('focusin',onFocus,true);document.removeEventListener('keydown',onKey,true);document.removeEventListener('pointerdown',onPointer,true);
    removeEventListener('resize',position);removeEventListener('scroll',position,true);
    try{runtime.onMessage.removeListener(onMessage);}catch{}
    if(globalThis.__authenticatorCompanion===control)delete globalThis.__authenticatorCompanion;
  }};
  globalThis.__authenticatorCompanion=control;
  const first=candidates()[0];if(first)show(first);
})();
