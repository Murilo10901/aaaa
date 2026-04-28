
(() => {
  const BOOT = window.APP_BOOTSTRAP || {};
  const STORAGE_KEY = BOOT.cacheKey || 'aaa_finance_v3_local';
  const $ = (s, root=document)=> typeof root === 'string' ? document.querySelector(root).querySelector(s) : root.querySelector(s);
  const $$ = (s, root=document)=>[...(typeof root === 'string' ? document.querySelector(root).querySelectorAll(s) : root.querySelectorAll(s))];
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const today=()=>new Date().toISOString().slice(0,10);
  const monthKey=()=>new Date().toISOString().slice(0,7);
  const MAIN_ACCOUNT_ID = 'main-account';
  const DATA_SCHEMA_VERSION = 5;
  const state = normalize(loadInitial());
  let saveTimer=null;
  let activeScreen=state.activeScreen||'home';
  let openSummaryAccordion = null;
  let txSearch = '';
  let txStatusFilter = 'all';

  function loadInitial(){
    try { return BOOT.initialState || JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch { return {}; }
  }
  function asArray(v){ return Array.isArray(v) ? v : []; }
  function asObject(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function asNumber(v){
    if(typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if(typeof v === 'string') return Number(v.replace(/\s/g,'').replace(/R\$/gi,'').replace(/\./g,'').replace(',','.')) || 0;
    return Number(v||0) || 0;
  }
  function normalizeText(v,fallback=''){ return String(v ?? fallback).trim(); }
  function normalizeTxDate(tx, fallbackMonth){
    const raw = tx.date || tx.data || tx.dueDate || tx.createdAt || tx.purchaseDate || '';
    if(/^\d{4}-\d{2}-\d{2}/.test(String(raw))) return String(raw).slice(0,10);
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(String(raw))){
      const [d,m,y]=String(raw).split('/'); return `${y}-${m}-${d}`;
    }
    return `${fallbackMonth || monthKey()}-01`;
  }
  function inferMonthFromItem(tx, fallbackMonth){
    const d = normalizeTxDate(tx, fallbackMonth);
    return d.slice(0,7) || fallbackMonth || monthKey();
  }
  function normalizeStatus(tx, kind){
    const raw = String(tx.status || tx.situacao || '').toLowerCase();
    if(['received','recebido','recebida','pago','paid'].includes(raw)) return kind==='income' ? 'received' : 'paid';
    if(['not_received','nao_recebido','não recebido','não_recebido'].includes(raw)) return 'not_received';
    if(['not_paid','nao_pago','não pago','não_pago'].includes(raw)) return 'not_paid';
    if(['pending','pendente','aberto'].includes(raw)) return 'pending';
    return kind==='income' ? 'received' : 'paid';
  }
  function createMainAccount(openingBalance=0){
    return {id:MAIN_ACCOUNT_ID, bank:'Carteira', name:'Conta principal', dueDay:10, closingDay:25, openingBalance:asNumber(openingBalance), color:'#7c3aed', migrated:true};
  }
  function normalizeMonthsContainer(raw, selectedMonth, migration){
    const aliases = raw.months || raw.meses || raw.monthData || raw.dataByMonth || raw.financeByMonth || {};
    const months = asObject(aliases);
    const out = {};
    Object.entries(months).forEach(([k,v])=>{
      if(/^\d{4}-\d{2}$/.test(k)) out[k]=asObject(v);
    });

    const rootIncomes = asArray(raw.incomes || raw.receitas || raw.entradas);
    const rootOutflows = asArray(raw.outflows || raw.expenses || raw.despesas || raw.saidas || raw.gastos);
    const rootCards = asArray(raw.cardPurchases || raw.card_purchases || raw.comprasCartao || raw.compras_cartao);
    const rootTransactions = asArray(raw.transactions || raw.transacoes || raw.lancamentos);

    function ensure(k){ if(!out[k]) out[k]={openingBalance:0,incomes:[],outflows:[],cardPurchases:[],manualInvoices:{},saveGoal:0,savedThisMonth:0}; return out[k]; }

    rootIncomes.forEach(item=>{ const k=inferMonthFromItem(item,selectedMonth); ensure(k).incomes.push(item); migration.applied=true; migration.rootItemsMoved++; });
    rootOutflows.forEach(item=>{ const k=inferMonthFromItem(item,selectedMonth); ensure(k).outflows.push(item); migration.applied=true; migration.rootItemsMoved++; });
    rootCards.forEach(item=>{ const k=inferMonthFromItem(item,selectedMonth); ensure(k).cardPurchases.push(item); migration.applied=true; migration.rootItemsMoved++; });
    rootTransactions.forEach(item=>{
      const rawType=String(item.type || item.tipo || item.kind || '').toLowerCase();
      const k=inferMonthFromItem(item,selectedMonth); const m=ensure(k);
      if(['income','receita','entrada','in'].includes(rawType)) m.incomes.push(item);
      else if(['card','cartao','cartão','credit','credito','crédito'].includes(rawType)) m.cardPurchases.push(item);
      else m.outflows.push(item);
      migration.applied=true; migration.rootItemsMoved++;
    });

    if(!Object.keys(out).length) out[selectedMonth]={openingBalance:asNumber(raw.openingBalance || raw.initialBalance || raw.saldoInicial || raw.balance),incomes:[],outflows:[],cardPurchases:[],manualInvoices:{},saveGoal:0,savedThisMonth:0};
    return out;
  }
  function normalize(s){
    const raw = s && typeof s === 'object' ? s : {};
    const now=monthKey();
    const selectedMonth = raw.selectedMonthKey || raw.selectedMonth || raw.currentMonth || now;
    const migration = {version:DATA_SCHEMA_VERSION, applied:false, needsSave:false, createdMainAccount:false, fixedTransactions:0, fixedCards:0, fixedCounterparties:0, rootItemsMoved:0, orphanCardPurchases:0};

    let cards = asArray(raw.cards || raw.cartoes || raw.accounts || raw.contas).map((c)=>{
      const id = normalizeText(c.id || c.cardId || c.accountId || c.uuid, uid());
      if(!c.id && !c.cardId && !c.accountId) migration.fixedCards++;
      return {
        ...c,
        id,
        bank:normalizeText(c.bank || c.banco || c.accountName || c.nomeBanco || c.name, 'Conta'),
        name:normalizeText(c.name || c.apelido || c.nickname || c.cardName, 'Principal'),
        dueDay:asNumber(c.dueDay || c.vencimento || c.diaVencimento || 10) || 10,
        closingDay:asNumber(c.closingDay || c.fechamento || c.diaFechamento || 25) || 25,
        openingBalance:asNumber(c.openingBalance || c.saldoInicial || c.balance || c.saldo || 0),
        color:c.color || c.cor || '#7c3aed'
      };
    });
    const cardIds = new Set(cards.map(c=>c.id));
    const needsDefaultAccount = !cards.length;
    if(needsDefaultAccount){ cards.unshift(createMainAccount(raw.openingBalance || raw.initialBalance || raw.saldoInicial || raw.balance)); cardIds.add(MAIN_ACCOUNT_ID); migration.createdMainAccount=true; migration.applied=true; }

    const months = normalizeMonthsContainer(raw, selectedMonth, migration);
    function ensureMainAccount(){
      if(!cardIds.has(MAIN_ACCOUNT_ID)){
        cards.unshift(createMainAccount(raw.openingBalance || raw.initialBalance || raw.saldoInicial || raw.balance));
        cardIds.add(MAIN_ACCOUNT_ID); migration.createdMainAccount=true; migration.applied=true;
      }
      return MAIN_ACCOUNT_ID;
    }
    function normalizeTransaction(tx, kind, month){
      const fallbackAccount = tx.accountId || tx.cardId || tx.account_id || tx.card_id || tx.contaId || tx.cartaoId || tx.card || tx.account;
      let accountId = normalizeText(fallbackAccount, '');
      if(!accountId || !cardIds.has(accountId)){
        accountId = ensureMainAccount();
        migration.fixedTransactions++;
        migration.applied=true;
      }
      const id = normalizeText(tx.id || tx.txId || tx.transactionId || tx.uuid, uid());
      if(!tx.id) { migration.fixedTransactions++; migration.applied=true; }
      return {
        ...tx,
        id,
        date:normalizeTxDate(tx, month),
        description:normalizeText(tx.description || tx.descricao || tx.title || tx.nome, kind==='income'?'Receita':'Despesa'),
        amount:asNumber(tx.amount ?? tx.valor ?? tx.value ?? tx.total ?? 0),
        category:normalizeText(tx.category || tx.categoria || 'Outros','Outros'),
        status:normalizeStatus(tx, kind),
        method:normalizeText(tx.method || tx.metodo || tx.origem || 'Carteira','Carteira'),
        accountId,
        cardId: tx.cardId || tx.card_id || '',
        counterpartyId:normalizeText(tx.counterpartyId || tx.debtorId || tx.devedorId || tx.counterparty_id || '', ''),
        note:normalizeText(tx.note || tx.observation || tx.observacao || tx.obs || '', '')
      };
    }
    function normalizeCardPurchase(p, month){
      let cardId = normalizeText(p.cardId || p.accountId || p.card_id || p.account_id || p.cartaoId || p.contaId || '', '');
      if(!cardId || !cardIds.has(cardId)){
        cardId = ensureMainAccount();
        migration.orphanCardPurchases++;
        migration.applied=true;
      }
      const id = normalizeText(p.id || p.purchaseId || p.uuid, uid());
      if(!p.id){ migration.fixedTransactions++; migration.applied=true; }
      return {
        ...p,
        id,
        cardId,
        accountId:cardId,
        purchaseDate:normalizeTxDate(p, month),
        description:normalizeText(p.description || p.descricao || p.title || 'Compra no cartão','Compra no cartão'),
        totalAmount:asNumber(p.totalAmount ?? p.amount ?? p.valor ?? p.value ?? 0),
        installmentCount:Math.max(1,asNumber(p.installmentCount || p.parcelas || p.installments || 1) || 1),
        category:normalizeText(p.category || p.categoria || 'Cartão','Cartão'),
        status:p.status || 'paid',
        counterpartyId:normalizeText(p.counterpartyId || p.debtorId || p.devedorId || '', ''),
        note:normalizeText(p.note || p.observation || p.observacao || p.obs || '', '')
      };
    }

    Object.entries(months).forEach(([k,m])=>{
      const mm = asObject(m);
      months[k]={
        openingBalance:asNumber(mm.openingBalance || mm.saldoInicial || mm.initialBalance || 0),
        incomes:asArray(mm.incomes || mm.receitas || mm.entradas).map(x=>normalizeTransaction(x,'income',k)),
        outflows:asArray(mm.outflows || mm.expenses || mm.despesas || mm.saidas || mm.gastos).map(x=>normalizeTransaction(x,'expense',k)),
        cardPurchases:asArray(mm.cardPurchases || mm.card_purchases || mm.comprasCartao || mm.compras_cartao).map(x=>normalizeCardPurchase(x,k)),
        manualInvoices:asObject(mm.manualInvoices || mm.faturasManuais || {}),
        saveGoal:asNumber(mm.saveGoal || mm.metaGuardar || 0),
        savedThisMonth:asNumber(mm.savedThisMonth || mm.guardadoMes || 0),
        closed:!!(mm.closed || mm.isClosed || mm.fechado)
      };
    });

    const counterparties = asArray(raw.counterparties || raw.devedores || raw.debtors || raw.empresas).map(c=>{
      const id=normalizeText(c.id || c.counterpartyId || c.devedorId || c.uuid, uid());
      if(!c.id){ migration.fixedCounterparties++; migration.applied=true; }
      return {...c,id,name:normalizeText(c.name || c.nome || c.razaoSocial || 'Devedor','Devedor'),note:normalizeText(c.note || c.observacao || c.obs || c.status || 'Pendência','Pendência'),accountId:normalizeText(c.accountId || c.contaId || '', '')};
    });

    const selectedCardId = cardIds.has(raw.selectedCardId) ? raw.selectedCardId : '';
    if(raw.__schemaVersion !== DATA_SCHEMA_VERSION || migration.applied) migration.needsSave = true;

    return {
      ...raw,
      __schemaVersion: DATA_SCHEMA_VERSION,
      __migration: migration,
      theme:raw.theme||'dark',
      activeScreen:raw.activeScreen||'home',
      selectedMonthKey:selectedMonth,
      selectedCardId,
      profile:{name:raw.profile?.name||raw.profile?.display_name||'Matheus', email:raw.profile?.email||BOOT.user?.email||'', photo:raw.profile?.photo||'', fixedSalary:asNumber(raw.profile?.fixedSalary||0), defaultSaveGoal:asNumber(raw.profile?.defaultSaveGoal||0), savingsPotBase:asNumber(raw.profile?.savingsPotBase||0), fixedIncomes:asArray(raw.profile?.fixedIncomes), fixedOutflows:asArray(raw.profile?.fixedOutflows)},
      cards,
      counterparties,
      recurringRules: asArray(raw.recurringRules || raw.recorrentes || raw.lancamentosRecorrentes).map(r=>({
        id: normalizeText(r.id || r.ruleId || r.uuid, uid()),
        type: ['income','in','receita','entrada'].includes(String(r.type||r.tipo||'').toLowerCase()) ? 'income' : 'expense',
        description: normalizeText(r.description || r.descricao || r.title || r.nome, 'Lançamento recorrente'),
        amount: asNumber(r.amount ?? r.valor ?? r.value ?? 0),
        category: normalizeText(r.category || r.categoria || 'Outros','Outros'),
        accountId: normalizeText(r.accountId || r.contaId || r.cardId || '', ''),
        counterpartyId: normalizeText(r.counterpartyId || r.devedorId || '', ''),
        status: r.status || '',
        note: normalizeText(r.note || r.observacao || r.obs || '', ''),
        day: Math.min(28, Math.max(1, asNumber(r.day || r.dia || 1) || 1)),
        active: r.active !== false
      })),
      months
    };
  }
  function ensureMonth(k=state.selectedMonthKey){
    if(!state.months[k]) state.months[k]={openingBalance:0,incomes:[],outflows:[],cardPurchases:[],manualInvoices:{},saveGoal:0,savedThisMonth:0,closed:false};
    const m=state.months[k];
    m.incomes=Array.isArray(m.incomes)?m.incomes:[];
    m.outflows=Array.isArray(m.outflows)?m.outflows:[];
    m.cardPurchases=Array.isArray(m.cardPurchases)?m.cardPurchases:[];
    m.manualInvoices=m.manualInvoices||{};
    m.closed=!!m.closed;
    return m;
  }
  function isMonthClosed(k=state.selectedMonthKey){ return !!ensureMonth(k).closed; }
  function assertMonthOpen(k=state.selectedMonthKey){
    if(isMonthClosed(k)){ alert('Este mês está fechado/conferido. Reabra o mês para editar, excluir ou cadastrar lançamentos.'); return false; }
    return true;
  }
  function setMonthClosed(k=state.selectedMonthKey,closed=true){ ensureMonth(k).closed=!!closed; save(); render(); }
  function rowStatusGroup(row){
    const s=String(row.status||'').toLowerCase();
    if(['pending'].includes(s)) return 'pending';
    if(['not_paid','not_received'].includes(s)) return 'open';
    if(['paid','received'].includes(s)) return 'settled';
    return s || 'settled';
  }
  function rowMatchesFilters(row){
    const q=txSearch.trim().toLowerCase();
    if(q){
      const hay=[row.title,row.description,row.category,row.method,row.note,counterpartyName(row.counterpartyId),row.status,row.installment].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(txStatusFilter==='all') return true;
    const s=String(row.status||'').toLowerCase();
    if(txStatusFilter==='pending') return s==='pending';
    if(txStatusFilter==='settled') return ['paid','received'].includes(s);
    if(txStatusFilter==='open') return ['pending','not_paid','not_received'].includes(s);
    return s===txStatusFilter;
  }
  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  function parseMoney(v){return Number(String(v||'').replace(/\s/g,'').replace(/R\$/gi,'').replace(/\./g,'').replace(',','.'))||0;}
  function onlyDigits(v){return String(v||'').replace(/\D/g,'');}
  function formatMoneyTyping(value){
    const digits = onlyDigits(value);
    if(!digits) return '';
    return (Number(digits) / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }
  function bindMoneyInputs(root=document){
    $$('input[data-money="brl"]', root).forEach(input=>{
      if(input.dataset.moneyBound==='1') return;
      input.dataset.moneyBound='1';
      input.classList.add('money-input');
      input.setAttribute('inputmode','numeric');
      input.setAttribute('autocomplete','off');
      if(input.value) input.value = formatMoneyTyping(input.value) || input.value;
      input.addEventListener('input',()=>{
        input.value = formatMoneyTyping(input.value);
        input.setSelectionRange(input.value.length,input.value.length);
      });
      input.addEventListener('focus',()=>{
        if(input.value) {
          input.value = formatMoneyTyping(input.value) || input.value;
          setTimeout(()=>input.setSelectionRange(input.value.length,input.value.length),0);
        }
      });
      input.addEventListener('blur',()=>{
        input.value = formatMoneyTyping(input.value);
      });
      input.addEventListener('paste',()=>{
        setTimeout(()=>{ input.value = formatMoneyTyping(input.value); },0);
      });
    });
  }
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
    if(activeScreen==='pending') renderPendingScreen();
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
    let rows=combinedRows().filter(rowMatchesFilters); if(limit) rows=rows.slice(0,limit);
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
    applyRecurringToMonth(state.selectedMonthKey,false);
    const t=totals();
    const closed=isMonthClosed();
    title('Transações','Lista por dia, busca, status, edição, duplicação e fechamento do mês.');
    $('#appContent').innerHTML=`${accountSelectorHtml()}<section class="panel"><div class="balance-subgrid"><div class="mini-kpi"><span>Saldo fim do mês</span><strong style="color:var(--green)">${money(t.balance)}</strong></div><div class="mini-kpi"><span>Balanço mensal</span><strong>${money(t.income-t.expenses)}</strong></div></div>${closed?'<div class="month-closed-badge">🔒 Mês fechado/conferido</div>':''}</section><section class="panel"><div class="transaction-toolbar"><div class="field search-field"><label>Buscar transação</label><input id="txSearchInput" value="${esc(txSearch)}" placeholder="mercado, pix, cartão, João..." /></div><div class="field"><label>Status</label><select id="txStatusFilter"><option value="all">Todos</option><option value="open">Em aberto</option><option value="pending">Pendente</option><option value="settled">Pago/recebido</option><option value="paid">Pago</option><option value="received">Recebido</option><option value="not_paid">Não pago</option><option value="not_received">Não recebido</option></select></div></div><div class="panel-head"><div><h2>${monthLabel(state.selectedMonthKey)}</h2><p class="muted">Receitas, despesas, cartões e recorrentes</p></div><div class="actions-row"><button class="btn soft" id="toggleCloseMonthBtn">${closed?'Reabrir mês':'Fechar mês'}</button><button class="btn soft" id="recurringTopBtn">Recorrentes</button><button class="btn primary" id="addTxTop" ${closed?'disabled':''}>Adicionar</button></div></div><div class="transaction-list">${txListHtml()}</div></section>`;
    const status=$('#txStatusFilter'); if(status) status.value=txStatusFilter;
    $('#addTxTop').onclick=()=> closed ? alert('Mês fechado. Reabra para adicionar lançamentos.') : toggleFab();
    $('#recurringTopBtn').onclick=renderRecurringManager;
    $('#toggleCloseMonthBtn').onclick=()=>setMonthClosed(state.selectedMonthKey,!closed);
    $('#txSearchInput').oninput=e=>{txSearch=e.target.value||''; renderTransactions();};
    $('#txStatusFilter').onchange=e=>{txStatusFilter=e.target.value||'all'; renderTransactions();};
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
    $('#appContent').innerHTML=`<section class="panel"><h2>Configurações</h2><div class="list-menu"><button class="list-btn" id="themeBtn"><span><strong>Modo ${state.theme==='dark'?'claro':'escuro'}</strong><small>Alterar visual do app</small></span><b>☼</b></button><button class="list-btn" id="profileBtn"><span><strong>Perfil</strong><small>Nome e saldo inicial</small></span><b>›</b></button><button class="list-btn" id="cardBtn"><span><strong>Cartões</strong><small>Criar ou editar cartões</small></span><b>›</b></button><button class="list-btn" id="counterBtn"><span><strong>Devedores / empresas</strong><small>A receber e a pagar</small></span><b>›</b></button><button class="list-btn" id="pendingBtn"><span><strong>Pendências</strong><small>A receber, a pagar, vencidas e por pessoa</small></span><b>›</b></button><button class="list-btn" id="recurringBtn"><span><strong>Lançamentos recorrentes</strong><small>Aluguel, internet, salário, academia...</small></span><b>›</b></button><button class="list-btn" id="exportBtn"><span><strong>Exportar resumo</strong><small>Copiar texto do mês</small></span><b>⧉</b></button><button class="list-btn" id="logoutBtn"><span><strong>Sair da conta</strong><small>Encerrar sessão</small></span><b>↪</b></button></div></section><section class="panel"><h2>Contas/cartões cadastrados</h2>${cardListHtml()}</section><section class="panel"><h2>Devedores cadastrados</h2><p class="muted">${esc(selectedCardLabel())}</p><div id="debtList">${counterpartyHtml()}</div></section>`;
    $('#themeBtn').onclick=toggleTheme; $('#profileBtn').onclick=openProfile; $('#cardBtn').onclick=()=>{activeScreen='cards'; renderCardsManager(); save();}; $('#counterBtn').onclick=()=>openAction('counterparty'); $('#pendingBtn').onclick=()=>{activeScreen='pending'; renderPendingScreen(); save();}; $('#recurringBtn').onclick=renderRecurringManager; $('#exportBtn').onclick=copySummary; $('#logoutBtn').onclick=logout;
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
    $('#modalTitle').textContent=titleText; $('#modalEyebrow').textContent=eyebrow; $('#modalBody').innerHTML=body; $('#modalRoot').classList.remove('hidden'); $('#closeModalBtn').onclick=closeModal; $('#modalRoot .modal-backdrop').onclick=closeModal; bindMoneyInputs($('#modalBody'));
  }
  function closeModal(){ $('#modalRoot').classList.add('hidden'); $('#modalBody').innerHTML='';}
  function openAction(type){closeFab(); if(type==='income'||type==='expense') openTxForm(type); if(type==='card') openCardForm(); if(type==='counterparty') openCounterpartyForm(); if(type==='recurring') openRecurringForm();}
  function categoryOptions(selected=''){
    const cats=['Alimentação','Salário','Transporte','Lazer','Moradia','Serviços','Investimento','Cartão','Outros'];
    return cats.map(c=>`<option ${selected===c?'selected':''}>${c}</option>`).join('');
  }
  function statusOptions(kind,selected=''){
    const opts = kind==='income'
      ? [['received','Recebido'],['pending','Pendente'],['not_received','Não recebido']]
      : [['paid','Pago'],['pending','Pendente'],['not_paid','Não pago']];
    return opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('');
  }
  function openTxForm(type, editData=null){
    const isIn=type==='income';
    const isEdit=!!editData;
    const tx=editData?.item||{};
    const currentMonth=editData?.month||state.selectedMonthKey;
    const titleText=isEdit?(isIn?'Editar receita':'Editar despesa'):(isIn?'Adicionar receita':'Adicionar despesa');
    openModal(titleText,`<div class="form-grid"><div class="field"><label>Data</label><input id="fDate" type="date" value="${esc(tx.date||today())}"></div><div class="field"><label>Descrição</label><input id="fDesc" value="${esc(tx.description||'')}" placeholder="Ex.: Mercado, salário, pix..."></div><div class="field"><label>Valor</label><input id="fAmount" value="${tx.amount?money(tx.amount):''}" placeholder="R$ 0,00" inputmode="numeric" data-money="brl"></div><div class="field"><label>Categoria</label><select id="fCat">${categoryOptions(tx.category||'')}</select></div><div class="field"><label>Conta/cartão</label><select id="fAccount">${cardOptions(tx.accountId||state.selectedCardId,false)}</select></div><div class="field"><label>Vincular a devedor / empresa</label><select id="fCounterparty">${counterpartyOptions(tx.counterpartyId||'')}</select></div><div class="field"><label>Status</label><select id="fStatus">${statusOptions(isIn?'income':'expense',tx.status||(isIn?'received':'paid'))}</select></div><div class="field"><label>Observação / origem</label><textarea id="fNote" rows="3" placeholder="Ex.: combinado pelo WhatsApp, parcela 1, pagamento de cliente...">${esc(tx.note||'')}</textarea></div><div class="modal-actions"><button id="saveTx" class="btn primary">${isEdit?'Salvar alterações':'Salvar'}</button>${isEdit?`<button id="deleteTxFromEdit" class="btn danger" type="button">Excluir</button>`:''}</div></div>`);
    $('#saveTx').onclick=()=>{
      const k=$('#fDate').value.slice(0,7)||state.selectedMonthKey;
      if(!assertMonthOpen(k)) return;
      ensureMonth(k);
      const item={...(isEdit?tx:{}),id:isEdit?tx.id:uid(),date:$('#fDate').value||today(),description:$('#fDesc').value|| (isIn?'Receita':'Despesa'),amount:parseMoney($('#fAmount').value),category:$('#fCat').value,status:$('#fStatus').value||(isIn?'received':'paid'),method:'Carteira',accountId:$('#fAccount').value||state.selectedCardId||'',counterpartyId:$('#fCounterparty').value||'',note:$('#fNote').value.trim()};
      if(item.amount<=0)return alert('Digite um valor maior que zero.');
      const listName=isIn?'incomes':'outflows';
      if(isEdit){
        if(!assertMonthOpen(currentMonth)) return;
        const oldM=ensureMonth(currentMonth);
        oldM[listName]=(oldM[listName]||[]).filter(x=>x.id!==tx.id);
      }
      state.months[k][listName].push(item);
      state.selectedMonthKey=k;
      closeModal(); save(); render();
    };
    const delBtn=$('#deleteTxFromEdit');
    if(delBtn) delBtn.onclick=()=>deleteTransaction(isIn?'income':'outflow',tx.id,currentMonth,true);
  }
  function openCardForm(){
    openModal('Conta / cartão',`<div class="form-grid two"><div class="field"><label>Banco / nome da conta</label><input id="cardBank" placeholder="Nubank, Bradesco, Carteira..."></div><div class="field"><label>Apelido</label><input id="cardName" placeholder="Principal"></div><div class="field"><label>Saldo inicial dessa conta</label><input id="cardOpening" placeholder="R$ 0,00" inputmode="numeric" data-money="brl"></div><div class="field"><label>Vence dia</label><input id="cardDue" type="number" value="10"></div><div class="field"><label>Compra do mês nessa conta/cartão</label><input id="cardPurchase" placeholder="R$ 0,00" inputmode="numeric" data-money="brl"></div><div class="field"><label>Descrição da compra</label><input id="cardDesc" placeholder="Compra no cartão"></div><div class="field"><label>Parcelas</label><input id="cardParc" type="number" value="1"></div><button id="saveCard" class="btn primary">Salvar conta/cartão</button></div>`);
    $('#saveCard').onclick=()=>{let card=state.cards.find(c=>(c.bank||'').toLowerCase()===$('#cardBank').value.toLowerCase()&&(c.name||'').toLowerCase()===$('#cardName').value.toLowerCase()); if(!card){card={id:uid(),bank:$('#cardBank').value||'Conta',name:$('#cardName').value||'Principal',dueDay:Number($('#cardDue').value||10),closingDay:25,openingBalance:parseMoney($('#cardOpening').value),color:'#7c3aed'}; state.cards.push(card);} else {card.openingBalance=parseMoney($('#cardOpening').value)||Number(card.openingBalance||0); card.dueDay=Number($('#cardDue').value||card.dueDay||10);} const amount=parseMoney($('#cardPurchase').value); if(amount>0){const m=ensureMonth(); m.cardPurchases.push({id:uid(),cardId:card.id,purchaseDate:today(),description:$('#cardDesc').value||'Compra no cartão',totalAmount:amount,installmentCount:Math.max(1,Number($('#cardParc').value||1)),category:'Cartão'});} state.selectedCardId=card.id; closeModal(); save(); render();};
  }
  function openCounterpartyForm(){
    openModal('Devedor / empresa',`<div class="form-grid"><div class="field"><label>Nome</label><input id="cpName" placeholder="Ex.: João, Cliente, Empresa"></div><div class="field"><label>Observação</label><input id="cpNote" placeholder="Ex.: Me deve / Eu devo"></div><button id="saveCp" class="btn primary">Salvar devedor</button></div>`);
    $('#saveCp').onclick=()=>{const name=$('#cpName').value.trim(); if(!name)return alert('Digite um nome.'); state.counterparties.push({id:uid(),name,note:$('#cpNote').value.trim()}); closeModal(); save(); render();};
  }


  function openCardPurchaseEditForm(p, originMonth){
    if(!p)return;
    openModal('Editar compra no cartão',`<div class="form-grid two"><div class="field"><label>Data da compra</label><input id="editCardDate" type="date" value="${esc(p.purchaseDate||today())}"></div><div class="field"><label>Descrição</label><input id="editCardDesc" value="${esc(p.description||'Compra no cartão')}"></div><div class="field"><label>Valor total</label><input id="editCardAmount" value="${money(p.totalAmount||0)}" inputmode="numeric" data-money="brl"></div><div class="field"><label>Parcelas</label><input id="editCardParc" type="number" value="${esc(p.installmentCount||1)}"></div><div class="field"><label>Conta/cartão</label><select id="editCardId">${cardOptions(p.cardId||p.accountId||state.selectedCardId,false)}</select></div><div class="field"><label>Categoria</label><select id="editCardCat">${categoryOptions(p.category||'Cartão')}</select></div><div class="field"><label>Vincular a devedor / empresa</label><select id="editCardCounterparty">${counterpartyOptions(p.counterpartyId||'')}</select></div><div class="field"><label>Status</label><select id="editCardStatus"><option value="paid" ${p.status==='paid'?'selected':''}>Pago</option><option value="pending" ${p.status==='pending'?'selected':''}>Pendente</option><option value="not_paid" ${p.status==='not_paid'?'selected':''}>Não pago</option></select></div><div class="field" style="grid-column:1/-1"><label>Observação</label><textarea id="editCardNote" rows="3">${esc(p.note||'')}</textarea></div><div class="modal-actions" style="grid-column:1/-1"><button id="saveCardPurchase" class="btn primary">Salvar alterações</button><button id="deleteCardPurchase" class="btn danger" type="button">Excluir</button></div></div>`,'Compra no cartão');
    $('#saveCardPurchase').onclick=()=>{
      const newMonth=($('#editCardDate').value||today()).slice(0,7);
      ensureMonth(newMonth);
      const oldM=ensureMonth(originMonth||state.selectedMonthKey);
      oldM.cardPurchases=(oldM.cardPurchases||[]).filter(x=>x.id!==p.id);
      const cardId=$('#editCardId').value||state.selectedCardId||'';
      state.months[newMonth].cardPurchases.push({...p,id:p.id,purchaseDate:$('#editCardDate').value||today(),description:$('#editCardDesc').value||'Compra no cartão',totalAmount:parseMoney($('#editCardAmount').value),installmentCount:Math.max(1,Number($('#editCardParc').value||1)),cardId,accountId:cardId,category:$('#editCardCat').value||'Cartão',status:$('#editCardStatus').value||'paid',counterpartyId:$('#editCardCounterparty').value||'',note:$('#editCardNote').value.trim()});
      state.selectedMonthKey=newMonth; closeModal(); save(); render();
    };
    $('#deleteCardPurchase').onclick=()=>deleteTransaction('card',p.id,originMonth||state.selectedMonthKey,true);
  }

  function deleteTransaction(source,id,month,closeAfter=false){
    const found=findTransaction(source,id,month); const x=found.item; if(!x)return;
    const checkMonth=source==='card'?(found.originMonth||month||state.selectedMonthKey):(month||state.selectedMonthKey);
    if(!assertMonthOpen(checkMonth)) return;
    const label=x.description||found.type||'lançamento';
    if(!confirm(`Excluir "${label}"? Essa ação não pode ser desfeita.`))return;
    const targetMonth=month||found.originMonth||state.selectedMonthKey;
    const m=ensureMonth(targetMonth);
    if(source==='income') m.incomes=(m.incomes||[]).filter(item=>item.id!==id);
    if(source==='outflow') m.outflows=(m.outflows||[]).filter(item=>item.id!==id);
    if(source==='card'){
      const origin=found.originMonth||targetMonth;
      const cm=ensureMonth(origin);
      cm.cardPurchases=(cm.cardPurchases||[]).filter(item=>item.id!==id);
    }
    if(closeAfter) closeModal();
    save(); render();
  }

  function editTransaction(source,id,month){
    const found=findTransaction(source,id,month); const x=found.item; if(!x)return;
    if(source==='income') return openTxForm('income',{item:x,month:month||state.selectedMonthKey});
    if(source==='outflow') return openTxForm('expense',{item:x,month:month||state.selectedMonthKey});
    if(source==='card') return openCardPurchaseEditForm(x,found.originMonth||month||state.selectedMonthKey);
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
    openModal(found.type,`<div class="tx-detail-card"><div class="tx-ico ${found.cls}">${found.type==='Receita'?'↗':found.type==='Cartão'?'💳':'↘'}</div><h3>${esc(x.description||found.type)}</h3><strong class="tx-detail-value ${found.cls}">${found.sign} ${money(amount)}</strong></div><div class="detail-grid"><div><span>ID interno</span><strong>${esc(x.id||id)}</strong></div><div><span>Data</span><strong>${esc(longDate(date))}</strong></div><div><span>Categoria</span><strong>${esc(x.category||'Outros')}</strong></div><div><span>Status</span><strong>${esc(statusLabel(x.status))}</strong></div><div><span>Devedor / empresa</span><strong>${esc(cp||'Sem vínculo')}</strong></div><div><span>Origem</span><strong>${esc(found.type==='Cartão'?'Compra no cartão':(x.method||'Carteira'))}</strong></div></div><div class="note-box detail-note"><strong>Observação</strong><br>${esc(x.note||'Sem observação cadastrada.')}</div><div class="modal-actions tx-detail-actions"><button class="btn soft" data-duplicate-tx="${esc(id)}" data-duplicate-source="${esc(source)}" data-duplicate-month="${esc(month||found.originMonth||state.selectedMonthKey)}">Duplicar</button><button class="btn primary" data-edit-tx="${esc(id)}" data-edit-source="${esc(source)}" data-edit-month="${esc(month||found.originMonth||state.selectedMonthKey)}">Editar</button><button class="btn danger" data-delete-tx="${esc(id)}" data-delete-source="${esc(source)}" data-delete-month="${esc(month||found.originMonth||state.selectedMonthKey)}">Excluir</button></div>`,'Detalhe do lançamento');
  }
  function openCardDetail(id){
    const c=state.cards.find(x=>x.id===id); if(!c)return;
    const prev=state.selectedCardId; state.selectedCardId=id; const t=totals(); const tx=combinedRows().slice(0,8); const debtors=state.counterparties.map(cp=>({cp,r:getCounterpartyResume(cp.id,id)})).filter(x=>x.r.count>0); state.selectedCardId=prev;
    const body=`<div class="tx-detail-card"><div class="tx-ico card">💳</div><h3>${esc(c.bank||'Conta')} • ${esc(c.name||'Principal')}</h3><strong class="tx-detail-value">${money(t.balance)}</strong><p class="muted">Saldo inicial ${money(c.openingBalance||0)} • vence dia ${esc(c.dueDay||'-')}</p></div><div class="detail-kpis"><div><span>Receitas</span><strong class="in">${money(t.income)}</strong></div><div><span>Despesas</span><strong class="out">${money(t.expenses)}</strong></div><div><span>Faturas</span><strong>${money(t.cards)}</strong></div></div><h3>Devedores dessa conta</h3><div class="transaction-list">${debtors.length?debtors.map(({cp,r})=>`<div class="tx-row clickable" data-cp-open="${esc(cp.id)}"><div class="tx-ico in">👥</div><div class="tx-main"><strong>${esc(cp.name)}</strong><small>${r.count} lançamento(s) • saldo pendente ${money(r.balance)}</small></div><div class="tx-value ${r.balance>=0?'in':'out'}">${money(r.balance)}</div></div>`).join(''):'<div class="empty">Nenhum devedor vinculado a essa conta.</div>'}</div><h3>Últimos lançamentos</h3><div class="transaction-list">${tx.length?tx.map(x=>`<div class="tx-row clickable" data-tx-id="${esc(x.txId||x.id)}" data-tx-source="${esc(x.source||x.type)}" data-tx-month="${esc(x.monthKey||state.selectedMonthKey)}"><div class="tx-ico ${x.type==='in'?'in':x.type==='card'?'card':'out'}">${x.type==='in'?'↗':x.type==='card'?'💳':'↘'}</div><div class="tx-main"><strong>${esc(x.title)}</strong><small>${esc(longDate(x.date||x.purchaseDate||`${state.selectedMonthKey}-01`))}</small></div><div class="tx-value ${x.type==='in'?'in':'out'}">${x.type==='in'?'+':'-'} ${money(x.amount)}</div></div>`).join(''):'<div class="empty">Sem lançamentos nessa conta.</div>'}</div><div class="modal-actions"><button class="btn primary" data-select-card="${esc(c.id)}">Usar esta conta</button></div>`;
    openModal('Resumo da conta/cartão',body,'Conta selecionada');
  }

  function duplicateTransaction(source,id,month){
    const found=findTransaction(source,id,month); const x=found.item; if(!x)return;
    const baseMonth=source==='card'?(found.originMonth||month||state.selectedMonthKey):(month||state.selectedMonthKey);
    if(!assertMonthOpen(state.selectedMonthKey)) return;
    if(source==='card'){
      const copy={...x,id:uid(),purchaseDate:today(),description:(x.description||'Compra')+' (cópia)'};
      ensureMonth(state.selectedMonthKey).cardPurchases.push(copy);
    }else{
      const isIn=source==='income';
      const copy={...x,id:uid(),date:today(),description:(x.description||(isIn?'Receita':'Despesa'))+' (cópia)'};
      ensureMonth(state.selectedMonthKey)[isIn?'incomes':'outflows'].push(copy);
    }
    closeModal(); save(); render();
  }

  function applyRecurringToMonth(k=state.selectedMonthKey,notify=false){
    const rules=Array.isArray(state.recurringRules)?state.recurringRules:[];
    if(!rules.length || isMonthClosed(k)) return 0;
    const m=ensureMonth(k); let added=0;
    rules.filter(r=>r.active!==false && Number(r.amount||0)>0).forEach(r=>{
      const list=r.type==='income'?'incomes':'outflows';
      const exists=(m[list]||[]).some(x=>x.recurringRuleId===r.id && String(x.date||'').slice(0,7)===k);
      if(exists) return;
      const day=String(Math.min(28,Math.max(1,Number(r.day||1)))).padStart(2,'0');
      m[list].push({
        id:uid(), recurringRuleId:r.id, date:`${k}-${day}`, description:r.description, amount:Number(r.amount||0), category:r.category||'Outros',
        status:r.status || (r.type==='income'?'pending':'pending'), method:'Recorrente', accountId:r.accountId||state.selectedCardId||'', counterpartyId:r.counterpartyId||'', note:r.note||'Criado automaticamente por recorrência.'
      });
      added++;
    });
    return added;
  }

  function recurringRulesHtml(){
    const rules=Array.isArray(state.recurringRules)?state.recurringRules:[];
    if(!rules.length) return '<div class="empty">Nenhum lançamento recorrente cadastrado ainda.</div>';
    return rules.map(r=>`<div class="tx-row"><div class="tx-ico ${r.type==='income'?'in':'out'}">${r.type==='income'?'↗':'↘'}</div><div class="tx-main"><strong>${esc(r.description)}</strong><small>${r.type==='income'?'Receita':'Despesa'} • dia ${esc(r.day||1)} • ${esc(r.category||'Outros')} • ${esc(counterpartyName(r.counterpartyId)||'sem devedor')}</small></div><div class="debtor-actions"><strong class="tx-value ${r.type==='income'?'in':'out'}">${money(r.amount)}</strong><button class="btn danger" data-del-recurring="${esc(r.id)}">Excluir</button></div></div>`).join('');
  }
  function renderRecurringManager(){
    openModal('Lançamentos recorrentes', `<div class="panel-subtitle muted">Cadastre contas fixas como aluguel, internet, salário e academia. Depois aplique no mês selecionado.</div><div class="modal-actions"><button class="btn primary" id="newRecurringBtn">+ Novo recorrente</button><button class="btn soft" data-apply-recurring="1">Aplicar neste mês</button></div><div class="transaction-list" style="margin-top:14px">${recurringRulesHtml()}</div>`, 'Recorrência');
    $('#newRecurringBtn').onclick=openRecurringForm;
  }
  function openRecurringForm(){
    openModal('Novo recorrente', `<div class="form-grid"><div class="field"><label>Tipo</label><select id="recType"><option value="expense">Despesa</option><option value="income">Receita</option></select></div><div class="field"><label>Descrição</label><input id="recDesc" placeholder="Aluguel, internet, salário..."></div><div class="field"><label>Valor</label><input id="recAmount" placeholder="R$ 0,00" inputmode="numeric" data-money="brl"></div><div class="field"><label>Dia do mês</label><input id="recDay" type="number" min="1" max="28" value="1"></div><div class="field"><label>Categoria</label><select id="recCat">${categoryOptions('Outros')}</select></div><div class="field"><label>Conta/cartão</label><select id="recAccount">${cardOptions(state.selectedCardId,false)}</select></div><div class="field"><label>Vincular a devedor / empresa</label><select id="recCounterparty">${counterpartyOptions()}</select></div><div class="field"><label>Observação</label><textarea id="recNote" rows="3" placeholder="Detalhe do recorrente"></textarea></div><button id="saveRecurring" class="btn primary">Salvar recorrente</button></div>`, 'Recorrência');
    $('#saveRecurring').onclick=()=>{
      const amount=parseMoney($('#recAmount').value); if(amount<=0) return alert('Digite um valor maior que zero.');
      const type=$('#recType').value;
      state.recurringRules=Array.isArray(state.recurringRules)?state.recurringRules:[];
      state.recurringRules.push({id:uid(),type,description:$('#recDesc').value||'Lançamento recorrente',amount,day:Math.min(28,Math.max(1,Number($('#recDay').value||1))),category:$('#recCat').value||'Outros',accountId:$('#recAccount').value||'',counterpartyId:$('#recCounterparty').value||'',status:'pending',note:$('#recNote').value.trim(),active:true});
      closeModal(); save(); renderRecurringManager();
    };
  }
  function deleteRecurringRule(id){
    const rule=(state.recurringRules||[]).find(r=>r.id===id); if(!rule)return;
    if(!confirm(`Excluir recorrente "${rule.description}"? Os lançamentos já criados nos meses anteriores serão mantidos.`)) return;
    state.recurringRules=(state.recurringRules||[]).filter(r=>r.id!==id);
    save(); renderRecurringManager();
  }

  function pendingRows(){
    const rows=[];
    Object.entries(state.months||{}).forEach(([k,m])=>{
      (m.incomes||[]).forEach(x=>{ if(matchesSelectedCard(x) && ['pending','not_received'].includes(String(x.status||''))) rows.push({...x,type:'in',source:'income',txId:x.id,monthKey:k,title:x.description||'Receita'}); });
      (m.outflows||[]).forEach(x=>{ if(matchesSelectedCard(x) && ['pending','not_paid'].includes(String(x.status||''))) rows.push({...x,type:'out',source:'outflow',txId:x.id,monthKey:k,title:x.description||'Despesa'}); });
    });
    return rows.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  }
  function renderPendingScreen(){
    const rows=pendingRows();
    const rec=rows.filter(x=>x.type==='in').reduce((a,x)=>a+Number(x.amount||0),0);
    const pay=rows.filter(x=>x.type==='out').reduce((a,x)=>a+Number(x.amount||0),0);
    const byPerson={}; rows.forEach(x=>{const n=counterpartyName(x.counterpartyId)||'Sem devedor'; byPerson[n]=(byPerson[n]||0)+(x.type==='in'?Number(x.amount||0):-Number(x.amount||0));});
    title('Pendências','Tudo que está a receber, a pagar, vencido ou pendente.');
    $('#appContent').innerHTML=`${accountSelectorHtml()}<section class="panel"><div class="detail-kpis"><div><span>A receber</span><strong class="in">${money(rec)}</strong></div><div><span>A pagar</span><strong class="out">${money(pay)}</strong></div><div><span>Saldo pendente</span><strong>${money(rec-pay)}</strong></div></div></section><section class="panel"><h2>Por pessoa/devedor</h2><div class="transaction-list">${Object.entries(byPerson).map(([k,v])=>`<div class="tx-row"><div class="tx-ico in">👥</div><div class="tx-main"><strong>${esc(k)}</strong><small>Saldo pendente</small></div><div class="tx-value ${v>=0?'in':'out'}">${money(v)}</div></div>`).join('')||'<div class="empty">Nenhuma pendência por pessoa.</div>'}</div></section><section class="panel"><h2>Lista de pendências</h2><div class="transaction-list">${rows.map(x=>`<div class="tx-row clickable" data-tx-id="${esc(x.txId)}" data-tx-source="${esc(x.source)}" data-tx-month="${esc(x.monthKey)}"><div class="tx-ico ${x.type==='in'?'in':'out'}">${x.type==='in'?'↗':'↘'}</div><div class="tx-main"><strong>${esc(x.title)}</strong><small>${esc(longDate(x.date||`${x.monthKey}-01`))} • ${esc(statusLabel(x.status))} • ${esc(counterpartyName(x.counterpartyId)||'Sem devedor')}</small></div><div class="tx-value ${x.type==='in'?'in':'out'}">${x.type==='in'?'+':'-'} ${money(x.amount)}</div></div>`).join('')||'<div class="empty">Nada pendente. Muito bom!</div>'}</div></section>`;
    bindDynamicHandlers($('#appContent'));
  }
  function openProfile(){
    const m=ensureMonth();
    openModal('Perfil e saldo',`<div class="form-grid"><div class="field"><label>Nome</label><input id="pName" value="${state.profile.name||''}"></div><div class="field"><label>Saldo inicial do mês</label><input id="pOpening" value="${money(m.openingBalance)}" inputmode="numeric" data-money="brl"></div><div class="field"><label>Meta de guardar</label><input id="pGoal" value="${money(m.saveGoal)}" inputmode="numeric" data-money="brl"></div><div class="field"><label>Guardado no mês</label><input id="pSaved" value="${money(m.savedThisMonth)}" inputmode="numeric" data-money="brl"></div><button id="saveProfile" class="btn primary">Salvar</button></div>`,'Configurações');
    $('#saveProfile').onclick=()=>{state.profile.name=$('#pName').value||'Usuário';m.openingBalance=parseMoney($('#pOpening').value);m.saveGoal=parseMoney($('#pGoal').value);m.savedThisMonth=parseMoney($('#pSaved').value);closeModal();save();render();};
  }
  function copySummary(){const t=totals(); const txt=`Resumo ${monthLabel(state.selectedMonthKey)}\nReceitas: ${money(t.income)}\nDespesas: ${money(t.expenses)}\nSaldo: ${money(t.balance)}`; navigator.clipboard?.writeText(txt); alert('Resumo copiado.');}
  function toggleTheme(){state.theme=state.theme==='dark'?'light':'dark'; save(); render();}
  async function logout(){ if(confirm('Sair da conta?')){ try{ if(BOOT.logout) await BOOT.logout(); }catch{} location.href='index.html';}}
  function toggleFab(){const open=$('#fabMenu').classList.contains('hidden'); $('#fabMenu').classList.toggle('hidden',!open); $('#fabBackdrop').classList.toggle('hidden',!open); $('#fabBtn').classList.toggle('open',open);}
  function closeFab(){$('#fabMenu').classList.add('hidden');$('#fabBackdrop').classList.add('hidden');$('#fabBtn').classList.remove('open');}
  function boot(){
    ensureMonth();
    applyRecurringToMonth(state.selectedMonthKey,false);
    if(state.__migration?.needsSave){
      console.info('Migração de dados financeiros aplicada:', state.__migration);
      save();
    }
    document.addEventListener('click',(e)=>{
      const del=e.target.closest('[data-delcp]');
      if(del){e.preventDefault();e.stopPropagation(); deleteCounterparty(del.dataset.delcp); return;}
      const selectCard=e.target.closest('[data-select-card]');
      if(selectCard){e.preventDefault();e.stopPropagation(); setSelectedCard(selectCard.dataset.selectCard||''); return;}
      const cardDetail=e.target.closest('[data-card-detail]');
      if(cardDetail){e.preventDefault();e.stopPropagation(); openCardDetail(cardDetail.dataset.cardDetail); return;}
      const newCard=e.target.closest('[data-action-card="new"]');
      if(newCard){e.preventDefault();e.stopPropagation(); openAction('card'); return;}
      const duplicateTx=e.target.closest('[data-duplicate-tx]');
      if(duplicateTx){e.preventDefault();e.stopPropagation(); duplicateTransaction(duplicateTx.dataset.duplicateSource,duplicateTx.dataset.duplicateTx,duplicateTx.dataset.duplicateMonth); return;}
      const delRec=e.target.closest('[data-del-recurring]');
      if(delRec){e.preventDefault();e.stopPropagation(); deleteRecurringRule(delRec.dataset.delRecurring); return;}
      const applyRec=e.target.closest('[data-apply-recurring]');
      if(applyRec){e.preventDefault();e.stopPropagation(); const added=applyRecurringToMonth(state.selectedMonthKey,true); alert(added?`${added} recorrente(s) aplicado(s).`:'Nenhum recorrente novo para aplicar neste mês.'); save(); render(); return;}
      const editTx=e.target.closest('[data-edit-tx]');
      if(editTx){e.preventDefault();e.stopPropagation(); editTransaction(editTx.dataset.editSource,editTx.dataset.editTx,editTx.dataset.editMonth); return;}
      const deleteTx=e.target.closest('[data-delete-tx]');
      if(deleteTx){e.preventDefault();e.stopPropagation(); deleteTransaction(deleteTx.dataset.deleteSource,deleteTx.dataset.deleteTx,deleteTx.dataset.deleteMonth,true); return;}
      const cp=e.target.closest('[data-cp-open]');
      if(cp){e.preventDefault();e.stopPropagation(); openCounterpartyDetail(cp.dataset.cpOpen); return;}
      const tx=e.target.closest('[data-tx-id]');
      if(tx){e.preventDefault();openTransactionDetail(tx.dataset.txSource,tx.dataset.txId,tx.dataset.txMonth);}
    });
    $$('.seg-tab,.bottom-item,.rail-btn[data-screen]').forEach(b=>b.onclick=()=>setScreen(b.dataset.screen));
    $('#prevMonthBtn').onclick=()=>{state.selectedMonthKey=shiftMonth(state.selectedMonthKey,-1);ensureMonth();applyRecurringToMonth(state.selectedMonthKey,true);save();render();};
    $('#nextMonthBtn').onclick=()=>{state.selectedMonthKey=shiftMonth(state.selectedMonthKey,1);ensureMonth();applyRecurringToMonth(state.selectedMonthKey,true);save();render();};
    $('#monthPickerBtn').onclick=()=>{const v=prompt('Digite o mês no formato AAAA-MM',state.selectedMonthKey); if(/^\d{4}-\d{2}$/.test(v||'')){state.selectedMonthKey=v;ensureMonth();applyRecurringToMonth(state.selectedMonthKey,true);save();render();}};
    $('#fabBtn').onclick=toggleFab; $('#fabBackdrop').onclick=closeFab; $$('#fabMenu [data-action]').forEach(b=>b.onclick=()=>openAction(b.dataset.action));
    $('#quickSettingsBtn').onclick=()=>setScreen('more'); $('#menuToggleBtn').onclick=toggleFab; $('#railThemeBtn').onclick=toggleTheme; $('#railLogoutBtn').onclick=logout; render();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
