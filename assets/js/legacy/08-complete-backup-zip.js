(function(){
  'use strict';
  // Cópias de segurança ZIP sem bibliotecas externas; os PDFs são guardados como ficheiros reais no ZIP.
  const mxBackupCoreKeys = new Set([
    'gestao_manutencao_ot_v1',
    'gestao_manutencao_compras_v1',
    'gestao_manutencao_inventory_v1',
    'gestao_manutencao_suppliers_v1'
  ]);
  const mxBackupEncoder = new TextEncoder();
  const mxBackupCrcTable = (()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0}return t})();
  function mxBackupCrc(bytes){let c=0xffffffff;for(const b of bytes)c=mxBackupCrcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
  function mxBackupU16(v){return new Uint8Array([v&255,(v>>>8)&255])}
  function mxBackupU32(v){return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255])}
  function mxBackupJoin(parts){let size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size),at=0;for(const p of parts){out.set(p,at);at+=p.length}return out}
  function mxBackupSafeName(value){return String(value||'documento.pdf').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^\.+/,'').slice(0,110)||'documento.pdf'}
  function mxBackupZip(entries){
    const locals=[],centrals=[];let offset=0;
    for(const entry of entries){
      const name=mxBackupEncoder.encode(entry.name),data=entry.data instanceof Uint8Array?entry.data:new Uint8Array(entry.data),crc=mxBackupCrc(data),size=data.length;
      if(name.length>65535||size>0xffffffff)throw new Error('Um dos ficheiros excede o tamanho suportado pelo ZIP.');
      const local=mxBackupJoin([mxBackupU32(0x04034b50),mxBackupU16(20),mxBackupU16(0x0800),mxBackupU16(0),mxBackupU16(0),mxBackupU16(0x21),mxBackupU32(crc),mxBackupU32(size),mxBackupU32(size),mxBackupU16(name.length),mxBackupU16(0),name,data]);
      const central=mxBackupJoin([mxBackupU32(0x02014b50),mxBackupU16(20),mxBackupU16(20),mxBackupU16(0x0800),mxBackupU16(0),mxBackupU16(0),mxBackupU16(0x21),mxBackupU32(crc),mxBackupU32(size),mxBackupU32(size),mxBackupU16(name.length),mxBackupU16(0),mxBackupU16(0),mxBackupU16(0),mxBackupU16(0),mxBackupU32(0),mxBackupU32(offset),name]);
      locals.push(local);centrals.push(central);offset+=local.length;
      if(offset>0xffffffff)throw new Error('A cópia é demasiado grande para o formato ZIP clássico.');
    }
    const centralBytes=mxBackupJoin(centrals),localBytes=mxBackupJoin(locals),count=entries.length;
    if(count>65535)throw new Error('A cópia contém ficheiros a mais para o formato ZIP clássico.');
    const end=mxBackupJoin([mxBackupU32(0x06054b50),mxBackupU16(0),mxBackupU16(0),mxBackupU16(count),mxBackupU16(count),mxBackupU32(centralBytes.length),mxBackupU32(localBytes.length),mxBackupU16(0)]);
    return new Blob([localBytes,centralBytes,end],{type:'application/zip'});
  }
  async function mxBackupReadZip(file){
    const bytes=new Uint8Array(await file.arrayBuffer()),dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break}}
    if(eocd<0)throw new Error('Este ZIP não parece ser uma cópia de segurança válida.');
    const count=dv.getUint16(eocd+10,true);let ptr=dv.getUint32(eocd+16,true);const entries=new Map(),decoder=new TextDecoder('utf-8');
    for(let i=0;i<count;i++){
      if(ptr+46>bytes.length||dv.getUint32(ptr,true)!==0x02014b50)throw new Error('A estrutura do ZIP está danificada.');
      const method=dv.getUint16(ptr+10,true),crc=dv.getUint32(ptr+16,true),compressedSize=dv.getUint32(ptr+20,true),plainSize=dv.getUint32(ptr+24,true),nameLen=dv.getUint16(ptr+28,true),extraLen=dv.getUint16(ptr+30,true),commentLen=dv.getUint16(ptr+32,true),localOffset=dv.getUint32(ptr+42,true),name=decoder.decode(bytes.slice(ptr+46,ptr+46+nameLen));
      if(!name||name.startsWith('/')||name.split('/').includes('..'))throw new Error('O ZIP contém um caminho de ficheiro inválido.');
      entries.set(name,{method,crc,compressedSize,plainSize,localOffset});ptr+=46+nameLen+extraLen+commentLen;
    }
    async function read(name){
      const rec=entries.get(name);if(!rec)return null;const o=rec.localOffset;if(o+30>bytes.length||dv.getUint32(o,true)!==0x04034b50)throw new Error('Não foi possível ler um ficheiro dentro do ZIP.');
      const n=dv.getUint16(o+26,true),x=dv.getUint16(o+28,true),start=o+30+n+x,end=start+rec.compressedSize;if(end>bytes.length)throw new Error('Um ficheiro da cópia está incompleto.');
      const body=bytes.slice(start,end);let out;
      if(rec.method===0)out=body;
      else if(rec.method===8){if(typeof DecompressionStream==='undefined')throw new Error('Este navegador não consegue descomprimir ZIPs deste tipo. Use a cópia ZIP gerada pela aplicação.');const stream=new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw'));out=new Uint8Array(await new Response(stream).arrayBuffer())}
      else throw new Error('O ZIP usa um método de compressão não suportado.');
      if(out.length!==rec.plainSize||mxBackupCrc(out)!==rec.crc)throw new Error(`O ficheiro “${name}” está incompleto ou danificado.`);return out;
    }
    return {entries,read};
  }
  function mxBackupLocalExtras(){const out={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('gestao_manutencao_')&&!mxBackupCoreKeys.has(k))out[k]=localStorage.getItem(k)}return out}
  async function mxExportCompleteBackup(){
    const entries=[],refs=[],catalogRefs=[];
    const inventory=inventoryItems.map(item=>({...item,pdfs:(Array.isArray(item.pdfs)?item.pdfs:[]).map(({dataUrl,blob,...meta})=>({...meta}))}));
    // PDFs das peças/equipamentos ficam como ficheiros no ZIP, não como base64 no JSON.
    for(const item of inventoryItems){
      for(const meta of (Array.isArray(item.pdfs)?item.pdfs:[])){
        const stored=await mxGetInventoryPdf(meta.id),blob=await mxInventoryPdfBlob(meta.id);
        if(!blob)throw new Error(`Não foi possível encontrar o PDF “${meta.name||meta.id}”, associado ao artigo “${item.name||item.reference||item.id}”. A cópia foi interrompida para não criar um backup incompleto.`);
        const path=`documentos/inventario/${mxBackupSafeName(item.id)}_${mxBackupSafeName(meta.id)}_${mxBackupSafeName(meta.name||'manual.pdf')}`;
        entries.push({name:path,data:new Uint8Array(await blob.arrayBuffer())});
        refs.push({itemId:String(item.id),itemReference:String(item.reference||''),itemName:String(item.name||''),pdfId:String(meta.id),name:String(meta.name||stored?.name||'manual.pdf'),type:'application/pdf',size:blob.size,addedAt:meta.addedAt||stored?.addedAt||'',path});
      }
    }
    // Os ficheiros dos catálogos dos fornecedores também são preservados no ZIP.
    const suppliers=[];
    for(const supplier of supplierRecords){
      const copy={...supplier,catalogs:[]};
      for(const catalog of (Array.isArray(supplier.catalogs)?supplier.catalogs:[])){
        const {dataUrl,blob:embeddedBlob,...meta}=catalog;
        const stored=await mxGetCatalog(catalog.id);
        let fileBlob=stored?.blob||embeddedBlob||null;
        const dataUrlValue=stored?.dataUrl||dataUrl;
        if(!fileBlob&&dataUrlValue){try{fileBlob=await (await fetch(dataUrlValue)).blob()}catch{}}
        if(!fileBlob)throw new Error(`Não foi possível encontrar o ficheiro “${catalog.name||catalog.id}” do fornecedor “${supplier.name||supplier.id}”. A cópia foi interrompida para não criar um backup incompleto.`);
        const path=`documentos/fornecedores/${mxBackupSafeName(supplier.id)}_${mxBackupSafeName(catalog.id)}_${mxBackupSafeName(catalog.name||'catalogo')}`;
        entries.push({name:path,data:new Uint8Array(await fileBlob.arrayBuffer())});
        catalogRefs.push({supplierId:String(supplier.id),supplierName:String(supplier.name||''),catalogId:String(catalog.id),name:String(catalog.name||stored?.name||'ficheiro'),type:String(catalog.type||stored?.type||fileBlob.type||'application/octet-stream'),size:fileBlob.size,addedAt:catalog.addedAt||stored?.addedAt||'',path});
        copy.catalogs.push({...meta});
      }
      suppliers.push(copy);
    }
    const extras=mxBackupLocalExtras();
    const data={app:'Gestão de Manutenção OT',backupType:'complete',backupVersion:1,exportedAt:new Date().toISOString(),orders,purchases,inventory,suppliers,localStorageExtras:extras};
    const refDoc={app:'Gestão de Manutenção OT',referenceVersion:1,exportedAt:data.exportedAt,description:'Liga cada PDF ao artigo de inventário e cada ficheiro de catálogo ao fornecedor correspondente através dos seus identificadores.',documents:refs,catalogDocuments:catalogRefs};
    const readme='CÓPIA DE SEGURANÇA COMPLETA — GESTÃO DE MANUTENÇÃO\n\nPara restaurar, abra a aplicação e escolha Importar. Selecione este ficheiro ZIP. Confirme a reposição quando a aplicação apresentar o resumo.\n\n- dados.json: ordens de trabalho, inventário, fornecedores, compras e dados complementares.\n- referencia_documentos.json: associa cada PDF ao artigo e os ficheiros de catálogo ao fornecedor correto.\n- documentos/inventario/: PDFs associados às peças e equipamentos.\n- documentos/fornecedores/: catálogos e ficheiros anexados aos fornecedores.\n\nGuarde este ZIP num local seguro. A reposição substitui os dados atualmente guardados nesta aplicação.\n';
    entries.unshift({name:'dados.json',data:mxBackupEncoder.encode(JSON.stringify(data,null,2))},{name:'referencia_documentos.json',data:mxBackupEncoder.encode(JSON.stringify(refDoc,null,2))},{name:'LEIA-ME.txt',data:mxBackupEncoder.encode(readme)});
    const blob=mxBackupZip(entries),date=new Date().toISOString().slice(0,10),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`backup_completo_manutencao_${date}.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
    toast(`Cópia completa exportada: ${orders.length} OT(s), ${inventoryItems.length} artigo(s), ${purchases.length} compra(s), ${supplierRecords.length} fornecedor(es), ${refs.length} PDF(s) e ${catalogRefs.length} ficheiro(s) de fornecedor.`);
  }
  const mxLegacyExportData=exportData;
  exportData=async function(onlyClosed=false){if(onlyClosed)return mxLegacyExportData(true);try{await mxExportCompleteBackup()}catch(err){console.error(err);toast(err?.message||'Não foi possível criar a cópia de segurança ZIP.')}};

  async function mxReplaceDocumentStores(pdfDocs,catalogDocs,zip){
    const db=await mxCatalogDB(),pdfRecords=[],catalogRecords=[];
    for(const doc of pdfDocs){const data=await zip.read(doc.path);if(!data)throw new Error(`Falta o ficheiro “${doc.path}” indicado na referência dos documentos.`);if(data.length<5||String.fromCharCode(...data.slice(0,5))!=='%PDF-')throw new Error(`O ficheiro “${doc.name}” não parece ser um PDF válido.`);const blob=new Blob([data],{type:'application/pdf'});pdfRecords.push({id:doc.pdfId,itemId:doc.itemId,name:doc.name,type:'application/pdf',size:blob.size,addedAt:doc.addedAt||new Date().toISOString(),blob})}
    for(const doc of catalogDocs){const data=await zip.read(doc.path);if(!data)throw new Error(`Falta o ficheiro de catálogo “${doc.path}” indicado na referência.`);const blob=new Blob([data],{type:doc.type||'application/octet-stream'});catalogRecords.push({id:doc.catalogId,supplierId:doc.supplierId,name:doc.name,type:doc.type||blob.type||'application/octet-stream',size:blob.size,addedAt:doc.addedAt||new Date().toISOString(),blob})}
    await new Promise((resolve,reject)=>{const tx=db.transaction(['inventoryPdfs','catalogs'],'readwrite'),pdfStore=tx.objectStore('inventoryPdfs'),catalogStore=tx.objectStore('catalogs');pdfStore.clear();catalogStore.clear();for(const d of pdfRecords)pdfStore.put(d);for(const d of catalogRecords)catalogStore.put(d);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Não foi possível guardar os documentos restaurados.'));tx.onabort=()=>reject(tx.error||new Error('A restauração dos documentos foi cancelada pelo navegador.'))});
    return {pdfCount:pdfRecords.length,catalogCount:catalogRecords.length};
  }
  async function mxImportCompleteBackup(file){
    const zip=await mxBackupReadZip(file),dataBytes=await zip.read('dados.json'),refBytes=await zip.read('referencia_documentos.json');
    if(!dataBytes||!refBytes)throw new Error('Este ZIP não contém dados.json e referencia_documentos.json. Selecione uma cópia completa criada pela aplicação.');
    const data=JSON.parse(new TextDecoder('utf-8').decode(dataBytes)),ref=JSON.parse(new TextDecoder('utf-8').decode(refBytes));
    if(data.app!=='Gestão de Manutenção OT'||data.backupType!=='complete'||!Array.isArray(data.orders)||!Array.isArray(data.inventory)||!Array.isArray(data.suppliers)||!Array.isArray(data.purchases))throw new Error('O ficheiro não tem o formato de cópia completa esperado.');
    if(ref.app!=='Gestão de Manutenção OT'||!Array.isArray(ref.documents))throw new Error('O ficheiro de referência dos PDFs não é válido.');
    const inventoryIds=new Set(data.inventory.map(x=>String(x.id))),supplierIds=new Set(data.suppliers.map(x=>String(x.id))),metaPdfs=new Set(),metaCatalogs=new Set();let pdfMetaCount=0,catalogMetaCount=0;
    for(const item of data.inventory){for(const p of (Array.isArray(item.pdfs)?item.pdfs:[])){pdfMetaCount++;metaPdfs.add(`${String(item.id)}\n${String(p.id)}`)}}
    for(const sup of data.suppliers){for(const c of (Array.isArray(sup.catalogs)?sup.catalogs:[])){catalogMetaCount++;metaCatalogs.add(`${String(sup.id)}\n${String(c.id)}`)}}
    const seenRefs=new Set();for(const doc of ref.documents){const key=`${String(doc.itemId)}\n${String(doc.pdfId)}`;if(!inventoryIds.has(String(doc.itemId)))throw new Error(`O PDF “${doc.name}” aponta para um artigo de inventário que não existe na cópia.`);if(seenRefs.has(key))throw new Error('A referência dos documentos contém um PDF duplicado.');seenRefs.add(key);if(!metaPdfs.has(key))throw new Error(`O PDF “${doc.name}” não está ligado aos dados do artigo no ficheiro dados.json.`);if(!zip.entries.has(doc.path))throw new Error(`Falta o PDF “${doc.name}” no ZIP.`)}
    if(ref.documents.length!==pdfMetaCount)throw new Error('O número de PDFs em dados.json não coincide com o ficheiro de referência. A cópia parece incompleta.');
    const catalogDocs=Array.isArray(ref.catalogDocuments)?ref.catalogDocuments:[],seenCatalogRefs=new Set();for(const doc of catalogDocs){const key=`${String(doc.supplierId)}\n${String(doc.catalogId)}`;if(!supplierIds.has(String(doc.supplierId)))throw new Error(`O ficheiro “${doc.name}” aponta para um fornecedor que não existe na cópia.`);if(seenCatalogRefs.has(key))throw new Error('A referência dos catálogos contém um ficheiro duplicado.');seenCatalogRefs.add(key);if(!metaCatalogs.has(key))throw new Error(`O ficheiro “${doc.name}” não está ligado ao fornecedor no ficheiro dados.json.`);if(!zip.entries.has(doc.path))throw new Error(`Falta o ficheiro “${doc.name}” no ZIP.`)}
    if(catalogDocs.length!==catalogMetaCount)throw new Error('O número de catálogos em dados.json não coincide com o ficheiro de referência. A cópia parece incompleta.');
    // Validar todos os ficheiros antes de pedir a confirmação. Nenhum dado atual é alterado nesta fase.
    for(const doc of ref.documents){const bytes=await zip.read(doc.path);if(!bytes||bytes.length<5||String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw new Error(`O documento “${doc.name}” está ausente ou não é um PDF válido.`)}
    for(const doc of catalogDocs){const bytes=await zip.read(doc.path);if(!bytes)throw new Error(`O ficheiro de fornecedor “${doc.name}” está ausente ou danificado.`)}
    const summary=`A cópia contém:\n• ${data.orders.length} ordem(ns) de trabalho\n• ${data.inventory.length} artigo(s) de inventário\n• ${data.suppliers.length} fornecedor(es)\n• ${data.purchases.length} compra(s)\n• ${ref.documents.length} PDF(s) anexado(s)\n• ${catalogDocs.length} ficheiro(s) de catálogo\n\nAo confirmar, estes registos substituirão os dados atualmente guardados neste navegador. Os PDFs serão guardados e associados novamente aos artigos correspondentes. Esta ação não pode ser anulada; exporte primeiro uma cópia dos dados atuais se precisar de os conservar.`;
    ask('Restaurar cópia de segurança completa',summary,async()=>{
      try{
        // Guardar os documentos no IndexedDB numa transação antes de trocar os registos principais.
        const restoredDocs=await mxReplaceDocumentStores(ref.documents,catalogDocs,zip);
        orders=data.orders; purchases=data.purchases; inventoryItems=data.inventory.map(item=>({...item,suppliers:Array.isArray(item.suppliers)?item.suppliers:[],pdfs:(Array.isArray(item.pdfs)?item.pdfs:[]).map(p=>{const d=ref.documents.find(x=>String(x.itemId)===String(item.id)&&String(x.pdfId)===String(p.id));return {...p,...(d?{itemId:d.itemId,name:d.name,type:'application/pdf',size:d.size,addedAt:d.addedAt||p.addedAt}:{}),dataUrl:undefined,blob:undefined}})}));
        supplierRecords=data.suppliers.map(s=>({...s,catalogs:Array.isArray(s.catalogs)?s.catalogs:[]}));
        // Limpar campos internos da interface, gravar todos os registos e recuperar as preferências/dados auxiliares.
        currentId=null;purchaseId=null;
        const coreValues={gestao_manutencao_ot_v1:JSON.stringify(orders),gestao_manutencao_compras_v1:JSON.stringify(purchases),gestao_manutencao_inventory_v1:JSON.stringify(inventoryItems),gestao_manutencao_suppliers_v1:JSON.stringify(supplierRecords)};
        for(const key of Object.keys(coreValues))localStorage.setItem(key,coreValues[key]);
        const extras=data.localStorageExtras&&typeof data.localStorageExtras==='object'?data.localStorageExtras:{};
        const currentExtraKeys=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key&&key.startsWith('gestao_manutencao_')&&!mxBackupCoreKeys.has(key))currentExtraKeys.push(key)}
        for(const key of currentExtraKeys){if(!Object.prototype.hasOwnProperty.call(extras,key))localStorage.removeItem(key)}
        for(const key of Object.keys(extras)){if(key.startsWith('gestao_manutencao_')&&!mxBackupCoreKeys.has(key)&&typeof extras[key]==='string')localStorage.setItem(key,extras[key])}
        saveLocal();saveModuleData();resetPurchaseForm();renderAll();renderInventory();renderSuppliers();go('dashboard');
        toast(`Restauro concluído: ${orders.length} OT(s), ${inventoryItems.length} artigo(s), ${purchases.length} compra(s), ${supplierRecords.length} fornecedor(es), ${restoredDocs.pdfCount} PDF(s) e ${restoredDocs.catalogCount} ficheiro(s) de fornecedor.`);
      }catch(err){console.error('Erro ao restaurar cópia ZIP:',err);toast(err?.message||'O restauro falhou. Os dados não foram totalmente restaurados.')} 
    });
  }
  const mxLegacyImportAnyFile=importAnyFile;
  importAnyFile=async function(file){if(!file)return;if(/\.zip$/i.test(file.name||'')){try{await mxImportCompleteBackup(file)}catch(err){console.error('Erro na leitura da cópia ZIP:',err);toast(err?.message||'Não foi possível ler a cópia de segurança ZIP.')}return}return mxLegacyImportAnyFile(file)};
  const importPicker=$('importFile');if(importPicker){importPicker.accept='.zip,.json,.csv,.txt,.xlsx,.xls,application/zip,application/json,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'}
  const fullExportButton=$('exportJsonChoice');if(fullExportButton){fullExportButton.innerHTML='▣ &nbsp; Cópia completa (ZIP + PDFs)';fullExportButton.title='Inclui todos os registos e os PDFs anexados ao inventário';}
})();
