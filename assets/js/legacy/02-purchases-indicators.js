// Extensão de compras e indicadores (mantém compatibilidade com dados já guardados)
const PURCHASE_KEY='gestao_manutencao_compras_v1';
let purchases=[], purchaseId=null;
const PURCHASE_STATES=['Por solicitar','Solicitado','A aguardar fornecedor','Parcialmente recebido','Recebido','Cancelado'];
function catFor(o){if(o.category)return o.category;let t=((o.description||'')+' '+(o.equipment||'')).toLowerCase();if(/disjuntor|tomada|el[eé]tric|cabo/.test(t))return 'Falha elétrica';if(/queda|seguran|emerg[eê]ncia|guarda-corpo|barra de seguran/.test(t))return 'Segurança';if(/estrutura|lateral danific|chapa|danificad/.test(t))return 'Danos estruturais';if(/porta|gelo|cortina|storax|kinarca/.test(t))return 'Portas / gelo';if(/transportador|tapete|corrente|rolos|mesa elevat|elevador/.test(t))return 'Transportadores / movimentação';if(/verifica|manuten/.test(t))return 'Manutenção preventiva';return 'Outro'}
function getPurchases(){try{const x=JSON.parse(localStorage.getItem(PURCHASE_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function saveLocal(notice=false){try{orders=orders.map(o=>({...o,category:catFor(o)}));localStorage.setItem(KEY,JSON.stringify(orders));localStorage.setItem(PURCHASE_KEY,JSON.stringify(purchases));renderAll();if(notice)toast('Alterações guardadas neste computador.')}catch(e){toast('Não foi possível guardar. Exporte uma cópia de segurança e verifique o espaço disponível.')}}
function go(v){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===v));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));let t={dashboard:['Dashboard','Visão geral das ordens, prioridades e desempenho.'],orders:['Ordens em aberto','Lista de trabalho que precisa de acompanhamento.'],closed:['Ordens fechadas','Histórico das intervenções concluídas.'],detail:['Gerir ordem de trabalho','Edite os dados e registe o progresso.'],purchases:['Compras de materiais','Pedidos de material, estados de compra e ordens dependentes.'],analytics:['Indicadores de manutenção','Volume de avarias e indicadores de desempenho por período.'],worktime:['Distribuição do tempo de trabalho','Calendário mensal das OTs finalizadas e das horas registadas por dia.']}[v]||['Gestão de manutenção',''];$('title').textContent=t[0];$('subtitle').textContent=t[1];if($('newPurchaseBtn'))$('newPurchaseBtn').style.display=v==='purchases'?'inline-flex':'none';if(v==='purchases')renderPurchases();if(v==='analytics')renderAnalytics();if(v==='worktime')renderWeeklyTime()}
function formObj(){let old=orders.find(o=>o.id===currentId)||{};return {...old,number:$('fNumber').value.trim(),date:$('fDate').value,urgency:$('fUrgency').value,requester:$('fRequester').value.trim(),location:$('fLocation').value.trim(),equipment:$('fEquipment').value.trim(),description:$('fDescription').value.trim(),category:$('fCategory')?.value||catFor(old),status:$('fStatus').value,owner:$('fOwner').value.trim(),reason:$('fReason').value.trim(),work:$('fWork').value.trim(),closedAt:$('fCloseDate').value,tasks:old.tasks||[],updatedAt:localNow()}}
function fill(o){$('detailTitle').textContent='OT '+o.number;$('detailSub').textContent=(o.description||'Sem descrição')+' · '+(o.location||'Localização por definir');$('detailEyebrow').textContent=closed(o)?'ORDEM FECHADA':'GESTÃO INDIVIDUAL';$('fNumber').value=o.number;$('fDate').value=o.date||'';$('fUrgency').value=o.urgency;$('fRequester').value=o.requester||'';$('fLocation').value=o.location||'';$('fEquipment').value=o.equipment||'';$('fDescription').value=o.description||'';$('fCategory').value=catFor(o);$('fStatus').value=o.status;$('fOwner').value=o.owner||'';$('fReason').value=o.reason||'';$('fWork').value=o.work||'';$('fCloseDate').value=o.closedAt||'';$('fAction').value='keep';drawTasks(o);summary(o);$('closedNotice').innerHTML=closed(o)?`<div class="notice"><b>✓ Esta OT está fechada</b><br>Fechada em ${esc(dt(o.closedAt))}. Pode editar ou reabrir através da ação de fecho.</div>`:'';renderLinkedPurchases(o)}
function categoryLabel(c){return c||'Outro'}
function row(o,isClosed=false){if(isClosed)return `<tr><td><button class="otlink" data-open="${o.id}">${esc(o.number)}</button></td><td>${dt(o.date)}</td><td>${urgency(o.urgency)}</td><td>${dt(o.closedAt)}</td><td style="max-width:300px;white-space:normal">${esc(o.work||'Sem descrição do trabalho realizado')}</td><td><button class="btn" data-open="${o.id}">Consultar</button></td></tr>`;let n=parseInt(age(o)),desc=o.description||'Sem descrição registada';return `<tr><td><button class="otlink" data-open="${o.id}">${esc(o.number)}</button></td><td>${dt(o.date)}</td><td class="desc-cell"><strong>${esc(desc)}</strong><small>${esc(categoryLabel(catFor(o)))}</small></td><td>${urgency(o.urgency)}</td><td><span class="age ${n>=14?'late':''}">${age(o)}</span></td><td>${status(o.status)}</td><td>${esc(o.location||'—')}</td><td><button class="btn" data-open="${o.id}">Gerir →</button></td></tr>`}
function renderDashboard(){
  const openOrders=orders.filter(o=>!closed(o));
  const allClosed=orders.filter(closed);
  const countUrgency=(prefix)=>openOrders.filter(o=>String(o.urgency||'').trim().startsWith(prefix)).length;
  const p1=countUrgency('P1'),p2=countUrgency('P2'),p3=countUrgency('P3');
  const otherUrgency=Math.max(0,openOrders.length-p1-p2-p3);
  const late=openOrders.filter(o=>{const d=new Date(o.date);return !Number.isNaN(d.getTime())&&(Date.now()-d)/86400000>=14}).length;
  const equipmentCount=new Set(openOrders.map(o=>o.equipment||o.location).filter(Boolean)).size;
  const kpis=[
    ['Ordens em aberto',openOrders.length,'Em acompanhamento','#3977ad'],
    ['Urgência crítica',p1,'Requer atenção prioritária','#d84d59'],
    ['Ordens em atraso',late,'Abertas há 14 dias ou mais','#e88a35'],
    ['Ordens fechadas',allClosed.length,'Intervenções concluídas','#16846b'],
    ['Equipamentos / locais',equipmentCount,'Com ordens por acompanhar','#8066b0']
  ];
  $('kpis').innerHTML=kpis.map(k=>`<div class="kpi" style="--c:${k[3]}"><div class="label">${esc(k[0])}</div><strong>${k[1]}</strong><small>${esc(k[2])}</small></div>`).join('');

  const circularPalette=['#3977ad','#d9822b','#16836c','#8d7ad8','#3193a6','#cf8b3b','#c94351','#6c9d77','#7893a8','#a9b3bd'];
  const renderPie=(containerId,items,centerLabel,emptyMessage)=>{
    const target=$(containerId);
    if(!target)return;
    chartSettingsData[containerId]=items.map(x=>({label:String(x.label),value:Number(x.value)||0}));
    const visibleItems=chartItemsVisible(containerId,items);
    const validItems=visibleItems.filter(x=>Number(x.value)>0);
    const total=validItems.reduce((sum,x)=>sum+Number(x.value),0);
    const mode=chartModes[containerId]||'pie';
    const draw=()=>renderPie(containerId,items,centerLabel,emptyMessage);
    const heading=target.closest('.card')?.querySelector('.cardhead');chartTools(containerId,heading,items,draw);
    if(!total){target.innerHTML=`<div class="pie-empty">${esc(emptyMessage||'Sem dados para apresentar.')}</div>`;return;}
    let accumulated=0;
    const slices=validItems.map((item,index)=>{
      const value=Number(item.value),from=accumulated/total*360;
      accumulated+=value;
      const to=accumulated/total*360;
      // Separação branca subtil entre fatias; o intervalo diminui automaticamente em fatias pequenas.
      const gap=validItems.length>1?Math.min(.9,((to-from)*.28)):0;
      return `${item.color||circularPalette[index%circularPalette.length]} ${(from+gap/2).toFixed(3)}deg ${(to-gap/2).toFixed(3)}deg`;
    }).join(',');
    const legend=validItems.map((item,index)=>{
      const value=Number(item.value),pct=Math.round(value/total*100);
      const color=item.color||circularPalette[index%circularPalette.length];
      return `<div class="pie-legend-item" title="${esc(item.label)}: ${value} OT(s), ${pct}%"><i class="pie-swatch" style="background:${color}"></i><span class="pie-item-info"><span class="pie-item-name">${esc(item.label)}</span><small class="pie-item-pct">${pct}% do total</small></span><b class="pie-item-value">${value}</b></div>`;
    }).join('');
    const svgPie=()=>{let angle=-Math.PI/2;const paths=validItems.map((item,index)=>{const value=Number(item.value),span=value/total*Math.PI*2,start=angle;angle+=span;const x1=100+83*Math.cos(start),y1=100+83*Math.sin(start),x2=100+83*Math.cos(angle),y2=100+83*Math.sin(angle),large=span>Math.PI?1:0;const path=span>=Math.PI*2-.001?'M 100 17 A 83 83 0 1 1 99.99 17 Z':`M 100 100 L ${x1} ${y1} A 83 83 0 ${large} 1 ${x2} ${y2} Z`;return `<path class="pie-slice" d="${path}" fill="${item.color||circularPalette[index%circularPalette.length]}" stroke="#fff" stroke-width="2" tabindex="0" role="button" aria-label="${esc(item.label)}: ${value} OT(s)" data-pie-index="${index}"/>`}).join('');return `<svg viewBox="0 0 200 200" width="155" height="155" aria-label="${esc(centerLabel)}">${paths}<circle cx="100" cy="100" r="47" fill="#fff"/><text x="100" y="96" text-anchor="middle" font-size="25" font-weight="800" fill="#203148">${total}</text><text x="100" y="114" text-anchor="middle" font-size="10" fill="#718197">OTs</text></svg>`};
    const bars=()=>`<div class="vertical-chart">${validItems.map((item,index)=>{const value=Number(item.value),color=item.color||circularPalette[index%circularPalette.length],height=Math.max(2,value/Math.max(...validItems.map(x=>Number(x.value)))*100);return `<div class="vertical-chart-item interactive-chart-bar" role="button" tabindex="0" data-bar-index="${index}" title="${esc(item.label)}: ${value} OT(s)"><b>${value}</b><div class="vbar-track"><div class="vbar-fill" style="height:${height}%;background:${color}"></div></div><span>${esc(item.label)}</span></div>`}).join('')}</div>`;
    target.innerHTML=`<div class="pie-layout ${mode==='bar'?'bar-mode-layout':''}"><div class="pie-visual" aria-label="${esc(centerLabel)}: ${total} OT(s)">${mode==='pie'?svgPie():bars()}</div><div class="pie-legend-wrap"><div class="pie-legend-heading"><span>Legenda</span><span>${validItems.length} ${validItems.length===1?'categoria':'categorias'}</span></div><div class="pie-legend">${legend}</div></div></div>`;
    bindChartToggle(containerId,draw);
    target.querySelectorAll('[data-pie-index],[data-bar-index]').forEach(el=>{const idx=Number(el.dataset.pieIndex??el.dataset.barIndex),item=validItems[idx];const activate=()=>{const label=item.label;const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();showChartOrders(label,o=>{const status=String(o.status||'').toLowerCase(),closedYear=new Date().getFullYear();if(containerId==='urgPie')return !closed(o)&&String(o.urgency||'').trim().startsWith(label.slice(0,2));if(containerId==='areaBars')return !closed(o)&&((String(o.location||'Por definir').trim()===label)||(label==='Outras localizações'&&!['Por definir',...[]].includes(String(o.location||'Por definir').trim())&&true));if(containerId==='statusBars'){const key=norm(status);if(label==='Finalizada')return (/finaliz|complet|fechad/.test(key))&&new Date(o.closedAt||'').getFullYear()===closedYear;if(label==='Anulada')return /anulad|cancel/.test(key);if(label==='Em aberto')return !closed(o)&&/aberto|open/.test(key);return !closed(o)&&norm(status)===norm(label)}return false})};el.addEventListener('click',activate);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}})});
  };

  // Urgência: o gráfico inclui uma fatia para OTs sem prioridade classificada, se existirem.
  const urgencyEntries=[
    {label:'P1 · Crítica',value:p1,color:'#c94351'},
    {label:'P2 · Alta',value:p2,color:'#d9822b'},
    {label:'P3 · Normal',value:p3,color:'#16836c'}
  ];
  if(otherUrgency)urgencyEntries.push({label:'Sem classificação',value:otherUrgency,color:'#98a3b1'});
  renderPie('urgPie',urgencyEntries,'OTs abertas','Não existem OTs abertas para distribuir por urgência.');

  // Localização: cinco locais com maior número de OTs abertas; os restantes são agrupados.
  const locationCounts=new Map();
  openOrders.forEach(o=>{const label=String(o.location||'Por definir').trim()||'Por definir';locationCounts.set(label,(locationCounts.get(label)||0)+1)});
  const sortedLocations=[...locationCounts.entries()].sort((x,y)=>y[1]-x[1]||x[0].localeCompare(y[0],'pt-PT'));
  const locationEntries=sortedLocations.slice(0,5).map(([label,value],index)=>({label,value,color:circularPalette[index%circularPalette.length]}));
  const otherLocations=sortedLocations.slice(5).reduce((sum,row)=>sum+row[1],0);
  if(otherLocations)locationEntries.push({label:'Outras localizações',value:otherLocations,color:'#a9b3bd'});
  renderPie('areaBars',locationEntries,'OTs abertas','Não existem OTs abertas para apresentar por localização.');

  // A fatia Finalizada considera apenas OTs com data de fecho no ano civil atual.
  const currentYear=new Date().getFullYear();
  const dateYear=value=>{
    const raw=String(value??'').trim();
    if(!raw)return null;
    let match=raw.match(/^(\d{4})[-/]/);if(match)return Number(match[1]);
    match=raw.match(/^\d{1,2}[/.\-]\d{1,2}[/.\-](\d{4})/);if(match)return Number(match[1]);
    const parsed=new Date(raw);return Number.isNaN(parsed.getTime())?null:parsed.getFullYear();
  };
  const statusKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const dashboardStatus=o=>{
    const raw=String(o?.status||'').trim(),key=statusKey(raw);
    if(/^(anulad|cancel)/.test(key))return 'Anulada';
    if(/^(complet|finaliz|fechad|closed|done)/.test(key)||(!raw&&o?.closedAt))return 'Finalizada';
    if(key==='oficina')return 'Oficina';
    if(key.includes('analise'))return 'Em análise';
    if(key.includes('espera dos tecnicos')||key.includes('espera tecnica'))return 'Espera dos técnicos';
    if(key.includes('compra de material')||key.includes('aguardar fornecedor')||key.includes('por solicitar'))return 'Compra de material';
    if(key.includes('em espera')||key==='espera')return 'Em espera';
    if(key.includes('curso')||key==='in progress')return 'Em curso';
    if(key.includes('aberto')||key==='open')return 'Em aberto';
    return raw||'Em aberto';
  };
  const statusOrder=['Em aberto','Em análise','Oficina','Em curso','Em espera','Compra de material','Espera dos técnicos','Finalizada','Anulada'];
  const statusPalette={'Em aberto':'#5795e8','Em análise':'#9876df','Oficina':'#3193a6','Em curso':'#42a67e','Em espera':'#e2a044','Compra de material':'#da8241','Espera dos técnicos':'#cf8b3b','Finalizada':'#2da47e','Anulada':'#98a3b1'};
  const statusCounts=new Map();
  orders.forEach(o=>{
    const label=dashboardStatus(o);
    if(label==='Finalizada'&&dateYear(o.closedAt)!==currentYear)return;
    statusCounts.set(label,(statusCounts.get(label)||0)+1);
  });
  const statuses=[...statusCounts.entries()].sort((x,y)=>{
    const a=statusOrder.indexOf(x[0]),b=statusOrder.indexOf(y[0]);
    if(a>=0&&b>=0)return a-b;if(a>=0)return -1;if(b>=0)return 1;return x[0].localeCompare(y[0],'pt-PT');
  }).map(([label,value],index)=>({label,value,color:statusPalette[label]||circularPalette[index%circularPalette.length]}));
  renderPie('statusBars',statuses,'OTs por estado',`Sem estados para apresentar. As OTs finalizadas contam apenas se tiverem data de fecho em ${currentYear}.`);
  const note=$('dashboardStatusNote');
  if(note)note.textContent=`Finalizadas: data de fecho em ${currentYear}. Os restantes estados mostram a situação atual.`;

  const list=openOrders.slice().sort((x,y)=>rank(x.urgency)-rank(y.urgency)||new Date(x.date)-new Date(y.date)).slice(0,6);
  $('attentionRows').innerHTML=list.length?list.map(o=>`<tr><td><button class="otlink" data-open="${esc(o.id)}">${esc(o.number)}</button></td><td>${dt(o.date)}</td><td class="desc-cell"><strong>${esc(o.description||'Sem descrição registada')}</strong><small>${esc(catFor(o))}</small></td><td>${urgency(o.urgency)}</td><td><span class="age ${(Date.now()-new Date(o.date))/86400000>=14?'late':''}">${age(o)}</span></td><td>${status(o.status)}</td><td><button class="btn" data-open="${esc(o.id)}">Gerir →</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Não existem ordens pendentes. Excelente trabalho!</td></tr>';
  $('attentionCount').textContent=`A mostrar ${list.length} de ${openOrders.length} ordens em aberto`;
  bindOpen();
}
function renderOpen(){let q=$('searchOpen').value.toLowerCase(),u=$('urgencyFilter').value,s=$('statusFilter').value;let a=orders.filter(o=>!closed(o)&&(!q||[o.number,o.location,o.equipment,o.description,catFor(o)].join(' ').toLowerCase().includes(q))&&(!u||o.urgency===u)&&(!s||o.status===s)).sort((x,y)=>rank(x.urgency)-rank(y.urgency)||new Date(x.date)-new Date(y.date));$('openRows').innerHTML=a.length?a.map(o=>row(o)).join(''):'<tr><td colspan="8" class="empty">Não foram encontradas ordens com estes filtros.</td></tr>';$('openCount').textContent=`${a.length} ordem(ns) encontrada(s)`;bindOpen()}
function renderAll(){let sel=$('statusFilter').value,sts=[...new Set(orders.filter(o=>!closed(o)).map(o=>o.status))];$('statusFilter').innerHTML='<option value="">Todos os estados</option>'+sts.map(s=>`<option>${esc(s)}</option>`).join('');if(sts.includes(sel))$('statusFilter').value=sel;renderDashboard();renderOpen();renderClosed();renderPurchases();renderAnalytics()}
function exportData(onlyClosed=false){let arr=onlyClosed?orders.filter(closed):orders;let blob=new Blob([JSON.stringify({app:'Gestão de Manutenção OT',version:2,exportedAt:new Date().toISOString(),orders:arr,purchases:onlyClosed?[]:purchases},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=onlyClosed?'historico_ordens_fechadas.json':'backup_manutencao_compras.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Cópia de segurança exportada.')}
function importFile(file){let r=new FileReader();r.onload=()=>{try{let x=JSON.parse(r.result),a=Array.isArray(x)?x:x.orders;if(!Array.isArray(a))throw 0;ask('Importar cópia de segurança',`Foram encontradas ${a.length} ordens. A importação vai substituir os dados guardados neste navegador. Continuar?`,()=>{orders=a.map(o=>({...o,id:o.id||(crypto.randomUUID?.()||String(Math.random())),tasks:Array.isArray(o.tasks)?o.tasks:[],category:catFor(o)}));purchases=Array.isArray(x.purchases)?x.purchases:[];saveLocal();go('dashboard');toast('Dados importados.')})}catch{toast('Ficheiro inválido. Escolha uma cópia JSON exportada pela aplicação.')}};r.readAsText(file)}
function purchaseStatusClass(s){const k=String(s||'Por solicitar').toLocaleLowerCase('pt-PT');if(k==='recebido')return 'done';if(k==='cancelado')return 'cancel';if(k==='a aguardar fornecedor')return 'waiting';if(k==='parcialmente recebido')return 'partial';if(k==='solicitado')return 'submitted';return 'pending'}function purchaseStateBadge(s){const c=purchaseStatusClass(s);return `<span class="purchase-state ${c}">${esc(s||'Por solicitar')}</span>`}
function orderNum(id){let o=orders.find(o=>o.id===id||o.number===id);return o?o.number:'—'}
function renderLinkedPurchases(o){const target=$('linkedPurchaseList');if(!target)return;const ps=purchases.filter(p=>p.linkedOT===o.id||p.linkedOT===o.number);target.innerHTML=ps.length?ps.map(p=>`<div class="linked-purchase"><div><strong>${esc(p.number)} · ${esc(p.material)}</strong><small>${esc(p.quantity||1)} unidade(s) · ${esc(p.supplier||'Fornecedor por definir')} · Prazo: ${esc(p.expectedDate||'não definido')}</small><small>Estado: ${esc(p.status)}${p.notes?' · '+esc(p.notes):''}</small></div><button class="btn" data-edit-purchase="${p.id}">Gerir</button></div>`).join(''):'<div class="muted">Não há compras associadas a esta OT.</div>';target.querySelectorAll('[data-edit-purchase]').forEach(b=>b.onclick=()=>{go('purchases');editPurchase(b.dataset.editPurchase)});const sel=$('linkExistingPurchase');if(sel){const current=ps.map(p=>p.id);const candidates=purchases;sel.innerHTML='<option value="">Selecionar compra existente…</option>'+candidates.map(p=>`<option value="${esc(p.id)}">${esc(p.number)} · ${esc(p.material)}${p.linkedOT&&!current.includes(p.id)?' (ligada a outra OT)':''}</option>`).join('')}}
function linkExistingPurchaseToCurrent(){const o=orders.find(x=>x.id===currentId),sel=$('linkExistingPurchase'),p=purchases.find(x=>x.id===sel?.value);if(!o||!p)return toast('Selecione uma compra registada.');if(closed(o))return toast('Esta OT está fechada; reabra-a para alterar as associações.');p.linkedOT=o.id;p.updatedAt=localNow();saveLocal();fill(orders.find(x=>x.id===o.id));toast('Compra e OT associadas nos dois sentidos.')}
function showPurchaseEditor(show){$('purchaseEditor').classList.toggle('purchase-editor-open',!!show);$('purchaseEditor').classList.toggle('purchase-editor-hidden',!show);if(show)$('purchaseEditor').scrollIntoView({behavior:'smooth',block:'start'})}function resetPurchaseForm(prefillOT=''){purchaseId=null;$('purchaseFormTitle').textContent='Registar pedido de material';$('pNumber').value='';$('pRequestDate').value=localNow();$('pMaterial').value='';$('pQty').value='1';$('pStatus').value='Por solicitar';$('pSupplier').value='';$('pExpected').value='';$('pReceived').value='';$('pNotes').value='';populatePurchaseOTs(prefillOT);if(!prefillOT)$('pLinkedOT').value='';$('deletePurchaseBtn').style.display='none';$('savePurchaseBtn').textContent='Guardar compra';}
function populatePurchaseOTs(selected=''){
 let sel=$('pLinkedOT');if(!sel)return;
 const old=selected||sel.value||'';
 const eligible=orders.filter(o=>!closed(o)).slice().sort((a,b)=>a.number.localeCompare(b.number));
 let options='<option value="">Sem OT associada</option>'+eligible.map(o=>`<option value="${esc(o.id)}">${esc(o.number)} — ${esc(o.description||'Sem descrição')}</option>`).join('');
 // Preserva uma ligação histórica a uma OT que entretanto foi fechada, mas não permite escolhê-la para novas compras.
 const legacy=old?orders.find(o=>o.id===old):null;
 if(legacy&&closed(legacy))options+=`<option value="${esc(legacy.id)}" disabled>OT ${esc(legacy.number)} — fechada (ligação existente)</option>`;
 sel.innerHTML=options;
 if([...sel.options].some(x=>x.value===old))sel.value=old;else sel.value='';
}
function editPurchase(id){let p=purchases.find(x=>x.id===id);if(!p)return;showPurchaseEditor(true);purchaseId=p.id;$('purchaseFormTitle').textContent='Editar compra '+p.number;$('pNumber').value=p.number||'';$('pRequestDate').value=p.requestDate||'';$('pMaterial').value=p.material||'';$('pQty').value=p.quantity||1;$('pStatus').value=p.status||'Por solicitar';$('pSupplier').value=p.supplier||'';$('pExpected').value=p.expectedDate||'';$('pReceived').value=p.receivedDate||'';$('pNotes').value=p.notes||'';populatePurchaseOTs(p.linkedOT||'');$('pLinkedOT').value=p.linkedOT||'';$('deletePurchaseBtn').style.display='inline-block';$('savePurchaseBtn').textContent='Guardar alterações';$('purchaseEditor').scrollIntoView({behavior:'smooth',block:'start'})}
function savePurchase(){let material=$('pMaterial').value.trim();if(!material){toast('Descreva o material ou a peça a comprar.');$('pMaterial').focus();return}let num=$('pNumber').value.trim()||('CMP-'+new Date().getFullYear()+'-'+String((purchases.length+1)).padStart(3,'0'));if(purchases.some(p=>p.id!==purchaseId&&p.number.toLowerCase()===num.toLowerCase())){toast('Já existe uma compra com essa referência.');return}let linked=$('pLinkedOT').value;let previous=purchases.find(p=>p.id===purchaseId);let linkedOrder=linked?orders.find(o=>o.id===linked):null;if(linked&&!linkedOrder){toast('A OT selecionada já não existe. Escolha uma OT em aberto.');return}if(linkedOrder&&closed(linkedOrder)&&(!previous||previous.linkedOT!==linked)){toast('Só é possível associar uma compra nova a uma OT em aberto.');return}let p={id:purchaseId||(crypto.randomUUID?.()||String(Date.now())),number:num,requestDate:$('pRequestDate').value||localNow(),material,quantity:Math.max(1,Number($('pQty').value)||1),status:$('pStatus').value,supplier:$('pSupplier').value.trim(),expectedDate:$('pExpected').value,receivedDate:$('pReceived').value,notes:$('pNotes').value.trim(),linkedOT:linked,updatedAt:localNow()};if(p.status==='Recebido'&&!p.receivedDate)p.receivedDate=new Date().toISOString().slice(0,10);let ix=purchases.findIndex(x=>x.id===purchaseId);if(ix>=0)purchases[ix]=p;else purchases.unshift(p);purchaseId=p.id;saveLocal();editPurchase(p.id);toast('Compra guardada.');}
function renderPurchases(){if(!$('purchaseRows'))return;populatePurchaseOTs($('pLinkedOT')?.value||'');let q=($('searchPurchases')?.value||'').toLowerCase(),sf=$('purchaseStatusFilter')?.value||'';let list=purchases.filter(p=>(!q||[p.number,p.material,p.supplier,orderNum(p.linkedOT),p.notes].join(' ').toLowerCase().includes(q))&&(!sf||p.status===sf)).sort((a,b)=>(b.requestDate||'').localeCompare(a.requestDate||''));let open=purchases.filter(p=>!['Recebido','Cancelado'].includes(p.status)).length,waiting=purchases.filter(p=>['Solicitado','A aguardar fornecedor','Parcialmente recebido'].includes(p.status)).length,received=purchases.filter(p=>p.status==='Recebido').length,linked=purchases.filter(p=>p.linkedOT&& !['Recebido','Cancelado'].includes(p.status)).length;$('purchaseKpis').innerHTML=[['Compras ativas',open,'#3977ad'],['A aguardar fornecedor',waiting,'#e88a35'],['Materiais recebidos',received,'#16846b'],['OTs dependentes',new Set(purchases.filter(p=>p.linkedOT&&!['Recebido','Cancelado'].includes(p.status)).map(p=>p.linkedOT)).size,'#8066b0']].map(k=>`<div class="kpi" style="--c:${k[2]}"><div class="label">${k[0]}</div><strong>${k[1]}</strong><small>${k[0]==='OTs dependentes'?'Ordens ligadas a compras pendentes':k[0]==='Materiais recebidos'?'Concluídas no registo':k[0]==='A aguardar fornecedor'?'Pedido submetido ou parcial':'Pedidos ainda não fechados'}</small></div>`).join('');$('purchaseRows').innerHTML=list.length?list.map(p=>`<tr class="purchase-row purchase-${purchaseStatusClass(p.status)}"><td><button class="otlink" data-purchase="${p.id}">${esc(p.number)}</button></td><td>${esc(dt(p.requestDate))}</td><td class="desc-cell"><strong>${esc(p.material)}</strong><small>${esc(p.supplier||'Fornecedor por definir')}${p.notes?' · '+esc(p.notes):''}</small></td><td>${esc(p.quantity||1)}</td><td>${p.linkedOT?`<button class="purchase-open-ot" data-related-ot="${esc(p.linkedOT)}">${esc(orderNum(p.linkedOT))}</button>`:'—'}</td><td>${esc(p.expectedDate||'—')}</td><td>${purchaseStateBadge(p.status)}</td><td><button class="btn" data-purchase="${p.id}">Editar</button></td></tr>`).join(''):'<tr><td colspan="8" class="empty">Ainda não existem pedidos de compra. Use “Nova compra” para registar material necessário.</td></tr>';$('purchaseCount').textContent=`${list.length} compra(s) encontrada(s)`;$('purchaseRows').querySelectorAll('[data-purchase]').forEach(b=>b.onclick=()=>editPurchase(b.dataset.purchase));$('purchaseRows').querySelectorAll('[data-related-ot]').forEach(b=>b.onclick=()=>{let o=orders.find(x=>x.id===b.dataset.relatedOt);if(o)openDetail(o.id,'purchases')});if(currentId&&$('detail').classList.contains('active')){let o=orders.find(x=>x.id===currentId);if(o)renderLinkedPurchases(o)}}
function startNewPurchase(){go('purchases');resetPurchaseForm();showPurchaseEditor(true);$('purchaseFormTitle').textContent='Registar pedido de material';$('pMaterial').focus()}
function createPurchaseLinkedToCurrent(){let o=orders.find(x=>x.id===currentId);if(o&&closed(o)){toast('Só pode associar compras a OTs em aberto. Use “Nova compra” para criar um pedido sem associação.');return}go('purchases');resetPurchaseForm(o?o.id:'');showPurchaseEditor(true);if(o){$('pMaterial').value='';$('pNotes').value='Compra necessária para a OT '+o.number+' — '+o.description;$('purchaseFormTitle').textContent='Nova compra ligada à OT '+o.number}$('purchaseEditor').scrollIntoView({behavior:'smooth',block:'start'});$('pMaterial').focus()}
function periodDateBounds(){
 const y=Number($('aYear').value)||new Date().getFullYear();
 const range=$('aRange').value||'month';
 const maxSub=range==='month'?12:range==='quarter'?4:range==='half'?2:1;
 const parsedSub=Number($('aSub').value);
 const sub=Math.min(maxSub,Math.max(1,Number.isFinite(parsedSub)&&parsedSub>0?parsedSub:1));
 let start,end;
 if(range==='year'){start=new Date(y,0,1);end=new Date(y+1,0,1)}
 else if(range==='half'){const firstMonth=(sub-1)*6;start=new Date(y,firstMonth,1);end=new Date(y,firstMonth+6,1)}
 else if(range==='quarter'){const firstMonth=(sub-1)*3;start=new Date(y,firstMonth,1);end=new Date(y,firstMonth+3,1)}
 else{start=new Date(y,sub-1,1);end=new Date(y,sub,1)}
 return {y,range,sub,start,end};
}
function analyticsYears(){const ys=new Set();for(const o of orders){for(const v of [o.closedAt,o.endAt,o.endDate,o.dataFim,o['Data de fim'],o.date]){const d=analyticsDate(v);if(d)ys.add(d.getFullYear())}}ys.add(new Date().getFullYear());return [...ys].sort((a,b)=>b-a)}
function analyticsDate(v){if(!v)return null;let d=new Date(v);if(!Number.isNaN(d.getTime()))return d;return null}
function setupAnalyticsControls(){
 const years=analyticsYears();
 const latestDataYear=years[0];
 const currentYear=new Date().getFullYear();
 const preferredYear=years.includes(currentYear)?currentYear:latestDataYear;
 $('aYear').innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
 $('aYear').value=String(preferredYear);
 populateSubperiod(false);
}
function refreshAnalyticsYears(){
 const sel=$('aYear');if(!sel)return;
 const current=sel.value;
 const years=analyticsYears();
 const actual=years.map(String);
 if([...sel.options].map(o=>o.value).join('|')!==actual.join('|')){
   sel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
   sel.value=actual.includes(current)?current:String(years[0]);
 }
}

function populateSubperiod(useCurrentSelection=true){
 const r=$('aRange').value||'month',year=Number($('aYear').value)||new Date().getFullYear();
 const labels=r==='month'?['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']:r==='quarter'?['1.º trimestre','2.º trimestre','3.º trimestre','4.º trimestre']:r==='half'?['1.º semestre','2.º semestre']:['Ano completo'];
 const old=Number($('aSub').value),max=labels.length;
 $('aSub').innerHTML=labels.map((x,i)=>`<option value="${i+1}">${x}</option>`).join('');
 let latestMonth=0;
 for(const o of orders){const d=analyticsDate(o.closedAt||o.endAt||o.endDate||o.dataFim||o['Data de fim']||o.date);if(d&&d.getFullYear()===year)latestMonth=Math.max(latestMonth,d.getMonth()+1)}
 if(!latestMonth&&year===new Date().getFullYear())latestMonth=new Date().getMonth()+1;
 let suggested=r==='month'?Math.max(1,latestMonth):r==='quarter'?Math.max(1,Math.ceil((latestMonth||1)/3)):r==='half'?(latestMonth>6?2:1):1;
 let value=useCurrentSelection&&old>=1&&old<=max?old:suggested;
 $('aSub').value=String(Math.min(max,Math.max(1,value)));
 $('aSub').style.display=r==='year'?'none':'';
}

function inDateRange(v,start,end){let d=v?new Date(v):null;return d&&!isNaN(d)&&d>=start&&d<end}
function average(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null}
function renderAnalytics(){/* A versão ativa do renderer é configurada no script de indicadores, após a inicialização dos dados. */}
function renderAll(){let sel=$('statusFilter')?.value||'',sts=[...new Set(orders.filter(o=>!closed(o)).map(o=>o.status))];$('statusFilter').innerHTML='<option value="">Todos os estados</option>'+sts.map(s=>`<option>${esc(s)}</option>`).join('');if(sts.includes(sel))$('statusFilter').value=sel;renderDashboard();renderOpen();renderClosed();renderPurchases();renderAnalytics()}
// Importação aditiva: acrescenta novas OTs sem alterar registos existentes.
function normOT(v){return String(v??'').trim().toLocaleLowerCase('pt-PT').replace(/\s+/g,'')}
function parseCSV(text){let first=(text.split(/\r?\n/,1)[0]||''),semi=(first.match(/;/g)||[]).length,comma=(first.match(/,/g)||[]).length,delim=semi>=comma?';':',';let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++}else if(c==='"'){quoted=!quoted}else if(c===delim&&!quoted){row.push(cell.trim());cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(v=>v!==''))rows.push(row);row=[];cell=''}else cell+=c}row.push(cell.trim());if(row.some(v=>v!==''))rows.push(row);if(rows.length<2)throw Error('CSV sem linhas de dados');let headers=rows.shift().map(h=>h.trim().toLocaleLowerCase('pt-PT').normalize('NFD').replace(/[\u0300-\u036f]/g,''));return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))}
function pick(o,keys){for(const k of keys){let v=o[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim()}return ''}
function normalizeImportedOT(raw){let number=pick(raw,['number','numero da ot','numero ot','numero','ot','nº ot','no ot','número da ot','número ot']);if(!number)return null;let date=pick(raw,['date','data de abertura','data abertura','data']);if(date&&/^\d{2}\/\d{2}\/\d{4}/.test(date)){let m=date.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);if(m)date=`${m[3]}-${m[2]}-${m[1]}T${m[4]||'00'}:${m[5]||'00'}`}else if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date))date+='T00:00';if(!date||isNaN(new Date(date)))date=localNow();let urgencyRaw=pick(raw,['urgency','grau de urgencia','urgencia','prioridade']).toLocaleLowerCase('pt-PT');let urgency=urgencyRaw.includes('p1')||urgencyRaw.includes('crit')?'P1 - Crítica':urgencyRaw.includes('p3')||urgencyRaw.includes('normal')?'P3 - Normal':'P2 - Alta';let statusRaw=pick(raw,['status','estado','status da ot']);let allowed=['Em aberto','Em análise','Em espera','Compra de material','Espera dos técnicos','Finalizada'];let statusValue=allowed.find(x=>x.toLocaleLowerCase('pt-PT')===statusRaw.toLocaleLowerCase('pt-PT'))||'Em aberto';let closedAt=pick(raw,['closedAt','data e hora de fecho','data de fecho','fechada em']);return {id:crypto.randomUUID?.()||String(Date.now()+Math.random()),number,date,urgency,requester:pick(raw,['requester','requisitante']),location:pick(raw,['location','localizacao','localização']),equipment:pick(raw,['equipment','equipamento']),description:pick(raw,['description','descricao da avaria','descrição da avaria','descricao','descrição']),status:statusValue,reason:pick(raw,['reason','descricao do status','motivo do status']),tasks:Array.isArray(raw.tasks)?raw.tasks:[],work:pick(raw,['work','trabalho realizado','descricao do trabalho realizado']),closedAt,owner:pick(raw,['owner','responsavel','responsável']),category:pick(raw,['category','categoria da avaria','categoria'])||'Outro',updatedAt:localNow()}}
function importAdditiveFile(file){let r=new FileReader();r.onload=()=>{try{let raw=String(r.result||''),parsed;if(file.name.toLowerCase().endsWith('.csv')||file.name.toLowerCase().endsWith('.txt'))parsed=parseCSV(raw);else{let x=JSON.parse(raw);parsed=Array.isArray(x)?x:(Array.isArray(x.orders)?x.orders:null)}if(!Array.isArray(parsed))throw Error('Formato inválido');let seen=new Set(orders.map(o=>normOT(o.number))),added=[],dupes=0,invalid=0;for(let item of parsed){let o=normalizeImportedOT(item||{});if(!o){invalid++;continue}let key=normOT(o.number);if(seen.has(key)){dupes++;continue}seen.add(key);added.push(o)}if(!added.length){toast(`Nenhuma OT nova adicionada. Duplicadas: ${dupes}; sem número válido: ${invalid}.`);return}ask('Adicionar ordens de trabalho',`O ficheiro contém ${parsed.length} linha(s). Serão adicionadas ${added.length} OT(s) novas; ${dupes} duplicada(s) serão ignoradas e ${invalid} linha(s) sem número válido serão ignoradas. As OTs já existentes não serão alteradas. Continuar?`,()=>{orders=[...added,...orders];saveLocal();go('dashboard');toast(`${added.length} OT(s) adicionadas. ${dupes} duplicada(s) ignoradas.`)});}catch(e){toast('Não foi possível ler o ficheiro. Use JSON exportado pela aplicação ou CSV com cabeçalhos.')}};r.readAsText(file,'UTF-8')}
function downloadImportTemplate(){let csv='Numero da OT;Data de abertura;Grau de urgencia;Requisitante;Localizacao;Equipamento;Descricao da avaria;Status;Descricao do status;Responsavel;Categoria da avaria;Trabalho realizado;Data e hora de fecho\n';let a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='modelo_importacao_ots.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Modelo CSV descarregado.')}
// Ligações e controlos das compras
if($('newPurchaseBtn'))$('newPurchaseBtn').onclick=startNewPurchase;$('closePurchaseBtn').onclick=()=>showPurchaseEditor(false);$('resetPurchaseBtn').onclick=()=>{resetPurchaseForm();showPurchaseEditor(true)};$('savePurchaseBtn').onclick=savePurchase;$('searchPurchases').oninput=renderPurchases;$('purchaseStatusFilter').onchange=renderPurchases;$('deletePurchaseBtn').onclick=()=>{if(!purchaseId)return;ask('Eliminar compra','Tem a certeza de que pretende eliminar este registo de compra?',()=>{purchases=purchases.filter(p=>p.id!==purchaseId);resetPurchaseForm();saveLocal(true)})};$('purchaseExport').onclick=()=>{let b=new Blob([JSON.stringify({app:'Gestão de compras de manutenção',exportedAt:new Date().toISOString(),purchases,orders:orders.map(o=>({id:o.id,number:o.number,description:o.description}))},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='compras_materiais_manutencao.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Lista de compras exportada.')};$('createLinkedPurchase').onclick=createPurchaseLinkedToCurrent;if($('linkExistingPurchaseBtn'))$('linkExistingPurchaseBtn').onclick=linkExistingPurchaseToCurrent;$('aRange').onchange=()=>{populateSubperiod(false);renderAnalytics()};$('aYear').onchange=()=>{populateSubperiod(true);renderAnalytics()};$('aSub').onchange=()=>renderAnalytics();
// Inicializa as extensões sem limpar os dados antigos já guardados.
orders=orders.map(o=>({...o,category:catFor(o)}));purchases=getPurchases();setupAnalyticsControls();resetPurchaseForm();renderAll();
