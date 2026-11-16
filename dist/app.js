import { cameraOrder, activeCameraIds, audioSourceId, audioAllowed, liveEdgeState, resumeAction, diagnosticSnapshot } from './player-state.js';

const icons = {
  pip:'<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
  broadcast:'<circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16"/>',
  play:'<path d="m8 5 11 7-11 7Z"/>', pause:'<path d="M8 5v14M16 5v14"/>',
  volume:'<path d="m11 5-6 4H2v6h3l6 4Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted:'<path d="m11 5-6 4H2v6h3l6 4Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  expand:'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>',
  collapse:'<path d="M9 4v5H4m11-5v5h5M9 20v-5H4m11 5v-5h5"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>',
  single:'<rect x="3" y="5" width="18" height="14" rx="1"/>',
  multi:'<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M15 5v14m0-7h6"/>',
  camera:'<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3Z"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>', arrow:'<path d="M5 19 19 5M7 5h12v12"/>'
};
const $ = id => document.getElementById(id);
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.camera}</svg>`;
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
let config, selected = 'camera-1', layout = 'multi', tab = 'cameras';
let cameraPlayingIntent = false, channelPlayingIntent = false, soundEnabled = false, volume = .75, toastTimer, awayAt = 0;
const states = new Map();
const viewer = $('viewer');

function toast(text) {
  clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true,4500);
}
document.querySelectorAll('[data-dialog]').forEach(button => button.onclick = () => { if(button.dataset.dialog === 'healthDialog') updateDiagnostics(); $(button.dataset.dialog).showModal(); });
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('click',e => {
    if(e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  });
});

function makeTile(feed,index,target) {
  const card = document.createElement('article');
  card.className = 'camera-tile'; card.dataset.camera = feed.id; card.setAttribute('aria-label',feed.name);
  const number = feed.id === 'main' ? 'CH' : String(index+1).padStart(2,'0');
  card.innerHTML = `<video playsinline muted preload="none" aria-label="${escape(feed.name)} video"></video><div class="tile-placeholder"><span class="placeholder-number" aria-hidden="true">${number}</span><span class="placeholder-symbol">${icon('camera')}</span><p hidden></p><button class="start-button">${icon('play')}<span>Watch live</span></button></div><div class="tile-header"><span class="camera-number">CAM ${number}</span><span class="camera-title">${escape(feed.name)}</span><span class="tile-status">Ready</span></div><button class="promote-button" aria-label="Make ${escape(feed.name)} the main camera"><span>${icon('expand')}Make main</span></button><span class="audio-pill" hidden>${icon('volume')}Audio</span>`;
  target.append(card);
  const state = {feed,card,video:card.querySelector('video'),player:null,cleanup:Promise.resolve(),generation:0,loading:false,loaded:false,desired:false,error:null,errorCode:null};
  state.video.controls = false; state.video.muted = true; state.video.volume = volume;
  states.set(feed.id,state);
  card.querySelector('.start-button').onclick = () => {
    if(state.error) { state.error = null; state.desired = true; setPlaybackIntent(true); startCamera(state); }
    else playActive();
  };
  card.querySelector('.promote-button').onclick = () => selectCamera(feed.id);
  state.video.addEventListener('playing',() => {
    if(!state.desired) { state.video.pause(); return; }
    state.loading = false; state.card.querySelector('.tile-placeholder').hidden = true; syncControls();
  });
  state.video.addEventListener('pause',syncControls);
  state.video.addEventListener('waiting',syncControls);
  state.video.addEventListener('volumechange',() => {
    // Only the selected camera may be audible, including external media controls.
    const permitted = audioAllowed(feed.id) && feed.id === audioSourceId(selected,layout,tab) && soundEnabled;
    if(!permitted && !state.video.muted) state.video.muted = true;
    syncControls();
  });
  state.video.addEventListener('ended',() => failCamera(state,'The feed ended. Try reconnecting.'));
  state.video.addEventListener('enterpictureinpicture',syncControls);
  state.video.addEventListener('leavepictureinpicture',syncControls);
  state.video.addEventListener('error',() => { if(state.loaded && !state.loading) failCamera(state,'Video unavailable. Try reconnecting.'); });
  return state;
}

function showPlaceholder(state,message='',action='Watch live',loading=false) {
  if(!state.feed.url) message='No source added';
  const el = state.card.querySelector('.tile-placeholder'); el.hidden = false; el.classList.toggle('loading',loading);
  el.querySelector('p').textContent = message; el.querySelector('p').hidden = !message;
  const button = el.querySelector('button'); button.querySelector('span').textContent = action;
  button.disabled = loading;
  button.hidden = !state.feed.url || (!state.error && state.feed.id !== 'main' && state.feed.id !== selected);
}
function failCamera(state,message) {
  state.error = message; state.loading = false; state.desired = false; state.video.pause();
  showPlaceholder(state,message,'Retry'); syncControls();
}
function applyQuality(state) {
  if(!state.player) return;
  const quality = $('quality').value;
  // Small previews do not need a full-HD download. Promoting a camera raises its cap.
  const maxHeight = quality === 'auto' ? (state.feed.id === 'main' || state.feed.id === selected ? 1080 : 360) : Number(quality);
  state.player.configure({abr:{enabled:true,restrictions:{maxHeight}}});
}
async function playVideo(state) {
  if(!state.desired) return;
  try { await state.video.play(); }
  catch {
    if(!state.desired) return;
    state.desired = false;
    showPlaceholder(state,'Press play to start.','Play');
  }
  syncControls();
}
async function startCamera(state) {
  if(!activeIds().includes(state.feed.id)) return;
  if(!state.feed.url) { state.desired=false; state.error=null; showPlaceholder(state,'No source added'); syncControls(); return; }
  state.desired = true;
  if(state.loading) { syncControls(); return; }
  if(state.loaded && state.player && !state.error) { applyAudio(); await playVideo(state); return; }
  const previous = state.player; state.player = null;
  const generation = ++state.generation;
  state.error = null; state.errorCode = null; state.loaded = false; state.loading = true;
  showPlaceholder(state,'Connecting…','Connecting',true); syncControls();
  if(previous) state.cleanup = previous.destroy().catch(()=>{});
  await state.cleanup;
  if(generation !== state.generation) return;
  try {
    if(!window.shaka || !shaka.Player.isBrowserSupported()) throw new Error('unsupported');
    const player = new shaka.Player(); state.player = player;
    await player.attach(state.video);
    if(generation !== state.generation) return;
    player.configure({streaming:{bufferingGoal:18,rebufferingGoal:2},manifest:{retryParameters:{maxAttempts:2,timeout:12000}},abr:{enabled:true}});
    applyQuality(state); applyAudio();
    player.addEventListener('error',e => { if(generation === state.generation && e.detail?.severity === 2) { state.errorCode=e.detail.code; failCamera(state,'Cannot connect. Try reconnecting.'); } });
    await player.load(state.feed.url);
    if(generation !== state.generation) return;
    state.loaded = true; state.loading = false;
    seekToEdge(state);
    if(state.desired) await playVideo(state);
    else showPlaceholder(state,'','Resume');
  } catch(error) {
    if(generation !== state.generation) return;
    const message = error?.message === 'unsupported' ? 'This browser cannot play this stream. Try a supported desktop browser.' : 'Cannot connect. Try reconnecting.';
    console.warn('Feed failed',state.feed.id,error?.code || error?.name || 'unknown');
    state.errorCode = error?.code;
    failCamera(state,message);
  }
  syncControls();
}
function stopCamera(state) {
  ++state.generation; state.desired = false; state.loading = false; state.loaded = false; state.error = null;
  state.video.pause(); state.video.muted = true;
  const player = state.player; state.player = null;
  if(player) state.cleanup = player.destroy().catch(()=>{});
  showPlaceholder(state);
}
function activeIds() { return config ? activeCameraIds(config.cameras,selected,layout,tab) : []; }
function activeStates() { return activeIds().map(id=>states.get(id)).filter(Boolean); }
function primaryState() { return states.get(tab === 'channel' ? 'main' : selected); }
function setPlaybackIntent(value) { if(tab === 'cameras') cameraPlayingIntent = value; else channelPlayingIntent = value; }
function playbackIntent() { return tab === 'cameras' ? cameraPlayingIntent : channelPlayingIntent; }
function applyAudio() {
  const audioId = audioSourceId(selected,layout,tab);
  states.forEach(state => {
    const mute = !soundEnabled || state.feed.id !== audioId || !audioAllowed(state.feed.id);
    if(state.video.muted !== mute) state.video.muted = mute;
    if(state.video.volume !== volume) state.video.volume = volume;
  });
}
function playActive() {
  if(!config) return;
  setPlaybackIntent(true);
  activeStates().forEach(state=>{seekToEdge(state);startCamera(state);});
  syncControls();
}
function togglePlay() {
  if(!config) return;
  if(activeStates().some(state=>state.desired)) {
    setPlaybackIntent(false);
    activeStates().forEach(state=>{state.desired=false;state.video.pause();});
    syncControls();
  } else playActive();
}
function selectCamera(id) {
  if(!config?.cameras.some(feed=>feed.id === id)) return;
  if(id !== selected) closePip();
  selected = id; renderLayout();
}
function renderLayout() {
  if(!config) return;
  $('cameraWall').hidden = tab !== 'cameras'; $('channelWall').hidden = tab !== 'channel';
  $('layoutSwitch').hidden = tab !== 'cameras'; $('cameraPicker').hidden = tab !== 'cameras'; $('channelNotice').hidden = tab !== 'channel';
  $('cameraWall').classList.toggle('single',layout === 'single');
  $('multiView').setAttribute('aria-pressed',String(layout === 'multi')); $('singleView').setAttribute('aria-pressed',String(layout === 'single'));
  $('camerasTab').setAttribute('aria-pressed',String(tab === 'cameras')); $('channelTab').setAttribute('aria-pressed',String(tab === 'channel'));
  const ids = activeIds();
  cameraOrder(config.cameras,selected).forEach((feed,index) => {
    const state = states.get(feed.id);
    state.card.hidden = !ids.includes(feed.id);
    state.card.classList.toggle('main-camera',index === 0); state.card.classList.toggle('side-camera',index !== 0); state.card.dataset.slot = String(index);
    state.card.querySelector('.promote-button').hidden = index === 0 || layout === 'single';
    state.card.querySelector('.start-button').hidden = !state.feed.url || (index !== 0 && !state.error);
  });
  states.forEach(state => {
    if(!ids.includes(state.feed.id)) { if(state.player || state.loading) stopCamera(state); }
    else { applyQuality(state); if(tab === 'cameras' && cameraPlayingIntent) startCamera(state); }
  });
  $('cameraPicker').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.id === selected)));
  const state = primaryState();
  $('currentTitle').textContent = state?.feed.name || 'Camera 1';
  if(tab === 'channel') $('currentTitle').textContent = 'Live channel';
  document.title = tab === 'channel' ? 'Streamview · Live channel' : 'Streamview · Live cameras';
  applyAudio(); syncControls();
}
function setTab(next) {
  if(!config || next === tab) return;
  closePip();
  // Release the inactive channel rather than leaving audio or downloads running.
  activeStates().forEach(stopCamera);
  tab = next; renderLayout();
  if(tab === 'channel') { channelPlayingIntent=true; startCamera(states.get('main')); }
}
function edgeFor(state) {
  let end = NaN, live = false;
  try { if(state?.loaded && state.player) { end = state.player.seekRange().end; live = state.player.isLive(); } } catch {}
  return liveEdgeState({loaded:!!state?.loaded,isLive:live,paused:state?.video.paused ?? true,readyState:state?.video.readyState || 0,currentTime:state?.video.currentTime || 0,seekEnd:end});
}
function syncControls() {
  if(!config) return;
  const active = activeStates(), primary = primaryState();
  const hasSource = active.some(state=>state.feed.url);
  const playing = active.some(state=>state.desired);
  $('playToggle').disabled = !hasSource;
  $('refresh').disabled = !hasSource;
  $('soundToggle').disabled = !primary?.feed.url;
  $('volume').disabled = !primary?.feed.url;
  $('quality').disabled = !hasSource;
  $('playToggle').innerHTML = icon(playing ? 'pause' : 'play');
  $('playToggle').setAttribute('aria-label',`${playing ? 'Pause' : 'Play'} ${tab === 'channel' ? 'channel' : 'cameras'}`);
  $('playToggle').title = playing ? 'Pause' : 'Play';
  const audioId = audioSourceId(selected,layout,tab), audioState = states.get(audioId);
  $('soundToggle').innerHTML = icon(soundEnabled && volume > 0 ? 'volume' : 'muted');
  $('soundToggle').setAttribute('aria-label',`${soundEnabled ? 'Mute' : 'Unmute'} ${audioState?.feed.name || 'audio'}`);
  $('audioName').textContent = audioId === 'main' ? 'Live channel' : audioState?.feed.name || '';
  $('soundToggle').title = `${soundEnabled ? 'Mute' : 'Unmute'} ${audioState?.feed.name || 'audio'}`;
  const edge = edgeFor(primary);
  $('goLive').disabled = !edge.available;
  $('goLive').classList.toggle('at-live',edge.atEdge);
  $('goLive').querySelector('span').textContent = edge.atEdge && tab !== 'channel' ? 'LIVE' : 'Go live';
  $('goLive').setAttribute('aria-label','Jump to live edge');
  $('goLive').title = 'Newest available video; program live status may be unverified';
  const pipActive = !!document.pictureInPictureElement || primary?.video.webkitPresentationMode === 'picture-in-picture';
  const pipSupported = !!document.pictureInPictureEnabled || !!primary?.video.webkitSupportsPresentationMode?.('picture-in-picture');
  $('pip').disabled = !pipSupported || !primary?.loaded;
  $('pip').setAttribute('aria-pressed',String(pipActive));
  $('pip').setAttribute('aria-label',pipActive ? 'Exit picture in picture' : 'Picture in picture');
  $('pip').title = pipSupported ? (pipActive ? 'Exit picture in picture' : 'Picture in picture') : 'Picture in picture is unavailable in this browser';
  const count = active.filter(state=>state.loaded && state.video.readyState >= 2 && !state.video.paused).length;
  $('sourceState').textContent = !hasSource ? 'No sources' : count ? `${count}/${active.length} connected` : active.some(s=>s.loading) ? 'Connecting' : active.some(s=>s.error) ? 'Connection issue' : playing ? 'Buffering' : 'Ready';
  $('sourceState').classList.toggle('connected',count === active.length && count > 0);
  states.forEach(state => {
    const label = state.card.querySelector('.tile-status'); const edge = edgeFor(state);
    const buffering = state.loaded && state.desired && state.video.readyState < 3;
    let text = 'Ready';
    if(!state.feed.url) text = 'No source';
    else if(state.error) text = 'Unavailable';
    else if(state.loading) text = 'Connecting';
    else if(state.loaded && !state.desired) text = 'Paused';
    else if(buffering) text = 'Buffering';
    else if(state.loaded) text = state.feed.id === 'main' ? 'Unverified' : edge.atEdge ? 'LIVE' : 'Connected';
    label.textContent = text; label.classList.toggle('live',state.feed.id !== 'main' && text === 'LIVE'); label.classList.toggle('buffering',buffering);
    state.card.querySelector('.audio-pill').hidden = state.video.muted || state.video.paused || volume === 0;
  });
  if($('healthDialog').open) updateDiagnostics();
}
function seekToEdge(state) {
  try { if(state.loaded && state.player?.isLive()) state.video.currentTime=state.player.seekRange().end; } catch {}
}
async function jumpToLive() {
  if(!config) return;
  setPlaybackIntent(true);
  for(const state of activeStates()) {
    if(!state.loaded || !state.player) { startCamera(state); continue; }
    seekToEdge(state);
    state.desired = true; playVideo(state);
  }
}
function closePip() {
  if(document.pictureInPictureElement) document.exitPictureInPicture().catch(()=>{});
  states.forEach(state=>{if(state.video.webkitPresentationMode === 'picture-in-picture') state.video.webkitSetPresentationMode('inline');});
}
async function togglePip() {
  const state=primaryState();
  if(document.pictureInPictureElement || state?.video.webkitPresentationMode === 'picture-in-picture') {closePip();return;}
  if(!state?.loaded || state.video.readyState < 2) {toast('Start the video before opening picture in picture.');return;}
  try {
    if(document.pictureInPictureEnabled && state.video.requestPictureInPicture) await state.video.requestPictureInPicture();
    else if(state.video.webkitSupportsPresentationMode?.('picture-in-picture')) state.video.webkitSetPresentationMode('picture-in-picture');
    else throw new Error('unsupported');
  } catch {toast('Picture in picture is not available here. Try opening Streamview in your browser.');}
  syncControls();
}
function diagnostics() {
  return activeStates().map(state=>{
    const video=state.video;let buffer=0,lag=NaN;
    for(let i=0;i<video.buffered.length;i++) if(video.currentTime>=video.buffered.start(i) && video.currentTime<=video.buffered.end(i)) buffer=video.buffered.end(i)-video.currentTime;
    try {if(state.loaded && state.player.isLive()) lag=state.player.seekRange().end-video.currentTime;}catch{}
    return diagnosticSnapshot({name:state.feed.name,status:state.card.querySelector('.tile-status').textContent,width:video.videoWidth,height:video.videoHeight,bufferSeconds:buffer,lagSeconds:lag,errorCode:state.errorCode});
  });
}
function updateDiagnostics() {
  $('healthRows').innerHTML=diagnostics().map(d=>`<section class="health-card"><div class="health-heading"><span>${escape(d.name)}</span><span>${escape(d.status)}${d.errorCode ? ` · ${d.errorCode}` : ''}</span></div><dl class="health-metrics"><div><dt>Picture</dt><dd>${d.resolution || '—'}</dd></div><div><dt>Buffered</dt><dd>${d.bufferSeconds ?? '—'} s</dd></div><div><dt>Behind stream</dt><dd>${d.behindStreamSeconds ?? '—'} s</dd></div></dl></section>`).join('');
}
function catchUp(awayMs=0) {
  if(!config || document.hidden) return;
  for(const state of activeStates()) {
    let lag=Infinity;try{if(state.loaded)lag=state.player.seekRange().end-state.video.currentTime;}catch{}
    const inPip=document.pictureInPictureElement===state.video || state.video.webkitPresentationMode==='picture-in-picture';
    const action=resumeAction({wantsPlayback:playbackIntent(),loaded:state.loaded,hasError:!!state.error,awayMs:inPip?0:awayMs,lagSeconds:lag});
    if(state.loading || action==='none')continue;
    if(action==='reconnect'){stopCamera(state);startCamera(state);}
    else {if(action==='seek')seekToEdge(state);state.desired=true;playVideo(state);}
  }
}
function returnToViewer() { if(!awayAt || document.hidden)return; const elapsed=Date.now()-awayAt;awayAt=0;catchUp(elapsed); }
function setTheater(on) {
  viewer.classList.toggle('theater',on); document.body.classList.toggle('theater-open',on); syncFullscreen();
}
function syncFullscreen() {
  const expanded = !!document.fullscreenElement || viewer.classList.contains('theater');
  $('fullScreen').innerHTML = icon(expanded ? 'collapse' : 'expand');
  $('fullScreen').setAttribute('aria-label',expanded ? 'Exit full screen' : 'Full screen');
  $('fullScreen').title = expanded ? 'Exit full screen' : 'Full screen';
}
async function toggleFullscreen() {
  if(viewer.classList.contains('theater')) { setTheater(false); return; }
  if(document.fullscreenElement) { await document.exitFullscreen(); return; }
  try { if(!viewer.requestFullscreen) throw new Error('unsupported'); await viewer.requestFullscreen(); }
  catch { setTheater(true); } // Embedded browsers may block native fullscreen; fill their window instead.
  syncFullscreen();
}
$('camerasTab').onclick=()=>setTab('cameras'); $('channelTab').onclick=()=>setTab('channel');
$('multiView').onclick=()=>{layout='multi';renderLayout();}; $('singleView').onclick=()=>{layout='single';renderLayout();};
$('playToggle').onclick=togglePlay; $('goLive').onclick=jumpToLive;
$('soundToggle').onclick=()=>{soundEnabled=!soundEnabled;if(soundEnabled && volume===0){volume=.75;$('volume').value='75';}applyAudio();syncControls();};
$('volume').oninput=()=>{volume=Number($('volume').value)/100;soundEnabled=volume>0;applyAudio();syncControls();};
$('quality').onchange=()=>activeStates().forEach(applyQuality);
$('refresh').onclick=()=>{if(!config)return;setPlaybackIntent(true);activeStates().forEach(state=>{stopCamera(state);startCamera(state);});toast('Reconnecting…');};
$('fullScreen').onclick=toggleFullscreen;
$('pip').onclick=togglePip;
$('copyDiagnostics').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify({viewer:'Streamview',feeds:diagnostics()},null,2));toast('Connection details copied.');}catch{toast('Copy is unavailable in this browser.');}};
document.addEventListener('fullscreenchange',syncFullscreen);
// Suppress this shortcut only. Browser tools and client configuration remain accessible.
document.addEventListener('keydown',e=>{
  if(e.key==='F12'){e.preventDefault();e.stopPropagation();}
},{capture:true});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && viewer.classList.contains('theater')) {setTheater(false);return;}
  if(document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA|BUTTON|A/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey)return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  if(e.key.toLowerCase()==='m' && ! $('soundControl').hidden)$('soundToggle').click();
  if(e.key.toLowerCase()==='f')toggleFullscreen();
});
window.addEventListener('offline',()=>{activeStates().forEach(state=>failCamera(state,'You are offline. Reconnect to try again.'));});
window.addEventListener('online',()=>catchUp(30000));
window.addEventListener('blur',()=>{awayAt ||= Date.now();});
window.addEventListener('focus',returnToViewer);
document.addEventListener('visibilitychange',()=>{if(document.hidden)awayAt ||= Date.now();else returnToViewer();});
window.addEventListener('pagehide',()=>{awayAt=Date.now();states.forEach(stopCamera);});
window.addEventListener('pageshow',e=>{if(e.persisted && config){renderLayout();catchUp(30000);}});
setInterval(syncControls,1000);

async function init() {
  try {
    let response = await fetch('./streams.json',{cache:'no-store'});
    if(response.status===404) response=await fetch('./streams.example.json',{cache:'no-store'});
    if(!response.ok)throw new Error('config');
    config=await response.json();
    if(!Array.isArray(config.cameras)||config.cameras.length!==3||!config.channel)throw new Error('config');
    if(window.shaka)shaka.polyfill.installAll();
    config.cameras.forEach((feed,index)=>{
      makeTile(feed,index,$('cameraWall'));
      const button=document.createElement('button');button.dataset.id=feed.id;
      button.innerHTML=`<span>${String(index+1).padStart(2,'0')}</span>${escape(feed.name)}`;
      button.setAttribute('aria-label',`Select ${feed.name}`);button.onclick=()=>selectCamera(feed.id);$('cameraPicker').append(button);
    });
    const channel=makeTile(config.channel,3,$('channelWall'));channel.card.classList.add('main-camera');channel.card.querySelector('.promote-button').hidden=true;
    showPlaceholder(channel,'Live status unverified','Open channel');
    cameraPlayingIntent=config.cameras.some(feed=>feed.url);
    states.forEach(state=>{if(!state.feed.url)showPlaceholder(state,'No source added');});
    renderLayout();
  }catch{config=null;$('sourceState').textContent='Unable to load';$('playToggle').disabled=true;toast('Player settings could not load. Reload this page.');}
}
init();
