import React from 'react';
import {AbsoluteFill,Composition,Img,OffthreadVideo,Sequence,interpolate,registerRoot,staticFile,useCurrentFrame} from 'remotion';
const scenes=[
 {title:'Нейро-стенографист',eyebrow:'HEX.TEAM · Android · 1.2.3',text:'Разговор → структурированный текст. Локально, с участниками и таймкодами.',image:'demo-home.png',tags:['Русский язык','Модели в APK','Без облака'],duration:144},
 {title:'Импорт аудио',text:'Выбор готовой записи через системный файловый диалог. WAV PCM16 и M4A/AAC.',image:'demo-picker.png',tags:['Файлы устройства','WAV / M4A / AAC'],duration:132},
 {title:'Текст раньше резюме',text:'После ASR сразу открываются стенограмма, плеер и экспорт. Qwen продолжает отдельно.',image:'early-text.png',tags:['Реальный офлайн-запуск','Без ожидания LLM'],duration:144},
 {title:'Кто и когда говорил',text:'Реплики разделены по участникам. Метки — в миллисекундах исходной записи.',image:'demo-text.png',tags:['Speaker ID','Временные метки'],duration:132},
 {title:'Переход по таймкоду',text:'Нажатие на время запускает нужный участок. В проверке: 00:02 → воспроизведение с нужной позиции.',image:'demo-text.png',tags:['Навигация по репликам','Изменение имени участника'],duration:132},
 {title:'Прослушивание',text:'Запуск и пауза. Источник аудио остаётся связан со стенограммой.',image:'demo-audio-playing.png',tags:['Аудио из библиотеки','Пауза останавливает таймер'],duration:132},
 {title:'Перемотка и скорость',text:'Полный плеер стенограммы: ±15 с, касание дорожки, 0.75–2×. Проверено: 03 → 18 → 03 с; середина — 02:30.',image:'demo-text.png',tags:['Измеренное отношение 2×: 1.99','В аудиотеке — компактный play/pause'],duration:168},
 {title:'Резюме на устройстве',text:'Qwen формирует отдельный итог. Стенограмма и оценочный JSON не переписываются.',image:'demo-summary.png',tags:['Локальная LLM','Важные детали нужно сверять'],duration:144},
 {title:'Экспорт TXT и JSON',text:'TXT — протокол для чтения. JSON — строгая структура для оценки без дополнительных полей.',image:'demo-export.png',tags:['Системный диалог отправки','Предпросмотр JSON'],duration:132},
 {title:'Прозрачный JSON',text:'speaker_id · start_ms · end_ms · text. Имена и резюме хранятся отдельно.',image:'demo-json.png',tags:['Целые миллисекунды','Переименование не меняет ID'],duration:144},
 {title:'История после перезапуска',text:'Готовые расшифровки, резюме и аудио доступны после остановки и повторного запуска процесса.',image:'demo-home.png',tags:['Локальное хранение','Повторное открытие'],duration:132},
 {title:'Встроенный диктофон',text:'Начать запись прямо в приложении. На экране видны длительность и измеряемый уровень сигнала.',image:'demo-recording.png',tags:['Реальный экран эмулятора','Не запись телефонных звонков'],duration:132},
 {title:'Пауза и продолжение',text:'Пауза останавливает таймер. Продолжение пишет в тот же файл; завершение открывает предпросмотр.',image:'demo-pause.png',tags:['Один файл','Пауза проверена'],duration:132},
 {title:'Прослушать и сохранить',text:'Прослушивание до сохранения, название записи и выбор: сохранить аудио или сразу расшифровать.',image:'demo-finished.png',tags:['Предпросмотр','Имя записи'],duration:132},
 {title:'Аудио остаётся в библиотеке',text:'Новая запись сохранена и повторно открыта. Старое аудио и история пережили обновление APK.',image:'demo-saved.png',tags:['Приватная аудиотека','Повторное воспроизведение'],duration:132},
 {title:'Настоящие переходы',text:'Экранная запись этого APK. Монтаж ускорен в 3 раза; это демонстрация UX, не замер скорости ASR.',video:true,tags:['Без макетов и фиктивной расшифровки','Запись экрана ×3'],duration:288},
 {title:'Ускорение с оговорками',text:'На 5-минутном подкасте кандидат: 339 → 248 с полного цикла. На одном эталоне DER ухудшился: 27.84% → 30.28%.',image:'demo-text.png',tags:['Замеры эмулятора','Redmi и часовой TitaNet не проверены'],duration:192},
 {title:'Семь материалов — в README',text:'APK · исходники · инструкция · архитектура и модели · ограничения · собственные тесты · это видео.',image:'demo-final-home.png',tags:['SHA-256 опубликован','Предварительный релиз'],duration:168},
];
const total=scenes.reduce((n,s)=>n+s.duration,0);
function Scene({data,index}){const f=useCurrentFrame();const opacity=interpolate(f,[0,10],[0,1],{extrapolateRight:'clamp'});const y=interpolate(f,[0,15],[18,0],{extrapolateRight:'clamp'});return <AbsoluteFill style={{background:'#10151c',fontFamily:'Segoe UI, sans-serif',color:'#f7fafc',padding:54}}>
 <div style={{position:'absolute',width:620,height:620,borderRadius:620,background:'radial-gradient(circle,#183631 0%,transparent 69%)',right:-100,top:80}}/>
 <div style={{fontSize:16,letterSpacing:2,color:'#8ce2c3',textTransform:'uppercase'}}>HEX.TEAM / НЕЙРО-СТЕНОГРАФИСТ</div>
 <div style={{position:'absolute',left:54,top:144,width:742,opacity,transform:`translateY(${y}px)`}}>
  <div style={{fontSize:16,color:'#97a8b9',marginBottom:20}}>{data.eyebrow||`СЦЕНАРИЙ ${String(index+1).padStart(2,'0')} / ${scenes.length}`}</div>
  <div style={{fontSize:51,fontWeight:700,lineHeight:1.09,letterSpacing:-1.6,marginBottom:27,maxWidth:720}}>{data.title}</div>
  <div style={{fontSize:27,lineHeight:1.45,color:'#ccd6df',maxWidth:700}}>{data.text}</div>
  <div style={{display:'flex',gap:10,marginTop:30,flexWrap:'wrap'}}>{data.tags.map(t=><div key={t} style={{border:'1px solid #385047',borderRadius:10,padding:'9px 13px',fontSize:16,color:'#a5e4ca',maxWidth:690}}>{t}</div>)}</div>
 </div>
 <div style={{position:'absolute',right:61,top:65,width:261,height:580,borderRadius:26,overflow:'hidden',border:'7px solid #29313a',boxShadow:'0 22px 65px #0009',background:'#fafafa'}}>
 {data.video?<OffthreadVideo src={staticFile('live.mp4')} muted trimBefore={24*20} playbackRate={3} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<Img src={staticFile(data.image)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}
 </div>
 <div style={{position:'absolute',left:54,bottom:37,fontSize:14,color:'#7b8d9e'}}>Реальные экраны APK 1.2.3 · x86_64-эмулятор · монтаж Remotion · без озвучки</div>
 </AbsoluteFill>}
function Film(){const f=useCurrentFrame();let from=0;return <AbsoluteFill>{scenes.map((data,index)=>{const at=from;from+=data.duration;return <Sequence key={index} from={at} durationInFrames={data.duration}><Scene data={data} index={index}/></Sequence>})}<div style={{position:'absolute',bottom:0,left:0,height:4,width:`${100*f/total}%`,background:'#8ce2c3'}}/></AbsoluteFill>}
registerRoot(()=> <Composition id="Submission" component={Film} durationInFrames={total} fps={24} width={1280} height={720}/>);
