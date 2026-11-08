import React from 'react';
import {AbsoluteFill,Composition,Html5Audio,OffthreadVideo,Sequence,registerRoot,staticFile,useCurrentFrame} from 'remotion';
import timeline from './public/real/timeline.json';
const WIDTH=900,HEIGHT=1600;
function ActionClip({segment,index}){
 const frame=useCurrentFrame();
 return <AbsoluteFill style={{background:'#11161d',fontFamily:'Segoe UI, sans-serif',color:'#f9fafb'}}>
  <div style={{position:'absolute',left:32,top:13,fontSize:15,letterSpacing:2,color:'#9cddc7'}}>HEX.TEAM · ЖИВАЯ ДЕМОНСТРАЦИЯ</div>
  <div style={{position:'absolute',left:32,top:35,fontSize:25,fontWeight:650}}>{segment.chapter_index}. {segment.chapter}</div>
  <div style={{position:'absolute',top:75,left:126,width:648,height:1440,overflow:'hidden',borderRadius:14,background:'#fafafa'}}>
   <OffthreadVideo src={staticFile(segment.source)} trimBefore={Math.round(segment.start_s*timeline.fps)} playbackRate={segment.rate} muted style={{width:'100%',height:'100%',objectFit:'contain'}}/>
  </div>
  <div style={{position:'absolute',left:24,right:24,bottom:28,minHeight:43,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,fontWeight:600,textAlign:'center',lineHeight:1.15}}>{segment.title}</div>
  <div style={{position:'absolute',bottom:8,left:25,right:25,display:'flex',justifyContent:'space-between',fontSize:12,color:'#9faebc'}}>
   <span>APK 1.2.3 · реальная запись экрана · голосовой комментарий</span>
   <span>{segment.kind==='wait'?'Ожидание: ': 'Монтаж: '}×{segment.rate.toFixed(2)} · {index+1}/{timeline.segments.length}</span>
  </div>
  <Html5Audio src={staticFile(segment.voice)} />
  <div style={{position:'absolute',bottom:0,left:0,height:3,width:`${100*(segment.from_frame+frame)/timeline.total_frames}%`,background:'#8ce2c3'}}/>
 </AbsoluteFill>
}
function Film(){return <AbsoluteFill>{timeline.segments.map((segment,index)=><Sequence key={index} from={segment.from_frame} durationInFrames={segment.duration_frames}><ActionClip segment={segment} index={index}/></Sequence>)}</AbsoluteFill>}
registerRoot(()=> <Composition id="ProductDemo" component={Film} durationInFrames={timeline.total_frames} fps={timeline.fps} width={WIDTH} height={HEIGHT}/>);
