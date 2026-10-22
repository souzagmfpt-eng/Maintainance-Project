(function(){
  const HOURS_KEY='gestao_manutencao_horas_planeadas_dia_v1';
  const own=$=>document.getElementById($);
  const safeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const oldFormObj=formObj;
  formObj=function(){const o=oldFormObj();o.workType=own('fWorkType')?.value||'';return o};
  const oldFill=fill;
  fill=function(o){if(own('fWorkType'))own('fWorkType').value=o.workType||'';oldFill(o)};

  // Statuses from the source spreadsheet are authoritative: "Oficina" remains open; "Completa" and "Anulado" are closed.
  closed=function(o){if(!o)return false;const s=String(o.status||'').toLocaleLowerCase('pt-PT');if(s==='anulada'||s==='anulado'||s==='finalizada'||s==='completa'||s==='completo')return true;if(['oficina','em curso','em análise','em analise','em aberto','em espera','compra de material','espera dos técnicos','espera dos tecnicos'].includes(s))return false;return !!o.closedAt};

  // Import headers matching the real Excel export.
  impHeaderLooksLikeNumber=function(v){return ['n ot','no ot','n da ot','no da ot','numero da ot','numero ot','n da ote','no da ote','numero da ote','n ote','no ote','number','ot'].includes(impKey(v))};
  impMatrixToRecords=function(matrix){if(!matrix||!matrix.length)throw Error('Folha vazia.');let hi=matrix.findIndex(r=>r.some(impHeaderLooksLikeNumber));if(hi<0)throw Error('Não encontrei a coluna “Nº OT”.');const headers=matrix[hi].map(v=>String(v??'').trim());const out=[];for(let ri=hi+1;ri<matrix.length;ri++){const row=matrix[ri];if(!row||!row.some(v=>String(v??'').trim()!==''))continue;const rec={};headers.forEach((h,i)=>{if(h)rec[h]=row[i]??''});out.push(rec)}return out};
  normalizeImportedOT=function(raw){
    const number=String(impPick(raw,['Nº OT','Nº da Ote','numero da ot','numero da ote','numero ot','n ot','no ot','n da ot','no da ot','number','ot'])||'').trim();if(!number)return null;
    const date=impDate(impPick(raw,['Data','date','data de abertura','data abertura','abertura']));
    const startedAt=impDate(impPick(raw,['data de inicio','data de início','data inicio','inicio','startedAt']));
    const closedAt=impDate(impPick(raw,['data de fim','data fim','fim','closedAt','data de fecho']));
    const description=String(impPick(raw,['descrição','descricao','descrição da avaria','descricao da avaria','avaria','defeito','description'])||'').trim();
    const location=String(impPick(raw,['localização','localizacao','local','location'])||'').trim();
    const typeRaw=impKey(impPick(raw,['tipo do trabalho','tipo de trabalho','tipo trabalho','tipo','workType','work type']));
    const workType=typeRaw.includes('prevent')?'Preventiva':(typeRaw.includes('corret')?'Corretiva':'');
    const situationRaw=String(impPick(raw,['situação','situacao','status','estado','situação da ot'])||'').trim();const situationKey=impKey(situationRaw);let statusValue='Em aberto';
    if(situationKey.startsWith('anulad')||situationKey.startsWith('cancel'))statusValue='Anulada';
    else if(situationKey.startsWith('complet')||situationKey.startsWith('finaliz')||situationKey.startsWith('fechad'))statusValue='Finalizada';
    else if(situationKey==='oficina')statusValue='Oficina';
    else if(situationKey.includes('curso'))statusValue='Em curso';
    else if(situationKey.includes('analise'))statusValue='Em análise';
    else if(situationKey.includes('espera'))statusValue='Em espera';
    else if(situationKey.includes('material'))statusValue='Compra de material';
    else if(situationKey){const existing=['Em aberto','Em análise','Em espera','Compra de material','Espera dos técnicos','Em curso','Oficina','Finalizada','Anulada'].find(x=>impKey(x)===situationKey);if(existing)statusValue=existing;else statusValue=situationRaw}
    else if(closedAt)statusValue='Finalizada';
    let urgencyRaw=impKey(impPick(raw,['grau de urgencia','urgencia','prioridade']));const urgency=urgencyRaw.includes('p1')||urgencyRaw.includes('crit')?'P1 - Crítica':urgencyRaw.includes('p3')||urgencyRaw.includes('normal')?'P3 - Normal':'P2 - Alta';
    const slaDueDate=impDate(impPick(raw,['prazo sla','data limite sla','slaDueDate']));
    const startDown=impDate(impPick(raw,['inicio da indisponibilidade','início da indisponibilidade','inicio da paragem','downtimeStartAt']));
    const returnedAt=impDate(impPick(raw,['reposicao em servico','reposição em serviço','data de reposicao','returnedAt']));
    const ftfRaw=impKey(impPick(raw,['resolvida na primeira visita','firstTimeFix']));const firstTimeFix=ftfRaw==='sim'||ftfRaw==='yes'||ftfRaw==='true'?'Sim':(ftfRaw==='nao'||ftfRaw==='no'||ftfRaw==='false'?'Não':'');
    const previousTasks=Array.isArray(raw.tasks)?raw.tasks:[];
    const category=String(impPick(raw,['categoria da avaria','categoria','category'])|| (workType==='Preventiva'?'Manutenção preventiva':'Outro'));
    return {...raw,id:raw.id?String(raw.id):impId(),number,date,startedAt,closedAt,workType,urgency,requester:String(impPick(raw,['requisitante','requester'])||''),location,equipment:String(impPick(raw,['equipamento','equipment'])||''),description,status:statusValue,reason:String(impPick(raw,['descricao do status','motivo do status','reason'])||''),tasks:previousTasks,work:String(impPick(raw,['trabalho realizado','descricao do trabalho realizado','work'])||''),owner:String(impPick(raw,['responsavel','responsável','owner'])||''),category,updatedAt:localNow(),slaDueDate:slaDueDate?slaDueDate.slice(0,10):'',downtimeStartAt:startDown,returnedAt,firstTimeFix};
  };

  downloadImportTemplate=function(){const headers=['Nº OT','Data','Descrição','Data de inicio','Data de fim','Tipo do trabalho','Localização','Situação'];const csv=headers.map(impCsvCell).join(';')+'\r\n';impDownload(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),'modelo_importacao_ots.csv');toast('Modelo de importação descarregado com as 8 colunas do Excel.')};
  impSituation=function(o){const s=String(o.status||'').toLocaleLowerCase('pt-PT');if(s.startsWith('anulad')||s.startsWith('cancel'))return 'Anulado';if(s==='oficina'||['em aberto','em curso','em análise','em analise','em espera','compra de material','espera dos técnicos','espera dos tecnicos'].includes(s))return 'Oficina';if(s.startsWith('complet')||s.startsWith('finaliz')||s.startsWith('fechad')||o.closedAt)return 'Completa';return 'Oficina'};
  exportOTsCsv=function(){const headers=['Nº OT','Data','Descrição','Data de inicio','Data de fim','Tipo do trabalho','Localização','Situação'];const rows=[headers,...orders.map(o=>[o.number,impFormatDate(o.date),o.description||'',impFormatDate(o.startedAt||''),impFormatDate(o.closedAt||''),o.workType||'',o.location||'',impSituation(o)])];const csv=rows.map(r=>r.map(impCsvCell).join(';')).join('\r\n')+'\r\n';impDownload(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),'ordens_trabalho_excel.csv');toast('Ordens exportadas com as 8 colunas do Excel.')};

  // A true reset requires deliberate confirmation and removes both OTs and purchases.
  if(own('clearDataSide'))own('clearDataSide').onclick=()=>ask('Limpar todos os dados?', 'Esta ação elimina todas as OTs, compras e parâmetros locais guardados nesta aplicação. Não pode ser anulada. Exporte uma cópia de segurança antes de continuar. Pretende começar do zero?',()=>{orders=[];purchases=[];inventoryItems=[];supplierRecords=[];currentId=null;purchaseId=null;try{if(window.indexedDB)indexedDB.deleteDatabase('gestao_manutencao_catalogos_v1')}catch{}localStorage.setItem(KEY,'[]');localStorage.setItem(PURCHASE_KEY,'[]');localStorage.removeItem(HOURS_KEY);localStorage.removeItem('gestao_manutencao_inventory_v1');localStorage.removeItem('gestao_manutencao_suppliers_v1');if(own('purchaseEditor'))showPurchaseEditor(false);saveLocal();go('dashboard');toast('Dados da aplicação limpos. Pode importar as novas OTs.')});

  // Helper functions for the six maintenance indicators.
  function asDate(v){if(v===undefined||v===null||String(v).trim()==='')return null;if(v instanceof Date)return isNaN(v)?null:new Date(v);let s=String(v).trim();let iso='';if((typeof v==='number'||/^\d{4,5}(?:\.\d+)?$/.test(s))&&Number(s)>20000&&Number(s)<100000){iso=impDate(s)}else if(/^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}(?:[ T]+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s)){iso=impDate(s)}else if(/^\d{4}-\d{2}-\d{2}$/.test(s)){iso=s+'T00:00'}else if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)){iso=s.replace(' ','T')}else{iso=s}let d=new Date(iso);if(isNaN(d)){const fallback=impDate(s);d=fallback?new Date(fallback):null}return d&&!isNaN(d)?d:null}
  function isCompletedOT(o){return !!o&&String(o.status||'').toLocaleLowerCase('pt-PT')!=='anulada'&&(String(o.status||'').toLocaleLowerCase('pt-PT').startsWith('finaliz')||String(o.status||'').toLocaleLowerCase('pt-PT').startsWith('complet')||!!o.closedAt)}
  function isCancelledOT(o){return String(o?.status||'').toLocaleLowerCase('pt-PT').startsWith('anulad')||String(o?.status||'').toLocaleLowerCase('pt-PT').startsWith('cancel')}
  function otStartDate(o){return asDate(o?.startedAt||o?.startAt||o?.startDate||o?.dataInicio||o?.['Data de inicio']||o?.['Data de início'])}
  function otCloseDate(o){return asDate(o?.closedAt||o?.endAt||o?.endDate||o?.dataFim||o?.['Data de fim'])}
  function isFinalizedInYear(o,year=new Date().getFullYear()){const c=otCloseDate(o);return !!c&&c.getFullYear()===year&&isCompletedOT(o)&&!isCancelledOT(o)}
  function typeOfWork(o){let k=impKey(o?.workType||o?.work_type||o?.workTypeLabel||'');if(k.includes('prevent'))return 'Preventiva';if(k.includes('corret'))return 'Corretiva';return ''}
  function inRangeDate(value,start,end){const d=asDate(value);return !!d&&d>=start&&d<end}
  function periodName(r,sub,y){if(r==='year')return `Ano ${y}`;if(r==='half')return `${sub===1?'1.º':'2.º'} semestre de ${y}`;if(r==='quarter')return `${sub}.º trimestre de ${y}`;return `${own('aSub').selectedOptions[0]?.textContent||''} de ${y}`}
  function makeBuckets(start,end,range,sub,y){const out=[];if(range==='year'||range==='half'||range==='quarter'){let first=range==='year'?0:(range==='half'?(sub-1)*6:(sub-1)*3),count=range==='year'?12:(range==='half'?6:3);for(let i=0;i<count;i++){const m=first+i;out.push({label:new Date(y,m,1).toLocaleDateString('pt-PT',{month:'short'}),start:new Date(y,m,1),end:new Date(y,m+1,1)})}}else{let p=new Date(start);for(let i=0;i<5&&p<end;i++){let e=new Date(Math.min(end.getTime(),new Date(p.getFullYear(),p.getMonth(),p.getDate()+7).getTime()));out.push({label:`${String(p.getDate()).padStart(2,'0')}–${String(new Date(e-1).getDate()).padStart(2,'0')}`,start:new Date(p),end:new Date(e)});p=e}}return out}
  function metricBarTone(id,x){const v=Number(x.value);if(id==='mttrChart')return v<=2?'good':v<=4?'warn':'bad';if(id==='backlogChart'){const l=String(x.label);return l.includes('0–7')?'good':l.includes('8–30')?'warn':'bad'}if(id==='faultFrequencyChart')return v>=3?'bad':v>=2?'warn':'neutral';if(id==='openEquipmentsChart')return v>=4?'bad':v>=2?'warn':'neutral';if(id==='workTypeChart')return String(x.label).includes('Preventiva')?'good':String(x.label).includes('Corretiva')?'warn':'neutral';return 'neutral'}
  function metricOrderFilter(id,x,o){
    const bounds=periodDateBounds();
    const closeDate=otCloseDate(o),startDate=otStartDate(o);
    // Todas as fatias/barras consultam o mesmo intervalo escolhido nos filtros da aba.
    if(!closeDate||closeDate<bounds.start||closeDate>=bounds.end||!isCompletedOT(o)||isCancelledOT(o))return false;
    if(id==='mttrChart')return typeOfWork(o)==='Corretiva'&&!!startDate&&closeDate>=startDate&&(!x.start||closeDate>=x.start)&&(!x.end||closeDate<x.end);
    if(id==='workTypeChart')return typeOfWork(o)===x.label||(x.label==='Não classificada'&&!typeOfWork(o));
    if(id==='faultFrequencyChart')return typeOfWork(o)==='Corretiva'&&impKey(String(o.description||'').trim()||'Descrição não registada').replace(/\s+/g,' ').trim()===impKey(x.label).replace(/\s+/g,' ').trim();
    if(id==='openEquipmentsChart')return `${String(o.location||'Localização não identificada').trim()} · ${String(o.equipment||'Equipamento não identificado').trim()}`===x.label;
    if(id==='backlogChart'){
      const opened=asDate(o.date);if(!opened||closeDate<opened)return false;
      const days=(closeDate.getTime()-opened.getTime())/86400000;
      return x.label==='0–7 dias'?days<=7:x.label==='8–30 dias'?days>7&&days<=30:days>30;
    }
    return false;
  }
  function renderMetricBars(id,items,format){
    const el=own(id);if(!el)return;
    const allValid=items.filter(x=>x&&Number.isFinite(Number(x.value)));
    chartSettingsData[id]=allValid.map(x=>({label:String(x.label),value:Number(x.value)||0}));
    const valid=chartItemsVisible(id,allValid);
    const card=el.closest('.card'),heading=card?.querySelector('.metric-heading');
    const rerender=()=>renderMetricBars(id,items,format);
    chartTools(id,heading,allValid,rerender)
    el.classList.remove('metric-pie-mode','metric-bar-mode');el.style.display='';el.style.gap='';el.style.overflowX='';el.style.alignItems='';el.style.paddingTop='';
    if(!valid.length){el.innerHTML='<div class="empty">Sem dados suficientes neste período.</div>';return}
    const palette=['#3977ad','#d9822b','#16836c','#8d7ad8','#3193a6','#cf8b3b','#c85d78','#78964a'];
    const mode=chartModes[id]||'pie';
    const total=valid.reduce((n,x)=>n+Math.max(0,Number(x.value)),0);
    const legend=valid.map((x,i)=>{const value=Math.max(0,Number(x.value)),pct=total?value/total*100:0;return `<button type="button" class="metric-legend-item" data-legend-index="${i}" title="Consultar: ${safeText(x.label)}"><i style="--legend-color:${palette[i%palette.length]}"></i><span class="metric-legend-label">${safeText(x.label)}</span><b>${safeText(format?format(x.value):x.value)}</b><small>${pct.toLocaleString('pt-PT',{maximumFractionDigits:1})}%</small></button>`}).join('');
    if(mode==='pie'){
      el.classList.add('metric-pie-mode');let angle=-Math.PI/2;
      const slices=valid.map((x,i)=>({x,i,value:Math.max(0,Number(x.value))})).filter(o=>o.value>0).map(({x,i,value})=>{const span=total?value/total*Math.PI*2:0,x1=100+78*Math.cos(angle),y1=100+78*Math.sin(angle);angle+=span;const x2=100+78*Math.cos(angle),y2=100+78*Math.sin(angle);const large=span>Math.PI?1:0;const d=span>=Math.PI*2-.0001?'M100 22 A78 78 0 1 1 99.99 22 Z':`M 100 100 L ${x1} ${y1} A 78 78 0 ${large} 1 ${x2} ${y2} Z`;return `<path class="pie-slice" data-metric-index="${i}" d="${d}" fill="${palette[i%palette.length]}" stroke="#fff" stroke-width="2"><title>${safeText(x.label)}: ${safeText(format?format(x.value):x.value)}</title></path>`}).join('');
      const centerValue=id==='mttrChart'?(own('mttrMeta')?.querySelector('strong')?.textContent||'—').replace(/\s*horas?$/i,'').trim():total.toLocaleString('pt-PT',{maximumFractionDigits:1});
      const centerCaption=id==='mttrChart'?'MÉDIA (H)':'TOTAL';
      el.innerHTML=`<div class="metric-pie-layout"><div class="metric-pie-visual"><svg viewBox="0 0 200 200" role="img" aria-label="Gráfico circular"><circle cx="100" cy="100" r="80" fill="#edf2f7"/>${slices}<circle cx="100" cy="100" r="43" fill="#fff"/><text x="100" y="96" text-anchor="middle" class="metric-pie-total">${safeText(centerValue)}</text><text x="100" y="113" text-anchor="middle" class="metric-pie-caption">${safeText(centerCaption)}</text></svg></div><div class="metric-pie-legend">${legend}</div></div>`;
    }else{
      el.classList.add('metric-bar-mode');const max=Math.max(1,...valid.map(x=>Math.max(0,Number(x.value))));
      el.innerHTML=`<div class="metric-vertical-chart">${valid.map((x,i)=>{const value=Math.max(0,Number(x.value)),height=value/max*100;return `<button type="button" class="vertical-chart-item interactive-chart-bar" data-metric-index="${i}" title="${safeText(x.label)}: ${safeText(format?format(x.value):x.value)}"><b>${safeText(format?format(x.value):x.value)}</b><div class="vbar-track"><div class="vbar-fill" style="height:${height}%;background:${palette[i%palette.length]}"></div></div><span>${safeText(x.label)}</span></button>`}).join('')}</div><div class="metric-bar-legend">${legend}</div>`;
    }
    el.querySelectorAll('[data-metric-index],[data-legend-index]').forEach(node=>{const idx=Number(node.dataset.metricIndex??node.dataset.legendIndex),x=valid[idx];if(!x)return;node.onclick=()=>showChartOrders(x.label,o=>metricOrderFilter(id,x,o))});
  }
  function renderMetricRows(id,items){const el=own(id);if(!el)return;el.innerHTML=items.length?items.map(x=>`<div class="metric-progress-row"><span>${safeText(x.label)}</span><div class="metric-progress-track"><span class="${safeText(x.tone||'')}" style="width:${Math.max(0,Math.min(100,Number(x.percent)||0))}%"></span></div><b>${safeText(x.value)}</b></div>`).join(''):'<div class="empty">Sem registos para apresentar.</div>'}
  function setMeta(id,headline,detail){const el=own(id);if(el)el.innerHTML=`<strong>${safeText(headline)}</strong><span>${safeText(detail)}</span>`}
  function mergeIntervals(list){list=list.slice().sort((a,b)=>a[0]-b[0]);const merged=[];for(const x of list){const last=merged[merged.length-1];if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else merged.push(x.slice())}return merged}
  function renderWeeklyTime(){
    const input=own('workMonth'),chart=own('weeklyTimeChart'),meta=own('weeklyTimeMeta');
    if(!chart)return;
    try{
      if(!input){chart.innerHTML='<div class="empty">Não foi possível encontrar o seletor do mês.</div>';return;}
      if(!input.value){const now=new Date();input.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;}
      const parts=input.value.match(/^(\d{4})-(\d{2})$/);
      if(!parts){chart.innerHTML='<div class="empty">Escolha um mês válido para apresentar o calendário.</div>';return;}
      const year=Number(parts[1]),month=Number(parts[2])-1;
      if(month<0||month>11){chart.innerHTML='<div class="empty">Escolha um mês válido para apresentar o calendário.</div>';return;}
      const monthStart=new Date(year,month,1),monthEnd=new Date(year,month+1,1),daysInMonth=new Date(year,month+1,0).getDate();
      const completedThisMonth=orders.map(o=>{
        const close=otCloseDate(o),start=otStartDate(o);
        const duration=start&&close&&close>=start?close.getTime()-start.getTime():null;
        return {o,close,start,duration};
      }).filter(x=>x.close&&x.close>=monthStart&&x.close<monthEnd&&isCompletedOT(x.o)&&!isCancelledOT(x.o))
        .sort((a,b)=>a.close-b.close||String(a.o.number||'').localeCompare(String(b.o.number||''),'pt-PT'));
      const dayData=Array.from({length:daysInMonth},(_,i)=>({day:i+1,date:new Date(year,month,i+1),orders:[],durationMs:0,validDurations:0}));
      for(const item of completedThisMonth){
        const idx=item.close.getDate()-1;
        if(idx<0||idx>=dayData.length)continue;
        dayData[idx].orders.push(item);
        if(item.duration!==null&&item.duration>=0){dayData[idx].durationMs+=item.duration;dayData[idx].validDurations++;}
      }
      const validHours=completedThisMonth.filter(x=>x.duration!==null&&x.duration>=0).reduce((sum,x)=>sum+x.duration,0);
      const totalOTs=completedThisMonth.length,activeDays=dayData.filter(d=>d.orders.length>0).length;
      const monthName=monthStart.toLocaleDateString('pt-PT',{month:'long',year:'numeric'});
      if(meta)meta.innerHTML=`<strong>${safeText(monthName.charAt(0).toLocaleUpperCase('pt-PT')+monthName.slice(1))}</strong><span>${totalOTs} OT(s) finalizadas · ${formatDuration(validHours)} registados · ${activeDays} dia(s) com fechos</span>`;
      const weekdayLabels=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
      const firstOffset=(monthStart.getDay()+6)%7;
      const cells=[];
      for(let i=0;i<firstOffset;i++)cells.push('<div class="month-calendar-blank" aria-hidden="true"></div>');
      const compactHours=d=>d.validDurations?`${(d.durationMs/3600000).toLocaleString('pt-PT',{maximumFractionDigits:1})} h`:(d.orders.length?'— h':'0 h');
      for(const d of dayData){
        const dateISO=`${year}-${String(month+1).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;
        const count=d.orders.length;
        const countLabel=count===1?'1 OT':`${count} OTs`;
        const durationLabel=d.validDurations?formatDuration(d.durationMs):(count?'sem horários válidos':'0 h');
        const aria=`${d.day} de ${monthName}, ${countLabel} finalizada(s), ${durationLabel}. Clique para consultar.`;
        cells.push(`<button type="button" class="month-calendar-day ${count?'has-closed':''}" data-calendar-day="${dateISO}" title="${safeText(aria)}" aria-label="${safeText(aria)}"><span class="month-calendar-date">${d.day}</span><span class="month-calendar-hours">${compactHours(d)}</span><small class="month-calendar-count">${countLabel}</small></button>`);
      }
      while(cells.length<42)cells.push('<div class="month-calendar-blank" aria-hidden="true"></div>');
      chart.innerHTML=`<div class="month-calendar-weekdays">${weekdayLabels.map(x=>`<div class="month-calendar-weekday">${x}</div>`).join('')}</div><div class="month-calendar-grid">${cells.join('')}</div>`;
      chart.querySelectorAll('[data-calendar-day]').forEach(button=>button.addEventListener('click',()=>openClosedOTsForDay(button.dataset.calendarDay)));
    }catch(err){
      console.error('Erro ao desenhar o calendário mensal:',err);
      chart.innerHTML=`<div class="notice" style="margin:8px 0"><b>Não foi possível calcular este mês.</b><br>${safeText(err&&err.message?err.message:String(err))}</div>`;
      if(meta)meta.innerHTML='<strong>Erro no calendário</strong><span>Verifique os dados de data de início e de fecho.</span>';
    }
  }
  function formatDuration(ms){
    if(!Number.isFinite(ms)||ms<0)return '—';
    const minutes=Math.round(ms/60000),hours=Math.floor(minutes/60),mins=minutes%60;
    return `${hours} h ${String(mins).padStart(2,'0')} min`;
  }
  function closeWeeklyOTDetails(){const modal=own('weeklyOTModal');if(modal)modal.classList.remove('show')}
  function openClosedOTsForDay(dateISO){
    const modal=own('weeklyOTModal'),content=own('weeklyOTModalContent'),summary=own('weeklyOTModalSummary'),subtitle=own('weeklyOTModalSubtitle');
    if(!modal||!content)return;
    const parts=String(dateISO||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!parts){content.innerHTML='<div class="empty">Não foi possível identificar a data selecionada.</div>';modal.classList.add('show');return;}
    const year=Number(parts[1]),month=Number(parts[2])-1,day=Number(parts[3]);
    const dayStart=new Date(year,month,day),dayEnd=new Date(year,month,day+1);
    const closedOnDay=orders.map(o=>{
      const close=otCloseDate(o),start=otStartDate(o);
      return {o,close,start,duration:start&&close&&close>=start?close.getTime()-start.getTime():null};
    }).filter(x=>x.close&&x.close>=dayStart&&x.close<dayEnd&&isCompletedOT(x.o)&&!isCancelledOT(x.o))
      .sort((a,b)=>a.close-b.close||String(a.o.number||'').localeCompare(String(b.o.number||''),'pt-PT'));
    const valid=closedOnDay.filter(x=>x.duration!==null&&x.duration>=0);
    const total=valid.reduce((sum,x)=>sum+x.duration,0);
    const dateLabel=dayStart.toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    own('weeklyOTModalTitle').textContent=`OTs finalizadas · ${dateLabel}`;
    if(subtitle)subtitle.textContent=`${closedOnDay.length} OT(s) com data de fecho neste dia. As horas somam as durações válidas entre início e fecho.`;
    if(summary)summary.innerHTML=`<span><b>${closedOnDay.length}</b>&nbsp; OT(s) finalizadas</span><span><b>${valid.length}</b>&nbsp; com duração válida</span><span><b>${formatDuration(total)}</b>&nbsp; tempo total</span>${closedOnDay.length>valid.length?`<span>${closedOnDay.length-valid.length} OT(s) sem horários válidos</span>`:''}`;
    if(!closedOnDay.length){
      content.innerHTML='<div class="empty">Não existem OTs finalizadas com data de fecho neste dia.</div>';
    }else{
      const rows=closedOnDay.map(x=>{
        const o=x.o,number=String(o.number||o.ot||'Sem número'),desc=String(o.description||o.descricao||o.work||'Sem descrição registada'),place=String(o.location||o.localizacao||'—'),equipment=String(o.equipment||o.equipamento||''),duration=x.duration===null?'Sem horários válidos':formatDuration(x.duration);
        return `<tr class="weekly-click-row"><td><button type="button" class="otlink" data-day-ot="${safeText(o.id)}" title="Abrir a ficha completa da OT ${safeText(number)}">${safeText(number)} ↗</button></td><td class="desc-cell"><strong>${safeText(desc)}</strong>${o.work?`<small>Trabalho realizado: ${safeText(o.work)}</small>`:''}</td><td>${safeText(place)}${equipment?`<br><span class="muted">${safeText(equipment)}</span>`:''}</td><td>${safeText(x.start?dt(x.start):'—')}</td><td>${safeText(dt(x.close))}</td><td class="duration-cell">${safeText(duration)}</td></tr>`;
      }).join('');
      content.innerHTML=`<table class="weekly-table"><thead><tr><th>N.º OT</th><th>Avaria / trabalho</th><th>Localização / equipamento</th><th>Início</th><th>Fecho</th><th>Tempo gasto</th></tr></thead><tbody>${rows}</tbody></table>`;
      content.querySelectorAll('[data-day-ot]').forEach(button=>button.addEventListener('click',()=>{
        const id=button.dataset.dayOt;closeWeeklyOTDetails();if(id)openDetail(id,'worktime');
      }));
    }
    modal.classList.add('show');
  }
  ['closeWeeklyOTModal','closeWeeklyOTModalTop'].forEach(id=>{const button=own(id);if(button)button.addEventListener('click',closeWeeklyOTDetails)});
  if(own('weeklyOTModal'))own('weeklyOTModal').addEventListener('click',event=>{if(event.target===own('weeklyOTModal'))closeWeeklyOTDetails()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeWeeklyOTDetails()});
  if(own('workMonth')){
    own('workMonth').addEventListener('change',renderWeeklyTime);
    own('workMonth').addEventListener('input',renderWeeklyTime);
  }
  window.renderWeeklyTime=renderWeeklyTime;
  renderWeeklyTime();
  renderAnalytics=function(){
    if(!own('analyticsKpis'))return;
    refreshAnalyticsYears();
    const {y,range,sub,start,end}=periodDateBounds();
    const opened=orders.filter(o=>inRangeDate(o.date,start,end)&&!isCancelledOT(o));
    const closedAll=orders.filter(o=>isCompletedOT(o)&&!isCancelledOT(o));
    const completedPeriod=closedAll.filter(o=>inRangeDate(otCloseDate(o),start,end));
    const completedCorrectiveInPeriod=orders.filter(o=>isCompletedOT(o)&&!isCancelledOT(o)&&typeOfWork(o)==='Corretiva'&&inRangeDate(o.closedAt,start,end));
    const currentOpen=orders.filter(o=>!closed(o)&&!isCancelledOT(o));
    const toDate=v=>asDate(v);
    const mttrVals=completedCorrectiveInPeriod.map(o=>{
      const a=toDate(o.startedAt),b=toDate(o.closedAt);
      return a&&b&&b>=a?(b-a)/3600000:null;
    }).filter(v=>v!==null&&Number.isFinite(v));
    const mttr=mttrVals.length?mttrVals.reduce((a,b)=>a+b,0)/mttrVals.length:null;
    const preventive=opened.filter(o=>typeOfWork(o)==='Preventiva').length;
    const corrective=opened.filter(o=>typeOfWork(o)==='Corretiva').length;
    const unknownType=Math.max(0,opened.length-preventive-corrective);
    const ageDays=o=>{const d=toDate(o.date);return d?Math.max(0,(Date.now()-d.getTime())/86400000):0};
    const backlog7=currentOpen.filter(o=>ageDays(o)<7).length;
    const backlog30=currentOpen.filter(o=>ageDays(o)>=7&&ageDays(o)<=30).length;
    const backlog31=currentOpen.filter(o=>ageDays(o)>30).length;
    const closedCount=completedPeriod.length;
    const closureRate=opened.length?100*closedCount/opened.length:null;
    const periodTitle=periodName(range,sub,y);
    own('analyticsRangeLabel').textContent=`Período selecionado: ${periodTitle} (${start.toLocaleDateString('pt-PT')}–${new Date(end.getTime()-1).toLocaleDateString('pt-PT')}). Os cartões de resumo respeitam este período; todos os gráficos usam OTs finalizadas com data de fecho no ano corrente.`;

    const mttrTone=mttr===null?'neutral':mttr<=2?'good':mttr<=4?'warn':'bad';
    const backlogTone=currentOpen.length===0?'good':currentOpen.length<=5?'warn':'bad';
    const completedTone=closedCount>0?'good':'warn';
    const kpis=[
      ['OTs registadas no período',String(opened.length),'Ordens pela data de abertura','#3f7dc4','Conta OTs não anuladas pela data de abertura dentro do período selecionado. É um indicador de volume de trabalho, não de desempenho isoladamente.','neutral'],
      ['OTs concluídas no período',String(closedCount),'Ordens fechadas no período selecionado','#16836c','Conta OTs concluídas cuja data de fecho está dentro do período selecionado. Um valor elevado indica mais fechos, mas deve ser comparado com a carga de trabalho e o backlog.',completedTone],
      ['MTTR — reparação corretiva',mttr===null?'—':mttr.toFixed(1)+' h',mttrVals.length?`${mttrVals.length} reparação(ões) com datas válidas`:'Registe início e fim nas OTs corretivas',mttrTone==='good'?'#16836c':mttrTone==='warn'?'#d9822b':mttrTone==='bad'?'#c94351':'#8066b0','Tempo médio entre início e fecho das OTs corretivas concluídas no período. Referência visual provisória: até 2 h = bom; >2 a 4 h = atenção; >4 h = crítico. Ajuste os limites à realidade da instalação.',mttrTone],
      ['Backlog atual',String(currentOpen.length),`${backlog31} OT(s) abertas há mais de 30 dias`,backlogTone==='good'?'#16836c':backlogTone==='warn'?'#d9822b':'#c94351','Conta todas as OTs ainda não concluídas neste momento. Referência visual provisória: 0 = bom; 1–5 = atenção; >5 = crítico. Veja também a antiguidade das ordens, pois o volume aceitável depende da equipa.',backlogTone]
    ];
    own('analyticsKpis').innerHTML=kpis.map(k=>`<div class="kpi signal-${safeText(k[5])}" style="--c:${k[3]}"><div class="label" title="${safeText(k[4])}">${safeText(k[0])}<span class="metric-info-mark" aria-hidden="true">ⓘ</span></div><strong>${safeText(k[1])}</strong><small>${safeText(k[2])}</small></div>`).join('');

    // Todos os gráficos e respetivas consultas usam o intervalo selecionado (mês, trimestre, semestre ou ano), pela data de fecho.
    const graphBounds=periodDateBounds();
    const graphRangeLabel=periodName(graphBounds.range,graphBounds.sub,graphBounds.y);
    const completedSelectedPeriod=orders.filter(o=>{
      const close=otCloseDate(o);
      return !!close&&close>=graphBounds.start&&close<graphBounds.end&&isCompletedOT(o)&&!isCancelledOT(o);
    });
    const correctiveSelectedPeriod=completedSelectedPeriod.filter(o=>typeOfWork(o)==='Corretiva');
    const durationSample=items=>items.map(o=>{
      const a=otStartDate(o),b=otCloseDate(o);
      return a&&b&&b>=a?(b.getTime()-a.getTime())/3600000:null;
    }).filter(v=>v!==null&&Number.isFinite(v));
    const periodMttrSamples=durationSample(correctiveSelectedPeriod);
    const periodMttr=periodMttrSamples.length?periodMttrSamples.reduce((a,b)=>a+b,0)/periodMttrSamples.length:null;
    const buckets=makeBuckets(graphBounds.start,graphBounds.end,graphBounds.range,graphBounds.sub,graphBounds.y);
    const periodMttrBuckets=buckets.map(bucket=>{
      const sample=durationSample(correctiveSelectedPeriod.filter(o=>{
        const close=otCloseDate(o);return close&&close>=bucket.start&&close<bucket.end;
      }));
      return {...bucket,value:sample.length?sample.reduce((a,b)=>a+b,0)/sample.length:null};
    }).filter(x=>x.value!==null);
    setMeta('mttrMeta',periodMttr===null?'—':periodMttr.toLocaleString('pt-PT',{minimumFractionDigits:1,maximumFractionDigits:1})+' horas',periodMttrSamples.length?`Média de ${periodMttrSamples.length} OT(s) corretiva(s) finalizada(s) em ${graphRangeLabel}, com início e fecho válidos.`:`Sem OTs corretivas com horários válidos em ${graphRangeLabel}.`);
    renderMetricBars('mttrChart',periodMttrBuckets,x=>Number(x).toLocaleString('pt-PT',{minimumFractionDigits:1,maximumFractionDigits:1})+' h');

    const preventiveCompleted=completedSelectedPeriod.filter(o=>typeOfWork(o)==='Preventiva').length;
    const correctiveCompleted=correctiveSelectedPeriod.length;
    const unknownCompleted=completedSelectedPeriod.filter(o=>!typeOfWork(o)).length;
    setMeta('workTypeMeta',`${completedSelectedPeriod.length} OT(s) finalizadas em ${graphRangeLabel}`,`Preventiva: ${preventiveCompleted} · Corretiva: ${correctiveCompleted} · Não classificada: ${unknownCompleted}. Contagem pela data de fecho.`);
    renderMetricBars('workTypeChart',[{label:'Preventiva',value:preventiveCompleted},{label:'Corretiva',value:correctiveCompleted},{label:'Não classificada',value:unknownCompleted}],x=>String(x));

    const closedDurations=completedSelectedPeriod.map(o=>{const a=asDate(o.date),b=otCloseDate(o);return {o,a,b,days:a&&b&&b>=a?(b.getTime()-a.getTime())/86400000:null}}).filter(x=>x.days!==null&&Number.isFinite(x.days));
    const close7=closedDurations.filter(x=>x.days<=7).length;
    const close30=closedDurations.filter(x=>x.days>7&&x.days<=30).length;
    const close31=closedDurations.filter(x=>x.days>30).length;
    setMeta('backlogMeta',`${closedDurations.length} OT(s) com datas válidas`,`${close7} fechada(s) até 7 dias · ${close30} entre 8 e 30 dias · ${close31} após mais de 30 dias. Só OTs finalizadas em ${graphRangeLabel}.`);
    renderMetricBars('backlogChart',[{label:'0–7 dias',value:close7},{label:'8–30 dias',value:close30},{label:'Mais de 30 dias',value:close31}],x=>String(x));

    const faults=new Map();
    for(const o of correctiveSelectedPeriod){
      const label=String(o.description||'').trim()||'Descrição não registada';
      const key=impKey(label).replace(/\s+/g,' ').trim()||'descricao nao registada';
      if(!faults.has(key))faults.set(key,{label,count:0});
      faults.get(key).count++;
    }
    const topFaults=[...faults.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'pt-PT')).slice(0,8);
    setMeta('faultFrequencyMeta',topFaults.length?`${faults.size} tipo(s) de avaria corretiva em ${graphRangeLabel}`:`Sem avarias corretivas finalizadas em ${graphRangeLabel}`,`${correctiveSelectedPeriod.length} OT(s) corretivas consideradas; anuladas e OTs fora da data de fecho selecionada excluídas.`);
    renderMetricBars('faultFrequencyChart',topFaults.map(x=>({label:x.label,value:x.count})),x=>`${x} OT(s)`);

    const equipmentByPlace=new Map();
    for(const o of completedSelectedPeriod){
      const place=String(o.location||'Localização não identificada').trim();
      const equipment=String(o.equipment||'Equipamento não identificado').trim();
      const label=`${place} · ${equipment}`;
      const key=impKey(place)+'|'+impKey(equipment);
      if(!equipmentByPlace.has(key))equipmentByPlace.set(key,{label,place,equipment,count:0});
      equipmentByPlace.get(key).count++;
    }
    const topEquipment=[...equipmentByPlace.values()].sort((a,b)=>b.count-a.count||a.place.localeCompare(b.place,'pt-PT')).slice(0,10);
    const missingEquipment=completedSelectedPeriod.filter(o=>!String(o.equipment||'').trim()).length;
    setMeta('openEquipmentsMeta',`${completedSelectedPeriod.length} OT(s) finalizadas em ${graphRangeLabel}`,missingEquipment?`${missingEquipment} OT(s) sem equipamento identificado; agrupamento pela localização e pelo equipamento registado.`:`Agrupado por localização e equipamento; apenas fechos de ${graphRangeLabel}.`);
    renderMetricBars('openEquipmentsChart',topEquipment.map(x=>({label:x.label,value:x.count})),x=>`${x} OT(s)`);

    const rangeLabel=own('analyticsRangeLabel');
    if(rangeLabel)rangeLabel.textContent=`Gráficos: apenas OTs finalizadas com data de fecho entre ${graphBounds.start.toLocaleDateString('pt-PT')} e ${new Date(graphBounds.end.getTime()-1).toLocaleDateString('pt-PT')} (${graphRangeLabel}). Todas as fatias e barras abrem OTs desse mesmo período.`;

    const notes=document.querySelector('.metrics-notes');
    if(notes)notes.innerHTML=`<div class="insight"><b>MTTR</b><p>Média das horas entre início e fecho das OTs corretivas finalizadas no período selecionado, com datas válidas. O gráfico detalha por mês ou semana, consoante o intervalo.</p></div><div class="insight"><b>OTs finalizadas por tipo</b><p>Conta ordens preventivas, corretivas e não classificadas cuja data de fecho pertence ao período selecionado.</p></div><div class="insight"><b>Tempo até ao fecho</b><p>Agrupa OTs finalizadas no período selecionado com data de abertura e data de fecho válidas, pelo número de dias decorridos entre as duas datas.</p></div><div class="insight"><b>Avarias mais frequentes</b><p>Conta descrições normalizadas nas OTs corretivas finalizadas no período selecionado. Repetições elevadas podem justificar análise de causa-raiz.</p></div><div class="insight"><b>Equipamentos por localização</b><p>Conta OTs finalizadas no período selecionado por combinação de localização e equipamento. Registos sem dados completos ficam identificados como não identificados.</p></div>`;
  };

  // Os indicadores apresentados usam apenas dados relevantes para MTTR, distribuição, backlog e recorrência.
  if(own('fWorkType'))own('fWorkType').addEventListener('change',()=>{if(own('fWorkType').value==='Preventiva'&&own('fCategory')&&(!own('fCategory').value||own('fCategory').value==='Outro'))own('fCategory').value='Manutenção preventiva'});
  // Render once after replacing templates and metric calculations.
  renderAll();
})();
