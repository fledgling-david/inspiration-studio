"use strict";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover: hover) and (pointer: fine)').matches;
const ease='cubic-bezier(.22,1,.36,1)';
let works=[],slide=0,previewId='',detailId='',filter='all',touchX=0,cursorFrame=0,cursorInside=false,cursorX=0,cursorY=0,shownX=0,shownY=0,closePending=false;
const escapeHTML=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>String(n+1).padStart(2,'0');
const detailLink=id=>'../?v=discovery-2#all?item='+encodeURIComponent(id);
function motion(el,frames,opts={}){if(reduced||!el.animate)return Promise.resolve();return el.animate(frames,{duration:650,easing:ease,...opts}).finished.catch(()=>{})}
function upgrade(img,url){if(!url||!/^https:\/\//.test(url))return;const src=img.getAttribute('src'),loader=new Image();loader.onload=()=>{if(img.getAttribute('src')===src)img.src=url};loader.src=url}
function updateSlide(next,initial=false){
 slide=(next+3)%3;const r=works[slide];
 $$('#stage-images img').forEach((img,i)=>{const active=i===slide;img.classList.toggle('active',active);img.setAttribute('aria-hidden',String(!active));if(active){img.style.transform='scale(1)';motion(img,[{transform:'scale(1.06)'},{transform:'scale(1)'}],{duration:initial?1800:1300});if(!img.dataset.upgraded){img.dataset.upgraded='true';upgrade(img,r.original)}}});
 $('#stage-title').textContent=r.title;$('#stage-category').textContent=r.label+' / '+r.kind;$('#stage-subtitle').textContent=r.en.toUpperCase();$('#slide-number').textContent=number(slide);
 $$('.slide-tabs button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===slide)));
 if(!initial)motion($('.stage-text'),[{opacity:0,transform:'translateY(15px)'},{opacity:1,transform:'translateY(0)'}],{duration:700});
}
function showPreview(id,initial=false){
 if(id===previewId)return;previewId=id;const r=works.find(x=>x.id===id);const img=$('#preview-image');img.src=r.image;img.alt=r.title+' · 作者公开示例';$('#preview-en').textContent=r.en;$('#preview-author').textContent=r.repo.split('/')[0];$('#preview-frame').style.background=r.color+'24';
 $$('.work-row').forEach(b=>b.classList.toggle('is-previewing',b.dataset.id===id));
 if(!initial)motion(img,[{opacity:.15,transform:'scale(.97) translateY(8px)'},{opacity:1,transform:'scale(1) translateY(0)'}],{duration:600});
 upgrade(img,r.original);
}
function renderRows(){
 const list=works.filter(r=>filter==='all'||r.category===filter);
 $('#work-list').innerHTML=list.map(r=>`<button class="work-row" data-id="${r.id}" aria-label="查看${r.title}"><span class="row-number">${number(works.indexOf(r))}</span><img class="row-image" src="${r.image}" alt="" loading="lazy"><div><h3 class="row-title">${r.title}</h3><span class="row-meta"><span>${r.label}</span><span>${r.kind}</span><span>${r.repo.split('/')[0]}</span></span></div><span class="row-arrow" aria-hidden="true">↗</span></button>`).join('');
 $$('.work-row').forEach(row=>{if(fine)row.addEventListener('pointerenter',()=>showPreview(row.dataset.id));row.addEventListener('focus',()=>showPreview(row.dataset.id));row.addEventListener('click',()=>openWork(row.dataset.id));});
 $('#result-count').textContent=String(list.length).padStart(2,'0')+' 件精选作品';
 if(!list.some(r=>r.id===previewId))showPreview(list[0].id);else $$('.work-row').forEach(r=>r.classList.toggle('is-previewing',r.dataset.id===previewId));
}
function fillDetail(id){
 const r=works.find(x=>x.id===id);detailId=id;$('#detail-number').textContent='SELECTED WORK / '+number(works.indexOf(r));$('#detail-label').textContent=r.label+' / '+r.kind;$('#detail-title').textContent=r.title;$('#detail-en').textContent=r.en;$('#detail-desc').textContent=r.desc;
 const img=$('#detail-image');img.src=r.image;img.alt=r.title+' · 作者公开示例';$('#detail-visual').style.background=r.color+'28';upgrade(img,r.original);
 $('#detail-source').textContent=r.repo+' ↗';$('#detail-source').href=r.source;$('#detail-input').textContent=r.input;$('#detail-needs').textContent=r.needs;$('#detail-verification').textContent=r.verification;$('#detail-license').textContent=r.license||'请查看原项目';$('#detail-install').href=detailLink(id);
}
function openWork(id){
 const dialog=$('#work-dialog');fillDetail(id);if(!dialog.open){dialog.showModal();motion(dialog,[{opacity:0,transform:'translateY(40px)',clipPath:'inset(5% 0 0 0)'},{opacity:1,transform:'translateY(0)',clipPath:'inset(0% 0 0 0)'}],{duration:800});motion($('#detail-image'),[{transform:'scale(1.045)'},{transform:'scale(1)'}],{duration:1200});motion($('.detail-content'),[{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:850,delay:100});}else{motion($('#detail-image'),[{opacity:.1,transform:'translateX(18px)'},{opacity:1,transform:'translateX(0)'}],{duration:600});motion($('#detail-title'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:500});}
}
async function closeWork(){if(closePending||!$('#work-dialog').open)return;closePending=true;await motion($('#work-dialog'),[{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(20px) scale(.985)'}],{duration:300});$('#work-dialog').close();closePending=false;}
function detailNext(step){const n=works.findIndex(r=>r.id===detailId);openWork(works[(n+step+works.length)%works.length].id);}
function renderSearch(){
 const q=$('#search-input').value.trim().toLocaleLowerCase();const aliases=q.replace(/海报/g,'设计').replace(/视频/g,'动态').replace(/photo/g,'影像');
 const list=works.filter(r=>{const text=[r.title,r.en,r.name,r.repo,r.desc,r.label,r.needs,r.input,{image:'影像 照片',design:'设计 海报',video:'动态 视频'}[r.category]].join(' ').toLocaleLowerCase();return !q||text.includes(q)||text.includes(aliases)});
 $('#search-results').innerHTML=list.length?list.map(r=>`<button class="search-result" data-search-id="${r.id}"><img src="${r.image}" alt=""><div><b>${r.title}</b><small>${r.label} / ${escapeHTML(r.name)}</small></div><span>↗</span></button>`).join(''):`<p class="search-empty">没有匹配的精选作品。<br><a href="../?v=discovery-2#all?q=${encodeURIComponent($('#search-input').value.trim())}">去完整资源库搜索 ↗</a></p>`;
 $$('[data-search-id]').forEach(b=>b.addEventListener('click',()=>{$('#search-dialog').close();openWork(b.dataset.searchId)}));
}
function openSearch(){if(!works.length)return;if($('#work-dialog').open)return;$('#search-dialog').showModal();$('#search-input').value='';renderSearch();$('#search-input').focus();motion($('#search-dialog'),[{opacity:0,transform:'translateY(15px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:450});}
function setup(){
 $('.search-open span').textContent=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘ K':'Ctrl K';
 $('#stage-images').innerHTML=works.slice(0,3).map((r,i)=>`<img src="${r.image}" alt="${r.title} · 作者公开示例" data-project="${i}" class="${i===0?'active':''}" aria-hidden="${i!==0}" ${i===0?'fetchpriority="high"':'loading="lazy"'}>`).join('');
 updateSlide(0,true);showPreview(works[0].id,true);renderRows();
 $$('[data-slide]').forEach(b=>b.addEventListener('click',()=>updateSlide(Number(b.dataset.slide))));$('#next-slide').addEventListener('click',()=>updateSlide(slide+1));$('#previous-slide').addEventListener('click',()=>updateSlide(slide-1));
 const stage=$('#stage');stage.addEventListener('click',e=>{if(!e.target.closest('button'))openWork(works[slide].id)});$$('[data-open-feature]').forEach(b=>b.addEventListener('click',()=>openWork(works[slide].id)));
 stage.addEventListener('keydown',e=>{if(e.target!==stage)return;if(e.key==='ArrowRight'){e.preventDefault();updateSlide(slide+1)}if(e.key==='ArrowLeft'){e.preventDefault();updateSlide(slide-1)}if(e.key==='Enter'){e.preventDefault();openWork(works[slide].id)}});
 stage.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX},{passive:true});stage.addEventListener('touchend',e=>{const delta=e.changedTouches[0].clientX-touchX;if(Math.abs(delta)>65)updateSlide(slide+(delta<0?1:-1))},{passive:true});
 if(fine&&!reduced){const cursor=$('.stage-cursor');const tick=()=>{shownX+=(cursorX-shownX)*.15;shownY+=(cursorY-shownY)*.15;cursor.style.transform=`translate(${shownX-37}px,${shownY-37}px) scale(${cursorInside?1:.7})`;if(cursorInside||Math.abs(cursorX-shownX)>1||Math.abs(cursorY-shownY)>1)cursorFrame=requestAnimationFrame(tick);else cursorFrame=0};stage.addEventListener('pointermove',e=>{const rect=stage.getBoundingClientRect();cursorX=e.clientX-rect.left;cursorY=e.clientY-rect.top;cursorInside=!e.target.closest('button');cursor.style.opacity=cursorInside?'1':'0';if(!cursorFrame)cursorFrame=requestAnimationFrame(tick)});stage.addEventListener('pointerleave',()=>{cursorInside=false;cursor.style.opacity='0'});}
 $$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderRows();motion($('#work-list'),[{opacity:.2,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:500})}));
 $('#preview-open').addEventListener('click',()=>openWork(previewId));$$('[data-close-work]').forEach(b=>b.addEventListener('click',closeWork));$('#detail-prev').addEventListener('click',()=>detailNext(-1));$('#detail-next').addEventListener('click',()=>detailNext(1));
 $('#work-dialog').addEventListener('cancel',e=>{e.preventDefault();closeWork()});$('#work-dialog').addEventListener('click',e=>{if(e.target===$('#work-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeWork()}});
 $$('[data-search-open]').forEach(b=>b.addEventListener('click',openSearch));$('#search-close').addEventListener('click',()=>$('#search-dialog').close());$('#search-input').addEventListener('input',renderSearch);$('#search-input').addEventListener('keydown',e=>{if(e.key==='ArrowDown'){$('.search-result')?.focus();e.preventDefault()}if(e.key==='Enter'){$('.search-result')?.click();e.preventDefault()}});
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if($('#search-dialog').open)$('#search-dialog').close();else openSearch()}if($('#work-dialog').open&&!/INPUT|TEXTAREA/.test(e.target.tagName)){if(e.key==='ArrowRight'){e.preventDefault();detailNext(1)}if(e.key==='ArrowLeft'){e.preventDefault();detailNext(-1)}}});
 if(!reduced&&'IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');observer.unobserve(e.target)}}),{threshold:.12});$$('.index-heading,.index-toolbar,.about-layout').forEach(el=>{el.classList.add('reveal-ready');observer.observe(el)})}
 let scheduled=false;function scrollUpdate(){const max=document.documentElement.scrollHeight-innerHeight;$('.reading-progress').style.transform=`scaleX(${max>0?scrollY/max:0})`;if(!reduced){const rect=stage.getBoundingClientRect();if(rect.bottom>0&&rect.top<innerHeight){const offset=Math.max(-30,Math.min(30,-rect.top*.055));$('#stage-images').style.transform=`translateY(${offset}px) scale(1.055)`}}scheduled=false}addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(scrollUpdate)}},{passive:true});scrollUpdate();
}
fetch('works.json?v=2').then(r=>{if(!r.ok)throw Error('作品资料加载失败');return r.json()}).then(data=>{works=data;setup()}).catch(()=>{$('#stage-title').textContent='作品暂时无法加载';$('#stage-subtitle').innerHTML='<a href="../?v=discovery-2#all">进入正式版 →</a>';$('#result-count').textContent='请刷新页面，或进入正式版。';$$('[data-open-feature],.slide-tabs button,.slide-arrows button,#preview-open,[data-filter]').forEach(b=>b.disabled=true)});
