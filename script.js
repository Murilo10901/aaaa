
(() => {
  const BOOT = window.APP_BOOTSTRAP || {};
  const STORAGE_KEY = BOOT.cacheKey || 'aaa_finance_v3_local';
  const $ = (s, root=document)=> typeof root === 'string' ? document.querySelector(root).querySelector(s) : root.querySelector(s);
  const $$ = (s, root=document)=>[...(typeof root === 'string' ? document.querySelector(root).querySelectorAll(s) : root.querySelectorAll(s))];
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const today=()=>new Date().toISOString().slice(0,10);
  const monthKey=()=>new Date().toISOString().slice(0,7);
  const state = normalize(loadInitial());
  let saveTimer=null;
  let activeScreen=state.activeScreen||'home';
  let openSummaryAccordion = null;

  function loadInitial(){
    try { return BOOT.initialState || JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch { return {}; }
  }
  function normalize(s){
    const now=monthKey();
    return {
      theme:s.theme||'dark',
      activeScreen:s.activeScreen||'home',
      selectedMonthKey:s.selectedMonthKey||s.selectedMonth||now,
      selectedCardId:s.selectedCardId||'',
      profile:{name:s.profile?.name||s.profile?.display_name||'Matheus', email:s.profile?.email||BOOT.user?.email||'', photo:s.profile?.photo||''},
      cards:Array.isArray(s.cards)?s.cards.map(c=>({...c,id:c.id||uid(),bank:c.bank||'Conta',name:c.name||'Principal',dueDay:c.dueDay||10,closingDay:c.closingDay||25,openingBalance:Number(c.openingBalance||0),color:c.color||'#7c3aed'})):[],
      counterparties:Array.isArray(s.counterparties)?s.counterparties:[],
      months:s.months&&typeof s.months==='object'?s.months:{}
    };
  }
  function ensureMonth(k=state.selectedMonthKey){
    if(!state.months[k]) state.months[k]={openingBalance:0,incomes:[],outflows:[],cardPurchases:[],manualInvoices:{},saveGoal:0,savedThisMonth:0};
    const m=state.months[k];
    m.incomes=Array.isArray(m.incomes)?m.incomes:[];
    m.outflows=Array.isArray(m.outflows)?m.outflows:[];
    m.cardPurchases=Array.isArray(m.cardPurchases)?m.cardPurchases:[];
    m.manualInvoices=m.manualInvoices||{};
    return m;
  }
  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  function parseMoney(v){return Number(String(v||'').replace(/\s/g,'').replace(/R\$/gi,'').replace(/\./g,'').replace(',','.'))||0;}
  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function counterpartyName(id){return state.counterparties.find(c=>c.id===id)?.name||'';}
  function counterpartyOptions(selected=''){
    return '<option value="">Sem vínculo</option>'+state.counterparties.map(c=>`<option value="${esc(c.id)}" ${selected===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  }
  function activeCard(){return state.cards.find(c=>c.id===state.selectedCardId)||null;}
  function selectedCardLabel(){const c=activeCard(); return c?`${c.bank||'Conta'} • ${c.name||'Principal'}`:'Todas as contas';}
  function cardOptions(selected=state.selectedCardId, includeAll=false){
    const first = includeAll?'<option value="">Todas as contas</option>':'<option value="">Sem conta específica</option>';
    return first+state.cards.map(c=>`<option value="${esc(c.id)}" ${selected===c.id?'selected':''}>${esc(c.bank||'Conta')} • ${esc(c.name||'Principal')}</option>`).join('');
  }
  function matchesSelectedCard(x){return !state.selectedCardId || x.accountId===state.selectedCardId || x.cardId===state.selectedCardId;}
  function setSelectedCard(cardId){state.selectedCardId=cardId||''; save(); render();}
  function accountSelectorHtml(){
    const active=state.selectedCardId||'';
    const chips=[`<button class="account-chip ${!active?'active':''}" data-select-card=""><span>◎</span><strong>Todas</strong><small>Visão geral</small></button>`]
      .concat(state.cards.map(c=>`<button class="account-chip ${active===c.id?'active':''}" data-select-card="${esc(c.id)}"><span>💳</span><strong>${esc(c.bank||'Conta')}</strong><small>${esc(c.name||'Principal')}</small></button>`));
    return `<section class="account-strip"><div class="account-strip-head"><div><strong>Conta selecionada</strong><small>${esc(selectedCardLabel())}</small></div><button class="btn soft mini" data-action-card="new">+ Conta/cartão</button></div><div class="account-chips">${chips.join('')}</div></section>`;
  }
  function cardOpeningForSelected(k=state.selectedMonthKey){const c=activeCard(); return c?Number(c.openingBalance||0):Number(ensureMonth(k).openingBalance||0);}
  function cardBalance(cardId,k=state.selectedMonthKey){const prev=state.selectedCardId; state.selectedCardId=cardId||''; const t=totals(k); state.selectedCardId=prev; return t.balance;}
  function monthLabel(k){const [y,m]=k.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'short',year:'numeric'}).replace('.','');}
  function longDate(date){try{return new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit'});}catch{return date}}
  function shiftMonth(k,o){const [y,m]=k.split('-').map(Number);const d=new Date(y,m-1+o,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
  function allMonthKeys(){const keys=Object.keys(state.months); if(!keys.includes(state.selectedMonthKey)) keys.push(state.selectedMonthKey); return [...new Set(keys)].sort();}
  function installmentAmounts(total,count){count=Math.max(1,Number(count||1)); const cents=Math.round(Number(total||0)*100); const base=Math.floor(cents/count); const rem=cents%count; return Array.from({length:count},(_,i)=>(base+(i<rem?1:0))/100);}
  function cardInstallmentsForMonth(k,cardId='all'){
    const rows=[]; Object.entries(state.months).forEach(([origin,m])=>{ensureMonth(origin).cardPurchases.forEach(p=>{if(cardId!=='all'&&p.cardId!==cardId)return; installmentAmounts(p.totalAmount,p.installmentCount||1).forEach((amt,i)=>{if(shiftMonth(origin,i)===k) rows.push({...p, amount:amt, type:'card', installment:`${i+1}/${p.installmentCount||1}`});});});}); return rows;
  }
  function totals(k=state.selectedMonthKey){
    const m=ensureMonth(k);
    const income=m.incomes.filter(x=>matchesSelectedCard(x)&&x.status!=='not_received').reduce((a,x)=>a+Number(x.amount||0),0);
    const out=m.outflows.filter(x=>matchesSelectedCard(x)&&x.status!=='not_paid').reduce((a,x)=>a+Number(x.amount||0),0);
    const cards=cardInstallmentsForMonth(k,state.selectedCardId||'all').reduce((a,x)=>a+Number(x.amount||0),0);
    const opening=cardOpeningForSelected(k);
    const balance=opening+income-out-cards-Number(m.savedThisMonth||0);
    return {opening,income,out,cards,balance,expenses:out+cards,saved:Number(m.savedThisMonth||0),saveGoal:Number(m.saveGoal||0)}
  }
  function save(){
    state.activeScreen=activeScreen; ensureMonth();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    showSync('Salvando...','syncing');
    clearTimeout(saveTimer);
    saveTimer=setTimeout(async()=>{
      try{if(BOOT.saveState) await BOOT.saveState(state); showSync('Salvo','saved',1200);}
      catch(e){console.error(e); showSync('Erro ao salvar','error',2200);}
    },650);
  }
  function showSync(txt,type,hide=0){const b=$('#syncStatusBadge'); if(!b)return; b.textContent=txt;b.className='sync-status-badge '+type; if(hide) setTimeout(()=>b.classList.add('hidden'),hide)}
  function setScreen(screen){
    activeScreen=screen;
    $$('.seg-tab,.bottom-item,.rail-btn').forEach(b=>b.classList.toggle('active',b.dataset.screen===screen));
    closeFab(); render(); save();
  }

  function bindDynamicHandlers(root=document){
    const scope = root || document;
    $$('[data-select-card]', scope).forEach(b=>{
      if(b.dataset.boundSelectCard==='1') return;
      b.dataset.boundSelectCard='1';
      b.onclick=(e)=>{e.preventDefault();e.stopPropagation(); setSelectedCard(b.dataset.selectCard||'');};
    });
    $$('[data-card-detail]', scope).forEach(b=>{
      if(b.dataset.boundCardDetail==='1') return;
      b.dataset.boundCardDetail='1';
      b.onclick=(e)=>{e.preventDefault();e.stopPropagation(); openCardDetail(b.dataset.cardDetail);};
    });
    $$('[data-action-card="new"]', scope).forEach(b=>{
      if(b.dataset.boundNewCard==='1') return;
      b.dataset.boundNewCard='1';
      b.onclick=(e)=>{e.preventDefault();e.stopPropagation(); openAction('card');};
    });
  }

  function render(){
    document.body.classList.toggle('theme-light',state.theme==='light'); ensureMonth();
    $('#monthLabelTop').textContent=monthLabel(state.selectedMonthKey);
    if(activeScreen==='home') renderHome();
    if(activeScreen==='transactions') renderTransactions();
    if(activeScreen==='planning') renderPlanning();
    if(activeScreen==='more') renderMore();
    if(activeScreen==='cards') renderCardsManager();
    bindDynamicHandlers();
  }
  function title(h,p=''){ $('#screenTitle').innerHTML=`<h1>${h}</h1>${p?`<p>${p}</p>`:''}`; }
  function renderHome(){
    const t=totals();
    const c=activeCard();
    title(`Olá, ${state.profile.name||'você'}`, state.selectedCardId?`Visão da conta ${selectedCardLabel()}.`:'Visão rápida do seu mês financeiro.');
    $('#appContent').innerHTML=`
    ${accountSelectorHtml()}
    <section class="hero-card"><div class="hero-row"><div><span class="balance-label">Saldo fim do mês</span><div class="balance-value">${money(t.balance)}</div><p class="muted">${state.selectedCardId?'Dados filtrados pela conta/cartão selecionado.':'Receitas, despesas, cartões e dinheiro guardado no mês.'}</p><div class="balance-subgrid"><div class="mini-kpi"><span>Receitas</span><strong style="color:var(--green)">${money(t.income)}</strong></div><div class="mini-kpi"><span>Despesas</span><strong style="color:var(--red)">${money(t.expenses)}</strong></div></div></div><button class="fake-card clickable" ${c?`data-card-detail="${esc(c.id)}"`:''}><div class="chip"></div><div><small>${c?'Conta/cartão selecionado':'Visão geral'}</small><div class="card-number">${c?esc(c.bank||'Conta'):'AAA FINANCE'}</div></div><div class="card-bottom"><div><small>${c?'Nome':'Usuário'}</small><strong>${c?esc(c.name||'Principal'):esc(state.profile.name||'Usuário')}</strong></div><div><small>Saldo</small><strong>${money(t.balance)}</strong></div></div></button></div></section>
    <section class="quick-grid"><button class="quick-card" data-qa="income"><i>＋</i><strong>Receita</strong></button><button class="quick-card" data-qa="expense"><i>−</i><strong>Despesa</strong></button><button class="quick-card" data-qa="card"><i>💳</i><strong>Cartão</strong></button><button class="quick-card" data-qa="counterparty"><i>👥</i><strong>Devedores</strong></button></section>
    <section class="panel"><div class="panel-head"><div><h2>Últimas transações</h2><p class="muted">${esc(selectedCardLabel())}</p></div><button class="btn soft" id="seeAllTx">Ver tudo</button></div><div class="transaction-list">${txListHtml(6)}</div></section>`;
    $$('[data-qa]').forEach(b=>b.onclick=()=>openAction(b.dataset.qa)); $('#seeAllTx').onclick=()=>setScreen('transactions');
  }
  function combinedRows(k=state.selectedMonthKey){
    const m=ensureMonth(k); const rows=[];
    m.incomes.filter(matchesSelectedCard).forEach(x=>rows.push({...x,type:'in',source:'income',txId:x.id,monthKey:k,amount:Number(x.amount||0),title:x.description||'Receita'}));
    m.outflows.filter(matchesSelectedCard).forEach(x=>rows.push({...x,type:'out',source:'outflow',txId:x.id,monthKey:k,amount:Number(x.amount||0),title:x.description||'Despesa'}));
    cardInstallmentsForMonth(k,state.selectedCardId||'all').forEach(x=>rows.push({...x,type:'card',source:'card',txId:x.purchaseId||x.id,monthKey:k,title:x.description||'Cartão'}));
    return rows.sort((a,b)=>String(b.date||b.purchaseDate||'').localeCompare(String(a.date||a.purchaseDate||'')));
  }
  function txListHtml(limit=999){
    let rows=combinedRows(); if(limit) rows=rows.slice(0,limit);
    if(!rows.length)return '<div class="empty">Nenhum lançamento nesse mês. Clique no + para cadastrar.</div>';
    let html='', last='';
    rows.forEach(r=>{
      const d=r.date||r.purchaseDate||`${state.selectedMonthKey}-01`;
      if(d!==last){html+=`<div class="day-title">${longDate(d)}</div>`; last=d;}
      const cls=r.type==='in'?'in':(r.type==='card'?'card':'out');
      const sign=r.type==='in'?'+':'-';
      const cp=r.counterpartyId?counterpartyName(r.counterpartyId):'';
      const meta=[r.category||'Outros', r.type==='card'?'Cartão':(r.method||'Carteira'), cp?`Devedor: ${cp}`:''].filter(Boolean).join(' | ');
      html+=`<div class="tx-row clickable" data-tx-id="${esc(r.txId||r.id)}" data-tx-source="${esc(r.source||r.type)}" data-tx-month="${esc(r.monthKey||state.selectedMonthKey)}"><div class="tx-ico ${cls}">${r.type==='in'?'↗':r.type==='card'?'💳':'↘'}</div><div class="tx-main"><strong>${esc(r.title)}</strong><small>${esc(meta)}${r.installment?' • '+esc(r.installment):''}</small></div><div class="tx-value ${r.type==='in'?'in':'out'}">${sign} ${money(r.amount)}<span class="check">✓</span></div></div>`;
    }); return html;
  }
  function renderTransactions(){
    const t=totals();
    title('Transações','Lista por dia, com controle mensal igual app.');
    $('#appContent').innerHTML=`${accountSelectorHtml()}<section class="panel"><div class="balance-subgrid"><div class="mini-kpi"><span>Saldo fim do mês</span><strong style="color:var(--green)">${money(t.balance)}</strong></div><div class="mini-kpi"><span>Balanço mensal</span><strong>${money(t.income-t.expenses)}</strong></div></div></section><section class="panel"><div class="panel-head"><div><h2>${monthLabel(state.selectedMonthKey)}</h2><p class="muted">Receitas, despesas e cartões</p></div><button class="btn primary" id="addTxTop">Adicionar</button></div><div class="transaction-list">${txListHtml()}</div></section>`;
    $('#addTxTop').onclick=toggleFab;
  }
  function renderPlanning(){
    const t=totals(); title('Planejamento e resumos','Gráficos e leituras por categoria, cartões e período.');
    $('#appContent').innerHTML=`<section class="summary-grid"><div class="panel canvas-card"><h2>Receitas vs Despesas</h2><canvas id="pieChart" class="chart-canvas"></canvas></div><div class="panel canvas-card"><h2>Evolução do mês</h2><canvas id="barChart" class="chart-canvas"></canvas></div></section><section class="panel"><h2>Escolha um resumo</h2><div class="accordion-menu">${summaryAccordionItem('cards','Resumo por cartão','Faturas e parcelas do mês')}${summaryAccordionItem('cat','Gastos por categoria','Onde o dinheiro saiu')}${summaryAccordionItem('debt','Devedores e pendências','A receber e a pagar')}</div></section>`;
    drawPie('pieChart',t.income,t.expenses); drawBars('barChart'); $$('[data-accordion]').forEach(b=>b.onclick=()=>toggleSummaryAccordion(b.dataset.accordion));
  }
  function summaryAccordionItem(type,label,subtitle){
    const isOpen = openSummaryAccordion===type;
    return `<div class="accordion-item ${isOpen?'open':''}" data-acc="${type}"><button class="list-btn ${isOpen?'active':''}" data-accordion="${type}" aria-expanded="${isOpen}"><span><strong>${label}</strong><small>${subtitle}</small></span><b>›</b></button><div class="accordion-body">${isOpen?summaryDetailHtml(type):''}</div></div>`;
  }
  function toggleSummaryAccordion(type){
    openSummaryAccordion = openSummaryAccordion===type ? null : type;
    renderPlanning();
  }
  function summaryDetailHtml(type){
    if(type==='cards') return cardListHtml();
    if(type==='cat'){const map={}; combinedRows().filter(x=>x.type!=='in').forEach(x=>map[x.category||'Outros']=(map[x.category||'Outros']||0)+x.amount); return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="tx-row"><div class="tx-ico out">%</div><div class="tx-main"><strong>${k}</strong><small>Categoria</small></div><div class="tx-value out">${money(v)}</div></div>`).join('')||'<div class="empty">Sem despesas.</div>';}
    if(type==='debt') return counterpartyHtml();
    return '';
  }
  function renderSummaryDetail(type){
    toggleSummaryAccordion(type);
  }
  function getCounterpartyResume(id,cardId=state.selectedCardId){
    let receivable=0,payable=0,received=0,paid=0,count=0;
    Object.values(state.months||{}).forEach(m=>{
      (m.incomes||[]).forEach(x=>{if(x.counterpartyId!==id)return; if(cardId&&x.accountId!==cardId)return; count++; if(x.status==='received') received+=Number(x.amount||0); else receivable+=Number(x.amount||0);});
      (m.outflows||[]).forEach(x=>{if(x.counterpartyId!==id)return; if(cardId&&x.accountId!==cardId)return; count++; if(x.status==='paid') paid+=Number(x.amount||0); else payable+=Number(x.amount||0);});
    });
    return {receivable,payable,received,paid,count,balance:receivable-payable};
  }
  function counterpartyHtml(){
    if(!state.counterparties.length)return '<div class="empty">Nenhum devedor/empresa cadastrado. Clique no + e escolha Devedor.</div>';
    const rows=state.counterparties.map(c=>{const r=getCounterpartyResume(c.id); return {c,r};}).filter(x=>!state.selectedCardId||x.r.count>0);
    if(!rows.length)return `<div class="empty">Nenhum devedor vinculado a ${esc(selectedCardLabel())}.</div>`;
    return rows.map(({c,r})=>`<div class="tx-row clickable debtor-row" data-cp-open="${esc(c.id)}"><div class="tx-ico in">👥</div><div class="tx-main"><strong>${esc(c.name)}</strong><small>${esc(c.note||'Pendência')} • ${r.count} lançamento(s) • saldo pendente ${money(r.balance)}</small></div><div class="debtor-actions"><button type="button" class="btn soft" data-cp-open="${esc(c.id)}">Ver</button><button type="button" class="btn danger" data-delcp="${esc(c.id)}">Excluir</button></div></div>`).join('');
  }
  function deleteCounterparty(id){
    const cp=state.counterparties.find(c=>c.id===id); if(!cp)return;
    const linked = counterpartyRows(id,true).length;
    const message = linked>0
      ? `Excluir ${cp.name}? Existem ${linked} lançamento(s) vinculados. O histórico financeiro será mantido, mas ficará sem vínculo.`
      : `Excluir ${cp.name}?`;
    if(!confirm(message))return;
    Object.values(state.months||{}).forEach(m=>{
      (m.incomes||[]).forEach(x=>{ if(x.counterpartyId===id) x.counterpartyId=''; });
      (m.outflows||[]).forEach(x=>{ if(x.counterpartyId===id) x.counterpartyId=''; });
    });
    state.counterparties=state.counterparties.filter(c=>c.id!==id);
    save(); render();
  }
  function cardListHtml(){
    if(!state.cards.length)return '<div class="empty">Nenhuma conta/cartão cadastrado. Clique em Cartões para criar.</div>';
    return `<div class="card-account-grid">${state.cards.map(c=>{const prev=state.selectedCardId; state.selectedCardId=c.id; const t=totals(); state.selectedCardId=prev; return `<button class="account-card ${prev===c.id?'active':''}" data-card-detail="${esc(c.id)}"><span>💳</span><strong>${esc(c.bank||'Conta')} • ${esc(c.name||'Principal')}</strong><small>Vence dia ${esc(c.dueDay||'-')} • Saldo ${money(t.balance)}</small></button>`;}).join('')}</div>`;
  }
  function renderCardsManager(){
    title('Cartões e contas','Escolha uma conta para filtrar todo o app ou clique para ver o resumo.');
    $('#appContent').innerHTML=`${accountSelectorHtml()}<section class="panel"><div class="panel-head"><div><h2>Suas contas/cartões</h2><p class="muted">Cada cartão funciona como uma conta dentro do app.</p></div><button class="btn primary" id="newCardBtn">+ Nova conta</button></div>${cardListHtml()}</section>`;
    $('#newCardBtn').onclick=()=>openAction('card');
  }
  function renderMore(){
    title('Mais','Configurações, devedores, cartões e dados.');
    $('#appContent').innerHTML=`<section class="panel"><h2>Configurações</h2><div class="list-menu"><button class="list-btn" id="themeBtn"><span><strong>Modo ${state.theme==='dark'?'claro':'escuro'}</strong><small>Alterar visual do app</small></span><b>☼</b></button><button class="list-btn" id="profileBtn"><span><strong>Perfil</strong><small>Nome e saldo inicial</small></span><b>›</b></button><button class="list-btn" id="cardBtn"><span><strong>Cartões</strong><small>Criar ou editar cartões</small></span><b>›</b></button><button class="list-btn" id="counterBtn"><span><strong>Devedores / empresas</strong><small>A receber e a pagar</small></span><b>›</b></button><button class="list-btn" id="exportBtn"><span><strong>Exportar resumo</strong><small>Copiar texto do mês</small></span><b>⧉</b></button><button class="list-btn" id="logoutBtn"><span><strong>Sair da conta</strong><small>Encerrar sessão</small></span><b>↪</b></button></div></section><section class="panel"><h2>Contas/cartões cadastrados</h2>${cardListHtml()}</section><section class="panel"><h2>Devedores cadastrados</h2><p class="muted">${esc(selectedCardLabel())}</p><div id="debtList">${counterpartyHtml()}</div></section>`;
    $('#themeBtn').onclick=toggleTheme; $('#profileBtn').onclick=openProfile; $('#cardBtn').onclick=()=>{activeScreen='cards'; renderCardsManager(); save();}; $('#counterBtn').onclick=()=>openAction('counterparty'); $('#exportBtn').onclick=copySummary; $('#logoutBtn').onclick=logout;
    bindDynamicHandlers($('#appContent'));
  }
  function drawPie(id,a,b){
    const c=$('#'+id); if(!c)return; const ctx=c.getContext('2d'); c.width=c.clientWidth*devicePixelRatio; c.height=c.clientHeight*devicePixelRatio; ctx.scale(devicePixelRatio,devicePixelRatio);
    const cx=c.clientWidth/2,cy=c.clientHeight/2+10,r=Math.min(cx,cy)-26,total=Math.max(a+b,1); let start=-Math.PI/2;
    [[a,'#60a5fa'],[b,'#7c3aed']].forEach(([val,col])=>{ctx.beginPath();ctx.moveTo(cx,cy);ctx.fillStyle=col;ctx.arc(cx,cy,r,start,start+(val/total)*Math.PI*2);ctx.fill();start+=(val/total)*Math.PI*2;});
    ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--text');ctx.font='800 16px Inter';ctx.textAlign='center';ctx.fillText(money(a-b),cx,cy+5);
  }
  function drawBars(id){
    const c=$('#'+id);if(!c)return;const ctx=c.getContext('2d');c.width=c.clientWidth*devicePixelRatio;c.height=c.clientHeight*devicePixelRatio;ctx.scale(devicePixelRatio,devicePixelRatio);
    const keys=allMonthKeys().slice(-6),vals=keys.map(k=>totals(k).expenses),max=Math.max(...vals,1);
    keys.forEach((k,i)=>{const bw=(c.clientWidth-40)/keys.length-10,x=20+i*((c.clientWidth-40)/keys.length),bh=(vals[i]/max)*(c.clientHeight-54);ctx.fillStyle='#7c3aed';ctx.beginPath();ctx.roundRect?ctx.roundRect(x,c.clientHeight-32-bh,bw,bh,8):ctx.rect(x,c.clientHeight-32-bh,bw,bh);ctx.fill();ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--muted');ctx.font='11px Inter';ctx.textAlign='center';ctx.fillText(monthLabel(k).split(' ')[0],x+bw/2,c.clientHeight-10);});
  }
  function openModal(titleText,body,eyebrow='Cadastro'){
    $('#modalTitle').textContent=titleText; $('#modalEyebrow').textContent=eyebrow; $('#modalBody').innerHTML=body; $('#modalRoot').classList.remove('hidden'); $('#closeModalBtn').onclick=closeModal; $('#modalRoot .modal-backdrop').onclick=closeModal;
  }
  function closeModal(){ $('#modalRoot').classList.add('hidden'); $('#modalBody').innerHTML='';}
  function openAction(type){closeFab(); if(type==='income'||type==='expense') openTxForm(type); if(type==='card') openCardForm(); if(type==='counterparty') openCounterpartyForm();}
  function openTxForm(type){
    const isIn=type==='income';
    openModal(isIn?'Adicionar receita':'Adicionar despesa',`<div class="form-grid"><div class="field"><label>Data</label><input id="fDate" type="date" value="${today()}"></div><div class="field"><label>Descrição</label><input id="fDesc" placeholder="Ex.: Mercado, salário, pix..."></div><div class="field"><label>Valor</label><input id="fAmount" placeholder="R$ 0,00"></div><div class="field"><label>Categoria</label><select id="fCat"><option>Alimentação</option><option>Salário</option><option>Transporte</option><option>Lazer</option><option>Moradia</option><option>Serviços</option><option>Investimento</option><option>Outros</option></select></div><div class="field"><label>Conta/cartão</label><select id="fAccount">${cardOptions(state.selectedCardId,false)}</select></div><div class="field"><label>Vincular a devedor / empresa</label><select id="fCounterparty">${counterpartyOptions()}</select></div><div class="field"><label>Status</label><select id="fStatus">${isIn?'<option value="received">Recebido</option><option value="pending">Pendente</option><option value="not_received">Não recebido</option>':'<option value="paid">Pago</option><option value="pending">Pendente</option><option value="not_paid">Não pago</option>'}</select></div><div class="field"><label>Observação / origem</label><textarea id="fNote" rows="3" placeholder="Ex.: combinado pelo WhatsApp, parcela 1, pagamento de cliente..."></textarea></div><button id="saveTx" class="btn primary">Salvar</button></div>`);
    $('#saveTx').onclick=()=>{const k=$('#fDate').value.slice(0,7)||state.selectedMonthKey; ensureMonth(k); const item={id:uid(),date:$('#fDate').value||today(),description:$('#fDesc').value|| (isIn?'Receita':'Despesa'),amount:parseMoney($('#fAmount').value),category:$('#fCat').value,status:$('#fStatus').value||(isIn?'received':'paid'),method:'Carteira',accountId:$('#fAccount').value||state.selectedCardId||'',counterpartyId:$('#fCounterparty').value||'',note:$('#fNote').value.trim()}; if(item.amount<=0)return alert('Digite um valor maior que zero.'); (isIn?state.months[k].incomes:state.months[k].outflows).push(item); state.selectedMonthKey=k; closeModal(); save(); render();};
  }
  function openCardForm(){
    openModal('Conta / cartão',`<div class="form-grid two"><div class="field"><label>Banco / nome da conta</label><input id="cardBank" placeholder="Nubank, Bradesco, Carteira..."></div><div class="field"><label>Apelido</label><input id="cardName" placeholder="Principal"></div><div class="field"><label>Saldo inicial dessa conta</label><input id="cardOpening" placeholder="R$ 0,00"></div><div class="field"><label>Vence dia</label><input id="cardDue" type="number" value="10"></div><div class="field"><label>Compra do mês nessa conta/cartão</label><input id="cardPurchase" placeholder="R$ 0,00"></div><div class="field"><label>Descrição da compra</label><input id="cardDesc" placeholder="Compra no cartão"></div><div class="field"><label>Parcelas</label><input id="cardParc" type="number" value="1"></div><button id="saveCard" class="btn primary">Salvar conta/cartão</button></div>`);
    $('#saveCard').onclick=()=>{let card=state.cards.find(c=>(c.bank||'').toLowerCase()===$('#cardBank').value.toLowerCase()&&(c.name||'').toLowerCase()===$('#cardName').value.toLowerCase()); if(!card){card={id:uid(),bank:$('#cardBank').value||'Conta',name:$('#cardName').value||'Principal',dueDay:Number($('#cardDue').value||10),closingDay:25,openingBalance:parseMoney($('#cardOpening').value),color:'#7c3aed'}; state.cards.push(card);} else {card.openingBalance=parseMoney($('#cardOpening').value)||Number(card.openingBalance||0); card.dueDay=Number($('#cardDue').value||card.dueDay||10);} const amount=parseMoney($('#cardPurchase').value); if(amount>0){const m=ensureMonth(); m.cardPurchases.push({id:uid(),cardId:card.id,purchaseDate:today(),description:$('#cardDesc').value||'Compra no cartão',totalAmount:amount,installmentCount:Math.max(1,Number($('#cardParc').value||1)),category:'Cartão'});} state.selectedCardId=card.id; closeModal(); save(); render();};
  }
  function openCounterpartyForm(){
    openModal('Devedor / empresa',`<div class="form-grid"><div class="field"><label>Nome</label><input id="cpName" placeholder="Ex.: João, Cliente, Empresa"></div><div class="field"><label>Observação</label><input id="cpNote" placeholder="Ex.: Me deve / Eu devo"></div><button id="saveCp" class="btn primary">Salvar devedor</button></div>`);
    $('#saveCp').onclick=()=>{const name=$('#cpName').value.trim(); if(!name)return alert('Digite um nome.'); state.counterparties.push({id:uid(),name,note:$('#cpNote').value.trim()}); closeModal(); save(); render();};
  }

  function counterpartyRows(id,ignoreCard=false){
    const rows=[];
    Object.entries(state.months||{}).forEach(([k,m])=>{
      (m.incomes||[]).forEach(x=>{if(x.counterpartyId!==id)return; if(!ignoreCard&&state.selectedCardId&&x.accountId!==state.selectedCardId)return; rows.push({...x,type:'in',source:'income',txId:x.id,monthKey:k,title:x.description||'Receita'});});
      (m.outflows||[]).forEach(x=>{if(x.counterpartyId!==id)return; if(!ignoreCard&&state.selectedCardId&&x.accountId!==state.selectedCardId)return; rows.push({...x,type:'out',source:'outflow',txId:x.id,monthKey:k,title:x.description||'Despesa'});});
    });
    return rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  }
  function statusLabel(s){return ({received:'Recebido',paid:'Pago',pending:'Pendente',not_received:'Não recebido',not_paid:'Não pago'})[s]||s||'Sem status';}
  function openCounterpartyDetail(id){
    const cp=state.counterparties.find(c=>c.id===id); if(!cp)return;
    const r=getCounterpartyResume(id), rows=counterpartyRows(id);
    const body=`<div class="detail-kpis"><div><span>A receber pendente</span><strong class="in">${money(r.receivable)}</strong></div><div><span>A pagar pendente</span><strong class="out">${money(r.payable)}</strong></div><div><span>Saldo pendente</span><strong>${money(r.balance)}</strong></div></div><h3>Movimentações vinculadas</h3><div class="transaction-list">${rows.length?rows.map(x=>`<div class="tx-row clickable" data-tx-id="${esc(x.txId)}" data-tx-source="${esc(x.source)}" data-tx-month="${esc(x.monthKey)}"><div class="tx-ico ${x.type==='in'?'in':'out'}">${x.type==='in'?'↗':'↘'}</div><div class="tx-main"><strong>${esc(x.title)}</strong><small>${esc(longDate(x.date||`${x.monthKey}-01`))} • ${esc(x.category||'Outros')} • ${esc(statusLabel(x.status))}</small></div><div class="tx-value ${x.type==='in'?'in':'out'}">${x.type==='in'?'+':'-'} ${money(x.amount)}</div></div>`).join(''):'<div class="empty">Ainda não existe entrada ou saída vinculada a esse devedor.</div>'}</div>`;
    openModal(`Pendências de ${cp.name}`,body,'Devedor / empresa');
  }
  function findTransaction(source,id,month){
    const m=ensureMonth(month||state.selectedMonthKey);
    if(source==='income') return {item:(m.incomes||[]).find(x=>x.id===id), type:'Receita', sign:'+', cls:'in'};
    if(source==='outflow') return {item:(m.outflows||[]).find(x=>x.id===id), type:'Despesa', sign:'-', cls:'out'};
    if(source==='card'){
      let found=null, origin='';
      Object.entries(state.months||{}).some(([k,mm])=>{found=(mm.cardPurchases||[]).find(x=>x.id===id); if(found){origin=k; return true;} return false;});
      return {item:found, type:'Cartão', sign:'-', cls:'out', originMonth:origin};
    }
    return {item:null,type:'Lançamento',sign:'',cls:''};
  }
  function openTransactionDetail(source,id,month){
    const found=findTransaction(source,id,month); const x=found.item; if(!x)return;
    const cp=x.counterpartyId?counterpartyName(x.counterpartyId):'';
    const date=x.date||x.purchaseDate||`${month||found.originMonth||state.selectedMonthKey}-01`;
    const amount=x.amount??x.totalAmount??0;
    openModal(found.type,`<div class="tx-detail-card"><div class="tx-ico ${found.cls}">${found.type==='Receita'?'↗':found.type==='Cartão'?'💳':'↘'}</div><h3>${esc(x.description||found.type)}</h3><strong class="tx-detail-value ${found.cls}">${found.sign} ${money(amount)}</strong></div><div class="detail-grid"><div><span>ID interno</span><strong>${esc(x.id||id)}</strong></div><div><span>Data</span><strong>${esc(longDate(date))}</strong></div><div><span>Categoria</span><strong>${esc(x.category||'Outros')}</strong></div><div><span>Status</span><strong>${esc(statusLabel(x.status))}</strong></div><div><span>Devedor / empresa</span><strong>${esc(cp||'Sem vínculo')}</strong></div><div><span>Origem</span><strong>${esc(found.type==='Cartão'?'Compra no cartão':(x.method||'Carteira'))}</strong></div></div><div class="note-box detail-note"><strong>Observação</strong><br>${esc(x.note||'Sem observação cadastrada.')}</div>`,'Detalhe do lançamento');
  }
  function openCardDetail(id){
    const c=state.cards.find(x=>x.id===id); if(!c)return;
    const prev=state.selectedCardId; state.selectedCardId=id; const t=totals(); const tx=combinedRows().slice(0,8); const debtors=state.counterparties.map(cp=>({cp,r:getCounterpartyResume(cp.id,id)})).filter(x=>x.r.count>0); state.selectedCardId=prev;
    const body=`<div class="tx-detail-card"><div class="tx-ico card">💳</div><h3>${esc(c.bank||'Conta')} • ${esc(c.name||'Principal')}</h3><strong class="tx-detail-value">${money(t.balance)}</strong><p class="muted">Saldo inicial ${money(c.openingBalance||0)} • vence dia ${esc(c.dueDay||'-')}</p></div><div class="detail-kpis"><div><span>Receitas</span><strong class="in">${money(t.income)}</strong></div><div><span>Despesas</span><strong class="out">${money(t.expenses)}</strong></div><div><span>Faturas</span><strong>${money(t.cards)}</strong></div></div><h3>Devedores dessa conta</h3><div class="transaction-list">${debtors.length?debtors.map(({cp,r})=>`<div class="tx-row clickable" data-cp-open="${esc(cp.id)}"><div class="tx-ico in">👥</div><div class="tx-main"><strong>${esc(cp.name)}</strong><small>${r.count} lançamento(s) • saldo pendente ${money(r.balance)}</small></div><div class="tx-value ${r.balance>=0?'in':'out'}">${money(r.balance)}</div></div>`).join(''):'<div class="empty">Nenhum devedor vinculado a essa conta.</div>'}</div><h3>Últimos lançamentos</h3><div class="transaction-list">${tx.length?tx.map(x=>`<div class="tx-row clickable" data-tx-id="${esc(x.txId||x.id)}" data-tx-source="${esc(x.source||x.type)}" data-tx-month="${esc(x.monthKey||state.selectedMonthKey)}"><div class="tx-ico ${x.type==='in'?'in':x.type==='card'?'card':'out'}">${x.type==='in'?'↗':x.type==='card'?'💳':'↘'}</div><div class="tx-main"><strong>${esc(x.title)}</strong><small>${esc(longDate(x.date||x.purchaseDate||`${state.selectedMonthKey}-01`))}</small></div><div class="tx-value ${x.type==='in'?'in':'out'}">${x.type==='in'?'+':'-'} ${money(x.amount)}</div></div>`).join(''):'<div class="empty">Sem lançamentos nessa conta.</div>'}</div><div class="modal-actions"><button class="btn primary" data-select-card="${esc(c.id)}">Usar esta conta</button></div>`;
    openModal('Resumo da conta/cartão',body,'Conta selecionada');
  }
  function openProfile(){
    const m=ensureMonth();
    openModal('Perfil e saldo',`<div class="form-grid"><div class="field"><label>Nome</label><input id="pName" value="${state.profile.name||''}"></div><div class="field"><label>Saldo inicial do mês</label><input id="pOpening" value="${money(m.openingBalance)}"></div><div class="field"><label>Meta de guardar</label><input id="pGoal" value="${money(m.saveGoal)}"></div><div class="field"><label>Guardado no mês</label><input id="pSaved" value="${money(m.savedThisMonth)}"></div><button id="saveProfile" class="btn primary">Salvar</button></div>`,'Configurações');
    $('#saveProfile').onclick=()=>{state.profile.name=$('#pName').value||'Usuário';m.openingBalance=parseMoney($('#pOpening').value);m.saveGoal=parseMoney($('#pGoal').value);m.savedThisMonth=parseMoney($('#pSaved').value);closeModal();save();render();};
  }
  function copySummary(){const t=totals(); const txt=`Resumo ${monthLabel(state.selectedMonthKey)}\nReceitas: ${money(t.income)}\nDespesas: ${money(t.expenses)}\nSaldo: ${money(t.balance)}`; navigator.clipboard?.writeText(txt); alert('Resumo copiado.');}
  function toggleTheme(){state.theme=state.theme==='dark'?'light':'dark'; save(); render();}
  async function logout(){ if(confirm('Sair da conta?')){ try{ if(BOOT.logout) await BOOT.logout(); }catch{} location.href='index.html';}}
  function toggleFab(){const open=$('#fabMenu').classList.contains('hidden'); $('#fabMenu').classList.toggle('hidden',!open); $('#fabBackdrop').classList.toggle('hidden',!open); $('#fabBtn').classList.toggle('open',open);}
  function closeFab(){$('#fabMenu').classList.add('hidden');$('#fabBackdrop').classList.add('hidden');$('#fabBtn').classList.remove('open');}
  function boot(){
    ensureMonth();
    document.addEventListener('click',(e)=>{
      const del=e.target.closest('[data-delcp]');
      if(del){e.preventDefault();e.stopPropagation(); deleteCounterparty(del.dataset.delcp); return;}
      const selectCard=e.target.closest('[data-select-card]');
      if(selectCard){e.preventDefault();e.stopPropagation(); setSelectedCard(selectCard.dataset.selectCard||''); return;}
      const cardDetail=e.target.closest('[data-card-detail]');
      if(cardDetail){e.preventDefault();e.stopPropagation(); openCardDetail(cardDetail.dataset.cardDetail); return;}
      const newCard=e.target.closest('[data-action-card="new"]');
      if(newCard){e.preventDefault();e.stopPropagation(); openAction('card'); return;}
      const cp=e.target.closest('[data-cp-open]');
      if(cp){e.preventDefault();e.stopPropagation(); openCounterpartyDetail(cp.dataset.cpOpen); return;}
      const tx=e.target.closest('[data-tx-id]');
      if(tx){e.preventDefault();openTransactionDetail(tx.dataset.txSource,tx.dataset.txId,tx.dataset.txMonth);}
    });
    $$('.seg-tab,.bottom-item,.rail-btn[data-screen]').forEach(b=>b.onclick=()=>setScreen(b.dataset.screen));
    $('#prevMonthBtn').onclick=()=>{state.selectedMonthKey=shiftMonth(state.selectedMonthKey,-1);ensureMonth();save();render();};
    $('#nextMonthBtn').onclick=()=>{state.selectedMonthKey=shiftMonth(state.selectedMonthKey,1);ensureMonth();save();render();};
    $('#monthPickerBtn').onclick=()=>{const v=prompt('Digite o mês no formato AAAA-MM',state.selectedMonthKey); if(/^\d{4}-\d{2}$/.test(v||'')){state.selectedMonthKey=v;ensureMonth();save();render();}};
    $('#fabBtn').onclick=toggleFab; $('#fabBackdrop').onclick=closeFab; $$('#fabMenu [data-action]').forEach(b=>b.onclick=()=>openAction(b.dataset.action));
    $('#quickSettingsBtn').onclick=()=>setScreen('more'); $('#menuToggleBtn').onclick=toggleFab; $('#railThemeBtn').onclick=toggleTheme; $('#railLogoutBtn').onclick=logout; render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
