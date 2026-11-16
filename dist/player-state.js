export function cameraOrder(cameras, selected) {
  const main = cameras.find(feed => feed.id === selected) || cameras[0];
  return main ? [main, ...cameras.filter(feed => feed.id !== main.id)] : [];
}
export function activeCameraIds(cameras, selected, layout, tab) {
  if(tab === 'channel') return ['main'];
  return cameraOrder(cameras,selected).slice(0,layout === 'single' ? 1 : 3).map(feed => feed.id);
}
export function audioSourceId(selected, layout, tab) {
  if(tab === 'channel') return 'main';
  return selected;
}
export function audioAllowed(id) { return ['camera-1','camera-2','camera-3','main'].includes(id); }
export function liveEdgeState({loaded,isLive,paused,readyState,currentTime,seekEnd}) {
  if(!loaded || !isLive || !Number.isFinite(seekEnd)) return {available:false,atEdge:false};
  return {available:true,atEdge:!paused && readyState >= 2 && seekEnd-currentTime <= 15};
}

export function resumeAction({wantsPlayback, loaded, hasError, awayMs, lagSeconds}) {
  if(!wantsPlayback) return 'none';
  if(hasError || !loaded || awayMs >= 30000) return 'reconnect';
  return lagSeconds > 3 ? 'seek' : 'play';
}

// Only these fields may leave the player when a visitor explicitly copies details.
export function diagnosticSnapshot({name,status,width,height,bufferSeconds,lagSeconds,errorCode}) {
  const seconds = value => Number.isFinite(value) ? Math.max(0,Math.round(value*10)/10) : null;
  return {name:String(name),status:String(status),resolution:width && height ? `${width}×${height}` : null,bufferSeconds:seconds(bufferSeconds),behindStreamSeconds:seconds(lagSeconds),errorCode:Number.isInteger(errorCode) ? errorCode : null};
}
