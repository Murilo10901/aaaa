
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

  function loadInitial(){
    try { return BOOT.initialState || JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch { return {}; }
  }
  function normalize(s){
    const now=monthKey();
    return {
      theme:s.theme||'dark',
      activeScreen:s.activeScreen||'home',
      selectedMonthKey:s.selectedMonthKey||s.selectedMonth||now,
      profile:{name:s.profile?.name||s.profile?.display_name||'Matheus', email:s.profile?.email||BOOT.user?.email||'', photo:s.profile?.photo||''},
      cards:Array.isArray(s.cards)?s.cards:[],
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
    const income=m.incomes.filter(x=>x.status!=='not_received').reduce((a,x)=>a+Number(x.amount||0),0);
    const out=m.outflows.filter(x=>x.status!=='not_paid').reduce((a,x)=>a+Number(x.amount||0),0);
    const cards=cardInstallmentsForMonth(k).reduce((a,x)=>a+Number(x.amount||0),0);
    const opening=Number(m.openingBalance||0);
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
  function render(){
    document.body.classList.toggle('theme-light',state.theme==='light'); ensureMonth();
    $('#monthLabelTop').textContent=monthLabel(state.selectedMonthKey);
    if(activeScreen==='home') renderHome();
    if(activeScreen==='transactions') renderTransactions();
    if(activeScreen==='planning') renderPlanning();
    if(activeScreen==='more') renderMore();
  }
  function title(h,p=''){ $('#screenTitle').innerHTML=`<h1>${h}</h1>${p?`<p>${p}</p>`:''}`; }
  function renderHome(){
    const t=totals();
    title(`Olá, ${state.profile.name||'você'}`,'Visão rápida do seu mês financeiro.');
    $('#appContent').innerHTML=`
    <section class="hero-card"><div class="hero-row"><div><span class="balance-label">Saldo fim do mês</span><div class="balance-value">${money(t.balance)}</div><p class="muted">Receitas, despesas, cartão e dinheiro guardado no mês.</p><div class="balance-subgrid"><div class="mini-kpi"><span>Receitas</span><strong style="color:var(--green)">${money(t.income)}</strong></div><div class="mini-kpi"><span>Despesas</span><strong style="color:var(--red)">${money(t.expenses)}</strong></div></div></div><div class="fake-card"><div class="chip"></div><div class="card-number">1478 2255 4595 9874</div><div class="card-bottom"><div><small>Card holder</small><strong>${state.profile.name||'Usuário'}</strong></div><div><small>Saldo</small><strong>${money(t.balance)}</strong></div></div></div></div></section>
    <section class="quick-grid"><button class="quick-card" data-qa="income"><i>＋</i><strong>Receita</strong></button><button class="quick-card" data-qa="expense"><i>−</i><strong>Despesa</strong></button><button class="quick-card" data-qa="card"><i>💳</i><strong>Cartão</strong></button><button class="quick-card" data-qa="counterparty"><i>👥</i><strong>Devedores</strong></button></section>
    <section class="panel"><div class="panel-head"><div><h2>Últimas transações</h2><p class="muted">Entradas e saídas em lista limpa</p></div><button class="btn soft" id="seeAllTx">Ver tudo</button></div><div class="transaction-list">${txListHtml(6)}</div></section>`;
    $$('[data-qa]').forEach(b=>b.onclick=()=>openAction(b.dataset.qa)); $('#seeAllTx').onclick=()=>setScreen('transactions');
  }
  function combinedRows(k=state.selectedMonthKey){
    const m=ensureMonth(k); const rows=[];
    m.incomes.forEach(x=>rows.push({...x,type:'in',amount:Number(x.amount||0),title:x.description||'Receita'}));
    m.outflows.forEach(x=>rows.push({...x,type:'out',amount:Number(x.amount||0),title:x.description||'Despesa'}));
    cardInstallmentsForMonth(k).forEach(x=>rows.push({...x,type:'card',title:x.description||'Cartão'}));
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
      const meta=[r.category||'Outros', r.type==='card'?'Cartão':(r.method||'Carteira')].filter(Boolean).join(' | ');
      html+=`<div class="tx-row"><div class="tx-ico ${cls}">${r.type==='in'?'↗':r.type==='card'?'💳':'↘'}</div><div class="tx-main"><strong>${r.title}</strong><small>${meta}${r.installment?' • '+r.installment:''}</small></div><div class="tx-value ${r.type==='in'?'in':'out'}">${sign} ${money(r.amount)}<span class="check">✓</span></div></div>`;
    }); return html;
  }
  function renderTransactions(){
    const t=totals();
    title('Transações','Lista por dia, com controle mensal igual app.');
    $('#appContent').innerHTML=`<section class="panel"><div class="balance-subgrid"><div class="mini-kpi"><span>Saldo fim do mês</span><strong style="color:var(--green)">${money(t.balance)}</strong></div><div class="mini-kpi"><span>Balanço mensal</span><strong>${money(t.income-t.expenses)}</strong></div></div></section><section class="panel"><div class="panel-head"><div><h2>${monthLabel(state.selectedMonthKey)}</h2><p class="muted">Receitas, despesas e cartões</p></div><button class="btn primary" id="addTxTop">Adicionar</button></div><div class="transaction-list">${txListHtml()}</div></section>`;
    $('#addTxTop').onclick=toggleFab;
  }
  function renderPlanning(){
    const t=totals(); title('Planejamento e resumos','Gráficos e leituras por categoria, cartões e período.');
    $('#appContent').innerHTML=`<section class="summary-grid"><div class="panel canvas-card"><h2>Receitas vs Despesas</h2><canvas id="pieChart" class="chart-canvas"></canvas></div><div class="panel canvas-card"><h2>Evolução do mês</h2><canvas id="barChart" class="chart-canvas"></canvas></div></section><section class="panel"><h2>Escolha um resumo</h2><div class="list-menu"><button class="list-btn" data-summary="cards"><span><strong>Resumo por cartão</strong><small>Faturas e parcelas do mês</small></span><b>›</b></button><button class="list-btn" data-summary="cat"><span><strong>Gastos por categoria</strong><small>Onde o dinheiro saiu</small></span><b>›</b></button><button class="list-btn" data-summary="debt"><span><strong>Devedores e pendências</strong><small>A receber e a pagar</small></span><b>›</b></button></div><div id="summaryDetail" style="margin-top:14px"></div></section>`;
    drawPie('pieChart',t.income,t.expenses); drawBars('barChart'); $$('[data-summary]').forEach(b=>b.onclick=()=>renderSummaryDetail(b.dataset.summary));
  }
  function renderSummaryDetail(type){
    const el=$('#summaryDetail');
    if(type==='cards'){const rows=state.cards.map(c=>`<div class="tx-row"><div class="tx-ico card">💳</div><div class="tx-main"><strong>${c.bank||'Banco'} • ${c.name||'Cartão'}</strong><small>Vence dia ${c.dueDay||'-'}</small></div><div class="tx-value out">${money(cardInstallmentsForMonth(state.selectedMonthKey,c.id).reduce((a,x)=>a+x.amount,0))}</div></div>`).join('')||'<div class="empty">Nenhum cartão cadastrado.</div>'; el.innerHTML=rows;}
    if(type==='cat'){const map={}; combinedRows().filter(x=>x.type!=='in').forEach(x=>map[x.category||'Outros']=(map[x.category||'Outros']||0)+x.amount); el.innerHTML=Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="tx-row"><div class="tx-ico out">%</div><div class="tx-main"><strong>${k}</strong><small>Categoria</small></div><div class="tx-value out">${money(v)}</div></div>`).join('')||'<div class="empty">Sem despesas.</div>';}
    if(type==='debt'){el.innerHTML=counterpartyHtml();}
  }
  function counterpartyHtml(){if(!state.counterparties.length)return '<div class="empty">Nenhum devedor/empresa cadastrado. Clique no + e escolha Devedor.</div>'; return state.counterparties.map(c=>`<div class="tx-row"><div class="tx-ico in">👥</div><div class="tx-main"><strong>${c.name}</strong><small>${c.note||'Pendência'}</small></div><div><button class="btn soft" data-delcp="${c.id}">Excluir</button></div></div>`).join('');}
  function renderMore(){
    title('Mais','Configurações, devedores, cartões e dados.');
    $('#appContent').innerHTML=`<section class="panel"><h2>Configurações</h2><div class="list-menu"><button class="list-btn" id="themeBtn"><span><strong>Modo ${state.theme==='dark'?'claro':'escuro'}</strong><small>Alterar visual do app</small></span><b>☼</b></button><button class="list-btn" id="profileBtn"><span><strong>Perfil</strong><small>Nome e saldo inicial</small></span><b>›</b></button><button class="list-btn" id="cardBtn"><span><strong>Cartões</strong><small>Criar ou editar cartões</small></span><b>›</b></button><button class="list-btn" id="counterBtn"><span><strong>Devedores / empresas</strong><small>A receber e a pagar</small></span><b>›</b></button><button class="list-btn" id="exportBtn"><span><strong>Exportar resumo</strong><small>Copiar texto do mês</small></span><b>⧉</b></button><button class="list-btn" id="logoutBtn"><span><strong>Sair da conta</strong><small>Encerrar sessão</small></span><b>↪</b></button></div></section><section class="panel"><h2>Devedores cadastrados</h2><div id="debtList">${counterpartyHtml()}</div></section>`;
    $('#themeBtn').onclick=toggleTheme; $('#profileBtn').onclick=openProfile; $('#cardBtn').onclick=()=>openAction('card'); $('#counterBtn').onclick=()=>openAction('counterparty'); $('#exportBtn').onclick=copySummary; $('#logoutBtn').onclick=logout;
    $$('[data-delcp]').forEach(b=>b.onclick=()=>{state.counterparties=state.counterparties.filter(c=>c.id!==b.dataset.delcp); save(); render();});
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
    openModal(isIn?'Adicionar receita':'Adicionar despesa',`<div class="form-grid"><div class="field"><label>Data</label><input id="fDate" type="date" value="${today()}"></div><div class="field"><label>Descrição</label><input id="fDesc" placeholder="Ex.: Mercado, salário, pix..."></div><div class="field"><label>Valor</label><input id="fAmount" placeholder="R$ 0,00"></div><div class="field"><label>Categoria</label><select id="fCat"><option>Alimentação</option><option>Salário</option><option>Transporte</option><option>Lazer</option><option>Moradia</option><option>Serviços</option><option>Investimento</option><option>Outros</option></select></div><button id="saveTx" class="btn primary">Salvar</button></div>`);
    $('#saveTx').onclick=()=>{const k=$('#fDate').value.slice(0,7)||state.selectedMonthKey; ensureMonth(k); const item={id:uid(),date:$('#fDate').value||today(),description:$('#fDesc').value|| (isIn?'Receita':'Despesa'),amount:parseMoney($('#fAmount').value),category:$('#fCat').value,status:isIn?'received':'paid',method:'Carteira'}; if(item.amount<=0)return alert('Digite um valor maior que zero.'); (isIn?state.months[k].incomes:state.months[k].outflows).push(item); state.selectedMonthKey=k; closeModal(); save(); render();};
  }
  function openCardForm(){
    openModal('Cartão / compra',`<div class="form-grid two"><div class="field"><label>Banco</label><input id="cardBank" placeholder="Nubank, Bradesco..."></div><div class="field"><label>Nome do cartão</label><input id="cardName" placeholder="Principal"></div><div class="field"><label>Vence dia</label><input id="cardDue" type="number" value="10"></div><div class="field"><label>Compra do mês</label><input id="cardPurchase" placeholder="R$ 0,00"></div><div class="field"><label>Descrição da compra</label><input id="cardDesc" placeholder="Compra no cartão"></div><div class="field"><label>Parcelas</label><input id="cardParc" type="number" value="1"></div><button id="saveCard" class="btn primary">Salvar cartão/compra</button></div>`);
    $('#saveCard').onclick=()=>{let card=state.cards.find(c=>(c.bank||'').toLowerCase()===$('#cardBank').value.toLowerCase()&&(c.name||'').toLowerCase()===$('#cardName').value.toLowerCase()); if(!card){card={id:uid(),bank:$('#cardBank').value||'Cartão',name:$('#cardName').value||'Principal',dueDay:Number($('#cardDue').value||10),closingDay:25,color:'#7c3aed'}; state.cards.push(card);} const amount=parseMoney($('#cardPurchase').value); if(amount>0){const m=ensureMonth(); m.cardPurchases.push({id:uid(),cardId:card.id,purchaseDate:today(),description:$('#cardDesc').value||'Compra no cartão',totalAmount:amount,installmentCount:Math.max(1,Number($('#cardParc').value||1)),category:'Cartão'});} closeModal(); save(); render();};
  }
  function openCounterpartyForm(){
    openModal('Devedor / empresa',`<div class="form-grid"><div class="field"><label>Nome</label><input id="cpName" placeholder="Ex.: João, Cliente, Empresa"></div><div class="field"><label>Observação</label><input id="cpNote" placeholder="Ex.: Me deve / Eu devo"></div><button id="saveCp" class="btn primary">Salvar devedor</button></div>`);
    $('#saveCp').onclick=()=>{const name=$('#cpName').value.trim(); if(!name)return alert('Digite um nome.'); state.counterparties.push({id:uid(),name,note:$('#cpNote').value.trim()}); closeModal(); save(); render();};
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
    $$('.seg-tab,.bottom-item,.rail-btn[data-screen]').forEach(b=>b.onclick=()=>setScreen(b.dataset.screen));
    $('#prevMonthBtn').onclick=()=>{state.selectedMonthKey=shiftMonth(state.selectedMonthKey,-1);ensureMonth();save();render();};
    $('#nextMonthBtn').onclick=()=>{state.selectedMonthKey=shiftMonth(state.selectedMonthKey,1);ensureMonth();save();render();};
    $('#monthPickerBtn').onclick=()=>{const v=prompt('Digite o mês no formato AAAA-MM',state.selectedMonthKey); if(/^\d{4}-\d{2}$/.test(v||'')){state.selectedMonthKey=v;ensureMonth();save();render();}};
    $('#fabBtn').onclick=toggleFab; $('#fabBackdrop').onclick=closeFab; $$('#fabMenu [data-action]').forEach(b=>b.onclick=()=>openAction(b.dataset.action));
    $('#quickSettingsBtn').onclick=()=>setScreen('more'); $('#menuToggleBtn').onclick=toggleFab; $('#railThemeBtn').onclick=toggleTheme; $('#railLogoutBtn').onclick=logout; render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
