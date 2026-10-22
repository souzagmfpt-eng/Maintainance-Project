// Extensão de inventário, fornecedores, catálogos e fatias interativas dos gráficos.
let inventoryItems = [];
let supplierRecords = [];
let mxEditingInventoryId = null;
let mxEditingSupplierId = null;
let mxCurrentItemTags = [];
let mxSelectedItemSupplierIds = [];
let mxSupplierPickerPending = [];
let mxPendingCatalogFiles = [];
let mxPendingItemPdfFiles = [];
let mxEditingItemPdfs = [];
let mxPendingItemPdfDeletes = [];
const MX_INVENTORY_KEY = 'gestao_manutencao_inventory_v1';
const MX_SUPPLIERS_KEY = 'gestao_manutencao_suppliers_v1';
const mxById = (arr,id) => arr.find(x => String(x.id) === String(id));
const mxNewId = () => (crypto.randomUUID ? crypto.randomUUID() : 'mx-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const mxNorm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-PT');
function mxLoadModuleData(){
  try{const x=JSON.parse(localStorage.getItem(MX_INVENTORY_KEY)||'[]');inventoryItems=Array.isArray(x)?x:[]}catch{inventoryItems=[]}
  try{const x=JSON.parse(localStorage.getItem(MX_SUPPLIERS_KEY)||'[]');supplierRecords=Array.isArray(x)?x:[]}catch{supplierRecords=[]}
  inventoryItems=inventoryItems.map(x=>({...x,suppliers:Array.isArray(x.suppliers)?x.suppliers:[],pdfs:Array.isArray(x.pdfs)?x.pdfs:[]}));
  supplierRecords=supplierRecords.map(x=>({...x,catalogs:Array.isArray(x.catalogs)?x.catalogs:[]}));
}
function saveModuleData(){
  try{localStorage.setItem(MX_INVENTORY_KEY,JSON.stringify(inventoryItems));localStorage.setItem(MX_SUPPLIERS_KEY,JSON.stringify(supplierRecords));renderInventory();renderSuppliers();}
  catch(err){console.error(err);toast('Não foi possível guardar o inventário/fornecedores. Exporte os registos e verifique o espaço disponível no navegador.')}
}
function mxSupplierName(id){return mxById(supplierRecords,id)?.name||'Fornecedor removido';}
function mxSupplierPills(ids){const valid=(ids||[]).map(id=>mxById(supplierRecords,id)).filter(Boolean);return valid.length?valid.map(x=>`<span class="supplier-chip">${esc(x.name)}</span>`).join(''):'<span class="muted">Sem fornecedor associado</span>'}
function mxLowStock(item){return Number(item.quantity||0)<=Number(item.minimum||0)}
function mxOpenInventoryEditor(item=null){
  mxEditingInventoryId=item?.id||null;
  mxPendingItemPdfFiles=[];mxEditingItemPdfs=Array.isArray(item?.pdfs)?item.pdfs.map(p=>({...p})):[];mxPendingItemPdfDeletes=[];
  if($('iManualPdfs'))$('iManualPdfs').value='';
  $('inventoryFormTitle').textContent=item?'Editar item de inventário':'Registar item';
  for(const [id,key,def] of [['iName','name',''],['iReference','reference',''],['iType','type','Peças'],['iCategory','category',''],['iBrand','brand',''],['iLocation','location',''],['iQuantity','quantity',0],['iMinimum','minimum',0],['iUnit','unit','un.'],['iCondition','condition','Disponível'],['iNotes','notes','']])$(id).value=item?.[key]??def;
  mxCurrentItemTags=Array.isArray(item?.tags)?item.tags.map(String).filter(Boolean):(item?.category?[String(item.category)]:[]);
  mxRenderInventoryTags();
  mxRenderItemSupplierChecks(item?.suppliers||[]);
  mxRenderInventoryPdfs();
  $('iTagInput').value='';
  $('inventoryEditor').style.display='block';
  $('inventoryEditor').scrollIntoView({behavior:'smooth',block:'start'});
  $('iName').focus({preventScroll:true});
}
function mxCloseInventoryEditor(){$('inventoryEditor').style.display='none';mxEditingInventoryId=null;mxCurrentItemTags=[];mxSelectedItemSupplierIds=[];mxPendingItemPdfFiles=[];mxEditingItemPdfs=[];mxPendingItemPdfDeletes=[];if($('iManualPdfs'))$('iManualPdfs').value='';if($('inventoryPdfPending'))$('inventoryPdfPending').innerHTML='';if($('inventoryPdfsList'))$('inventoryPdfsList').innerHTML=''}
function mxExistingInventoryTags(){
  const unique=new Map();
  inventoryItems.forEach(item=>{
    const source=Array.isArray(item.tags)&&item.tags.length?item.tags:(item.category?String(item.category).split(','):[]);
    source.forEach(raw=>{const tag=String(raw??'').trim().replace(/^#+/,'');const key=mxNorm(tag);if(tag&&key&&!unique.has(key))unique.set(key,tag)});
  });
  return [...unique.values()].sort((a,b)=>a.localeCompare(b,'pt-PT'));
}
function mxRenderInventoryTags(){
  const host=$('inventoryTagChips');if(!host)return;
  $('iCategory').value=mxCurrentItemTags.join(', ');
  host.innerHTML=mxCurrentItemTags.length?mxCurrentItemTags.map((tag,index)=>`<span class="inventory-tag-chip">${esc(tag)}<button type="button" data-remove-inventory-tag="${index}" aria-label="Remover etiqueta ${esc(tag)}" title="Remover etiqueta">×</button></span>`).join(''):'<span class="muted">Ainda sem etiquetas selecionadas.</span>';
  host.querySelectorAll('[data-remove-inventory-tag]').forEach(b=>b.onclick=()=>{mxCurrentItemTags.splice(Number(b.dataset.removeInventoryTag),1);mxRenderInventoryTags()});
  const suggestions=$('inventoryTagSuggestions');
  if(suggestions){
    const existing=mxExistingInventoryTags().filter(tag=>!mxCurrentItemTags.some(selected=>mxNorm(selected)===mxNorm(tag)));
    suggestions.innerHTML='<span class="inventory-tag-suggestions-label">Etiquetas existentes:</span>'+(existing.length?existing.map(tag=>`<button type="button" class="inventory-tag-suggestion" data-add-existing-tag="${esc(tag)}" title="Adicionar etiqueta ${esc(tag)}">＋ ${esc(tag)}</button>`).join(''):'<span class="muted">'+(mxExistingInventoryTags().length?'Todas as etiquetas existentes já foram selecionadas.':'Ainda não existem etiquetas guardadas.')+'</span>');
    suggestions.querySelectorAll('[data-add-existing-tag]').forEach(button=>button.onclick=()=>mxAddInventoryTagValue(button.dataset.addExistingTag));
  }
}
function mxAddInventoryTagValue(rawValue){
  const value=String(rawValue??'').trim().replace(/^#+/,'');if(!value)return false;
  if(mxCurrentItemTags.some(t=>mxNorm(t)===mxNorm(value))){toast('Esta etiqueta já está associada a este item.');return false}
  mxCurrentItemTags.push(value);mxRenderInventoryTags();return true;
}
function mxAddInventoryTag(){
  const input=$('iTagInput'),value=String(input?.value||'').trim().replace(/^#+/,'');if(!value)return;
  if(!mxAddInventoryTagValue(value)){input?.select();return}
  input.value='';input.focus();
}
function mxRenderItemSupplierChecks(checkedIds=[]){
  mxSelectedItemSupplierIds=[...new Set((checkedIds||[]).map(String).filter(id=>supplierRecords.some(s=>String(s.id)===id)))];
  mxRenderSelectedSupplierSummary();
}
function mxRenderSelectedSupplierSummary(){
  const host=$('itemSupplierSelected');if(!host)return;
  const selected=mxSelectedItemSupplierIds.map(id=>mxById(supplierRecords,id)).filter(Boolean).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-PT'));
  host.innerHTML=selected.length?selected.map(s=>`<span class="supplier-chip">${esc(s.name)}</span>`).join(''):'<span class="muted">Sem fornecedores selecionados.</span>';
  const button=$('openItemSupplierPicker');if(button)button.textContent=selected.length?`Alterar fornecedores (${selected.length})`:'Selecionar fornecedores';
}
function mxOpenItemSupplierPicker(){
  mxSupplierPickerPending=[...mxSelectedItemSupplierIds];
  if($('itemSupplierSearch'))$('itemSupplierSearch').value='';
  mxRenderSupplierPickerList();
  const modal=$('itemSupplierPickerModal');if(modal){modal.classList.add('show');modal.setAttribute('aria-hidden','false')}
  $('itemSupplierSearch')?.focus({preventScroll:true});
}
function mxRenderSupplierPickerList(){
  const host=$('itemSupplierPickerList');if(!host)return;
  const q=mxNorm($('itemSupplierSearch')?.value||'');
  const rows=supplierRecords.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-PT')).filter(s=>!q||mxNorm([s.name,s.email,s.phone,s.website,s.address].join(' ')).includes(q));
  host.innerHTML=rows.length?rows.map(s=>{const selected=mxSupplierPickerPending.map(String).includes(String(s.id));return `<label class="supplier-picker-row ${selected?'selected':''}"><input type="checkbox" data-picker-supplier="${esc(s.id)}" ${selected?'checked':''}><span class="supplier-picker-info"><strong>${esc(s.name)}</strong><small>${esc(s.email||'Sem e-mail')} · ${esc(s.phone||'Sem telefone')}</small></span></label>`}).join(''):'<div class="module-empty">'+(supplierRecords.length?'Não foram encontrados fornecedores com essa pesquisa.':'Ainda não existem fornecedores. Registe primeiro um fornecedor no separador Fornecedores.')+'</div>';
  host.querySelectorAll('[data-picker-supplier]').forEach(input=>{input.onchange=()=>{const id=String(input.dataset.pickerSupplier);if(input.checked&&!mxSupplierPickerPending.map(String).includes(id))mxSupplierPickerPending.push(id);else if(!input.checked)mxSupplierPickerPending=mxSupplierPickerPending.filter(x=>String(x)!==id);input.closest('.supplier-picker-row')?.classList.toggle('selected',input.checked);mxRenderSupplierPickerCount()};input.closest('.supplier-picker-row')?.addEventListener('click',e=>{if(e.target===input)return; e.preventDefault();input.checked=!input.checked;input.dispatchEvent(new Event('change',{bubbles:true}))})});
  mxRenderSupplierPickerCount();
}
function mxRenderSupplierPickerCount(){const el=$('itemSupplierPickerCount');if(el)el.textContent=`${mxSupplierPickerPending.length} selecionado(s)`}
function mxCloseItemSupplierPicker(apply=false){
  if(apply){mxSelectedItemSupplierIds=[...new Set(mxSupplierPickerPending.map(String))];mxRenderSelectedSupplierSummary()}
  const modal=$('itemSupplierPickerModal');if(modal){modal.classList.remove('show');modal.setAttribute('aria-hidden','true')}
}
async function mxSaveInventoryItem(){
  const name=$('iName').value.trim();if(!name){toast('O nome do item é obrigatório.');$('iName').focus();return}
  const ref=$('iReference').value.trim();
  if(ref&&inventoryItems.some(x=>x.id!==mxEditingInventoryId&&mxNorm(x.reference)===mxNorm(ref))){toast('Já existe um item com essa referência.');$('iReference').focus();return}
  const button=$('saveInventoryItem');if(button){button.disabled=true;button.textContent='A guardar…'}
  const itemId=mxEditingInventoryId||mxNewId(),newlyStored=[];
  try{
    for(const file of mxPendingItemPdfFiles){const meta=await mxStoreInventoryPdf(file,itemId);newlyStored.push(meta)}
    const item={id:itemId,name,reference:ref,type:$('iType').value,category:mxCurrentItemTags.join(', '),tags:[...mxCurrentItemTags],brand:$('iBrand').value.trim(),location:$('iLocation').value.trim(),quantity:Math.max(0,Math.floor(Number($('iQuantity').value)||0)),minimum:Math.max(0,Math.floor(Number($('iMinimum').value)||0)),unit:$('iUnit').value,condition:$('iCondition').value,notes:$('iNotes').value.trim(),suppliers:[...mxSelectedItemSupplierIds],pdfs:[...mxEditingItemPdfs,...newlyStored],updatedAt:new Date().toISOString()};
    const ix=inventoryItems.findIndex(x=>x.id===item.id);if(ix>=0)inventoryItems[ix]=item;else inventoryItems.unshift(item);
    saveModuleData();
    for(const id of mxPendingItemPdfDeletes)await mxDeleteInventoryPdfRecord(id);
    mxCloseInventoryEditor();toast(`Item de inventário guardado${item.pdfs.length?` com ${item.pdfs.length} PDF(s) associado(s)`:''}.`);
  }catch(err){
    for(const meta of newlyStored)await mxDeleteInventoryPdfRecord(meta.id);
    console.error('Erro ao guardar documentos PDF do inventário:',err);
    toast(err&&err.message?err.message:'Não foi possível guardar o item ou os manuais PDF. Verifique o espaço disponível.');
  }finally{if(button){button.disabled=false;button.textContent='Guardar item'}}
}
function mxDeleteInventoryItem(id){const item=mxById(inventoryItems,id);if(!item)return;ask('Eliminar item de inventário',`Pretende eliminar “${item.name}” do inventário? Esta ação não elimina as compras já registadas.`,async()=>{inventoryItems=inventoryItems.filter(x=>x.id!==id);saveModuleData();await Promise.all((item.pdfs||[]).map(p=>mxDeleteInventoryPdfRecord(p.id)));toast('Item eliminado do inventário.')})}
function mxCreatePurchaseFromItem(id){
  const item=mxById(inventoryItems,id);if(!item)return;
  go('purchases');resetPurchaseForm();showPurchaseEditor(true);
  $('pMaterial').value=`${item.name}${item.reference?' — Ref. '+item.reference:''}`;
  $('pQty').value=String(Math.max(1,Number(item.minimum||0)-Number(item.quantity||0)));
  const supplierNames=(item.suppliers||[]).map(mxSupplierName).filter(x=>x!=='Fornecedor removido');$('pSupplier').value=supplierNames.join(', ');
  $('pNotes').value=`Reposição a partir do inventário. Stock atual: ${item.quantity||0} ${item.unit||'un.'}; stock mínimo: ${item.minimum||0} ${item.unit||'un.'}.`;
  $('purchaseFormTitle').textContent='Nova compra para reposição de inventário';$('pMaterial').focus();
}
function renderInventory(){
  if(!$('inventoryRows'))return;
  const q=mxNorm($('searchInventory')?.value||''),type=$('inventoryTypeFilter')?.value||'',stock=$('inventoryStockFilter')?.value||'';
  const list=inventoryItems.filter(i=>(!q||[i.name,i.reference,i.type,i.category,(Array.isArray(i.tags)?i.tags:[]).join(' '),i.brand,i.location,i.notes,(i.pdfs||[]).map(p=>p.name).join(' '),(i.suppliers||[]).map(mxSupplierName).join(' ')].join(' ').toLocaleLowerCase('pt-PT').includes(q))&&(!type||i.type===type)&&(!stock||(stock==='low'?mxLowStock(i):!mxLowStock(i)))).sort((a,b)=>Number(mxLowStock(b))-Number(mxLowStock(a))||String(a.name).localeCompare(String(b.name),'pt-PT'));
  const low=inventoryItems.filter(mxLowStock).length,withStock=inventoryItems.filter(i=>Number(i.quantity||0)>0).length,types=new Set(inventoryItems.map(i=>i.type).filter(Boolean)).size;
  $('inventoryKpis').innerHTML=[['Itens registados',inventoryItems.length,'Artigos diferentes','#3977ad'],['Abaixo do mínimo',low,'Precisam de reposição',low?'#c94351':'#16836c'],['Itens com stock',withStock,'Itens com quantidade superior a zero','#16836c'],['Tipos de item',types,'Categorias em uso','#8066b0']].map(k=>`<div class="kpi" style="--c:${k[3]}"><div class="label">${esc(k[0])}</div><strong>${k[1]}</strong><small>${esc(k[2])}</small></div>`).join('');
  $('inventoryRows').innerHTML=list.length?list.map(i=>{const lowStock=mxLowStock(i),sn=(i.suppliers||[]).map(id=>mxById(supplierRecords,id)).filter(Boolean);return `<tr><td class="desc-cell"><strong>${esc(i.name)}</strong><small>${esc(i.reference||'Sem referência')}${i.brand?' · '+esc(i.brand):''}${(!Array.isArray(i.tags)||!i.tags.length)&&i.category?' · '+esc(i.category):''}</small>${(Array.isArray(i.tags)&&i.tags.length)?`<div class="inventory-tag-list">${i.tags.map(t=>`<span class="inventory-tag-chip">${esc(t)}</span>`).join('')}</div>`:''}${(i.pdfs||[]).length?`<span class="inventory-pdf-badge">▤ ${(i.pdfs||[]).length} PDF(s)</span>`:''}</td><td>${esc(i.type||'Outro')}</td><td><span class="supplier-chip ${lowStock?'inventory-low':'inventory-ok'}">${Number(i.quantity||0)} ${esc(i.unit||'un.')}</span><small class="muted" style="display:block;margin-top:5px">Mín.: ${Number(i.minimum||0)} ${esc(i.unit||'un.')}</small></td><td>${esc(i.location||'—')}</td><td>${mxSupplierPills(i.suppliers)}</td><td>${esc(i.condition||'Disponível')}${lowStock?'<small style="display:block;color:#bd3e45;font-weight:700;margin-top:4px">Stock a repor</small>':''}</td><td><div class="actions" style="gap:5px;flex-wrap:nowrap"><button class="btn" data-inv-edit="${esc(i.id)}">Editar</button><button class="btn soft" title="Criar compra de reposição" data-inv-buy="${esc(i.id)}">Repor</button><button class="btn" style="color:#bd3948" title="Eliminar item" data-inv-delete="${esc(i.id)}">×</button></div></td></tr>`}).join(''):'<tr><td colspan="7" class="module-empty">Não foram encontrados itens. Use “Novo item” para começar a construir o inventário.</td></tr>';
  $('inventoryCount').textContent=`A mostrar ${list.length} de ${inventoryItems.length} item(ns) registado(s)`;
  $('inventoryRows').querySelectorAll('[data-inv-edit]').forEach(b=>b.onclick=()=>mxOpenInventoryEditor(mxById(inventoryItems,b.dataset.invEdit)));
  $('inventoryRows').querySelectorAll('[data-inv-buy]').forEach(b=>b.onclick=()=>mxCreatePurchaseFromItem(b.dataset.invBuy));
  $('inventoryRows').querySelectorAll('[data-inv-delete]').forEach(b=>b.onclick=()=>mxDeleteInventoryItem(b.dataset.invDelete));
}
function mxOpenSupplierEditor(supplier=null){
  mxEditingSupplierId=supplier?.id||null;mxPendingCatalogFiles=[];
  $('supplierFormTitle').textContent=supplier?'Editar fornecedor':'Registar fornecedor';
  for(const [id,key] of [['sName','name'],['sPhone','phone'],['sEmail','email'],['sWebsite','website'],['sAddress','address'],['sNotes','notes']])$(id).value=supplier?.[key]||'';
  $('sCatalogFiles').value='';$('pendingCatalogNames').textContent='';$('inventorySupplierChecks')?.replaceChildren();mxRenderSupplierCatalogList(supplier);
  $('supplierEditor').style.display='block';$('supplierEditor').scrollIntoView({behavior:'smooth',block:'start'});$('sName').focus({preventScroll:true});
}
function mxCloseSupplierEditor(){$('supplierEditor').style.display='none';mxEditingSupplierId=null;mxPendingCatalogFiles=[];$('sCatalogFiles').value='';$('pendingCatalogNames').textContent=''}
function mxBytes(n){if(!Number.isFinite(Number(n))||Number(n)<0)return '—';if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(0)+' KB';return (n/1024/1024).toFixed(1)+' MB'}
let mxCatalogDBPromise=null;
function mxCatalogDB(){
  if(mxCatalogDBPromise)return mxCatalogDBPromise;
  mxCatalogDBPromise=new Promise((resolve,reject)=>{
    if(!window.indexedDB){reject(new Error('IndexedDB não está disponível'));return}
    const req=indexedDB.open('gestao_manutencao_catalogos_v1',2);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('catalogs'))db.createObjectStore('catalogs',{keyPath:'id'});if(!db.objectStoreNames.contains('inventoryPdfs'))db.createObjectStore('inventoryPdfs',{keyPath:'id'})};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Não foi possível abrir a base dos catálogos'));
  });
  return mxCatalogDBPromise;
}
function mxIDBRequest(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Falha a guardar o catálogo'))})}
function mxFileDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error||new Error('Não foi possível ler o ficheiro'));r.readAsDataURL(file)})}
async function mxStoreCatalog(file,supplierId){
  const meta={id:mxNewId(),supplierId,name:file.name,type:file.type||'application/octet-stream',size:file.size,addedAt:new Date().toISOString()};
  try{const db=await mxCatalogDB();await mxIDBRequest(db.transaction('catalogs','readwrite').objectStore('catalogs').put({...meta,blob:file}));return meta}
  catch(err){
    if(file.size>900*1024)throw new Error(`“${file.name}” excede o limite de reserva do navegador quando o armazenamento de ficheiros não está disponível.`);
    meta.dataUrl=await mxFileDataUrl(file);return meta;
  }
}
async function mxGetCatalog(id){
  for(const sup of supplierRecords){const found=(sup.catalogs||[]).find(c=>String(c.id)===String(id));if(found?.dataUrl)return found}
  try{const db=await mxCatalogDB();return await mxIDBRequest(db.transaction('catalogs','readonly').objectStore('catalogs').get(id))}catch{return null}
}
async function mxDeleteCatalogFile(id){try{const db=await mxCatalogDB();await mxIDBRequest(db.transaction('catalogs','readwrite').objectStore('catalogs').delete(id))}catch{}}
async function mxStoreInventoryPdf(file,itemId){
  const meta={id:mxNewId(),itemId,name:file.name,type:'application/pdf',size:file.size,addedAt:new Date().toISOString()};
  if(file.size>25*1024*1024)throw new Error(`O PDF “${file.name}” excede o limite de 25 MB por ficheiro.`);
  try{const db=await mxCatalogDB();await mxIDBRequest(db.transaction('inventoryPdfs','readwrite').objectStore('inventoryPdfs').put({...meta,blob:file}));return meta}
  catch(err){if(file.size>900*1024)throw new Error(`Não foi possível guardar “${file.name}” no armazenamento de ficheiros do navegador. O PDF é demasiado grande para a alternativa de armazenamento local.`);return {...meta,dataUrl:await mxFileDataUrl(file)}}
}
async function mxGetInventoryPdf(id){
  for(const item of inventoryItems){const found=(item.pdfs||[]).find(p=>String(p.id)===String(id));if(found?.dataUrl)return found}
  try{const db=await mxCatalogDB();return await mxIDBRequest(db.transaction('inventoryPdfs','readonly').objectStore('inventoryPdfs').get(id))}catch{return null}
}
async function mxDeleteInventoryPdfRecord(id){try{const db=await mxCatalogDB();await mxIDBRequest(db.transaction('inventoryPdfs','readwrite').objectStore('inventoryPdfs').delete(id))}catch{}}
async function mxInventoryPdfBlob(id){
  const rec=await mxGetInventoryPdf(id);if(!rec)return null;
  if(rec.blob)return rec.blob;
  if(rec.dataUrl){try{return await (await fetch(rec.dataUrl)).blob()}catch{return null}}
  return null;
}
async function mxDownloadInventoryPdf(id){
  const rec=await mxGetInventoryPdf(id),blob=await mxInventoryPdfBlob(id);if(!rec||!blob){toast('Não foi possível localizar o PDF. Se veio de outra instalação, volte a importar a cópia de segurança que contém o documento.');return}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=rec.name||'manual.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function mxOpenInventoryPdf(id){
  const tab=window.open('about:blank','_blank');
  mxGetInventoryPdf(id).then(async rec=>{const blob=await mxInventoryPdfBlob(id);if(!rec||!blob){if(tab)tab.close();toast('Não foi possível localizar o PDF guardado.');return}const url=URL.createObjectURL(blob);if(tab){tab.opener=null;tab.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000)}else{const a=document.createElement('a');a.href=url;a.download=rec.name||'manual.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}}).catch(err=>{if(tab)tab.close();console.error(err);toast('Falha ao abrir o manual PDF.')});
}
function mxRenderInventoryPdfs(){
  const host=$('inventoryPdfsList'),pending=$('inventoryPdfPending');if(!host)return;
  const existing=mxEditingItemPdfs||[],queued=mxPendingItemPdfFiles||[];
  host.innerHTML=existing.length?'<div class="inventory-pdf-section-title">PDFs associados ao item</div>'+existing.map(p=>`<div class="inventory-pdf-row"><span class="inventory-pdf-icon">PDF</span><span class="inventory-pdf-name"><strong>${esc(p.name||'Manual PDF')}</strong><small>${mxBytes(p.size)} · ${esc(new Date(p.addedAt||Date.now()).toLocaleDateString('pt-PT'))}</small></span><button type="button" class="btn soft" data-inv-pdf-open="${esc(p.id)}">Abrir</button><button type="button" class="btn" data-inv-pdf-download="${esc(p.id)}">Descarregar</button><button type="button" class="btn danger-soft" data-inv-pdf-remove="${esc(p.id)}" aria-label="Remover ${esc(p.name)}">Remover</button></div>`).join(''):'<div class="muted inventory-pdf-empty">Ainda não existem manuais ou documentos associados.</div>';
  host.querySelectorAll('[data-inv-pdf-open]').forEach(b=>b.onclick=()=>mxOpenInventoryPdf(b.dataset.invPdfOpen));
  host.querySelectorAll('[data-inv-pdf-download]').forEach(b=>b.onclick=()=>mxDownloadInventoryPdf(b.dataset.invPdfDownload));
  host.querySelectorAll('[data-inv-pdf-remove]').forEach(b=>b.onclick=()=>{const id=String(b.dataset.invPdfRemove);if(!mxPendingItemPdfDeletes.includes(id))mxPendingItemPdfDeletes.push(id);mxEditingItemPdfs=mxEditingItemPdfs.filter(p=>String(p.id)!==id);mxRenderInventoryPdfs()});
  if(pending)pending.innerHTML=queued.length?'<div class="inventory-pdf-section-title">Novos ficheiros a anexar</div>'+queued.map((f,i)=>`<div class="inventory-pdf-row pending"><span class="inventory-pdf-icon">PDF</span><span class="inventory-pdf-name"><strong>${esc(f.name)}</strong><small>${mxBytes(f.size)} · Será guardado ao clicar em “Guardar item”</small></span><button type="button" class="btn danger-soft" data-inv-pdf-pending-remove="${i}">Retirar</button></div>`).join(''):'';
  pending?.querySelectorAll('[data-inv-pdf-pending-remove]').forEach(b=>b.onclick=()=>{mxPendingItemPdfFiles.splice(Number(b.dataset.invPdfPendingRemove),1);mxRenderInventoryPdfs()});
}
function mxQueueInventoryPdfs(fileList){
  const files=Array.from(fileList||[]),valid=[];let rejected=[];
  for(const file of files){if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){rejected.push(`${file.name}: não é PDF`);continue}if(file.size>25*1024*1024){rejected.push(`${file.name}: excede 25 MB`);continue}if(mxPendingItemPdfFiles.some(f=>f.name===file.name&&f.size===file.size)||valid.some(f=>f.name===file.name&&f.size===file.size)){continue}valid.push(file)}
  mxPendingItemPdfFiles.push(...valid);if($('iManualPdfs'))$('iManualPdfs').value='';mxRenderInventoryPdfs();if(rejected.length)toast('Alguns ficheiros não foram adicionados: '+rejected.join(' · '));else if(valid.length)toast(`${valid.length} PDF(s) preparado(s) para anexar.`)
}
async function mxDownloadCatalog(id){
  const rec=await mxGetCatalog(id);if(!rec){toast('Não encontrei o ficheiro guardado. Verifique se está a utilizar o mesmo navegador e perfil.');return}
  let blob;if(rec.blob)blob=rec.blob;else if(rec.dataUrl){const parts=rec.dataUrl.split(','),mime=(parts[0].match(/data:([^;]+)/)||[])[1]||rec.type||'application/octet-stream';blob=await (await fetch(rec.dataUrl)).blob();if(blob.type!==mime)blob=new Blob([blob],{type:mime})}else{toast('O catálogo já não contém os dados do ficheiro.');return}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=rec.name||'catalogo';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function mxRenderSupplierCatalogList(supplier=null){
  const host=$('supplierCatalogList');if(!host)return;const cats=supplier?.catalogs||[];
  host.innerHTML=cats.length?cats.map(c=>`<div class="catalog-row"><div class="catalog-row-name">▤ ${esc(c.name)}<small>${mxBytes(c.size)} · Adicionado ${esc(new Date(c.addedAt||Date.now()).toLocaleDateString('pt-PT'))}</small></div><div class="catalog-row-actions"><button type="button" class="btn" data-cat-download="${esc(c.id)}">Descarregar</button><button type="button" class="btn" style="color:#bd3948" data-cat-remove="${esc(c.id)}">Remover</button></div></div>`).join(''):'<div class="muted">Este fornecedor ainda não tem catálogos guardados.</div>';
  host.querySelectorAll('[data-cat-download]').forEach(b=>b.onclick=()=>mxDownloadCatalog(b.dataset.catDownload));
  host.querySelectorAll('[data-cat-remove]').forEach(b=>b.onclick=()=>mxRemoveCatalogFromSupplier(b.dataset.catRemove));
}
function mxRemoveCatalogFromSupplier(id){
  const s=mxById(supplierRecords,mxEditingSupplierId);if(!s)return;
  const c=(s.catalogs||[]).find(x=>String(x.id)===String(id));if(!c)return;
  ask('Remover catálogo',`Remover “${c.name}” dos catálogos deste fornecedor?`,()=>{s.catalogs=(s.catalogs||[]).filter(x=>String(x.id)!==String(id));mxDeleteCatalogFile(id);saveModuleData();mxRenderSupplierCatalogList(s);toast('Catálogo removido.')});
}
async function mxSaveSupplier(){
  const name=$('sName').value.trim();if(!name){toast('O nome do fornecedor é obrigatório.');$('sName').focus();return}
  const email=$('sEmail').value.trim();const duplicate=supplierRecords.find(s=>s.id!==mxEditingSupplierId&&mxNorm(s.name)===mxNorm(name)&&(!email||!s.email||mxNorm(s.email)===mxNorm(email)));
  if(duplicate){toast('Já existe um fornecedor com esse nome e contacto. Edite o registo existente.');return}
  const old=mxById(supplierRecords,mxEditingSupplierId);const supplier={...(old||{}),id:mxEditingSupplierId||mxNewId(),name,phone:$('sPhone').value.trim(),email,website:$('sWebsite').value.trim(),address:$('sAddress').value.trim(),notes:$('sNotes').value.trim(),catalogs:Array.isArray(old?.catalogs)?old.catalogs:[],updatedAt:new Date().toISOString()};
  const ix=supplierRecords.findIndex(x=>x.id===supplier.id);if(ix>=0)supplierRecords[ix]=supplier;else supplierRecords.unshift(supplier);
  const chosen=mxPendingCatalogFiles.slice();$('saveSupplier').disabled=true;$('saveSupplier').textContent='A guardar…';
  let stored=0,failed=[];
  for(const file of chosen){try{const cat=await mxStoreCatalog(file,supplier.id);supplier.catalogs.push(cat);stored++}catch(e){failed.push(e.message||file.name)}}
  $('saveSupplier').disabled=false;$('saveSupplier').textContent='Guardar fornecedor';
  mxPendingCatalogFiles=[];$('sCatalogFiles').value='';$('pendingCatalogNames').textContent='';
  saveModuleData();mxRenderSupplierCatalogList(supplier);mxCloseSupplierEditor();
  if(failed.length)toast(`Fornecedor guardado. ${stored} catálogo(s) guardado(s); falha em: ${failed.join(' · ')}`);else toast(chosen.length?`Fornecedor guardado; ${stored} catálogo(s) associado(s).`:'Fornecedor guardado.');
}
function mxDeleteSupplier(id){
  const s=mxById(supplierRecords,id);if(!s)return;
  ask('Eliminar fornecedor',`Pretende eliminar “${s.name}”? A associação será removida dos itens; as compras históricas não serão alteradas.`,()=>{
    for(const c of (s.catalogs||[]))mxDeleteCatalogFile(c.id);
    supplierRecords=supplierRecords.filter(x=>x.id!==id);inventoryItems=inventoryItems.map(i=>({...i,suppliers:(i.suppliers||[]).filter(sid=>sid!==id)}));
    saveModuleData();toast('Fornecedor eliminado.');
  });
}
function mxSafeWeb(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
function renderSuppliers(){
  if(!$('supplierRows'))return;
  const q=mxNorm($('searchSuppliers')?.value||'');const list=supplierRecords.filter(s=>!q||[s.name,s.address,s.phone,s.email,s.website,s.notes].join(' ').toLocaleLowerCase('pt-PT').includes(q)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-PT'));
  const itemLinks=inventoryItems.reduce((n,i)=>n+(i.suppliers||[]).length,0),withCatalogs=supplierRecords.filter(s=>(s.catalogs||[]).length).length;
  $('supplierKpis').innerHTML=[['Fornecedores',supplierRecords.length,'Contactos registados','#3977ad'],['Com catálogo',withCatalogs,'Pelo menos um ficheiro associado','#16836c'],['Ligações a itens',itemLinks,'Associações fornecedor–item','#8066b0']].map(k=>`<div class="kpi" style="--c:${k[3]}"><div class="label">${esc(k[0])}</div><strong>${k[1]}</strong><small>${esc(k[2])}</small></div>`).join('');
  $('supplierRows').innerHTML=list.length?list.map(s=>{const cats=s.catalogs||[],items=inventoryItems.filter(i=>(i.suppliers||[]).includes(s.id)).length;const web=mxSafeWeb(s.website||'');const email=s.email?`<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`:'—';const website=web?`<a href="${esc(web)}" target="_blank" rel="noopener noreferrer">Abrir site ↗</a>`:'—';const catalogLinks=cats.length?cats.map(c=>`<button class="slice-ot-link" data-cat-download="${esc(c.id)}" title="Descarregar ${esc(c.name)}">${esc(c.name)}</button>`).join('<br>'):'<span class="muted">Sem catálogos</span>';return `<tr><td class="desc-cell"><strong>${esc(s.name)}</strong><small>${esc(s.address||'Morada não registada')}</small>${s.notes?`<small>${esc(s.notes)}</small>`:''}</td><td>${s.phone?`<a href="tel:${esc(s.phone.replace(/[^\d+]/g,''))}">${esc(s.phone)}</a>`:'—'}</td><td>${email}</td><td>${website}</td><td>${catalogLinks}${cats.length?`<small class="muted" style="display:block;margin-top:5px">${cats.length} ficheiro(s)</small>`:''}</td><td>${items}</td><td><div class="actions" style="gap:5px;flex-wrap:nowrap"><button class="btn" data-sup-edit="${esc(s.id)}">Editar</button><button class="btn" style="color:#bd3948" data-sup-delete="${esc(s.id)}">×</button></div></td></tr>`}).join(''):'<tr><td colspan="7" class="module-empty">Não existem fornecedores que correspondam à pesquisa. Use “Novo fornecedor” para registar um contacto.</td></tr>';
  $('supplierCount').textContent=`A mostrar ${list.length} de ${supplierRecords.length} fornecedor(es)`;
  $('supplierRows').querySelectorAll('[data-sup-edit]').forEach(b=>b.onclick=()=>mxOpenSupplierEditor(mxById(supplierRecords,b.dataset.supEdit)));
  $('supplierRows').querySelectorAll('[data-sup-delete]').forEach(b=>b.onclick=()=>mxDeleteSupplier(b.dataset.supDelete));
  $('supplierRows').querySelectorAll('[data-cat-download]').forEach(b=>b.onclick=()=>mxDownloadCatalog(b.dataset.catDownload));
}
function mxExportJson(payload,filename){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function mxExportInventory(){const full=await mxSuppliersWithCatalogData();mxExportJson({app:'Gestão de Manutenção OT',type:'inventory',exportedAt:new Date().toISOString(),inventory:inventoryItems,suppliers:full},'inventario_manutencao.json');toast('Inventário, fornecedores e catálogos exportados.')}
async function mxBlobDataUrl(blob){return await mxFileDataUrl(blob)}
async function mxSuppliersWithCatalogData(){const out=[];for(const s of supplierRecords){const copy={...s,catalogs:[]};for(const c of (s.catalogs||[])){let item={...c};if(!item.dataUrl){const stored=await mxGetCatalog(c.id);if(stored?.dataUrl)item.dataUrl=stored.dataUrl;else if(stored?.blob){try{item.dataUrl=await mxBlobDataUrl(stored.blob)}catch{}}}copy.catalogs.push(item)}out.push(copy)}return out}
async function mxExportSuppliers(){const full=await mxSuppliersWithCatalogData();mxExportJson({app:'Gestão de Manutenção OT',type:'suppliers',exportedAt:new Date().toISOString(),suppliers:full},'fornecedores_manutencao.json');toast('Lista de fornecedores e catálogos exportada.')}
exportData=async function(onlyClosed=false){if(onlyClosed){mxExportJson({app:'Gestão de Manutenção OT',version:3,exportedAt:new Date().toISOString(),orders:orders.filter(closed)},'historico_ordens_fechadas.json');toast('Histórico de OTs exportado.');return}const full=await mxSuppliersWithCatalogData();const payload={app:'Gestão de Manutenção OT',version:3,exportedAt:new Date().toISOString(),orders,purchases,inventory:inventoryItems,suppliers:full};mxExportJson(payload,'backup_completo_manutencao.json');toast('Cópia completa exportada, incluindo inventário, fornecedores e catálogos.')}

// Wrap the existing dashboard renderer to add true, independently hoverable SVG slices.
const mxOriginalRenderDashboard = renderDashboard;
function mxDashboardStatus(o){
  const raw=String(o?.status||'').trim(),k=mxNorm(raw);
  if(/^(anulad|cancel)/.test(k))return 'Anulada';
  if(/^(complet|finaliz|fechad|closed|done)/.test(k)||(!raw&&o?.closedAt))return 'Finalizada';
  if(k==='oficina')return 'Oficina';if(k.includes('analise'))return 'Em análise';
  if(k.includes('espera dos tecnicos')||k.includes('espera tecnica'))return 'Espera dos técnicos';
  if(k.includes('compra de material')||k.includes('aguardar fornecedor')||k.includes('por solicitar'))return 'Compra de material';
  if(k.includes('em espera')||k==='espera')return 'Em espera';if(k.includes('curso')||k==='in progress')return 'Em curso';if(k.includes('aberto')||k==='open')return 'Em aberto';
  return raw||'Em aberto';
}
function mxDateYear(v){const s=String(v??'').trim();let m=s.match(/^(\d{4})[-/]/);if(m)return Number(m[1]);m=s.match(/^\d{1,2}[/.-]\d{1,2}[/.-](\d{4})/);if(m)return Number(m[1]);const d=new Date(s);return s&&!Number.isNaN(d.getTime())?d.getFullYear():null}
function mxOrdersForSlice(hostId,label){
  const openOrders=orders.filter(o=>!closed(o));
  if(hostId==='urgPie'){
    if(label.startsWith('P1'))return openOrders.filter(o=>String(o.urgency||'').trim().startsWith('P1'));
    if(label.startsWith('P2'))return openOrders.filter(o=>String(o.urgency||'').trim().startsWith('P2'));
    if(label.startsWith('P3'))return openOrders.filter(o=>String(o.urgency||'').trim().startsWith('P3'));
    return openOrders.filter(o=>!['P1','P2','P3'].some(p=>String(o.urgency||'').trim().startsWith(p)));
  }
  if(hostId==='areaBars'){
    const counts=new Map();openOrders.forEach(o=>{const n=String(o.location||'Por definir').trim()||'Por definir';counts.set(n,(counts.get(n)||0)+1)});
    const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-PT'));
    const top=sorted.slice(0,5).map(x=>x[0]);
    if(label==='Outras localizações')return openOrders.filter(o=>!top.includes(String(o.location||'Por definir').trim()||'Por definir'));
    return openOrders.filter(o=>(String(o.location||'Por definir').trim()||'Por definir')===label);
  }
  if(hostId==='statusBars'){
    const y=new Date().getFullYear();
    return orders.filter(o=>{const st=mxDashboardStatus(o);if(st!==label)return false;if(st==='Finalizada')return mxDateYear(o.closedAt)===y;return true});
  }
  return [];
}
function mxOpenSliceModal(hostId,label,color){
  const data=mxOrdersForSlice(hostId,label).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''),'pt-PT'));
  const titleMap={urgPie:'Ordens por urgência',areaBars:'Ordens por localização',statusBars:'Estado das ordens'};
  $('sliceModalTitle').textContent=label;$('sliceModalDescription').textContent=`${titleMap[hostId]||'Gráfico'} · clique no número da OT para abrir a ficha completa.`;
  $('sliceModalCount').textContent=`${data.length} OT(s)`;$('sliceModalSearch').value='';
  $('sliceModalContent').innerHTML=data.length?`<div class="slice-table-wrap"><table><thead><tr><th>Número da OT</th><th>Data de abertura</th><th>Localização</th><th>Equipamento</th><th>Urgência</th><th>Estado</th></tr></thead><tbody>${data.map(o=>`<tr data-slice-search="${esc([o.number,o.date,o.location,o.equipment,o.description,o.urgency,o.status].join(' ').toLocaleLowerCase('pt-PT'))}"><td><button class="slice-ot-link" data-slice-open="${esc(o.id)}">${esc(o.number||'Sem número')}</button></td><td>${esc(dt(o.date))}</td><td>${esc(o.location||'—')}</td><td>${esc(o.equipment||'—')}</td><td>${typeof urgency==='function'?urgency(o.urgency):esc(o.urgency||'—')}</td><td>${typeof status==='function'?status(o.status):esc(o.status||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="module-empty">Não existem OTs neste segmento do gráfico.</div>';
  $('sliceModalBg').classList.add('show');$('sliceModalBg').dataset.chart=hostId;$('sliceModalBg').dataset.label=label;
}
function mxEnhancePieHosts(){
  for(const hostId of ['urgPie','areaBars','statusBars']){
    const host=$(hostId);if(!host)continue;
    const chart=host.querySelector('.pie-chart');if(!chart)continue;
    const legendItems=[...host.querySelectorAll('.pie-legend-item')];
    if(!legendItems.length)continue;
    const center=chart.querySelector('.pie-chart-center');const visual=host.querySelector('.pie-visual');if(visual){visual.setAttribute('role','group');visual.setAttribute('aria-label','Gráfico circular interativo; selecione uma fatia para consultar as OTs.')}
    const data=legendItems.map((el,index)=>{el.dataset.pieIndex=String(index);el.setAttribute('role','button');el.setAttribute('tabindex','0');const name=el.querySelector('.pie-item-name')?.textContent?.trim()||`Categoria ${index+1}`;const value=Number(el.querySelector('.pie-item-value')?.textContent||0);const swatch=el.querySelector('.pie-swatch');return {el,label:name,value,color:swatch?.style.backgroundColor||'#8a9aa5',hex:(swatch?.getAttribute('style')||'').match(/background:\s*([^;]+)/i)?.[1]||swatch?.style.backgroundColor||'#8a9aa5'}}).filter(x=>x.value>0);
    if(!data.length)continue;
    const total=data.reduce((n,x)=>n+x.value,0);let accumulated=0;const paths=[];
    const point=a=>{const r=a*Math.PI/180;return [50+49*Math.cos(r),50+49*Math.sin(r)]};
    for(let i=0;i<data.length;i++){
      const entry=data[i],from=-90+accumulated/total*360;accumulated+=entry.value;const to=-90+accumulated/total*360;let d='';
      if(data.length===1||to-from>=359.99)d='';
      else{const p1=point(from),p2=point(to),large=to-from>180?1:0;d=`M 50 50 L ${p1[0].toFixed(3)} ${p1[1].toFixed(3)} A 49 49 0 ${large} 1 ${p2[0].toFixed(3)} ${p2[1].toFixed(3)} Z`}
      const path=data.length===1?`<circle class="pie-slice" data-pie-index="${i}" tabindex="0" role="button" aria-label="${esc(entry.label)}: ${entry.value} OT(s)" cx="50" cy="50" r="49" fill="${esc(entry.hex)}"></circle>`:`<path class="pie-slice" data-pie-index="${i}" tabindex="0" role="button" aria-label="${esc(entry.label)}: ${entry.value} OT(s)" d="${d}" fill="${esc(entry.hex)}"></path>`;
      paths.push(path);
    }
    chart.style.background='transparent';chart.innerHTML=`<svg class="pie-interactive-svg" viewBox="0 0 100 100" aria-label="Gráfico circular interativo" role="group">${paths.join('')}</svg>${center?center.outerHTML:''}`;
    if(!host.dataset.mxPieEvents){host.dataset.mxPieEvents='1';
      const openIndex=e=>{const slice=e.target.closest('[data-pie-index]');if(!slice)return;const ix=Number(slice.dataset.pieIndex),live=host.querySelectorAll('.pie-legend-item')[ix],label=live?.querySelector('.pie-item-name')?.textContent?.trim(),swatch=live?.querySelector('.pie-swatch'),color=swatch?.getAttribute('style')?.match(/background:\s*([^;]+)/i)?.[1]||swatch?.style.backgroundColor||slice.getAttribute('fill');if(label)mxOpenSliceModal(hostId,label,color)};
      host.addEventListener('click',e=>{const legend=e.target.closest('.pie-legend-item[data-pie-index]');if(legend){e.preventDefault();const ix=Number(legend.dataset.pieIndex);const live=[...host.querySelectorAll('.pie-legend-item')][ix];const label=live?.querySelector('.pie-item-name')?.textContent?.trim();const color=live?.querySelector('.pie-swatch')?.style.backgroundColor;if(label)mxOpenSliceModal(hostId,label,color);return}openIndex(e)});
      host.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.pie-legend-item[data-pie-index],.pie-slice[data-pie-index]')){e.preventDefault();const ix=Number(e.target.dataset.pieIndex);const li=host.querySelectorAll('.pie-legend-item')[ix];const label=li?.querySelector('.pie-item-name')?.textContent?.trim();const color=li?.querySelector('.pie-swatch')?.style.backgroundColor;if(label)mxOpenSliceModal(hostId,label,color)}});
    }
  }
}
renderDashboard=function(){mxOriginalRenderDashboard();mxEnhancePieHosts()};

// The new views join the same view router and retain the application's local-first design.
const mxOriginalGo=go;
go=function(v){mxOriginalGo(v);document.body.classList.toggle('worktime-mode',v==='worktime');if(v==='worktime')window.scrollTo({top:0,behavior:'auto'});const titles={inventory:['Inventário de manutenção','Peças, ferramentas, equipamentos e níveis de stock.'],suppliers:['Fornecedores','Contactos, catálogos e fornecedores associados aos itens.']};if(titles[v]){$('title').textContent=titles[v][0];$('subtitle').textContent=titles[v][1]}if(v==='inventory')renderInventory();if(v==='suppliers')renderSuppliers()};

// Handlers for the added modules.
$('newInventoryBtn').onclick=()=>mxOpenInventoryEditor();$('closeInventoryEditor').onclick=mxCloseInventoryEditor;$('cancelInventoryEdit').onclick=mxCloseInventoryEditor;$('saveInventoryItem').onclick=mxSaveInventoryItem;
$('addInventoryTagBtn').onclick=mxAddInventoryTag;$('iTagInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();mxAddInventoryTag()}});
$('iManualPdfs')?.addEventListener('change',e=>mxQueueInventoryPdfs(e.target.files));
$('openItemSupplierPicker').onclick=mxOpenItemSupplierPicker;$('closeItemSupplierPicker').onclick=$('cancelItemSupplierPicker').onclick=()=>mxCloseItemSupplierPicker(false);$('applyItemSupplierPicker').onclick=()=>mxCloseItemSupplierPicker(true);$('itemSupplierSearch').oninput=mxRenderSupplierPickerList;$('itemSupplierPickerModal').addEventListener('click',e=>{if(e.target===$('itemSupplierPickerModal'))mxCloseItemSupplierPicker(false)});document.addEventListener('keydown',e=>{if(e.key==='Escape')mxCloseItemSupplierPicker(false)});
$('searchInventory').oninput=renderInventory;$('inventoryTypeFilter').onchange=renderInventory;$('inventoryStockFilter').onchange=renderInventory;$('exportInventoryBtn').onclick=mxExportInventory;
$('newSupplierBtn').onclick=()=>mxOpenSupplierEditor();$('closeSupplierEditor').onclick=mxCloseSupplierEditor;$('cancelSupplierEdit').onclick=mxCloseSupplierEditor;$('saveSupplier').onclick=mxSaveSupplier;$('searchSuppliers').oninput=renderSuppliers;$('exportSuppliersBtn').onclick=mxExportSuppliers;
$('sCatalogFiles').addEventListener('change',e=>{mxPendingCatalogFiles=[...(e.target.files||[])];$('pendingCatalogNames').textContent=mxPendingCatalogFiles.length?`${mxPendingCatalogFiles.length} ficheiro(s) selecionado(s): ${mxPendingCatalogFiles.map(f=>f.name+' ('+mxBytes(f.size)+')').join(' · ')}`:''});
$('sliceModalClose').onclick=$('sliceModalCloseBottom').onclick=()=>$('sliceModalBg').classList.remove('show');
$('sliceModalBg').addEventListener('click',e=>{if(e.target===$('sliceModalBg'))$('sliceModalBg').classList.remove('show')});
$('sliceModalSearch').addEventListener('input',()=>{const q=mxNorm($('sliceModalSearch').value);$('sliceModalContent').querySelectorAll('tbody tr').forEach(tr=>tr.hidden=!!q&&!mxNorm(tr.dataset.sliceSearch||'').includes(q))});
$('sliceModalContent').addEventListener('click',e=>{const b=e.target.closest('[data-slice-open]');if(!b)return;const id=b.dataset.sliceOpen;$('sliceModalBg').classList.remove('show');const o=mxById(orders,id);if(o)openDetail(o.id,'dashboard')});
// Keyboard dismissal works consistently for the new dialog and does not interfere with the existing dialogs.
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('sliceModalBg')?.classList.remove('show')});

mxLoadModuleData();
// Include the loaded inventory/supplier modules in the full application backup and JSON import already implemented above.
renderInventory();renderSuppliers();renderDashboard();
