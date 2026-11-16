import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraOrder, activeCameraIds, audioSourceId, audioAllowed, liveEdgeState, resumeAction, diagnosticSnapshot } from '../dist/player-state.js';
const cameras=[{id:'camera-1'},{id:'camera-2'},{id:'camera-3'}];
test('promoting a camera preserves three distinct feeds and puts it first',()=>{
  assert.deepEqual(cameraOrder(cameras,'camera-2').map(c=>c.id),['camera-2','camera-1','camera-3']);
  assert.deepEqual(cameraOrder(cameras,'missing').map(c=>c.id),['camera-1','camera-2','camera-3']);
  assert.deepEqual(cameras.map(c=>c.id),['camera-1','camera-2','camera-3']);
});
test('single view releases hidden feeds; manual channel opens without a status provider',()=>{
  assert.deepEqual(activeCameraIds(cameras,'camera-3','single','cameras'),['camera-3']);
  assert.deepEqual(activeCameraIds(cameras,'camera-3','multi','cameras'),['camera-3','camera-1','camera-2']);
  assert.deepEqual(activeCameraIds(cameras,'camera-3','multi','channel'),['main']);
});
test('sound follows the selected camera in each layout, or the channel',()=>{
  assert.equal(audioSourceId('camera-2','multi','cameras'),'camera-2');
  assert.equal(audioSourceId('camera-2','single','cameras'),'camera-2');
  assert.equal(audioSourceId('camera-3','single','cameras'),'camera-3');
  assert.equal(audioSourceId('camera-1','single','cameras'),'camera-1');
  assert.equal(audioSourceId('camera-2','multi','channel'),'main');
  assert.equal(audioAllowed('camera-2'),true);assert.equal(audioAllowed('camera-3'),true);
  assert.equal(audioAllowed('camera-1'),true);assert.equal(audioAllowed('main'),true);
});

test('returning catches up or reconnects, but never overrides a deliberate pause',()=>{
  const playing={wantsPlayback:true,loaded:true,hasError:false,awayMs:5000,lagSeconds:12};
  assert.equal(resumeAction(playing),'seek');
  assert.equal(resumeAction({...playing,lagSeconds:1}),'play');
  assert.equal(resumeAction({...playing,awayMs:35000}),'reconnect');
  assert.equal(resumeAction({...playing,loaded:false}),'reconnect');
  assert.equal(resumeAction({...playing,hasError:true}),'reconnect');
  assert.equal(resumeAction({...playing,wantsPlayback:false,hasError:true,awayMs:99999}),'none');
});

test('copied diagnostics whitelist basic metrics and exclude playback configuration',()=>{
  const result=diagnosticSnapshot({name:'Camera 1',status:'LIVE',width:1280,height:720,bufferSeconds:4.26,lagSeconds:-1,errorCode:1002,url:'private-address',drm:{clearKeys:{secret:'secret'}},ip:'visitor-ip'});
  assert.deepEqual(result,{name:'Camera 1',status:'LIVE',resolution:'1280×720',bufferSeconds:4.3,behindStreamSeconds:0,errorCode:1002});
});
test('live edge badge requires playing, decoded frames, and proximity to the live edge',()=>{
  const playing={loaded:true,isLive:true,paused:false,readyState:4,currentTime:990,seekEnd:1000};
  assert.deepEqual(liveEdgeState(playing),{available:true,atEdge:true});
  for(const patch of [{paused:true},{currentTime:900},{readyState:1}])assert.deepEqual(liveEdgeState({...playing,...patch}),{available:true,atEdge:false});
  for(const patch of [{loaded:false},{isLive:false},{seekEnd:NaN}])assert.deepEqual(liveEdgeState({...playing,...patch}),{available:false,atEdge:false});
});
