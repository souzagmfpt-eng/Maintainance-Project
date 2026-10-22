(function(){
  const q=(id)=>document.getElementById(id);
  const safe=(v)=>typeof window.esc==='function'?window.esc(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(!q('inventoryItemDetailModal')){
    const overlay=document.createElement('div');overlay.id='inventoryItemDetailModal';overlay.className='inventory-detail-overlay';overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<div class="inventory-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="inventoryDetailTitle"><div id="inventoryDetailContent"></div></div>';
    document.body.appendChild(overlay);
  }
  let activeInventoryDetailId=null;
  function detailField(label,value,full=false){return `<div class="inventory-detail-field${full?' full':''}"><span>${safe(label)}</span>${typeof value==='string'?`<strong>${value}</strong>`:value}</div>`}
  window.mxShowInventoryItemCard=function(id){
    const item=Array.isArray(inventoryItems)?inventoryItems.find(x=>String(x.id)===String(id)):null;
    if(!item){if(typeof window.toast==='function')window.toast('Não foi possível localizar o item de inventário.');return;}
    activeInventoryDetailId=item.id;
    const low=typeof window.mxLowStock==='function'?window.mxLowStock(item):Number(item.quantity||0)<=Number(item.minimum||0);
    const tags=Array.isArray(item.tags)&&item.tags.length?item.tags:(item.category?String(item.category).split(',').map(x=>x.trim()).filter(Boolean):[]);
    const suppliers=(item.suppliers||[]).map(sid=>Array.isArray(supplierRecords)?supplierRecords.find(s=>String(s.id)===String(sid)):null).filter(Boolean);
    const pdfs=Array.isArray(item.pdfs)?item.pdfs:[];
    const status=`<span class="inventory-detail-stock ${low?'low':'ok'}">${low?'⚠ Stock a repor':'✓ Stock adequado'} · ${Number(item.quantity||0)} ${safe(item.unit||'un.')}</span>`;
    const fields=[
      detailField('Tipo de item',safe(item.type||'Outro')),
      detailField('Referência',safe(item.reference||'Sem referência')),
      detailField('Stock atual',status),
      detailField('Stock mínimo',safe(`${Number(item.minimum||0)} ${item.unit||'un.'}`)),
      detailField('Marca / fabricante',safe(item.brand||'Não indicado')),
      detailField('Estado',safe(item.condition||'Disponível')),
      detailField('Localização',safe(item.location||'Não indicada')),
      detailField('Última atualização',safe(item.updatedAt&& !isNaN(new Date(item.updatedAt))?new Date(item.updatedAt).toLocaleString('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'—')),
      detailField('Etiquetas',tags.length?`<div class="inventory-detail-tags">${tags.map(t=>`<span class="inventory-detail-tag">${safe(t)}</span>`).join('')}</div>`:'<strong>Sem etiquetas</strong>',true),
      detailField('Notas / descrição',safe(item.notes||'Sem notas registadas'),true),
      detailField('Fornecedores associados',suppliers.length?`<div class="inventory-detail-suppliers">${suppliers.map(s=>`<span class="inventory-detail-supplier">${safe(s.name||'Fornecedor')}</span>`).join('')}</div>`:'<strong>Sem fornecedores associados</strong>',true)
    ].join('');
    const docs=pdfs.length?pdfs.map(p=>`<div class="inventory-detail-pdf"><span aria-hidden="true" style="font-weight:900;color:#b63843">PDF</span><span class="inventory-detail-pdf-name">${safe(p.name||'Manual PDF')}<small style="display:block;color:#72869a;font-weight:500">${safe(typeof window.mxBytes==='function'?window.mxBytes(p.size):'Documento associado')}</small></span><div class="inventory-detail-pdf-actions"><button type="button" class="btn soft" data-detail-pdf-open="${safe(p.id)}">Abrir</button><button type="button" class="btn" data-detail-pdf-download="${safe(p.id)}">Descarregar</button></div></div>`).join(''):'<div class="muted">Não existem manuais ou documentos PDF associados a este item.</div>';
    q('inventoryDetailContent').innerHTML=`<div class="inventory-detail-head"><div><div class="inventory-detail-eyebrow">Ficha do inventário</div><h2 id="inventoryDetailTitle">${safe(item.name||'Item sem nome')}</h2><div class="inventory-detail-subtitle">${safe(item.reference||'Sem referência')}${item.brand?' · '+safe(item.brand):''}</div></div><button type="button" class="btn" data-detail-close aria-label="Fechar ficha">✕</button></div><div class="inventory-detail-content"><div class="inventory-detail-grid">${fields}</div><div class="inventory-detail-section-title">Manuais e documentos (${pdfs.length})</div><div style="display:grid;gap:7px">${docs}</div></div><div class="inventory-detail-foot"><button type="button" class="btn" data-detail-close>Fechar</button><button type="button" class="btn soft" data-detail-buy="${safe(item.id)}">Criar compra</button><button type="button" class="btn primary" data-detail-edit="${safe(item.id)}">Editar item</button></div>`;
    const modal=q('inventoryItemDetailModal');modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    const close=modal.querySelector('[data-detail-close]');if(close)close.focus();
  };
  function closeDetail(){const modal=q('inventoryItemDetailModal');if(!modal)return;modal.classList.remove('show');modal.setAttribute('aria-hidden','true');document.body.style.overflow='';activeInventoryDetailId=null}
  document.addEventListener('click',function(e){
    const tbody=q('inventoryRows');if(tbody&&tbody.contains(e.target)){
      if(e.target.closest('button,a,input,select,textarea,label,[data-inv-edit],[data-inv-buy],[data-inv-delete]'))return;
      const row=e.target.closest('tr');if(row){const edit=row.querySelector('[data-inv-edit]');if(edit){e.preventDefault();window.mxShowInventoryItemCard(edit.dataset.invEdit)}}
    }
    const modal=q('inventoryItemDetailModal');if(!modal)return;
    if(e.target===modal||e.target.closest('[data-detail-close]')){closeDetail();return}
    const edit=e.target.closest('[data-detail-edit]');if(edit){const id=edit.dataset.detailEdit,item=Array.isArray(inventoryItems)?inventoryItems.find(x=>String(x.id)===String(id)):null;closeDetail();if(item&&typeof window.mxOpenInventoryEditor==='function')window.mxOpenInventoryEditor(item);return}
    const buy=e.target.closest('[data-detail-buy]');if(buy){const id=buy.dataset.detailBuy;closeDetail();if(typeof window.mxCreatePurchaseFromItem==='function')window.mxCreatePurchaseFromItem(id);return}
    const open=e.target.closest('[data-detail-pdf-open]');if(open){if(typeof window.mxOpenInventoryPdf==='function')window.mxOpenInventoryPdf(open.dataset.detailPdfOpen);return}
    const download=e.target.closest('[data-detail-pdf-download]');if(download){if(typeof window.mxDownloadInventoryPdf==='function')window.mxDownloadInventoryPdf(download.dataset.detailPdfDownload);return}
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&q('inventoryItemDetailModal')?.classList.contains('show')){closeDetail();return}
    if(e.key!=='Enter'&&e.key!==' ')return;
    const tbody=q('inventoryRows');if(!tbody||!tbody.contains(document.activeElement))return;
    const row=document.activeElement.closest('tr');if(!row||document.activeElement!==row)return;
    const edit=row.querySelector('[data-inv-edit]');if(edit){e.preventDefault();window.mxShowInventoryItemCard(edit.dataset.invEdit)}
  });
  // Keep rows clickable after every inventory re-render, without interfering with action buttons.
  function enhanceInventoryRows(){const tbody=q('inventoryRows');if(!tbody)return;tbody.querySelectorAll('tr').forEach(row=>{if(row.querySelector('[data-inv-edit]')){row.tabIndex=0;row.title='Clique para ver os detalhes do item';row.setAttribute('aria-label','Abrir detalhes do item de inventário')}})}
  const tbody=q('inventoryRows');if(tbody)new MutationObserver(enhanceInventoryRows).observe(tbody,{childList:true});enhanceInventoryRows();
})();
