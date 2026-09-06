/* ============================================================================
   Render diagnostics + black-frame watchdog
   A blank viewport with a working HUD is the worst possible failure mode: the
   player cannot tell whether the game is broken or just dark. This module can
   (a) prove the canvas is on screen, (b) measure what the renderer actually
   produced, (c) bypass the post chain, and (d) dump a copy-pasteable report.
   Toggle with F9, or from the pause menu, or it opens itself if the watchdog
   decides the player is staring at nothing.
   ========================================================================== */
/* Every caught runtime error lands here so a broken feature can never fail silently:
   the diagnostics panel lists them and the copy-report button ships them to me. */
const ERRLOG=[];
function errLog(where,e){
  const msg=where+': '+(e&&e.stack?String(e.stack).split('\n').slice(0,3).join(' | '):(e&&e.message||String(e)));
  ERRLOG.push(msg); if(ERRLOG.length>60) ERRLOG.shift();
  console.error('[game] '+msg);
  if(typeof DIAG!=='undefined'&&DIAG.errToast) DIAG.errToast();
}
if(typeof window!=='undefined'){
  window.addEventListener('error',ev=>{ errLog('window.onerror',ev.error||ev.message); });
  window.addEventListener('unhandledrejection',ev=>{ errLog('unhandledrejection',ev.reason); });
}

const DIAG={
  el:null, out:null, visible:false, lastPh:null, phT:0, errToastT:0,
  errToast(){
    if(typeof G==='undefined'||!G.time) return;
    if(G.time-this.errToastT<8) return;
    this.errToastT=G.time;
    UI.toast('A script error was captured — press F9 for the report','bad',4200);
  },
  acc:0, uiAcc:0, bad:0, hist:[], warned:false, autoSafe:false, autoBright:false,

  /* ---------- panel ---------- */
  build(){
    if(this.el) return this.el;
    const el=document.createElement('div');
    el.id='diag';
    el.style.cssText='position:fixed;left:12px;top:12px;z-index:95;max-width:min(560px,94vw);max-height:92vh;overflow:auto;'+
      'display:none;background:rgba(6,10,18,.96);color:#dce7fb;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;'+
      'border:1px solid #2b3b5c;border-radius:12px;padding:12px 14px;box-shadow:0 18px 50px rgba(0,0,0,.6);pointer-events:auto';
    el.innerHTML=
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'+
        '<b style="font:800 13px/1 var(--font,sans-serif);letter-spacing:.14em;color:#8fe6ff">RENDER DIAGNOSTICS</b>'+
        '<span style="flex:1"></span>'+
        '<span id="diagHint" style="opacity:.6">F9 to close</span>'+
      '</div>'+
      '<pre id="diagOut" style="margin:0 0 10px;white-space:pre-wrap;word-break:break-word"></pre>'+
      '<div id="diagBtns" style="display:flex;flex-wrap:wrap;gap:6px"></div>';
    document.body.appendChild(el);
    this.el=el; this.out=el.querySelector('#diagOut');

    const mk=(label,fn)=>{
      const b=document.createElement('button');
      b.textContent=label;
      b.style.cssText='font:800 11px/1 var(--font,sans-serif);letter-spacing:.08em;color:#dce7fb;background:#1b2740;'+
        'border:1px solid #35486e;border-radius:8px;padding:7px 10px;cursor:pointer;text-transform:uppercase';
      b.onmouseenter=()=>{ b.style.background='#25344f'; };
      b.onmouseleave=()=>{ b.style.background='#1b2740'; };
      b.onclick=()=>{ try{ fn(b); }catch(e){ this.line('error: '+(e&&e.message||e)); } this.refresh(); };
      el.querySelector('#diagBtns').appendChild(b);
      return b;
    };
    this.bSafe=mk('safe mode: off',b=>this.setSafe(!RENDER.safeMode));
    this.bBright=mk('fullbright: off',b=>this.setFullbright(!(RENDER.lightBoost>1)));
    this.bFog=mk('fog: on',b=>{ RENDER.fogOff=!RENDER.fogOff; b.textContent='fog: '+(RENDER.fogOff?'off':'on'); });
    this.bBloom=mk('bloom: on',b=>{ RENDER.bloomOn=!RENDER.bloomOn; b.textContent='bloom: '+(RENDER.bloomOn?'on':'off'); });
    mk('measure now',()=>{ this.measureNow(); });
    mk('copy report',()=>{ this.copy(); });
    mk('reset all',()=>{ this.setSafe(false); this.setFullbright(false); RENDER.fogOff=false; RENDER.bloomOn=true;
      this.bad=0; this.autoSafe=false; this.autoBright=false; this.warned=false; this.syncButtons(); });

    // discoverable from the pause menu too
    const quit=document.getElementById('btnQuitMatch');
    if(quit&&quit.parentNode&&!document.getElementById('diagPauseBtn')){
      const b=document.createElement('button');
      b.className=quit.className; b.id='diagPauseBtn'; b.textContent='Render Diagnostics';
      b.onclick=()=>{ UI.closeSettings&&UI.closeSettings(); this.toggle(); };
      quit.parentNode.appendChild(b);
    }
    this.syncButtons();
    return el;
  },
  syncButtons(){
    if(!this.bSafe) return;
    this.bSafe.textContent='safe mode: '+(RENDER.safeMode?'ON':'off');
    this.bSafe.style.background=RENDER.safeMode?'#7d2b1f':'#1b2740';
    this.bBright.textContent='fullbright: '+((RENDER.lightBoost||1)>1?'ON':'off');
    this.bBright.style.background=(RENDER.lightBoost||1)>1?'#7d2b1f':'#1b2740';
    const f=this.el&&this.el.querySelector('#diagBtns');
    if(f&&f.children[2]) f.children[2].textContent='fog: '+(RENDER.fogOff?'off':'on');
    if(f&&f.children[3]) f.children[3].textContent='bloom: '+(RENDER.bloomOn?'on':'off');
  },
  toggle(force){
    this.build();
    this.visible=force===undefined?!this.visible:!!force;
    this.el.style.display=this.visible?'block':'none';
    if(this.visible){ this.measureNow(); this.refresh(); }
  },
  line(t){ if(this.out) this.out.textContent+=(this.out.textContent?'\n':'')+t; },

  /* ---------- switches ---------- */
  setSafe(on,auto){
    if(typeof setSafeMode==='function') setSafeMode(on); else RENDER.safeMode=!!on;
    if(auto) this.autoSafe=true;
    this.syncButtons();
    UI.toast(on?'Safe rendering ON — post-processing bypassed':'Safe rendering OFF — post-processing restored',on?'warn':null,2600);
  },
  setFullbright(on,auto){
    RENDER.lightBoost=on?3.2:1;
    if(auto) this.autoBright=true;
    this.syncButtons();
  },

  /* ---------- measurement ---------- */
  measureNow(){
    const p=RENDER.post;
    RENDER.luma=(p&&p.measure)?p.measure():null;
    return RENDER.luma;
  },

  /* ---------- canvas sanity (runs once after boot) ---------- */
  verifyCanvas(){
    const c=RENDER.canvas, prob=[];
    if(!c) prob.push('no canvas reference');
    else{
      if(!c.isConnected) prob.push('canvas is not in the document');
      if(c.parentNode&&c.parentNode.tagName==='CANVAS') prob.push('canvas is nested inside another <canvas> (browsers never display it)');
      const r=c.getBoundingClientRect?c.getBoundingClientRect():{width:0,height:0};
      if(!(r.width>1&&r.height>1)) prob.push('canvas has no on-screen size ('+Math.round(r.width)+'x'+Math.round(r.height)+')');
      const cs=(typeof getComputedStyle==='function')?getComputedStyle(c):null;
      if(cs&&(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)===0)) prob.push('canvas is hidden by CSS ('+cs.display+'/'+cs.visibility+'/'+cs.opacity+')');
      if(!(c.width>1&&c.height>1)) prob.push('drawing buffer is '+c.width+'x'+c.height);
    }
    const gl=RENDER.renderer&&RENDER.renderer.getContext&&RENDER.renderer.getContext();
    if(gl&&gl.isContextLost&&gl.isContextLost()) prob.push('WebGL context lost');
    if(prob.length){
      console.error('[diag] canvas problems:',prob.join('; '));
      this.build(); this.toggle(true);
      this.out.textContent='THE VIEWPORT IS NOT SHOWING THE RENDERER\n\n'+prob.map(p=>' - '+p).join('\n')+'\n';
      this.warned=true;
      UI.toast('Render problem detected — diagnostics opened (F9)',  'bad', 6000);
    }
    return prob;
  },

  /* ---------- full text report ---------- */
  report(){
    const R=(typeof RENDER!=='undefined'&&RENDER)||{};
    const r=R.renderer, c=R.canvas, S=(typeof SHIP!=='undefined')?SHIP:null;
    const G_=(typeof G!=='undefined'&&G)||{phase:'?'};
    const L=[];
    const say=(k,v)=>L.push(String(k).padEnd(22,' ')+': '+v);
    L.push('IMPOSTOR 3D — render report');
    say('three', (window.THREE&&THREE.REVISION)||'?');
    say('webgl2', !!R.isWebGL2);
    const gl=r&&r.getContext&&r.getContext();
    say('context lost', !!(gl&&gl.isContextLost&&gl.isContextLost()));
    say('renderer', gl&&gl.getParameter?String(gl.getParameter(gl.VERSION||0x1f02)):'n/a');
    say('gpu', (gl&&gl.getExtension&&gl.getExtension('WEBGL_debug_renderer_info')&&gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL))||'n/a');
    if(c){
      const b=c.getBoundingClientRect?c.getBoundingClientRect():{width:0,height:0};
      say('canvas', c.tagName+(c.id?'#'+c.id:'')+' css '+Math.round(b.width)+'x'+Math.round(b.height)+' buffer '+c.width+'x'+c.height+
        ' connected='+c.isConnected+' parent='+(c.parentNode?c.parentNode.tagName:'-'));
    }
    say('phase', G_.phase);
    say('quality / pixelRatio', R.quality+' / '+R.pixelRatio);
    say('bloom / safeMode', R.bloomOn+' / '+!!R.safeMode);
    say('lightBoost / fogOff', (R.lightBoost||1)+' / '+!!R.fogOff);
    if(R.scene){
      let n=0,meshes=0,mats=0; R.scene.traverse(()=>{n++;}); 
      R.scene.traverse(o=>{ if(o.isMesh){meshes++; if(o.material) mats++;} });
      say('scene objects', n+' ('+meshes+' meshes)');
      say('scene.background', R.scene.background?(R.scene.background.isTexture?'texture':R.scene.background.type||'obj'):'null');
      say('scene.environment', R.scene.environment?'pmrem texture':'null');
      if(R.scene.fog){
        const d=R.scene.fog.density;
        say('fog', (R.scene.fog.type||'?')+' density '+(isFinite(d)?(+d).toFixed(5):String(d))+
          ' color '+(R.scene.fog.color&&R.scene.fog.color.getHexString?'#'+R.scene.fog.color.getHexString():'?'));
      }
    }
    if(S&&S.group) say('ship group', 'visible='+S.group.visible+' children='+S.group.children.length);
    if(S&&S.meshes){
      say('ship meshes', Object.keys(S.meshes).map(k=>k+'='+S.meshes[k].visible).join(' '));
    }
    if(S&&S.lights){
      const n=S.lights.normal||[], sum=n.reduce((a,l)=>a+(l.intensity||0),0);
      const nan=n.filter(l=>!isFinite(l.intensity)).length;
      const f2=(l)=>(l&&isFinite(l.intensity)?l.intensity.toFixed(2):'-');
      say('lights', n.length+' point (sum '+(isFinite(sum)?sum.toFixed(1):'NaN')+', NaN '+nan+') | emerg '+(S.lights.emerg||[]).length+
        ' | amb '+f2(S.lights.amb)+' | hemi '+f2(S.lights.hemi));
    }
    if(R.camera&&R.camera.position){
      const p=R.camera.position, n2=(v)=>isFinite(v)?(+v).toFixed(2):String(v);
      say('camera', 'pos '+n2(p.x)+','+n2(p.y)+','+n2(p.z)+' fov '+n2(R.camera.fov)+
        ' near '+R.camera.near+' far '+R.camera.far+' mode '+(typeof CAM!=='undefined'?CAM.mode:'-'));
    }
    if(r&&r.info){
      const rd=r.info.render||{};
      say('draw calls / tris', (rd.calls||0)+' / '+(rd.triangles||0)+
        ' (programs '+(r.info.programs&&r.info.programs.length!==undefined?r.info.programs.length:'?')+')');
    }
    if(R.shaderErrors&&R.shaderErrors.length)
      say('SHADER ERRORS', R.shaderErrors.length+' -> '+String(R.shaderErrors[0]).replace(/\s+/g,' ').slice(0,160));
    const m=R.luma;
    say('luma scene mean/max', m?m.scene.mean+' / '+m.scene.max:'not measured');
    say('luma final mean/max', m?m.final.mean+' / '+m.final.max:'not measured');
    if(this.hist.length) say('final luma history', this.hist.map(v=>v.toFixed(3)).join(' '));
    if(typeof ERRLOG!=='undefined'&&ERRLOG.length){
      say('captured errors', ERRLOG.length+' (last '+Math.min(6,ERRLOG.length)+' shown)');
      ERRLOG.slice(-6).forEach((m,i)=>L.push('   '+(i+1)+'. '+m.slice(0,220)));
    }
    if(this.autoSafe||this.autoBright) say('watchdog action', (this.autoSafe?'auto safe-mode ':'')+(this.autoBright?'auto fullbright':''));
    return L.join('\n');
  },
  refresh(){
    if(!this.out||!this.visible) return;
    try{ this.out.textContent=this.report(); }
    catch(e){ this.out.textContent='diagnostics error: '+(e&&e.message||e); }
  },
  copy(){
    const t=this.report();
    console.log(t);
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t); UI.toast('Report copied to the clipboard','good',2200); return; }
    }catch(e){}
    try{
      const ta=document.createElement('textarea');
      ta.value=t; ta.style.cssText='position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select(); document.execCommand&&document.execCommand('copy'); ta.remove();
      UI.toast('Report copied (fallback)','good',2200);
    }catch(e){ UI.toast('Copy failed — the report is in the browser console','warn',3000); }
  },

  /* ---------- per-frame ---------- */
  tick(dt){
    // Diagnostics are a guest in the render loop: they must never be able to break it.
    try{ this._tick(dt); }
    catch(e){
      if(!this._tickErr){ this._tickErr=true; console.warn('[diag] tick error:',e&&e.message||e); }
      this.visible=false; if(this.el) this.el.style.display='none';
    }
  },
  _tick(dt){
    // key binding is registered once
    if(!this._bound){
      this._bound=true;
      addEventListener('keydown',e=>{
        if(e.code==='F9'){ e.preventDefault(); this.toggle(); }
      });
    }
    // panel refresh ~5/s while open
    if(this.visible){
      this.uiAcc+=dt;
      if(this.uiAcc>0.2){ this.uiAcc=0; this.measureNow(); this.refresh(); }
      return;
    }
    // ---- stuck-phase recovery: a phase that can no longer advance freezes the whole
    // match (the server only ticks while playing/meeting), so detect and heal it ----
    if(G.phase!==this.lastPh){ this.lastPh=G.phase; this.phT=0; }
    this.phT+=dt;
    if(G.phase==='eject'){
      const act=typeof EJECT!=='undefined'&&!!EJECT.active;
      if((!act&&this.phT>6)||(act&&this.phT>45)){
        errLog('watchdog',new Error('eject phase stuck (active='+act+' for '+this.phT.toFixed(1)+'s)'));
        if(typeof forceResumePlay==='function') forceResumePlay('stuck ejection cutscene');
        this.phT=0;
      }
    } else if(G.phase==='meeting'){
      const S=typeof SERVER!=='undefined'&&SERVER&&SERVER.state;
      const mt=S&&S.meeting;
      const stalled=mt&&(mt.discussion<=0&&mt.voting<=0);
      if(stalled&&this.phT>6){
        errLog('watchdog',new Error('meeting stalled with no live timer for '+this.phT.toFixed(1)+'s'));
        if(typeof forceResumePlay==='function') forceResumePlay('stuck meeting');
        this.phT=0;
      }
    }
    // watchdog: sample once a second, only while a lit 3D view is expected
    if(G.phase!=='playing'&&G.phase!=='menu') return;
    if(typeof UI!=='undefined'&&UI.blocksInput&&UI.blocksInput()&&G.phase!=='playing') return;
    this.acc+=dt;
    if(this.acc<1) return;
    this.acc=0;
    const m=this.measureNow();
    if(!m) return;                       // read-back unavailable (headless stub) — stay quiet
    this.hist.push(m.final.mean); if(this.hist.length>8) this.hist.shift();
    const dark=m.final.mean<0.012&&m.final.max<0.06;
    if(!dark){
      if(this.bad>0) this.bad=Math.max(0,this.bad-1);
      return;
    }
    this.bad++;
    console.warn('[diag] frame is black — scene luma '+m.scene.mean+'/'+m.scene.max+', final '+m.final.mean+'/'+m.final.max);
    if(RENDER.shaderErrors&&RENDER.shaderErrors.length) this.bad=Math.max(this.bad,4); // no point waiting
    if(this.bad===2&&m.scene.mean>0.02&&!RENDER.safeMode){
      // the scene rendered fine but the composite threw it away: bypass post
      this.setSafe(true,true);
    }else if(this.bad===4){
      // nothing is reaching the framebuffer at all: light it up and show the numbers
      if(!RENDER.safeMode) this.setSafe(true,true);
      this.setFullbright(true,true);
      RENDER.fogOff=true;
      if(!this.warned){
        this.warned=true;
        this.toggle(true);
        UI.toast('The 3D view is rendering black — diagnostics opened. Copy the report and press F9 to close.','bad',9000);
      }
    }
  },
};
