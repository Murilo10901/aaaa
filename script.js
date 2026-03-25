const BOOT = window.APP_BOOTSTRAP || null;
const STORAGE_KEY = BOOT?.cacheKey || "assistente_financeiro_cartoes_filtrados_v4";

let remoteSaveTimer = null;
let remoteSaveRunning = false;
let lastRemoteSerialized = "";

const CATEGORY_OPTIONS = [
  "Salário",
  "Renda extra",
  "Reembolso",
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Lazer",
  "Assinaturas",
  "Educação",
  "Compras",
  "Contas",
  "Pix",
  "Outros"
];

const syncStatusBadge = document.getElementById("syncStatusBadge");

let syncBadgeTimer = null;

function showSyncBadge(text, type = "syncing", autoHideMs = 0) {
  if (!syncStatusBadge) return;

  clearTimeout(syncBadgeTimer);
  syncStatusBadge.textContent = text;
  syncStatusBadge.classList.remove("hidden", "syncing", "saved", "error");
  syncStatusBadge.classList.add(type);

  if (autoHideMs > 0) {
    syncBadgeTimer = setTimeout(() => {
      syncStatusBadge.classList.add("hidden");
    }, autoHideMs);
  }
}

function hideSyncBadge() {
  if (!syncStatusBadge) return;
  clearTimeout(syncBadgeTimer);
  syncStatusBadge.classList.add("hidden");
}
const PAYMENT_METHODS = ["Pix", "Débito", "Transferência", "Dinheiro", "Boleto", "Outro"];

const INCOME_STATUS_OPTIONS = [
  { value: "received", label: "Recebido" },
  { value: "pending", label: "Pendente" },
  { value: "not_received", label: "Não recebido" }
];

const OUTFLOW_STATUS_OPTIONS = [
  { value: "paid", label: "Pago" },
  { value: "pending", label: "Pendente" },
  { value: "not_paid", label: "Não pago" }
];

const CARD_COLORS = [
  { label: "Cinza", value: "#BFC5CF", text: "#111111" },
  { label: "Preto", value: "#0B0B0F", text: "#FFFFFF" },
  { label: "Azul", value: "#4B73B9", text: "#FFFFFF" },
  { label: "Coral", value: "#F46A6A", text: "#FFFFFF" },
  { label: "Roxo", value: "#7C4DFF", text: "#FFFFFF" },
  { label: "Verde", value: "#2E8B57", text: "#FFFFFF" }
];

const state = {
  onboardingSeen: false,
  onboardingStep: 0,
  activeChart: "selected",
  activeTab: "account",
  selectedMonthKey: "",
  selectedCardId: "",
  summaryCardFilter: "all",
  summaryProjectionMode: "current",
  summaryStatusFilter: "all",
  selectedCounterpartyId: "",
  lastSeenRealMonth: "",
  profile: {
    name: "",
    photo: "",
    email: "",
    fixedSalary: 0,
    defaultSaveGoal: 0,
    savingsPotBase: 0,
    fixedIncomes: [],
    fixedOutflows: []
  },
  cards: [],
  counterparties: [],
  months: {}
};

const onboardingSteps = [
  {
    icon: "👋",
    title: "Bem-vindo",
    text: "Esse sistema ajuda você a controlar conta, cartões, parcelas, pendências e dinheiro guardado mês a mês.",
    hint: "Tudo fica salvo na sua conta e também no navegador como segurança."
  },
  {
    icon: "🙋",
    title: "Como podemos te chamar?",
    text: "Seu nome aparece em várias partes do sistema para deixar a experiência mais pessoal.",
    hint: "Digite seu nome abaixo.",
    askName: true
  },
  {
    icon: "💳",
    title: "Cartões separados",
    text: "Cada cartão fica isolado. Ao clicar em um cartão no topo, a aba Cartões mostra só os dados dele.",
    hint: "As compras do cartão vão para o mês da data da compra."
  },
  {
    icon: "🧾",
    title: "Conta e saídas",
    text: "Na aba Conta você registra tudo que entrou e saiu da conta, com data, descrição, valor e categoria.",
    hint: "A data define em qual mês o lançamento aparece."
  },
  {
    icon: "🤝",
    title: "Pendências",
    text: "Agora você também pode cadastrar pessoas e empresas, vinculando entradas e saídas pendentes.",
    hint: "Assim você controla quem te deve e para quem você deve."
  },
  {
    icon: "📦",
    title: "Parcelas automáticas",
    text: "Ao lançar uma compra parcelada, as parcelas são distribuídas automaticamente pelos próximos meses.",
    hint: "Isso ajuda a enxergar a fatura futura."
  },
  {
    icon: "🐷",
    title: "Dinheiro guardado",
    text: "Na aba Guardar você define a meta do mês e registra quanto realmente guardou no cofrinho.",
    hint: "O sistema soma o histórico guardado com o valor inicial do seu cofrinho."
  },
  {
    icon: "☁️",
    title: "Salvo na sua conta",
    text: "Tudo que você altera fica vinculado ao seu login e pode ser acessado em outros dispositivos.",
    hint: "Se algo mudar, o sistema salva localmente e também sincroniza com sua conta."
  }
];

// ELEMENTOS
// Adicione isso junto com os outros const de elementos
const welcomeMonthModal = document.getElementById("welcomeMonthModal");
const welcomeMonthValue = document.getElementById("welcomeMonthValue");
const closeWelcomeMonthBtn = document.getElementById("closeWelcomeMonthBtn");
const closeWelcomeMonthBackdrop = document.getElementById("closeWelcomeMonthBackdrop");
const howToUseBtn = document.getElementById("howToUseBtn");
const menuToggleBtn = document.getElementById("menuToggleBtn");

const monthSelect = document.getElementById("monthSelect");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");
const createMonthBtn = document.getElementById("createMonthBtn");
const duplicateMonthBtn = document.getElementById("duplicateMonthBtn");

const cardCarousel = document.getElementById("cardCarousel");
const createCardQuickBtn = document.getElementById("createCardQuickBtn");
const editSelectedCardQuickBtn = document.getElementById("editSelectedCardQuickBtn");
const showAllCardsBtn = document.getElementById("showAllCardsBtn");

const counterpartyCarousel = document.getElementById("counterpartyCarousel");
const clearCounterpartyFilterBtn = document.getElementById("clearCounterpartyFilterBtn");
const openCounterpartiesTabBtn = document.getElementById("openCounterpartiesTabBtn");

const dashOpening = document.getElementById("dashOpening");
const dashIncome = document.getElementById("dashIncome");
const dashOutflow = document.getElementById("dashOutflow");
const dashCards = document.getElementById("dashCards");
const dashFree = document.getElementById("dashFree");
const dashDaily = document.getElementById("dashDaily");

const sumIncome = document.getElementById("sumIncome");
const sumOutflow = document.getElementById("sumOutflow");
const sumCards = document.getElementById("sumCards");
const sumSaveGoal = document.getElementById("sumSaveGoal");
const sumPendingReceivable = document.getElementById("sumPendingReceivable");
const sumPendingPayable = document.getElementById("sumPendingPayable");
const sumRemaining = document.getElementById("sumRemaining");
const sumFree = document.getElementById("sumFree");
const assistantMessage = document.getElementById("assistantMessage");
const monthAlerts = document.getElementById("monthAlerts");

const summaryFilterAllBtn = document.getElementById("summaryFilterAllBtn");
const summaryFilterSelectedBtn = document.getElementById("summaryFilterSelectedBtn");
const summaryModeCurrentBtn = document.getElementById("summaryModeCurrentBtn");
const summaryModeProjectedBtn = document.getElementById("summaryModeProjectedBtn");
const summaryStatusAllBtn = document.getElementById("summaryStatusAllBtn");
const summaryStatusSettledBtn = document.getElementById("summaryStatusSettledBtn");
const summaryStatusPendingBtn = document.getElementById("summaryStatusPendingBtn");
const summaryCounterpartySelect = document.getElementById("summaryCounterpartySelect");

const mainTabs = document.getElementById("mainTabs");
const tabContent = document.getElementById("tabContent");

const chartTitle = document.getElementById("chartTitle");
const chartLegend = document.getElementById("chartLegend");
const financeChart = document.getElementById("financeChart");
const chartTabs = [...document.querySelectorAll(".chart-tab")];

const sideMenu = document.getElementById("sideMenu");
const sideMenuBackdrop = document.getElementById("sideMenuBackdrop");
const closeMenuBtn = document.getElementById("closeMenuBtn");

const menuProfileImage = document.getElementById("menuProfileImage");
const menuProfileFallback = document.getElementById("menuProfileFallback");
const menuProfileName = document.getElementById("menuProfileName");
const menuProfileEmail = document.getElementById("menuProfileEmail");
const menuCurrentMonthLabel = document.getElementById("menuCurrentMonthLabel");
const menuFreeValue = document.getElementById("menuFreeValue");
const menuSavingsPotValue = document.getElementById("menuSavingsPotValue");

const openProfileBtn = document.getElementById("openProfileBtn");
const openImportBtn = document.getElementById("openImportBtn");
const exportTxtBtn = document.getElementById("exportTxtBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const copySummaryBtn = document.getElementById("copySummaryBtn");
const applyFixedValuesBtn = document.getElementById("applyFixedValuesBtn");
const resetBtn = document.getElementById("resetBtn");
const logoutAppBtn = document.getElementById("logoutAppBtn");

const importModal = document.getElementById("importModal");
const closeImportBtn = document.getElementById("closeImportBtn");
const closeImportBackdrop = document.getElementById("closeImportBackdrop");
const applyImportBtn = document.getElementById("applyImportBtn");
const clearImportBtn = document.getElementById("clearImportBtn");
const importText = document.getElementById("importText");

const profileModal = document.getElementById("profileModal");
const closeProfileBtn = document.getElementById("closeProfileBtn");
const closeProfileBackdrop = document.getElementById("closeProfileBackdrop");
const saveProfileBtn = document.getElementById("saveProfileBtn");

const profileNameInput = document.getElementById("profileNameInput");
const profilePhotoInput = document.getElementById("profilePhotoInput");
const fixedSalaryInput = document.getElementById("fixedSalaryInput");
const fixedSaveGoalInput = document.getElementById("fixedSaveGoalInput");
const savingsPotBaseInput = document.getElementById("savingsPotBaseInput");
const fixedIncomeName = document.getElementById("fixedIncomeName");
const fixedIncomeValue = document.getElementById("fixedIncomeValue");
const fixedExpenseName = document.getElementById("fixedExpenseName");
const fixedExpenseValue = document.getElementById("fixedExpenseValue");
const addFixedIncomeBtn = document.getElementById("addFixedIncomeBtn");
const addFixedExpenseBtn = document.getElementById("addFixedExpenseBtn");
const fixedIncomeList = document.getElementById("fixedIncomeList");
const fixedExpenseList = document.getElementById("fixedExpenseList");

const onboardingModal = document.getElementById("onboardingModal");
const onboardingCounter = document.getElementById("onboardingCounter");
const onboardingProgressFill = document.getElementById("onboardingProgressFill");
const onboardingIcon = document.getElementById("onboardingIcon");
const onboardingTitle = document.getElementById("onboardingTitle");
const onboardingText = document.getElementById("onboardingText");
const onboardingHint = document.getElementById("onboardingHint");
const onboardingAskName = document.getElementById("onboardingAskName");
const onboardingNameInput = document.getElementById("onboardingNameInput");
const skipOnboardingBtn = document.getElementById("skipOnboardingBtn");
const prevOnboardingBtn = document.getElementById("prevOnboardingBtn");
const nextOnboardingBtn = document.getElementById("nextOnboardingBtn");

const itemRowTemplate = document.getElementById("itemRowTemplate");

// UTILS
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function userName() {
  return state.profile.name?.trim() || "você";
}

function monthKeyFromDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function shortMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

function shiftMonth(monthKey, offset) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return monthKeyFromDate(date);
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function toSafeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function shortCurrency(value) {
  const num = Number(value || 0);
  if (Math.abs(num) >= 1000) return `R$ ${(num / 1000).toFixed(1)}k`;
  return `R$ ${num.toFixed(0)}`;
}

function parseMoneyString(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;

  let str = String(value).trim();
  str = str
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = parseFloat(str);
  return isNaN(number) ? 0 : number;
}

function formatMoneyMaskFromCents(cents) {
  const value = cents / 100;
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function getRawMoneyInputValue(input) {
  const cents = Number(input.dataset.cents || 0);
  return cents / 100;
}

function setMoneyInputValue(input, value) {
  const cents = Math.round(Number(value || 0) * 100);
  input.dataset.cents = String(Math.max(cents, 0));
  input.value = formatMoneyMaskFromCents(Math.max(cents, 0));
}

function bindMoneyInputs(root = document) {
  const inputs = root.querySelectorAll("[data-money]");
  inputs.forEach((input) => {
    if (input.dataset.bound === "true") return;
    input.dataset.bound = "true";

    if (!input.dataset.cents) input.dataset.cents = "0";
    if (!input.value) input.value = formatMoneyMaskFromCents(0);

    input.addEventListener("focus", () => input.select());

    input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "");
      const cents = digits ? Number(digits) : 0;
      input.dataset.cents = String(cents);
      input.value = formatMoneyMaskFromCents(cents);
    });
  });
}

function showButtonSuccess(button, originalText, successText = "Adicionado") {
  button.disabled = true;
  button.textContent = successText;
  button.classList.remove("btn-primary");
  button.classList.add("btn-success");

  setTimeout(() => {
    button.disabled = false;
    button.textContent = originalText;
    button.classList.remove("btn-success");
    button.classList.add("btn-primary");
  }, 900);
}

function getCardColorMeta(colorValue) {
  return CARD_COLORS.find((c) => c.value === colorValue) || CARD_COLORS[0];
}

function shadeColor(hex, percent) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00ff) + percent;
  let b = (num & 0x0000ff) + percent;

  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);

  return `rgb(${r}, ${g}, ${b})`;
}

function getMonthKeyFromDateString(dateStr, fallback = state.selectedMonthKey) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return fallback;
  return dateStr.slice(0, 7);
}

function createEmptyMonthData() {
  return {
    openingBalance: 0,
    incomes: [],
    outflows: [],
    cardPurchases: [],
    manualInvoices: {},
    saveGoal: 0,
    savedThisMonth: 0
  };
}

function ensureMonthShape(monthData) {
  if (!monthData || typeof monthData !== "object") {
    return createEmptyMonthData();
  }

  const normalizeIncome = (item) => ({
    ...item,
    status: item?.status || "received",
    counterpartyId: item?.counterpartyId || ""
  });

  const normalizeOutflow = (item) => ({
    ...item,
    status: item?.status || "paid",
    counterpartyId: item?.counterpartyId || ""
  });

  return {
    openingBalance: Number(monthData.openingBalance || 0),
    incomes: Array.isArray(monthData.incomes) ? monthData.incomes.map(normalizeIncome) : [],
    outflows: Array.isArray(monthData.outflows) ? monthData.outflows.map(normalizeOutflow) : [],
    cardPurchases: Array.isArray(monthData.cardPurchases) ? monthData.cardPurchases : [],
    manualInvoices: monthData.manualInvoices && typeof monthData.manualInvoices === "object"
      ? monthData.manualInvoices
      : {},
    saveGoal: Number(monthData.saveGoal || 0),
    savedThisMonth: Number(monthData.savedThisMonth || 0)
  };
}

function normalizeStateShape(source) {
  return {
    onboardingSeen: source?.onboardingSeen ?? false,
    onboardingStep: source?.onboardingStep ?? 0,
    activeChart: source?.activeChart ?? "selected",
    activeTab: source?.activeTab ?? "account",
    selectedMonthKey: source?.selectedMonthKey ?? monthKeyFromDate(),
    selectedCardId: source?.selectedCardId ?? "",
    summaryCardFilter: source?.summaryCardFilter ?? "all",
    summaryProjectionMode: source?.summaryProjectionMode ?? "current",
    summaryStatusFilter: source?.summaryStatusFilter ?? "all",
    selectedCounterpartyId: source?.selectedCounterpartyId ?? "",
    lastSeenRealMonth: source?.lastSeenRealMonth ?? monthKeyFromDate(),
    profile: {
      name: source?.profile?.name ?? BOOT?.profile?.display_name ?? "",
      photo: source?.profile?.photo ?? BOOT?.profile?.avatar_url ?? "",
      email: source?.profile?.email ?? BOOT?.profile?.email ?? BOOT?.user?.email ?? "",
      fixedSalary: Number(source?.profile?.fixedSalary || 0),
      defaultSaveGoal: Number(source?.profile?.defaultSaveGoal || 0),
      savingsPotBase: Number(source?.profile?.savingsPotBase || 0),
      fixedIncomes: Array.isArray(source?.profile?.fixedIncomes) ? source.profile.fixedIncomes : [],
      fixedOutflows: Array.isArray(source?.profile?.fixedOutflows) ? source.profile.fixedOutflows : []
    },
    cards: Array.isArray(source?.cards) ? source.cards : [],
    counterparties: Array.isArray(source?.counterparties) ? source.counterparties : [],
    months: Object.fromEntries(
      Object.entries(source?.months || {}).map(([key, value]) => [key, ensureMonthShape(value)])
    )
  };
}

function ensureMonthExists(monthKey) {
  state.months[monthKey] = ensureMonthShape(state.months[monthKey]);
}

function getSelectedMonthData() {
  ensureMonthExists(state.selectedMonthKey);
  return state.months[state.selectedMonthKey];
}

function getMonthKeysSorted() {
  return Object.keys(state.months).sort();
}
function queueRemoteSave() {
  if (!BOOT?.saveState) return;

  clearTimeout(remoteSaveTimer);

  remoteSaveTimer = setTimeout(async () => {
    if (remoteSaveRunning) return;

    const serialized = JSON.stringify(state);
    if (serialized === lastRemoteSerialized) return;

    remoteSaveRunning = true;
    showSyncBadge("Sincronizando...", "syncing");

    try {
      await BOOT.saveState(JSON.parse(serialized));
      lastRemoteSerialized = serialized;
      showSyncBadge("Salvo", "saved", 1400);
    } catch (error) {
      console.error("Falha ao salvar no Supabase:", error);
      showSyncBadge("Erro ao sincronizar", "error", 2500);
    } finally {
      remoteSaveRunning = false;
    }
  }, 700);
}


async function syncProfileToRemote() {
  if (!BOOT?.updateProfile) return;

  try {
    await BOOT.updateProfile({
      display_name: state.profile.name || "",
      avatar_url: state.profile.photo || null
    });
  } catch (error) {
    console.error("Falha ao sincronizar perfil remoto:", error);
  }
}

function saveState() {
  queueRemoteSave();
}

function loadState() {
  let source = null;

  if (BOOT?.initialState) {
    source = BOOT.initialState;
  }

  const normalized = normalizeStateShape(source || {});
  Object.assign(state, normalized);

  if (!state.selectedMonthKey) {
    state.selectedMonthKey = monthKeyFromDate();
  }

  ensureMonthExists(state.selectedMonthKey);

  if (!Object.keys(state.months).length) {
    state.months[state.selectedMonthKey] = createEmptyMonthData();
  }

  if (!state.profile.email && BOOT?.user?.email) {
    state.profile.email = BOOT.user.email;
  }
}


function createEmptyState(text) {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.textContent = text;
  return div;
}

function createItemRow(item, metaText, onEdit, onDelete) {
  const node = itemRowTemplate.content.cloneNode(true);
  const wrapper = node.querySelector(".item-row");

  wrapper.querySelector(".item-name").textContent = item.name || item.description || "Item";
  wrapper.querySelector(".item-meta").textContent = metaText || "";
  wrapper.querySelector(".item-value").textContent = formatCurrency(item.amount ?? item.value ?? 0);

  const editBtn = wrapper.querySelector(".edit-btn");
  const deleteBtn = wrapper.querySelector(".delete-btn");

  if (onEdit) {
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onEdit();
    });
  } else {
    editBtn.remove();
  }

  if (onDelete) {
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onDelete();
    });
  } else {
    deleteBtn.remove();
  }

  return node;
}

// DEVEDORES / EMPRESAS
function getCounterpartyById(counterpartyId) {
  return state.counterparties.find((item) => item.id === counterpartyId) || null;
}

function getCounterpartyName(counterpartyId) {
  return getCounterpartyById(counterpartyId)?.name || "Sem vínculo";
}

function getStatusLabel(status) {
  const map = {
    received: "Recebido",
    paid: "Pago",
    pending: "Pendente",
    not_received: "Não recebido",
    not_paid: "Não pago"
  };
  return map[status] || status;
}

function getIncomeStatusOptions() {
  return [
    { value: "received", label: "Recebido" },
    { value: "pending", label: "Pendente" },
    { value: "not_received", label: "Não recebido" }
  ];
}

function getOutflowStatusOptions() {
  return [
    { value: "paid", label: "Pago" },
    { value: "pending", label: "Pendente" },
    { value: "not_paid", label: "Não pago" }
  ];
}

function updateIncomeStatus(incomeId, newStatus) {
  const monthData = getSelectedMonthData();
  const item = monthData.incomes.find((entry) => entry.id === incomeId);
  if (!item) return;

  item.status = newStatus;
  saveState();
  renderApp();
}

function updateOutflowStatus(outflowId, newStatus) {
  const monthData = getSelectedMonthData();
  const item = monthData.outflows.find((entry) => entry.id === outflowId);
  if (!item) return;

  item.status = newStatus;
  saveState();
  renderApp();
}

function createStatusDropdown(item, type) {
  const select = document.createElement("select");
  select.className = `status-dropdown ${item.status || ""}`;

  const options = type === "income"
    ? getIncomeStatusOptions()
    : getOutflowStatusOptions();

  select.innerHTML = options
    .map((option) => `
      <option value="${option.value}" ${option.value === item.status ? "selected" : ""}>
        ${option.label}
      </option>
    `)
    .join("");

  select.addEventListener("change", (e) => {
    const newStatus = e.target.value;

    select.className = `status-dropdown ${newStatus}`;

    if (type === "income") {
      updateIncomeStatus(item.id, newStatus);
    } else {
      updateOutflowStatus(item.id, newStatus);
    }
  });

  return select;
}


function isSettledStatus(status) {
  return status === "received" || status === "paid";
}

function isPendingLikeStatus(status) {
  return status === "pending" || status === "not_received" || status === "not_paid";
}

function matchesCounterpartyFilter(item) {
  if (!state.selectedCounterpartyId) return true;
  return item.counterpartyId === state.selectedCounterpartyId;
}

function matchesStatusFilter(item) {
  const status = item?.status || "";

  if (state.summaryStatusFilter === "settled") return isSettledStatus(status);
  if (state.summaryStatusFilter === "pending") return isPendingLikeStatus(status);

  if (state.summaryProjectionMode === "current") return isSettledStatus(status);
  return true;
}

function getFilteredMonthIncomes(monthData) {
  return (monthData.incomes || []).filter((item) => matchesCounterpartyFilter(item) && matchesStatusFilter(item));
}

function getFilteredMonthOutflows(monthData) {
  return (monthData.outflows || []).filter((item) => matchesCounterpartyFilter(item) && matchesStatusFilter(item));
}

function getPendingReceivableTotal(monthKey = state.selectedMonthKey) {
  const monthData = ensureMonthShape(state.months[monthKey]);
  return (monthData.incomes || [])
    .filter((item) => matchesCounterpartyFilter(item) && (item.status === "pending" || item.status === "not_received"))
    .reduce((acc, item) => acc + Number(item.amount || 0), 0);
}

function getPendingPayableTotal(monthKey = state.selectedMonthKey) {
  const monthData = ensureMonthShape(state.months[monthKey]);
  return (monthData.outflows || [])
    .filter((item) => matchesCounterpartyFilter(item) && (item.status === "pending" || item.status === "not_paid"))
    .reduce((acc, item) => acc + Number(item.amount || 0), 0);
}

function getCounterpartyResume(counterpartyId) {
  let receivable = 0;
  let payable = 0;
  let settledReceivable = 0;
  let settledPayable = 0;

  Object.values(state.months).forEach((monthData) => {
    ensureMonthShape(monthData).incomes.forEach((item) => {
      if (item.counterpartyId !== counterpartyId) return;
      if (item.status === "received") settledReceivable += Number(item.amount || 0);
      else receivable += Number(item.amount || 0);
    });

    ensureMonthShape(monthData).outflows.forEach((item) => {
      if (item.counterpartyId !== counterpartyId) return;
      if (item.status === "paid") settledPayable += Number(item.amount || 0);
      else payable += Number(item.amount || 0);
    });
  });

  return {
    receivable,
    payable,
    settledReceivable,
    settledPayable,
    netPending: receivable - payable
  };
}

function buildCounterpartyOptions(selectedId = "") {
  const options = [`<option value="">Nenhum / sem vínculo</option>`];
  state.counterparties.forEach((item) => {
    options.push(`<option value="${item.id}" ${selectedId === item.id ? "selected" : ""}>${item.name}</option>`);
  });
  return options.join("");
}

function renderSummaryCounterpartySelect() {
  if (!summaryCounterpartySelect) return;

  summaryCounterpartySelect.innerHTML =
    `<option value="">Todos</option>` +
    state.counterparties
      .map((item) => `<option value="${item.id}" ${state.selectedCounterpartyId === item.id ? "selected" : ""}>${item.name}</option>`)
      .join("");
}

function renderCounterpartyCarousel() {
  if (!counterpartyCarousel) return;
  counterpartyCarousel.innerHTML = "";

  if (!state.counterparties.length) {
    counterpartyCarousel.appendChild(createEmptyState("Nenhum devedor / empresa cadastrado ainda."));
    return;
  }

  state.counterparties.forEach((item) => {
    const resume = getCounterpartyResume(item.id);

    const chip = document.createElement("button");
    chip.className = `counterparty-chip ${state.selectedCounterpartyId === item.id ? "active" : ""}`;
    chip.innerHTML = `
      <div class="counterparty-chip-name">${item.name}</div>
      <div class="counterparty-chip-meta">
        <span>Te deve: ${formatCurrency(resume.receivable)}</span>
        <span>Você deve: ${formatCurrency(resume.payable)}</span>
        <span>Saldo pendente: ${formatCurrency(resume.netPending)}</span>
      </div>
    `;

    chip.addEventListener("click", () => {
      state.selectedCounterpartyId = item.id;
      state.activeTab = "counterparties";
      saveState();
      renderApp();
    });

    counterpartyCarousel.appendChild(chip);
  });
}

// CARTÕES
function getCardById(cardId) {
  return state.cards.find((card) => card.id === cardId);
}

function installmentAmounts(totalAmount, count) {
  const totalCents = Math.round(Number(totalAmount || 0) * 100);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  const amounts = [];

  for (let i = 0; i < count; i++) {
    amounts.push((base + (i < remainder ? 1 : 0)) / 100);
  }

  return amounts;
}

function getAllPurchasesWithOrigin() {
  const result = [];
  Object.entries(state.months).forEach(([monthKey, monthData]) => {
    ensureMonthShape(monthData).cardPurchases.forEach((purchase) => {
      result.push({ monthKey, purchase });
    });
  });
  return result;
}

function getInstallmentsForMonth(monthKey, cardFilter = "all") {
  const result = [];

  getAllPurchasesWithOrigin().forEach(({ monthKey: originMonth, purchase }) => {
    const amounts = installmentAmounts(purchase.totalAmount, purchase.installmentCount);

    amounts.forEach((amount, index) => {
      const installmentMonth = shiftMonth(originMonth, index);
      if (installmentMonth !== monthKey) return;
      if (cardFilter !== "all" && purchase.cardId !== cardFilter) return;

      result.push({
        id: `${purchase.id}_${index + 1}`,
        purchaseId: purchase.id,
        cardId: purchase.cardId,
        description: purchase.description,
        purchaseDate: purchase.purchaseDate,
        installmentLabel: `${index + 1}/${purchase.installmentCount}`,
        amount,
        category: purchase.category || "Outros"
      });
    });
  });

  return result;
}

function getManualInvoice(cardId, monthKey = state.selectedMonthKey) {
  ensureMonthExists(monthKey);
  return Number(state.months[monthKey].manualInvoices?.[cardId] || 0);
}

function setManualInvoice(cardId, value, monthKey = state.selectedMonthKey) {
  ensureMonthExists(monthKey);

  if (!state.months[monthKey].manualInvoices || typeof state.months[monthKey].manualInvoices !== "object") {
    state.months[monthKey].manualInvoices = {};
  }

  const numericValue = Number(value || 0);
  state.months[monthKey].manualInvoices[cardId] = numericValue;

  // Faz a fatura manual virar uma saída da conta
  syncManualInvoiceToOutflow(cardId, numericValue, monthKey);

  saveState();
}
function syncManualInvoiceToOutflow(cardId, value, monthKey = state.selectedMonthKey) {
  ensureMonthExists(monthKey);

  const monthData = state.months[monthKey];
  const numericValue = Number(value || 0);
  const card = getCardById(cardId);

  if (!card) return;

  const existingIndex = monthData.outflows.findIndex(
    (item) => item.fromManualInvoice === true && item.cardId === cardId
  );

  if (numericValue <= 0) {
    if (existingIndex >= 0) {
      monthData.outflows.splice(existingIndex, 1);
    }
    return;
  }

  const outflowPayload = {
    id: existingIndex >= 0 ? monthData.outflows[existingIndex].id : uid(),
    date: `${monthKey}-10`,
    description: `Pagamento fatura - ${card.name}`,
    amount: numericValue,
    category: "Fatura cartão",
    method: "Débito",
    status: "paid",
    counterpartyId: "",
    fromManualInvoice: true,
    cardId
  };

  if (existingIndex >= 0) {
    monthData.outflows[existingIndex] = outflowPayload;
  } else {
    monthData.outflows.push(outflowPayload);
  }
}

function getInvoiceBreakdown(cardId, monthKey = state.selectedMonthKey) {
  const detailed = getInstallmentsForMonth(monthKey, cardId)
    .reduce((acc, item) => acc + item.amount, 0);

  const manual = getManualInvoice(cardId, monthKey);

  return {
    detailed,
    manual,
    // manual não entra mais no total de faturas,
    // porque virou saída da conta
    total: detailed
  };
}

function getInvoiceTotal(cardId, monthKey = state.selectedMonthKey) {
  return getInvoiceBreakdown(cardId, monthKey).total;
}

function getSelectedCard() {
  return state.cards.find((card) => card.id === state.selectedCardId) || null;
}

// TOTAIS
function endOfMonthDaysRemaining(monthKey = state.selectedMonthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const lastDay = new Date(year, month, 0).getDate();

  if (!isCurrentMonth) return lastDay;

  const today = now.getDate();
  return Math.max(lastDay - today + 1, 1);
}

function getFilteredCardTotal(monthKey = state.selectedMonthKey) {
  if (state.summaryCardFilter === "selected" && state.selectedCardId) {
    return getInvoiceTotal(state.selectedCardId, monthKey);
  }

  return state.cards.reduce((acc, card) => acc + getInvoiceTotal(card.id, monthKey), 0);
}

function getTotals(monthData = getSelectedMonthData(), monthKey = state.selectedMonthKey) {
  const filteredIncomes = getFilteredMonthIncomes(monthData);
  const filteredOutflows = getFilteredMonthOutflows(monthData);

  const openingBalance = Number(monthData.openingBalance || 0);

  const totalIncome = filteredIncomes.reduce((acc, item) => acc + toSafeNumber(item.amount), 0);
  const totalOutflow = filteredOutflows.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const totalCards = getFilteredCardTotal(monthKey);

  const pendingReceivable = getPendingReceivableTotal(monthKey);
  const pendingPayable = getPendingPayableTotal(monthKey);

  const savedThisMonth = Number(monthData.savedThisMonth || 0);
  const saveGoal = Number(monthData.saveGoal || 0);

  const totalExpense = totalOutflow + totalCards;

  const currentBalance = openingBalance + totalIncome - totalExpense;
  const projectedBalance =
    openingBalance + totalIncome + pendingReceivable - totalExpense - pendingPayable;

  const balanceByMode =
    state.summaryProjectionMode === "projected"
      ? projectedBalance
      : currentBalance;

  const freeToSpend = balanceByMode - savedThisMonth;
  const dailyFree = freeToSpend / endOfMonthDaysRemaining(monthKey);

  return {
    openingBalance,
    totalIncome,
    totalOutflow,
    totalCards,
    totalExpense,
    pendingReceivable,
    pendingPayable,
    saveGoal,
    savedThisMonth,
    currentBalance,
    projectedBalance,
    remaining: balanceByMode,
    freeToSpend,
    dailyFree
  };
}

function getSavingsPotTotal() {
  const monthlySaved = Object.values(state.months).reduce(
    (acc, monthData) => acc + Number(monthData.savedThisMonth || 0),
    0
  );
  return Number(state.profile.savingsPotBase || 0) + monthlySaved;
}

function getCategoryBreakdown(monthKey = state.selectedMonthKey) {
  const monthData = state.months[monthKey];
  if (!monthData) return [];

  const map = new Map();

  getFilteredMonthOutflows(monthData).forEach((item) => {
    const cat = item.category || "Outros";
    map.set(cat, (map.get(cat) || 0) + Number(item.amount || 0));
  });

  const cardFilter = state.summaryCardFilter === "selected" ? state.selectedCardId || "all" : "all";
  getInstallmentsForMonth(monthKey, cardFilter).forEach((item) => {
    const cat = item.category || "Outros";
    map.set(cat, (map.get(cat) || 0) + Number(item.amount || 0));
  });

  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function getMonthAlerts() {
  const monthData = getSelectedMonthData();
  const alerts = [];
  const totals = getTotals();

  const hasCardPurchases = monthData.cardPurchases.length > 0;
  const hasManualInvoice = Object.values(monthData.manualInvoices || {}).some((v) => Number(v || 0) > 0);

  const suspiciousOutflows = monthData.outflows.filter((item) => {
    const text = `${item.description || ""} ${item.category || ""}`.toLowerCase();
    return /fatura|cart[aã]o|credito|crédito|nubank|inter|itau|ita[uú]|santander|bradesco/.test(text);
  });

  if (hasCardPurchases && suspiciousOutflows.length > 0) {
    alerts.push("Você tem compras no cartão e também saídas da conta com cara de cartão/fatura. Verifique se não está duplicando valor.");
  }

  if (hasCardPurchases && hasManualInvoice) {
    alerts.push("Você tem compras detalhadas no cartão e ajuste manual de fatura no mesmo mês. O ajuste manual deve ser usado só para valor avulso que não foi lançado compra por compra.");
  }

  if (monthData.openingBalance === 0 && monthData.incomes.length > 0 && monthData.outflows.length > 0) {
    alerts.push("Seu saldo inicial está zerado. Se havia dinheiro parado na conta no começo do mês, cadastre o saldo inicial para o cálculo ficar correto.");
  }

  if (totals.remaining < 0) {
  alerts.push(`Seu mês está negativo em ${formatCurrency(Math.abs(totals.remaining))}.`);
}

  if (!state.cards.length) {
    alerts.push("Você ainda não cadastrou cartões. Se usa cartão de crédito, crie o cartão e lance as compras na aba Cartões.");
  }

  if (!monthData.incomes.length && !monthData.outflows.length && !hasCardPurchases) {
    alerts.push("Esse mês ainda está praticamente vazio.");
  }

  return alerts;
}

// MENU / PERFIL
function updateMenuProfile() {
  const totals = getTotals();
  const name = state.profile.name?.trim() || "Usuário";

  menuProfileName.textContent = name;
  menuProfileEmail.textContent = state.profile.email || BOOT?.user?.email || "Sem email";
  menuCurrentMonthLabel.textContent = monthLabel(state.selectedMonthKey);
  menuFreeValue.textContent = formatCurrency(totals.freeToSpend);
  menuSavingsPotValue.textContent = formatCurrency(getSavingsPotTotal());

  if (state.profile.photo) {
    menuProfileImage.src = state.profile.photo;
    menuProfileImage.style.display = "block";
    menuProfileFallback.style.display = "none";
  } else {
    menuProfileImage.removeAttribute("src");
    menuProfileImage.style.display = "none";
    menuProfileFallback.style.display = "grid";
    menuProfileFallback.textContent = name.charAt(0).toUpperCase() || "?";
  }
}

function openSideMenu() {
  sideMenu.classList.add("open");
}

function closeSideMenu() {
  sideMenu.classList.remove("open");
}

function openImportModal() {
  importModal.classList.remove("hidden");
}

function closeImportModal() {
  importModal.classList.add("hidden");
}

function openProfileModal() {
  profileModal.classList.remove("hidden");
  hydrateProfileModal();
}

function closeProfileModal() {
  profileModal.classList.add("hidden");
}

function hydrateProfileModal() {
  profileNameInput.value = state.profile.name || "";
  setMoneyInputValue(fixedSalaryInput, state.profile.fixedSalary || 0);
  setMoneyInputValue(fixedSaveGoalInput, state.profile.defaultSaveGoal || 0);
  setMoneyInputValue(savingsPotBaseInput, state.profile.savingsPotBase || 0);
  renderFixedLists();
  bindMoneyInputs(profileModal);
}

function renderFixedLists() {
  fixedIncomeList.innerHTML = "";
  fixedExpenseList.innerHTML = "";

  if (state.profile.fixedIncomes.length === 0) {
    fixedIncomeList.appendChild(createEmptyState("Nenhuma receita fixa cadastrada."));
  } else {
    state.profile.fixedIncomes.forEach((item) => {
      fixedIncomeList.appendChild(
        createItemRow(
          { name: item.name, amount: item.amount },
          "Receita fixa",
          () => editFixedIncome(item.id),
          () => removeFixedIncomeById(item.id)
        )
      );
    });
  }

  if (state.profile.fixedOutflows.length === 0) {
    fixedExpenseList.appendChild(createEmptyState("Nenhum gasto fixo cadastrado."));
  } else {
    state.profile.fixedOutflows.forEach((item) => {
      fixedExpenseList.appendChild(
        createItemRow(
          { name: item.name, amount: item.amount },
          "Gasto fixo",
          () => editFixedOutflow(item.id),
          () => removeFixedOutflowById(item.id)
        )
      );
    });
  }
}

function saveProfileData() {
  state.profile.name = profileNameInput.value.trim();
  state.profile.fixedSalary = getRawMoneyInputValue(fixedSalaryInput);
  state.profile.defaultSaveGoal = getRawMoneyInputValue(fixedSaveGoalInput);
  state.profile.savingsPotBase = getRawMoneyInputValue(savingsPotBaseInput);

  saveState();
  syncProfileToRemote();
  renderApp();
  closeProfileModal();
  alert("Perfil salvo com sucesso.");
}

function handlePhotoUpload(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    state.profile.photo = reader.result;
    saveState();
    await syncProfileToRemote();
    updateMenuProfile();
  };
  reader.readAsDataURL(file);
}

function applyFixedValuesToCurrentMonth() {
  const monthData = getSelectedMonthData();

  if (Number(state.profile.fixedSalary || 0) > 0) {
    const existsSalary = monthData.incomes.some((item) => item.fromFixedSalary);
    if (!existsSalary) {
      monthData.incomes.push({
        id: uid(),
        date: `${state.selectedMonthKey}-05`,
        description: "Salário fixo",
        amount: Number(state.profile.fixedSalary),
        category: "Salário",
        status: "received",
        counterpartyId: "",
        fromFixedSalary: true
      });
    }
  }

  state.profile.fixedIncomes.forEach((item) => {
    const exists = monthData.incomes.some((income) => income.description === item.name && income.fromFixedProfile);
    if (!exists) {
      monthData.incomes.push({
        id: uid(),
        date: `${state.selectedMonthKey}-05`,
        description: item.name,
        amount: Number(item.amount || 0),
        category: "Renda extra",
        status: "received",
        counterpartyId: "",
        fromFixedProfile: true
      });
    }
  });

  state.profile.fixedOutflows.forEach((item) => {
    const exists = monthData.outflows.some((out) => out.description === item.name && out.fromFixedProfile);
    if (!exists) {
      monthData.outflows.push({
        id: uid(),
        date: `${state.selectedMonthKey}-10`,
        description: item.name,
        amount: Number(item.amount || 0),
        category: "Contas",
        method: "Débito",
        status: "paid",
        counterpartyId: "",
        fromFixedProfile: true
      });
    }
  });

  if (!monthData.saveGoal && Number(state.profile.defaultSaveGoal || 0) > 0) {
    monthData.saveGoal = Number(state.profile.defaultSaveGoal || 0);
  }

  saveState();
  renderApp();
  alert(`Valores fixos aplicados em ${monthLabel(state.selectedMonthKey)}.`);
}

// ONBOARDING
function openOnboarding(forceStart = false) {
  if (forceStart) state.onboardingStep = 0;
  onboardingModal.classList.remove("hidden");
  renderOnboardingStep();
}

function closeOnboarding(markSeen = true) {
  onboardingModal.classList.add("hidden");
  if (markSeen) {
    state.onboardingSeen = true;
    saveState();
  }
}

function renderOnboardingStep() {
  const step = onboardingSteps[state.onboardingStep];
  onboardingCounter.textContent = `${state.onboardingStep + 1} / ${onboardingSteps.length}`;
  onboardingProgressFill.style.width = `${((state.onboardingStep + 1) / onboardingSteps.length) * 100}%`;
  onboardingIcon.textContent = step.icon;
  onboardingTitle.textContent = step.title;
  onboardingText.textContent = step.text;
  onboardingHint.textContent = step.hint;
  onboardingAskName.classList.toggle("hidden", !step.askName);
  prevOnboardingBtn.style.visibility = state.onboardingStep === 0 ? "hidden" : "visible";
  nextOnboardingBtn.textContent = state.onboardingStep === onboardingSteps.length - 1 ? "Finalizar" : "Próximo";

  if (step.askName) {
    onboardingNameInput.value = state.profile.name || "";
    setTimeout(() => onboardingNameInput.focus(), 30);
  }
}

function nextOnboarding() {
  const current = onboardingSteps[state.onboardingStep];

  if (current.askName) {
    const name = onboardingNameInput.value.trim();
    if (name) {
      state.profile.name = name;
      syncProfileToRemote();
    }
  }

  if (state.onboardingStep < onboardingSteps.length - 1) {
    state.onboardingStep++;
    saveState();
    renderOnboardingStep();
  } else {
    closeOnboarding(true);
    renderApp();
  }
}

function prevOnboarding() {
  if (state.onboardingStep > 0) {
    state.onboardingStep--;
    renderOnboardingStep();
  }
}

// MÊS

function populateMonthSelect() {
  const keys = getMonthKeysSorted();
  monthSelect.innerHTML = "";

  keys.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = monthLabel(key);
    option.selected = key === state.selectedMonthKey;
    monthSelect.appendChild(option);
  });
}

function createNewMonth() {
  const raw = prompt("Digite o mês no formato AAAA-MM:", state.selectedMonthKey);
  if (!raw) return;

  const value = raw.trim();
  if (!/^\d{4}-\d{2}$/.test(value)) {
    alert("Formato inválido. Use AAAA-MM.");
    return;
  }

  ensureMonthExists(value);
  state.selectedMonthKey = value;
  saveState();
  renderApp();
}

function duplicatePreviousMonth() {
  const previousKey = shiftMonth(state.selectedMonthKey, -1);
  ensureMonthExists(previousKey);
  ensureMonthExists(state.selectedMonthKey);

  const source = ensureMonthShape(state.months[previousKey]);
  const clone = JSON.parse(JSON.stringify(source));
  clone.incomes = clone.incomes.map((item) => ({ ...item, id: uid() }));
  clone.outflows = clone.outflows.map((item) => ({ ...item, id: uid() }));
  clone.cardPurchases = [];
  clone.manualInvoices = { ...(source.manualInvoices || {}) };

  state.months[state.selectedMonthKey] = ensureMonthShape(clone);

  saveState();
  renderApp();
  alert(`Dados base de ${monthLabel(previousKey)} copiados para ${monthLabel(state.selectedMonthKey)}.`);
}

function resetSelectedMonth() {
  state.months[state.selectedMonthKey] = createEmptyMonthData();
  state.months[state.selectedMonthKey].saveGoal = state.profile.defaultSaveGoal || 0;
  saveState();
  renderApp();
}

// IMPORT / EXPORT
function normalizeImportSection(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function ensureImportCard(bankName = "Cartão", cardName = "Cartão principal", importedCards = []) {
  let existing = state.cards.find(
    (c) =>
      c.bank.toLowerCase() === bankName.toLowerCase() &&
      c.name.toLowerCase() === cardName.toLowerCase()
  );

  if (existing) return existing;

  let imported = importedCards.find(
    (c) =>
      c.bank.toLowerCase() === bankName.toLowerCase() &&
      c.name.toLowerCase() === cardName.toLowerCase()
  );

  if (imported) return imported;

  imported = {
    id: uid(),
    bank: bankName,
    name: cardName,
    closingDay: 25,
    dueDay: 5,
    color: CARD_COLORS[0].value,
    active: true
  };

  importedCards.push(imported);
  return imported;
}

function parseHumanImport(text) {
  let targetMonthKey = state.selectedMonthKey;
  const importedMonth = createEmptyMonthData();
  const importedCards = [];
  const profilePatch = {};

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let currentSection = "";

  const parseLineItem = (line) => {
    const parts = line.split(":");
    if (parts.length < 2) return null;

    const name = parts.slice(0, -1).join(":").trim();
    const rawValue = parts[parts.length - 1].trim();
    const amount = parseMoneyString(rawValue);

    return { name, amount };
  };

  for (const line of lines) {
    const normalized = normalizeImportSection(line);

    if (
      normalized === "MES" ||
      normalized === "ENTRADAS" ||
      normalized === "FATURA CARTAO" ||
      normalized === "FATURA CARTÃO" ||
      normalized === "GASTOS FORA DO CARTAO" ||
      normalized === "GASTOS FORA DO CARTÃO" ||
      normalized === "CONTAS EXTRAS" ||
      normalized === "OBJETIVO DE ECONOMIA" ||
      normalized === "SALDO INICIAL"
    ) {
      currentSection = normalized;
      continue;
    }

    if (normalized.startsWith("MES=")) {
      const maybeMonth = line.split("=").slice(1).join("=").trim();
      if (/^\d{4}-\d{2}$/.test(maybeMonth)) targetMonthKey = maybeMonth;
      continue;
    }

    if (normalized.startsWith("NOME=")) {
      profilePatch.name = line.split("=").slice(1).join("=").trim();
      continue;
    }

    if (normalized.startsWith("SALDO INICIAL:")) {
      importedMonth.openingBalance = parseMoneyString(line.split(":").slice(1).join(":"));
      continue;
    }

    if (currentSection === "ENTRADAS") {
      const item = parseLineItem(line);
      if (!item) continue;
      importedMonth.incomes.push({
        id: uid(),
        date: `${targetMonthKey}-05`,
        description: item.name,
        amount: item.amount,
        category: /salario/i.test(item.name) ? "Salário" : "Renda extra",
        status: "received",
        counterpartyId: ""
      });
      continue;
    }

    if (currentSection === "FATURA CARTAO" || currentSection === "FATURA CARTÃO") {
      const item = parseLineItem(line);
      if (!item) continue;

      let bankName = "Cartão";
      let cardName = "Cartão principal";
      const lowered = item.name.toLowerCase();

      if (lowered.includes("nubank")) bankName = "Nubank";
      if (lowered.includes("inter")) bankName = "Inter";
      if (lowered.includes("itau") || lowered.includes("itaú")) bankName = "Itaú";
      if (lowered.includes("santander")) bankName = "Santander";
      if (lowered.includes("bradesco")) bankName = "Bradesco";
      if (lowered.includes("caixa")) bankName = "Caixa";

      const card = ensureImportCard(bankName, cardName, importedCards);
      importedMonth.manualInvoices[card.id] = (importedMonth.manualInvoices[card.id] || 0) + item.amount;
      continue;
    }

    if (currentSection === "GASTOS FORA DO CARTAO" || currentSection === "GASTOS FORA DO CARTÃO") {
      const item = parseLineItem(line);
      if (!item) continue;

      importedMonth.outflows.push({
        id: uid(),
        date: `${targetMonthKey}-06`,
        description: item.name,
        amount: Math.abs(item.amount),
        category: "Outros",
        method: "Débito",
        status: "paid",
        counterpartyId: ""
      });
      continue;
    }

    if (currentSection === "CONTAS EXTRAS") {
      const item = parseLineItem(line);
      if (!item) continue;

      if (item.amount >= 0) {
        importedMonth.incomes.push({
          id: uid(),
          date: `${targetMonthKey}-06`,
          description: item.name,
          amount: item.amount,
          category: "Renda extra",
          status: "received",
          counterpartyId: ""
        });
      } else {
        importedMonth.outflows.push({
          id: uid(),
          date: `${targetMonthKey}-06`,
          description: item.name,
          amount: Math.abs(item.amount),
          category: "Outros",
          method: "Pix",
          status: "paid",
          counterpartyId: ""
        });
      }
      continue;
    }

    if (currentSection === "OBJETIVO DE ECONOMIA") {
      const item = parseLineItem(line);
      if (item) importedMonth.saveGoal = item.amount;
      else importedMonth.saveGoal = parseMoneyString(line);
      continue;
    }
  }

  return {
    targetMonthKey,
    importedMonth,
    importedCards,
    profilePatch
  };
}

function generateTxtExport() {
  const monthData = getSelectedMonthData();
  const lines = [];

  lines.push("MES=" + state.selectedMonthKey);
  lines.push("");

  lines.push("ENTRADAS");
  if (monthData.incomes.length === 0) lines.push("Nenhuma: 0");
  else monthData.incomes.forEach((item) => lines.push(`${item.description}: ${item.amount}`));

  lines.push("");
  lines.push("FATURA CARTAO");
  if (state.cards.length === 0) {
    lines.push("Sem cartao: 0");
  } else {
    state.cards.forEach((card) => {
      const total = getInvoiceTotal(card.id, state.selectedMonthKey);
      if (total > 0) lines.push(`${card.bank}: ${total}`);
    });
  }

  lines.push("");
  lines.push("GASTOS FORA DO CARTAO");
  if (monthData.outflows.length === 0) lines.push("Nenhum: 0");
  else monthData.outflows.forEach((item) => lines.push(`${item.description}: ${item.amount}`));

  lines.push("");
  lines.push("OBJETIVO DE ECONOMIA");
  lines.push(`Guardar: ${monthData.saveGoal || 0}`);

  return lines.join("\n");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

async function copySummaryToClipboard() {
  try {
    await navigator.clipboard.writeText(generateTxtExport());
    alert("Resumo copiado.");
  } catch {
    alert("Não foi possível copiar automaticamente.");
  }
}

function applyImportedContent() {
  const raw = importText.value.trim();

  if (!raw) {
    alert("Cole um conteúdo para importar.");
    return;
  }

  try {
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeStateShape(parsed);
      Object.assign(state, normalized);
      ensureMonthExists(state.selectedMonthKey);
    } else {
      const result = parseHumanImport(raw);

      state.profile = {
        ...state.profile,
        ...result.profilePatch
      };

      result.importedCards.forEach((card) => {
        const exists = state.cards.some(
          (existing) =>
            existing.bank.toLowerCase() === card.bank.toLowerCase() &&
            existing.name.toLowerCase() === card.name.toLowerCase()
        );

        if (!exists) {
          state.cards.push(card);
        }
      });

      ensureMonthExists(result.targetMonthKey);
      state.months[result.targetMonthKey] = ensureMonthShape(result.importedMonth);
      state.selectedMonthKey = result.targetMonthKey;

      if (!state.selectedCardId && state.cards.length > 0) {
        state.selectedCardId = state.cards[0].id;
      }
    }

    saveState();
    syncProfileToRemote();
    renderApp();
    closeImportModal();
    alert("Importação concluída.");
  } catch (error) {
    console.error(error);
    alert("Não foi possível interpretar o conteúdo informado.");
  }
}

// GRÁFICO
function resizeCanvasForDPI(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function drawSelectedMonthChart() {
  const ctx = resizeCanvasForDPI(financeChart);
  const rect = financeChart.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  const totals = getTotals();
  const data = [
    { label: "Entrou", value: totals.totalIncome },
    { label: "Saiu", value: totals.totalOutflow },
    { label: "Fatura", value: totals.totalCards },
    { label: "Livre", value: Math.max(totals.freeToSpend, 0) }
  ];

  const max = Math.max(...data.map((d) => d.value), 1);
  const padding = 20;
  const chartHeight = height - 56;
  const slotWidth = (width - padding * 2) / data.length;
  const barWidth = Math.max(slotWidth - 14, 24);

  data.forEach((item, index) => {
    const x = padding + index * slotWidth + (slotWidth - barWidth) / 2;
    const barHeight = (item.value / max) * (chartHeight - 30);
    const y = chartHeight - barHeight + 8;

    const gradient = ctx.createLinearGradient(x, y, x, chartHeight + 8);
    gradient.addColorStop(0, "rgba(139,92,246,0.95)");
    gradient.addColorStop(1, "rgba(109,40,217,0.65)");

    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, x, y, barWidth, barHeight, 10);

    ctx.fillStyle = "rgba(184,173,201,0.95)";
    ctx.font = "11px Inter";
    ctx.textAlign = "center";
    ctx.fillText(shortCurrency(item.value), x + barWidth / 2, y - 6);

    ctx.fillStyle = "rgba(245,242,255,0.92)";
    ctx.font = "12px Inter";
    ctx.fillText(item.label, x + barWidth / 2, height - 10);
  });

  chartTitle.textContent = `Resumo de ${monthLabel(state.selectedMonthKey)}`;
  chartLegend.innerHTML = `
    <span class="legend-item">Entradas do mês</span>
    <span class="legend-item">Saídas da conta</span>
    <span class="legend-item">${state.summaryCardFilter === "selected" && state.selectedCardId ? "Fatura do cartão selecionado" : "Faturas de todos os cartões"}</span>
    <span class="legend-item">Livre para gastar</span>
  `;
}

function drawHistoryChart() {
  const ctx = resizeCanvasForDPI(financeChart);
  const rect = financeChart.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const keys = getMonthKeysSorted().slice(-8);
  const points = keys.map((key) => {
    const totals = getTotals(state.months[key], key);
    return {
      key,
      label: shortMonthLabel(key),
      value: totals.freeToSpend
    };
  });

  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(max - min, 1);

  const paddingX = 20;
  const paddingTop = 16;
  const paddingBottom = 32;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const y = paddingTop + (chartHeight / 3) * i;
    ctx.beginPath();
    ctx.moveTo(paddingX, y);
    ctx.lineTo(width - paddingX, y);
    ctx.stroke();
  }

  if (points.length === 0) return;

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = points.length === 1 ? width / 2 : paddingX + (chartWidth / (points.length - 1)) * index;
    const y = paddingTop + chartHeight - ((point.value - min) / range) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = "rgba(139,92,246,0.95)";
  ctx.lineWidth = 3;
  ctx.stroke();

  points.forEach((point, index) => {
    const x = points.length === 1 ? width / 2 : paddingX + (chartWidth / (points.length - 1)) * index;
    const y = paddingTop + chartHeight - ((point.value - min) / range) * chartHeight;

    ctx.fillStyle = "rgba(139,92,246,1)";
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(245,242,255,0.92)";
    ctx.font = "12px Inter";
    ctx.textAlign = "center";
    ctx.fillText(point.label, x, height - 10);
  });

  chartTitle.textContent = "Histórico do valor livre";
  chartLegend.innerHTML = `
    <span class="legend-item">Linha = livre para gastar por mês</span>
    <span class="legend-item">Últimos ${points.length} mês(es)</span>
  `;
}

function renderChart() {
  chartTabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.chart === state.activeChart);
  });

  if (state.activeChart === "history") drawHistoryChart();
  else drawSelectedMonthChart();
}

// RESUMOS
function updateDashboard() {
  const monthData = getSelectedMonthData();
  const totals = getTotals();

  dashOpening.textContent = formatCurrency(monthData.openingBalance || 0);
  dashIncome.textContent = formatCurrency(totals.totalIncome);
  dashOutflow.textContent = formatCurrency(totals.totalOutflow);
  dashCards.textContent = formatCurrency(totals.totalCards);
  dashFree.textContent = formatCurrency(totals.freeToSpend);
  dashDaily.textContent = formatCurrency(totals.dailyFree);

  sumIncome.textContent = formatCurrency(totals.totalIncome);
  sumOutflow.textContent = formatCurrency(totals.totalOutflow);
  sumCards.textContent = formatCurrency(totals.totalCards);
  sumSaveGoal.textContent = formatCurrency(monthData.savedThisMonth || 0);

  sumPendingReceivable.textContent = formatCurrency(totals.pendingReceivable);
  sumPendingPayable.textContent = formatCurrency(totals.pendingPayable);

  sumRemaining.textContent = formatCurrency(totals.remaining);
  sumFree.textContent = formatCurrency(totals.freeToSpend);

  sumRemaining.parentElement.classList.toggle("negative", totals.remaining < 0);
  sumFree.parentElement.classList.toggle("negative", totals.freeToSpend < 0);

  summaryFilterAllBtn.classList.toggle("active", state.summaryCardFilter === "all");
  summaryFilterSelectedBtn.classList.toggle("active", state.summaryCardFilter === "selected");
  summaryFilterSelectedBtn.disabled = !state.selectedCardId;

  summaryModeCurrentBtn.classList.toggle("active", state.summaryProjectionMode === "current");
  summaryModeProjectedBtn.classList.toggle("active", state.summaryProjectionMode === "projected");

  summaryStatusAllBtn.classList.toggle("active", state.summaryStatusFilter === "all");
  summaryStatusSettledBtn.classList.toggle("active", state.summaryStatusFilter === "settled");
  summaryStatusPendingBtn.classList.toggle("active", state.summaryStatusFilter === "pending");

  renderSummaryCounterpartySelect();
}

function updateAssistantMessage() {
  const totals = getTotals();
  const month = monthLabel(state.selectedMonthKey);
  const name = userName();

  if (state.summaryProjectionMode === "projected") {
    if (totals.projectedBalance >= 0) {
      assistantMessage.textContent =
        `${name}, no cenário projetado de ${month}, ` +
        `se você receber ${formatCurrency(totals.pendingReceivable)} ` +
        `e pagar ${formatCurrency(totals.pendingPayable)}, ` +
        `vai sobrar ${formatCurrency(totals.projectedBalance)} no mês.`;
    } else {
      assistantMessage.textContent =
        `${name}, no cenário projetado de ${month}, ` +
        `mesmo recebendo ${formatCurrency(totals.pendingReceivable)}, ` +
        `você ainda fica negativo em ${formatCurrency(Math.abs(totals.projectedBalance))}.`;
    }
    return;
  }

  if (totals.currentBalance >= 0) {
    assistantMessage.textContent =
      `${name}, no cenário atual de ${month}, ` +
      `sobram ${formatCurrency(totals.currentBalance)} no mês.`;
  } else {
    assistantMessage.textContent =
      `${name}, no cenário atual de ${month}, ` +
      `você está negativo em ${formatCurrency(Math.abs(totals.currentBalance))}.`;
  }
}

function renderMonthAlerts() {
  const alerts = getMonthAlerts();
  monthAlerts.innerHTML = "";

  if (!alerts.length) {
    const ok = document.createElement("div");
    ok.className = "note-box";
    ok.innerHTML = "Tudo certo por aqui. Seu mês não apresenta alerta importante de cadastro.";
    monthAlerts.appendChild(ok);
    return;
  }

  alerts.forEach((text) => {
    const item = document.createElement("div");
    item.className = "note-box";
    item.style.marginTop = "10px";
    item.innerHTML = `⚠ ${text}`;
    monthAlerts.appendChild(item);
  });
}

function renderCardCarousel() {
  cardCarousel.innerHTML = "";

  if (state.cards.length === 0) {
    const placeholder = document.createElement("button");
    placeholder.className = "create-card-placeholder";
    placeholder.textContent = "+ Criar cartão";
    placeholder.addEventListener("click", quickCreateCard);
    cardCarousel.appendChild(placeholder);
    return;
  }

  state.cards.forEach((card) => {
    const colorMeta = getCardColorMeta(card.color);

    const cardEl = document.createElement("button");
    cardEl.className = `fin-card ${state.selectedCardId === card.id ? "active" : ""}`;
    cardEl.style.background = `linear-gradient(135deg, ${card.color}, ${shadeColor(card.color, -12)})`;
    cardEl.style.color = colorMeta.text;

    cardEl.innerHTML = `
      <span class="fin-card-contactless">)))</span>
      <div class="fin-card-chip"></div>
      <div>
        <div class="fin-card-bank">${card.bank}</div>
        <div class="fin-card-number">0000 0000 0000 0000</div>
      </div>
      <div>
        <div class="fin-card-meta">fecha ${card.closingDay} • vence ${card.dueDay}</div>
        <div class="fin-card-name">${card.name}</div>
      </div>
    `;

    cardEl.addEventListener("click", () => {
      state.selectedCardId = card.id;
      state.summaryCardFilter = "selected";
      state.activeTab = "cards";
      renderApp();
    });

    cardCarousel.appendChild(cardEl);
  });

  const addCard = document.createElement("button");
  addCard.className = "create-card-placeholder";
  addCard.textContent = "+ Criar cartão";
  addCard.addEventListener("click", quickCreateCard);
  cardCarousel.appendChild(addCard);
}

function renderMainTabs() {
  [...mainTabs.querySelectorAll(".main-tab")].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
  });
}

function renderApp() {
  ensureMonthExists(state.selectedMonthKey);

  if (!state.selectedCardId && state.cards.length > 0) {
    state.selectedCardId = state.cards[0].id;
  }

  populateMonthSelect();
  updateDashboard();
  updateAssistantMessage();
  updateMenuProfile();
  renderMonthAlerts();
  renderCardCarousel();
  renderCounterpartyCarousel();
  renderMainTabs();
  renderCurrentTab();
  renderChart();
  saveState();
}

// TABS
function renderCurrentTab() {
  tabContent.innerHTML = "";

  switch (state.activeTab) {
    case "account":
      renderAccountTab();
      break;
    case "cards":
      renderCardsTab();
      break;
    case "save":
      renderSaveTab();
      break;
    case "summary":
      renderSummaryTab();
      break;
    case "counterparties":
      renderCounterpartiesTab();
      break;
    default:
      renderAccountTab();
  }

  bindMoneyInputs(tabContent);
}

function renderAccountTab() {
  const monthData = getSelectedMonthData();

  const section = document.createElement("div");
  section.className = "section-block";

  const rules = document.createElement("div");
  rules.className = "note-box";
  rules.innerHTML = `
    <strong>Para não deixar a conta torta:</strong><br>
    • Compra no cartão vai na aba <strong>Cartões</strong><br>
    • Pix, débito, boleto e transferência vão na aba <strong>Conta</strong><br>
    • A data do lançamento define em qual mês ele vai aparecer<br>
    • Você pode vincular ou não a um devedor / empresa
  `;
  section.appendChild(rules);

  const accountConfig = document.createElement("div");
  accountConfig.className = "inner-card";
  accountConfig.innerHTML = `
    <div class="section-title">Configuração da conta em ${monthLabel(state.selectedMonthKey)}</div>
    <p class="section-subtitle" style="margin-top: 8px;">
      Defina o saldo inicial do mês e depois registre tudo que entrou e saiu da conta.
    </p>
    <div class="form-grid" style="margin-top: 14px;">
      <div>
        <label for="openingBalanceInput">Saldo inicial</label>
        <input id="openingBalanceInput" type="text" data-money placeholder="R$ 0,00" />
      </div>
      <div>
        <label>&nbsp;</label>
        <button id="saveOpeningBalanceBtn" class="btn btn-primary">Salvar saldo inicial</button>
      </div>
    </div>
  `;
  section.appendChild(accountConfig);

  const incomeCard = document.createElement("div");
  incomeCard.className = "inner-card";
  incomeCard.innerHTML = `
    <div class="section-title">Adicionar dinheiro que entrou</div>
    <div class="form-grid single" style="margin-top: 14px;">
      <div>
        <label for="incomeDate">Data</label>
        <input id="incomeDate" type="date" value="${state.selectedMonthKey}-05" />
      </div>
      <div>
        <label for="incomeDescription">Descrição</label>
        <input id="incomeDescription" type="text" placeholder="Ex.: Salário / Pix recebido / site vendido" />
      </div>
      <div>
        <label for="incomeAmount">Valor</label>
        <input id="incomeAmount" type="text" data-money placeholder="R$ 0,00" />
      </div>
      <div>
        <label for="incomeCategory">Categoria</label>
        <select id="incomeCategory">
          ${CATEGORY_OPTIONS.map((cat) => `<option value="${cat}">${cat}</option>`).join("")}
        </select>
      </div>
      <div>
        <label for="incomeStatus">Status</label>
        <select id="incomeStatus">
          ${INCOME_STATUS_OPTIONS.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join("")}
        </select>
      </div>
      <div>
        <label for="incomeCounterparty">Vincular a devedor / empresa (opcional)</label>
        <select id="incomeCounterparty">
          ${buildCounterpartyOptions()}
        </select>
      </div>
    </div>
    <div class="form-actions" style="margin-top: 12px;">
      <button id="addIncomeBtn" class="btn btn-primary">Adicionar entrada</button>
    </div>
  `;

  const outflowCard = document.createElement("div");
  outflowCard.className = "inner-card";
  outflowCard.innerHTML = `
    <div class="section-title">Adicionar dinheiro que saiu da conta</div>
    <div class="form-grid single" style="margin-top: 14px;">
      <div>
        <label for="outflowDate">Data</label>
        <input id="outflowDate" type="date" value="${state.selectedMonthKey}-06" />
      </div>
      <div>
        <label for="outflowDescription">Descrição</label>
        <input id="outflowDescription" type="text" placeholder="Ex.: Pix enviado / Mercado / Conta paga / dívida futura" />
      </div>
      <div>
        <label for="outflowAmount">Valor</label>
        <input id="outflowAmount" type="text" data-money placeholder="R$ 0,00" />
      </div>
      <div>
        <label for="outflowCategory">Categoria</label>
        <select id="outflowCategory">
          ${CATEGORY_OPTIONS.map((cat) => `<option value="${cat}">${cat}</option>`).join("")}
        </select>
      </div>
      <div>
        <label for="outflowMethod">Forma</label>
        <select id="outflowMethod">
          ${PAYMENT_METHODS.map((m) => `<option value="${m}">${m}</option>`).join("")}
        </select>
      </div>
      <div>
        <label for="outflowStatus">Status</label>
        <select id="outflowStatus">
          ${OUTFLOW_STATUS_OPTIONS.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join("")}
        </select>
      </div>
      <div>
        <label for="outflowCounterparty">Vincular a devedor / empresa (opcional)</label>
        <select id="outflowCounterparty">
          ${buildCounterpartyOptions()}
        </select>
      </div>
    </div>
    <div class="form-actions" style="margin-top: 12px;">
      <button id="addOutflowBtn" class="btn btn-primary">Adicionar saída</button>
    </div>
  `;

  const listsGrid = document.createElement("div");
  listsGrid.className = "kanban-grid";

  const incomesCol = document.createElement("div");
  incomesCol.className = "kanban-column";
  incomesCol.innerHTML = `<div class="section-title">Entradas do mês</div>`;

  const incomesList = document.createElement("div");
  incomesList.className = "item-list";
  incomesList.style.marginTop = "14px";

  if (!monthData.incomes.length) {
    incomesList.appendChild(createEmptyState("Nenhuma entrada cadastrada."));
  } else {
    [...monthData.incomes]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .forEach((item) => {
        const row = createItemRow(
          { name: item.description, amount: item.amount },
          `${item.date} • ${item.category || "Outros"}${item.counterpartyId ? ` • ${getCounterpartyName(item.counterpartyId)}` : ""}`,
          () => editIncome(item.id),
          () => removeIncomeById(item.id)
        );

        const wrapper = row.querySelector(".item-row");
const statusDropdown = createStatusDropdown(item, "income");
wrapper.querySelector(".item-info").appendChild(statusDropdown);

        incomesList.appendChild(row);
      });
  }

  incomesCol.appendChild(incomesList);

  const outflowsCol = document.createElement("div");
  outflowsCol.className = "kanban-column";
  outflowsCol.innerHTML = `<div class="section-title">Saídas da conta</div>`;

  const outflowsList = document.createElement("div");
  outflowsList.className = "item-list";
  outflowsList.style.marginTop = "14px";

  if (!monthData.outflows.length) {
    outflowsList.appendChild(createEmptyState("Nenhuma saída cadastrada."));
  } else {
    [...monthData.outflows]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .forEach((item) => {
        const row = createItemRow(
          { name: item.description, amount: item.amount },
          `${item.date} • ${item.category || "Outros"} • ${item.method || "Débito"}${item.counterpartyId ? ` • ${getCounterpartyName(item.counterpartyId)}` : ""}`,
          () => editOutflow(item.id),
          () => removeOutflowById(item.id)
        );

          const wrapper = row.querySelector(".item-row");
          const statusDropdown = createStatusDropdown(item, "outflow");
          wrapper.querySelector(".item-info").appendChild(statusDropdown);

        outflowsList.appendChild(row);
      });
  }

  outflowsCol.appendChild(outflowsList);

  listsGrid.append(incomesCol, outflowsCol);
  section.append(incomeCard, outflowCard, listsGrid);
  tabContent.appendChild(section);

  bindMoneyInputs(section);
  setMoneyInputValue(document.getElementById("openingBalanceInput"), monthData.openingBalance || 0);

  document.getElementById("saveOpeningBalanceBtn").addEventListener("click", (e) => {
    const currentMonth = getSelectedMonthData();
    currentMonth.openingBalance = getRawMoneyInputValue(document.getElementById("openingBalanceInput"));
    saveState();
    renderApp();
    showButtonSuccess(e.currentTarget, "Salvar saldo inicial", "Salvo");
  });

  document.getElementById("addIncomeBtn").addEventListener("click", (e) => {
    const date = document.getElementById("incomeDate").value || `${state.selectedMonthKey}-05`;
    const targetMonthKey = getMonthKeyFromDateString(date, state.selectedMonthKey);
    ensureMonthExists(targetMonthKey);

    const targetMonth = state.months[targetMonthKey];
    const descriptionInput = document.getElementById("incomeDescription");
    const amountInput = document.getElementById("incomeAmount");
    const category = document.getElementById("incomeCategory").value || "Outros";
    const status = document.getElementById("incomeStatus").value || "received";
    const counterpartyId = document.getElementById("incomeCounterparty").value || "";

    const description = descriptionInput.value.trim() || "Entrada";
    const amount = getRawMoneyInputValue(amountInput);

    if (amount <= 0) {
      alert("Digite um valor maior que zero.");
      return;
    }

    targetMonth.incomes.push({
      id: uid(),
      date,
      description,
      amount,
      category,
      status,
      counterpartyId
    });

    descriptionInput.value = "";
    setMoneyInputValue(amountInput, 0);

    saveState();
    renderApp();
    showButtonSuccess(e.currentTarget, "Adicionar entrada");
  });

  document.getElementById("addOutflowBtn").addEventListener("click", (e) => {
    const date = document.getElementById("outflowDate").value || `${state.selectedMonthKey}-06`;
    const targetMonthKey = getMonthKeyFromDateString(date, state.selectedMonthKey);
    ensureMonthExists(targetMonthKey);

    const targetMonth = state.months[targetMonthKey];
    const descriptionInput = document.getElementById("outflowDescription");
    const amountInput = document.getElementById("outflowAmount");
    const category = document.getElementById("outflowCategory").value || "Outros";
    const method = document.getElementById("outflowMethod").value || "Débito";
    const status = document.getElementById("outflowStatus").value || "paid";
    const counterpartyId = document.getElementById("outflowCounterparty").value || "";

    const description = descriptionInput.value.trim() || "Saída";
    const amount = getRawMoneyInputValue(amountInput);

    if (amount <= 0) {
      alert("Digite um valor maior que zero.");
      return;
    }

    if (/fatura|cart[aã]o|credito|crédito/i.test(description)) {
      const confirmed = confirm(
        "Esse lançamento parece ser de cartão/fatura. Tem certeza que quer cadastrar como saída da conta?"
      );
      if (!confirmed) return;
    }

    targetMonth.outflows.push({
      id: uid(),
      date,
      description,
      amount,
      category,
      method,
      status,
      counterpartyId
    });

    descriptionInput.value = "";
    setMoneyInputValue(amountInput, 0);

    saveState();
    renderApp();
    showButtonSuccess(e.currentTarget, "Adicionar saída");
  });
}

function renderCardsTab() {
  const monthData = getSelectedMonthData();
  const selectedCard = getSelectedCard();

  const section = document.createElement("div");
  section.className = "section-block";

  if (!selectedCard) {
    const noCard = document.createElement("div");
    noCard.className = "note-box";
    noCard.innerHTML = `
      Você ainda não selecionou nenhum cartão. Use o carrossel acima para criar ou selecionar um cartão.
    `;
    section.appendChild(noCard);
    tabContent.appendChild(section);
    return;
  }

  const breakdown = getInvoiceBreakdown(selectedCard.id, state.selectedMonthKey);

  const selectedCardPanel = document.createElement("div");
  selectedCardPanel.className = "inner-card";
  selectedCardPanel.innerHTML = `
    <div class="section-title">Cartão selecionado</div>
    <p class="section-subtitle" style="margin-top: 8px;">
      ${selectedCard.bank} • ${selectedCard.name} • fecha dia ${selectedCard.closingDay} • vence dia ${selectedCard.dueDay}
    </p>
    <div class="form-actions" style="margin-top: 12px;">
      <button id="editSelectedCardBtn" class="btn btn-secondary">Editar cartão</button>
      <button id="removeSelectedCardBtn" class="btn btn-danger">Remover cartão</button>
    </div>
  `;
  section.appendChild(selectedCardPanel);

  const rules = document.createElement("div");
  rules.className = "note-box";
  rules.innerHTML = `
    <strong>Regra do cartão:</strong><br>
    • Compra no crédito entra aqui<br>
    • Ajuste manual serve para valor avulso da fatura<br>
    • Se você já lançou compra detalhada, não repita o mesmo valor no ajuste manual
  `;
  section.appendChild(rules);

  const invoiceCard = document.createElement("div");
  invoiceCard.className = "inner-card";
  invoiceCard.innerHTML = `
    <div class="section-title">Ajuste manual da fatura</div>
    <p class="section-subtitle" style="margin-top: 8px;">
      Use esse campo apenas para complementar a fatura quando você não quiser lançar tudo compra por compra.
    </p>
    <div class="form-grid" style="margin-top: 14px;">
      <div>
        <label for="manualInvoiceInput">Ajuste manual</label>
        <input id="manualInvoiceInput" type="text" data-money placeholder="R$ 0,00" />
      </div>
      <div>
        <label>&nbsp;</label>
        <button id="saveManualInvoiceBtn" class="btn btn-primary">Salvar ajuste</button>
      </div>
    </div>
  `;
  section.appendChild(invoiceCard);

  const purchaseCard = document.createElement("div");
  purchaseCard.className = "inner-card";
  purchaseCard.innerHTML = `
    <div class="section-title">Adicionar compra detalhada no cartão</div>
    <div class="form-grid single" style="margin-top: 14px;">
      <div>
        <label for="purchaseDate">Data da compra</label>
        <input id="purchaseDate" type="date" value="${state.selectedMonthKey}-06" />
      </div>
      <div>
        <label for="purchaseDescription">Descrição</label>
        <input id="purchaseDescription" type="text" placeholder="Ex.: Show / Compra online" />
      </div>
      <div>
        <label for="purchaseAmount">Valor total</label>
        <input id="purchaseAmount" type="text" data-money placeholder="R$ 0,00" />
      </div>
      <div>
        <label for="purchaseInstallments">Parcelas</label>
        <input id="purchaseInstallments" type="number" min="1" value="1" />
      </div>
      <div>
        <label for="purchaseCategory">Categoria</label>
        <select id="purchaseCategory">
          ${CATEGORY_OPTIONS.map((cat) => `<option value="${cat}">${cat}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="form-actions" style="margin-top: 12px;">
      <button id="addPurchaseBtn" class="btn btn-primary">Adicionar compra</button>
    </div>
  `;
  section.appendChild(purchaseCard);

  const invoiceSummaryCard = document.createElement("div");
  invoiceSummaryCard.className = "inner-card";
  invoiceSummaryCard.innerHTML = `
    <div class="section-title">Resumo da fatura em ${monthLabel(state.selectedMonthKey)}</div>
    <div class="totals-grid" style="margin-top:14px;">
      <div class="total-box">
        <span>Compras detalhadas</span>
        <strong>${formatCurrency(breakdown.detailed)}</strong>
      </div>
      <div class="total-box">
        <span>Ajuste manual</span>
        <strong>${formatCurrency(breakdown.manual)}</strong>
      </div>
      <div class="total-box">
        <span>Fatura total</span>
        <strong>${formatCurrency(breakdown.total)}</strong>
      </div>
    </div>
  `;
  section.appendChild(invoiceSummaryCard);

  const purchaseListCard = document.createElement("div");
  purchaseListCard.className = "inner-card";
  purchaseListCard.innerHTML = `<div class="section-title">Compras lançadas no mês de origem</div>`;
  const purchaseList = document.createElement("div");
  purchaseList.className = "item-list";
  purchaseList.style.marginTop = "14px";

  const purchasesOfSelected = monthData.cardPurchases.filter((purchase) => purchase.cardId === selectedCard.id);

  if (purchasesOfSelected.length === 0) {
    purchaseList.appendChild(createEmptyState("Nenhuma compra detalhada lançada neste mês para esse cartão."));
  } else {
    purchasesOfSelected.forEach((purchase) => {
      purchaseList.appendChild(
        createItemRow(
          { name: purchase.description, amount: purchase.totalAmount },
          `${purchase.purchaseDate} • ${purchase.category || "Outros"} • ${purchase.installmentCount}x`,
          () => editPurchase(purchase.id),
          () => removePurchaseById(purchase.id)
        )
      );
    });
  }

  purchaseListCard.appendChild(purchaseList);
  section.appendChild(purchaseListCard);

  const installmentListCard = document.createElement("div");
  installmentListCard.className = "inner-card";
  installmentListCard.innerHTML = `<div class="section-title">Parcelas que caem neste mês</div>`;
  const installmentList = document.createElement("div");
  installmentList.className = "item-list";
  installmentList.style.marginTop = "14px";

  const installments = getInstallmentsForMonth(state.selectedMonthKey, selectedCard.id);

  if (installments.length === 0 && getManualInvoice(selectedCard.id) <= 0) {
    installmentList.appendChild(createEmptyState("Nenhuma parcela ou ajuste manual relevante para este mês."));
  } else {
    if (getManualInvoice(selectedCard.id) > 0) {
      installmentList.appendChild(
        createItemRow(
          { name: "Ajuste manual", amount: getManualInvoice(selectedCard.id) },
          `${monthLabel(state.selectedMonthKey)} • valor lançado manualmente`,
          null,
          () => {
            const confirmed = confirm("Deseja remover o ajuste manual?");
            if (!confirmed) return;
            setManualInvoice(selectedCard.id, 0);
            renderApp();
          }
        )
      );
    }

    installments.forEach((line) => {
      installmentList.appendChild(
        createItemRow(
          { name: line.description, amount: line.amount },
          `${line.purchaseDate} • Parcela ${line.installmentLabel} • ${line.category || "Outros"}`,
          () => editPurchase(line.purchaseId),
          () => removePurchaseById(line.purchaseId)
        )
      );
    });
  }

  installmentListCard.appendChild(installmentList);
  section.appendChild(installmentListCard);

  tabContent.appendChild(section);
  bindMoneyInputs(section);

  setMoneyInputValue(document.getElementById("manualInvoiceInput"), getManualInvoice(selectedCard.id));

  document.getElementById("editSelectedCardBtn").addEventListener("click", () => {
    editCard(selectedCard.id);
  });

  document.getElementById("removeSelectedCardBtn").addEventListener("click", () => {
    const confirmed = confirm(`Deseja remover o cartão "${selectedCard.bank} • ${selectedCard.name}"?`);
    if (!confirmed) return;

    state.cards = state.cards.filter((card) => card.id !== selectedCard.id);

    Object.values(state.months).forEach((month) => {
      month.cardPurchases = (month.cardPurchases || []).filter(
        (purchase) => purchase.cardId !== selectedCard.id
      );

      if (month.manualInvoices && typeof month.manualInvoices === "object") {
        delete month.manualInvoices[selectedCard.id];
      }
    });

    state.selectedCardId = state.cards[0]?.id || "";
    state.summaryCardFilter = state.selectedCardId ? "selected" : "all";

    saveState();
    renderApp();
  });

  document.getElementById("saveManualInvoiceBtn").addEventListener("click", (e) => {
    const value = getRawMoneyInputValue(document.getElementById("manualInvoiceInput"));

    if (breakdown.detailed > 0 && value > 0) {
      const confirmed = confirm(
        "Você já tem compras detalhadas nesse cartão neste mês. Deseja mesmo somar também um ajuste manual?"
      );
      if (!confirmed) return;
    }

    setManualInvoice(selectedCard.id, value);
    renderApp();
    showButtonSuccess(e.currentTarget, "Salvar ajuste", "Salvo");
  });

  document.getElementById("addPurchaseBtn").addEventListener("click", (e) => {
    const date = document.getElementById("purchaseDate").value || `${state.selectedMonthKey}-06`;
    const purchaseMonthKey = getMonthKeyFromDateString(date, state.selectedMonthKey);
    ensureMonthExists(purchaseMonthKey);

    const descriptionInput = document.getElementById("purchaseDescription");
    const amountInput = document.getElementById("purchaseAmount");
    const installmentsInput = document.getElementById("purchaseInstallments");
    const category = document.getElementById("purchaseCategory").value || "Outros";

    const description = descriptionInput.value.trim() || "Compra";
    const totalAmount = getRawMoneyInputValue(amountInput);
    const installmentCount = Math.max(Number(installmentsInput.value || 1), 1);

    if (totalAmount <= 0) {
      alert("Digite um valor maior que zero.");
      return;
    }

    state.months[purchaseMonthKey].cardPurchases.push({
      id: uid(),
      cardId: selectedCard.id,
      purchaseDate: date,
      description,
      totalAmount,
      installmentCount,
      category
    });

    descriptionInput.value = "";
    setMoneyInputValue(amountInput, 0);
    installmentsInput.value = 1;

    saveState();
    renderApp();
    showButtonSuccess(e.currentTarget, "Adicionar compra");
  });
}

function renderSaveTab() {
  const monthData = getSelectedMonthData();

  const section = document.createElement("div");
  section.className = "section-block";

  const saveConfigCard = document.createElement("div");
  saveConfigCard.className = "inner-card";
  saveConfigCard.innerHTML = `
    <div class="section-title">Planejamento de dinheiro guardado</div>
    <div class="form-grid single" style="margin-top: 14px;">
      <div>
        <label for="saveGoalInput">Quanto quer guardar neste mês</label>
        <input id="saveGoalInput" type="text" data-money placeholder="R$ 0,00" />
      </div>
      <div>
        <label for="savedThisMonthInput">Quanto realmente guardou neste mês</label>
        <input id="savedThisMonthInput" type="text" data-money placeholder="R$ 0,00" />
      </div>
    </div>
    <div class="form-actions" style="margin-top: 12px;">
      <button id="saveSavingsBtn" type="button" class="btn btn-primary">Salvar valores de guardar</button>
    </div>
  `;

  const savingsSummary = document.createElement("div");
  savingsSummary.className = "totals-grid";
  savingsSummary.innerHTML = `
    <div class="total-box">
      <span>Cofrinho inicial</span>
      <strong>${formatCurrency(state.profile.savingsPotBase || 0)}</strong>
    </div>
    <div class="total-box">
      <span>Guardado neste mês</span>
      <strong>${formatCurrency(monthData.savedThisMonth || 0)}</strong>
    </div>
    <div class="total-box">
      <span>Meta de guardar no mês</span>
      <strong>${formatCurrency(monthData.saveGoal || 0)}</strong>
    </div>
    <div class="total-box">
      <span>Total atual do cofrinho</span>
      <strong>${formatCurrency(getSavingsPotTotal())}</strong>
    </div>
  `;

  const note = document.createElement("div");
  note.className = "note-box";
  note.innerHTML = `
    O valor realmente guardado entra no cofrinho e sai do livre para gastar.
  `;

  section.append(saveConfigCard, savingsSummary, note);
  tabContent.appendChild(section);

  bindMoneyInputs(section);

  const saveGoalInput = document.getElementById("saveGoalInput");
  const savedThisMonthInput = document.getElementById("savedThisMonthInput");
  const saveBtn = document.getElementById("saveSavingsBtn");

  setMoneyInputValue(saveGoalInput, Number(monthData.saveGoal || 0));
  setMoneyInputValue(savedThisMonthInput, Number(monthData.savedThisMonth || 0));

  saveBtn.addEventListener("click", (e) => {
    const currentMonth = getSelectedMonthData();

    currentMonth.saveGoal = Number(getRawMoneyInputValue(saveGoalInput) || 0);
    currentMonth.savedThisMonth = Number(getRawMoneyInputValue(savedThisMonthInput) || 0);

    saveState();
    renderApp();
    showButtonSuccess(e.currentTarget, "Salvar valores de guardar", "Salvo");
  });
}

function renderSummaryTab() {
  const monthData = getSelectedMonthData();
  const totals = getTotals();
  const categories = getCategoryBreakdown();

  const selectedCounterpartyName = state.selectedCounterpartyId
    ? getCounterpartyName(state.selectedCounterpartyId)
    : "todos os devedores / empresas";

  const modeLabel = state.summaryProjectionMode === "current"
    ? "Cenário atual"
    : "Cenário projetado";

  const section = document.createElement("div");
  section.className = "section-block";

  const grid = document.createElement("div");
  grid.className = "final-grid";
  grid.innerHTML = `
    <div class="final-card"><span>Entradas</span><strong>${formatCurrency(totals.totalIncome)}</strong></div>
    <div class="final-card"><span>Saídas da conta</span><strong>${formatCurrency(totals.totalOutflow)}</strong></div>
    <div class="final-card"><span>Faturas</span><strong>${formatCurrency(totals.totalCards)}</strong></div>
    <div class="final-card"><span>Saídas totais</span><strong>${formatCurrency(totals.totalExpense)}</strong></div>
    <div class="final-card"><span>A receber pendente</span><strong>${formatCurrency(totals.pendingReceivable)}</strong></div>
    <div class="final-card"><span>A pagar pendente</span><strong>${formatCurrency(totals.pendingPayable)}</strong></div>
    <div class="final-card"><span>Guardar no mês</span><strong>${formatCurrency(monthData.savedThisMonth || 0)}</strong></div>
    <div class="final-card"><span>Restante</span><strong>${formatCurrency(totals.remaining)}</strong></div>
    <div class="final-card final-big"><span>Livre para gastar</span><strong>${formatCurrency(totals.freeToSpend)}</strong></div>
  `;

  const note = document.createElement("div");
  note.className = "note-box";
  note.innerHTML = `
    <strong>${modeLabel}</strong><br>
    Filtro atual: <strong>${selectedCounterpartyName}</strong>.
  `;

  const formula = document.createElement("div");
  formula.className = "note-box";

  if (state.summaryProjectionMode === "projected") {
    formula.innerHTML = `
      <strong>Fórmula do resumo:</strong><br>
      (Entradas + A receber) - (Saídas da conta + Faturas + A pagar) = Restante<br>
      Restante - Guardado no mês = Livre para gastar
    `;
  } else {
    formula.innerHTML = `
      <strong>Fórmula do resumo:</strong><br>
      Entradas - (Saídas da conta + Faturas) = Restante<br>
      Restante - Guardado no mês = Livre para gastar
    `;
  }

  const categoryCard = document.createElement("div");
  categoryCard.className = "inner-card";
  categoryCard.innerHTML = `<div class="section-title">Categorias com maior saída no mês</div>`;

  const catList = document.createElement("div");
  catList.className = "item-list";
  catList.style.marginTop = "14px";

  if (categories.length === 0) {
    catList.appendChild(createEmptyState("Ainda não há categorias suficientes para mostrar."));
  } else {
    categories.slice(0, 6).forEach((item) => {
      catList.appendChild(
        createItemRow(
          { name: item.category, amount: item.amount },
          "Categoria de gasto",
          null,
          null
        )
      );
    });
  }

  categoryCard.appendChild(catList);
  section.append(grid, note, formula, categoryCard);
  tabContent.appendChild(section);
}

function renderCounterpartiesTab() {
  const section = document.createElement("div");
  section.className = "section-block";

  const formCard = document.createElement("div");
  formCard.className = "inner-card";
  formCard.innerHTML = `
    <div class="section-title">Cadastrar devedor / empresa</div>
    <div class="form-grid single" style="margin-top:14px;">
      <div>
        <label for="counterpartyName">Nome</label>
        <input id="counterpartyName" type="text" placeholder="Ex.: Rogério Lopes / Cliente site / Empresa X" />
      </div>
      <div>
        <label for="counterpartyType">Tipo</label>
        <select id="counterpartyType">
          <option value="person">Pessoa</option>
          <option value="company">Empresa</option>
        </select>
      </div>
      <div>
        <label for="counterpartyNotes">Observação</label>
        <input id="counterpartyNotes" type="text" placeholder="Ex.: pagamento do site / gasolina / empréstimo" />
      </div>
    </div>
    <div class="form-actions" style="margin-top:12px;">
      <button id="addCounterpartyBtn" class="btn btn-primary">Adicionar cadastro</button>
      <button id="clearSelectedCounterpartyBtn" class="btn btn-secondary">Limpar filtro</button>
    </div>
  `;
  section.appendChild(formCard);

  if (state.selectedCounterpartyId) {
    const selected = getCounterpartyById(state.selectedCounterpartyId);
    const resume = getCounterpartyResume(state.selectedCounterpartyId);

    const kpis = document.createElement("div");
    kpis.className = "counterparty-kpis";
    kpis.innerHTML = `
      <div class="total-box">
        <span>${selected?.name || "Cadastro"} te deve</span>
        <strong>${formatCurrency(resume.receivable)}</strong>
      </div>
      <div class="total-box">
        <span>Você deve para ${selected?.name || "ele"}</span>
        <strong>${formatCurrency(resume.payable)}</strong>
      </div>
      <div class="total-box">
        <span>Saldo pendente líquido</span>
        <strong>${formatCurrency(resume.netPending)}</strong>
      </div>
    `;
    section.appendChild(kpis);
  }

  const listCard = document.createElement("div");
  listCard.className = "inner-card";
  listCard.innerHTML = `<div class="section-title">Cadastros</div>`;

  const list = document.createElement("div");
  list.className = "item-list";
  list.style.marginTop = "14px";

  if (!state.counterparties.length) {
    list.appendChild(createEmptyState("Nenhum devedor / empresa cadastrado."));
  } else {
    state.counterparties.forEach((item) => {
      const resume = getCounterpartyResume(item.id);

      list.appendChild(
        createItemRow(
          { name: item.name, amount: resume.netPending },
          `${item.type === "company" ? "Empresa" : "Pessoa"} • Te deve ${formatCurrency(resume.receivable)} • Você deve ${formatCurrency(resume.payable)}`,
          () => {
            state.selectedCounterpartyId = item.id;
            saveState();
            renderApp();
          },
          () => {
            const confirmed = confirm(`Deseja remover o cadastro "${item.name}"?`);
            if (!confirmed) return;

            Object.values(state.months).forEach((monthData) => {
              monthData.incomes = (monthData.incomes || []).map((row) => ({
                ...row,
                counterpartyId: row.counterpartyId === item.id ? "" : row.counterpartyId
              }));

              monthData.outflows = (monthData.outflows || []).map((row) => ({
                ...row,
                counterpartyId: row.counterpartyId === item.id ? "" : row.counterpartyId
              }));
            });

            state.counterparties = state.counterparties.filter((cp) => cp.id !== item.id);

            if (state.selectedCounterpartyId === item.id) {
              state.selectedCounterpartyId = "";
            }

            saveState();
            renderApp();
          }
        )
      );
    });
  }

  listCard.appendChild(list);
  section.appendChild(listCard);

  if (state.selectedCounterpartyId) {
    const historyCard = document.createElement("div");
    historyCard.className = "inner-card";
    historyCard.innerHTML = `<div class="section-title">Histórico vinculado</div>`;

    const historyList = document.createElement("div");
    historyList.className = "item-list";
    historyList.style.marginTop = "14px";

    const rows = [];

    Object.entries(state.months).forEach(([monthKey, monthData]) => {
      ensureMonthShape(monthData).incomes.forEach((item) => {
        if (item.counterpartyId === state.selectedCounterpartyId) {
          rows.push({
            monthKey,
            direction: "in",
            date: item.date,
            description: item.description,
            amount: item.amount,
            status: item.status,
            category: item.category || "Outros"
          });
        }
      });

      ensureMonthShape(monthData).outflows.forEach((item) => {
        if (item.counterpartyId === state.selectedCounterpartyId) {
          rows.push({
            monthKey,
            direction: "out",
            date: item.date,
            description: item.description,
            amount: item.amount,
            status: item.status,
            category: item.category || "Outros",
            method: item.method || "Débito"
          });
        }
      });
    });

    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (!rows.length) {
      historyList.appendChild(createEmptyState("Nenhum lançamento vinculado a esse cadastro."));
    } else {
      rows.forEach((row) => {
        const card = document.createElement("div");
        card.className = "item-row";
        card.innerHTML = `
          <div class="item-info">
            <div class="counterparty-history-top">
              <strong class="item-name">${row.description}</strong>
              <span class="item-value">${formatCurrency(row.amount)}</span>
            </div>
            <span class="counterparty-history-meta">
              ${row.date} • ${monthLabel(row.monthKey)} • ${row.category}${row.method ? ` • ${row.method}` : ""}
            </span>
            <span class="counterparty-history-direction ${row.direction}">
              ${row.direction === "in" ? "A receber de" : "A pagar para"} ${getCounterpartyName(state.selectedCounterpartyId)}
            </span>
            <span class="status-badge ${row.status}">${getStatusLabel(row.status)}</span>
          </div>
        `;
        historyList.appendChild(card);
      });
    }

    historyCard.appendChild(historyList);
    section.appendChild(historyCard);
  }

  tabContent.appendChild(section);

  document.getElementById("addCounterpartyBtn")?.addEventListener("click", () => {
    const name = document.getElementById("counterpartyName").value.trim();
    const type = document.getElementById("counterpartyType").value;
    const notes = document.getElementById("counterpartyNotes").value.trim();

    if (!name) {
      alert("Digite um nome para o cadastro.");
      return;
    }

    const alreadyExists = state.counterparties.some(
      (item) => item.name.toLowerCase() === name.toLowerCase()
    );

    if (alreadyExists) {
      alert("Já existe um cadastro com esse nome.");
      return;
    }

    state.counterparties.push({
      id: uid(),
      name,
      type,
      notes
    });

    saveState();
    renderApp();
  });

  document.getElementById("clearSelectedCounterpartyBtn")?.addEventListener("click", () => {
    state.selectedCounterpartyId = "";
    saveState();
    renderApp();
  });
}

// HELPERS
function quickCreateCard() {
  const bank = prompt("Banco do cartão:");
  if (bank === null) return;

  const name = prompt("Nome do cartão:", "Cartão principal");
  if (name === null) return;

  const closingDay = prompt("Dia de fechamento:", "25");
  if (closingDay === null) return;

  const dueDay = prompt("Dia de vencimento:", "5");
  if (dueDay === null) return;

  const colorPrompt = prompt(
    `Escolha a cor:\n${CARD_COLORS.map((c, i) => `${i + 1} - ${c.label}`).join("\n")}`,
    "1"
  );
  if (colorPrompt === null) return;

  const colorIndex = Math.max(1, Math.min(Number(colorPrompt || 1), CARD_COLORS.length)) - 1;
  const chosenColor = CARD_COLORS[colorIndex];

  const card = {
    id: uid(),
    bank: bank.trim() || "Banco",
    name: name.trim() || "Cartão principal",
    closingDay: Math.max(Math.min(Number(closingDay || 1), 31), 1),
    dueDay: Math.max(Math.min(Number(dueDay || 1), 31), 1),
    color: chosenColor.value,
    active: true
  };

  state.cards.push(card);
  state.selectedCardId = card.id;
  state.summaryCardFilter = "selected";
  state.activeTab = "cards";
  saveState();
  renderApp();
}

function editSelectedCardQuick() {
  const card = getSelectedCard();
  if (!card) {
    alert("Selecione um cartão primeiro.");
    return;
  }
  editCard(card.id);
}

function editIncome(id) {
  let sourceMonthKey = null;
  let item = null;

  Object.entries(state.months).forEach(([monthKey, monthData]) => {
    const found = (monthData.incomes || []).find((i) => i.id === id);
    if (found) {
      sourceMonthKey = monthKey;
      item = found;
    }
  });

  if (!item || !sourceMonthKey) return;

  const date = prompt("Data (AAAA-MM-DD):", item.date);
  if (date === null) return;

  const description = prompt("Descrição:", item.description);
  if (description === null) return;

  const amount = prompt("Valor:", item.amount);
  if (amount === null) return;

  const category = prompt("Categoria:", item.category || "Outros");
  if (category === null) return;

  const status = prompt("Status (received, pending, not_received):", item.status || "received");
  if (status === null) return;

  const counterpartyName = prompt(
    "Nome do devedor / empresa (deixe vazio para sem vínculo):",
    item.counterpartyId ? getCounterpartyName(item.counterpartyId) : ""
  );
  if (counterpartyName === null) return;

  let counterpartyId = "";
  const cleanName = counterpartyName.trim();

  if (cleanName) {
    let existing = state.counterparties.find((cp) => cp.name.toLowerCase() === cleanName.toLowerCase());
    if (!existing) {
      existing = { id: uid(), name: cleanName, type: "person", notes: "" };
      state.counterparties.push(existing);
    }
    counterpartyId = existing.id;
  }

  const targetMonthKey = getMonthKeyFromDateString(date, sourceMonthKey);
  ensureMonthExists(targetMonthKey);

  const updated = {
    ...item,
    date,
    description: description.trim() || "Entrada",
    amount: parseMoneyString(amount),
    category: category.trim() || "Outros",
    status: status.trim() || "received",
    counterpartyId
  };

  state.months[sourceMonthKey].incomes = (state.months[sourceMonthKey].incomes || []).filter((row) => row.id !== id);
  state.months[targetMonthKey].incomes.push(updated);

  saveState();
  renderApp();
}

function editOutflow(id) {
  let sourceMonthKey = null;
  let item = null;

  Object.entries(state.months).forEach(([monthKey, monthData]) => {
    const found = (monthData.outflows || []).find((i) => i.id === id);
    if (found) {
      sourceMonthKey = monthKey;
      item = found;
    }
  });

  if (!item || !sourceMonthKey) return;

  const date = prompt("Data (AAAA-MM-DD):", item.date);
  if (date === null) return;

  const description = prompt("Descrição:", item.description);
  if (description === null) return;

  const amount = prompt("Valor:", item.amount);
  if (amount === null) return;

  const category = prompt("Categoria:", item.category || "Outros");
  if (category === null) return;

  const method = prompt("Forma:", item.method || "Débito");
  if (method === null) return;

  const status = prompt("Status (paid, pending, not_paid):", item.status || "paid");
  if (status === null) return;

  const counterpartyName = prompt(
    "Nome do devedor / empresa (deixe vazio para sem vínculo):",
    item.counterpartyId ? getCounterpartyName(item.counterpartyId) : ""
  );
  if (counterpartyName === null) return;

  let counterpartyId = "";
  const cleanName = counterpartyName.trim();

  if (cleanName) {
    let existing = state.counterparties.find((cp) => cp.name.toLowerCase() === cleanName.toLowerCase());
    if (!existing) {
      existing = { id: uid(), name: cleanName, type: "person", notes: "" };
      state.counterparties.push(existing);
    }
    counterpartyId = existing.id;
  }

  const targetMonthKey = getMonthKeyFromDateString(date, sourceMonthKey);
  ensureMonthExists(targetMonthKey);

  const updated = {
    ...item,
    date,
    description: description.trim() || "Saída",
    amount: parseMoneyString(amount),
    category: category.trim() || "Outros",
    method: method.trim() || "Débito",
    status: status.trim() || "paid",
    counterpartyId
  };

  state.months[sourceMonthKey].outflows = (state.months[sourceMonthKey].outflows || []).filter((row) => row.id !== id);
  state.months[targetMonthKey].outflows.push(updated);

  saveState();
  renderApp();
}

function editCard(cardId) {
  const card = getCardById(cardId);
  if (!card) return;

  const bank = prompt("Banco:", card.bank);
  if (bank === null) return;

  const name = prompt("Nome do cartão:", card.name);
  if (name === null) return;

  const closingDay = prompt("Dia de fechamento:", card.closingDay);
  if (closingDay === null) return;

  const dueDay = prompt("Dia de vencimento:", card.dueDay);
  if (dueDay === null) return;

  const currentColorIndex = Math.max(
    0,
    CARD_COLORS.findIndex((c) => c.value === card.color)
  );

  const colorPrompt = prompt(
    `Escolha a cor:\n${CARD_COLORS.map((c, i) => `${i + 1} - ${c.label}`).join("\n")}`,
    String(currentColorIndex + 1)
  );
  if (colorPrompt === null) return;

  const colorIndex = Math.max(1, Math.min(Number(colorPrompt || 1), CARD_COLORS.length)) - 1;

  card.bank = bank.trim() || "Banco";
  card.name = name.trim() || "Cartão principal";
  card.closingDay = Math.max(Math.min(Number(closingDay || 1), 31), 1);
  card.dueDay = Math.max(Math.min(Number(dueDay || 1), 31), 1);
  card.color = CARD_COLORS[colorIndex].value;

  saveState();
  renderApp();
}

function findPurchaseWithMonthById(purchaseId) {
  for (const [monthKey, monthData] of Object.entries(state.months)) {
    const purchase = (monthData.cardPurchases || []).find((p) => p.id === purchaseId);
    if (purchase) return { purchase, monthKey };
  }
  return null;
}

function editPurchase(purchaseId) {
  const found = findPurchaseWithMonthById(purchaseId);
  if (!found) return;

  const { purchase, monthKey: sourceMonthKey } = found;

  const date = prompt("Data da compra (AAAA-MM-DD):", purchase.purchaseDate);
  if (date === null) return;

  const description = prompt("Descrição da compra:", purchase.description);
  if (description === null) return;

  const amount = prompt("Valor total:", purchase.totalAmount);
  if (amount === null) return;

  const installments = prompt("Quantidade de parcelas:", purchase.installmentCount);
  if (installments === null) return;

  const category = prompt("Categoria:", purchase.category || "Outros");
  if (category === null) return;

  const targetMonthKey = getMonthKeyFromDateString(date, sourceMonthKey);
  ensureMonthExists(targetMonthKey);

  const updated = {
    ...purchase,
    purchaseDate: date,
    description: description.trim() || "Compra",
    totalAmount: parseMoneyString(amount),
    installmentCount: Math.max(Number(installments || 1), 1),
    category: category.trim() || "Outros"
  };

  state.months[sourceMonthKey].cardPurchases = (state.months[sourceMonthKey].cardPurchases || []).filter(
    (p) => p.id !== purchaseId
  );
  state.months[targetMonthKey].cardPurchases.push(updated);

  saveState();
  renderApp();
}

function editFixedIncome(id) {
  const item = state.profile.fixedIncomes.find((i) => i.id === id);
  if (!item) return;

  const name = prompt("Nome da receita fixa:", item.name);
  if (name === null) return;

  const amount = prompt("Valor:", item.amount);
  if (amount === null) return;

  item.name = name.trim() || "Receita fixa";
  item.amount = parseMoneyString(amount);

  saveState();
  renderFixedLists();
}

function editFixedOutflow(id) {
  const item = state.profile.fixedOutflows.find((i) => i.id === id);
  if (!item) return;

  const name = prompt("Nome do gasto fixo:", item.name);
  if (name === null) return;

  const amount = prompt("Valor:", item.amount);
  if (amount === null) return;

  item.name = name.trim() || "Gasto fixo";
  item.amount = parseMoneyString(amount);

  saveState();
  renderFixedLists();
}

function removeIncomeById(incomeId) {
  let removed = false;

  Object.values(state.months).forEach((monthData) => {
    const before = (monthData.incomes || []).length;
    monthData.incomes = (monthData.incomes || []).filter((entry) => entry.id !== incomeId);
    if (monthData.incomes.length !== before) removed = true;
  });

  if (!removed) return;
  saveState();
  renderApp();
}

function removeOutflowById(outflowId) {
  let removed = false;

  Object.values(state.months).forEach((monthData) => {
    const before = (monthData.outflows || []).length;
    monthData.outflows = (monthData.outflows || []).filter((entry) => entry.id !== outflowId);
    if (monthData.outflows.length !== before) removed = true;
  });

  if (!removed) return;
  saveState();
  renderApp();
}

function removePurchaseById(purchaseId) {
  const confirmed = confirm("Deseja remover essa compra?");
  if (!confirmed) return;

  Object.values(state.months).forEach((monthData) => {
    monthData.cardPurchases = (monthData.cardPurchases || []).filter(
      (purchase) => purchase.id !== purchaseId
    );
  });

  saveState();
  renderApp();
}

function removeFixedIncomeById(id) {
  const confirmed = confirm("Deseja remover essa receita fixa?");
  if (!confirmed) return;

  state.profile.fixedIncomes = state.profile.fixedIncomes.filter((item) => item.id !== id);
  saveState();
  renderFixedLists();
}

function removeFixedOutflowById(id) {
  const confirmed = confirm("Deseja remover esse gasto fixo?");
  if (!confirmed) return;

  state.profile.fixedOutflows = state.profile.fixedOutflows.filter((item) => item.id !== id);
  saveState();
  renderFixedLists();
}

// EVENTOS

// Fechar modal de novo mês
closeWelcomeMonthBtn?.addEventListener("click", () => {
  welcomeMonthModal.classList.add("hidden");
});

closeWelcomeMonthBackdrop?.addEventListener("click", () => {
  welcomeMonthModal.classList.add("hidden");
});
howToUseBtn?.addEventListener("click", () => openOnboarding(true));

menuToggleBtn?.addEventListener("click", openSideMenu);
closeMenuBtn?.addEventListener("click", closeSideMenu);
sideMenuBackdrop?.addEventListener("click", (e) => {
  if (e.target === sideMenuBackdrop) closeSideMenu();
});

monthSelect?.addEventListener("change", () => {
  state.selectedMonthKey = monthSelect.value;
  ensureMonthExists(state.selectedMonthKey);
  saveState();
  renderApp();
});

prevMonthBtn?.addEventListener("click", () => {
  const newKey = shiftMonth(state.selectedMonthKey, -1);
  ensureMonthExists(newKey);
  state.selectedMonthKey = newKey;
  saveState();
  renderApp();
});

nextMonthBtn?.addEventListener("click", () => {
  const newKey = shiftMonth(state.selectedMonthKey, 1);
  ensureMonthExists(newKey);
  state.selectedMonthKey = newKey;
  saveState();
  renderApp();
});

createMonthBtn?.addEventListener("click", createNewMonth);
duplicateMonthBtn?.addEventListener("click", duplicatePreviousMonth);

createCardQuickBtn?.addEventListener("click", quickCreateCard);
editSelectedCardQuickBtn?.addEventListener("click", editSelectedCardQuick);

showAllCardsBtn?.addEventListener("click", () => {
  state.summaryCardFilter = "all";
  saveState();
  renderApp();
});

clearCounterpartyFilterBtn?.addEventListener("click", () => {
  state.selectedCounterpartyId = "";
  saveState();
  renderApp();
});

openCounterpartiesTabBtn?.addEventListener("click", () => {
  state.activeTab = "counterparties";
  saveState();
  renderApp();
});

summaryFilterAllBtn?.addEventListener("click", () => {
  state.summaryCardFilter = "all";
  saveState();
  renderApp();
});

summaryFilterSelectedBtn?.addEventListener("click", () => {
  if (!state.selectedCardId) return;
  state.summaryCardFilter = "selected";
  saveState();
  renderApp();
});

summaryModeCurrentBtn?.addEventListener("click", () => {
  state.summaryProjectionMode = "current";
  saveState();
  renderApp();
});

summaryModeProjectedBtn?.addEventListener("click", () => {
  state.summaryProjectionMode = "projected";
  saveState();
  renderApp();
});

summaryStatusAllBtn?.addEventListener("click", () => {
  state.summaryStatusFilter = "all";
  saveState();
  renderApp();
});

summaryStatusSettledBtn?.addEventListener("click", () => {
  state.summaryStatusFilter = "settled";
  saveState();
  renderApp();
});

summaryStatusPendingBtn?.addEventListener("click", () => {
  state.summaryStatusFilter = "pending";
  saveState();
  renderApp();
});

summaryCounterpartySelect?.addEventListener("change", () => {
  state.selectedCounterpartyId = summaryCounterpartySelect.value || "";
  saveState();
  renderApp();
});

mainTabs?.addEventListener("click", (e) => {
  const btn = e.target.closest(".main-tab");
  if (!btn) return;
  state.activeTab = btn.dataset.tab;
  saveState();
  renderApp();
});

chartTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.activeChart = btn.dataset.chart;
    renderChart();
    saveState();
  });
});

window.addEventListener("resize", renderChart);

openProfileBtn?.addEventListener("click", () => {
  closeSideMenu();
  openProfileModal();
});

closeProfileBtn?.addEventListener("click", closeProfileModal);
closeProfileBackdrop?.addEventListener("click", closeProfileModal);
saveProfileBtn?.addEventListener("click", saveProfileData);

profilePhotoInput?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  handlePhotoUpload(file);
});

addFixedIncomeBtn?.addEventListener("click", (e) => {
  const name = fixedIncomeName.value.trim() || "Receita fixa";
  const amount = getRawMoneyInputValue(fixedIncomeValue);

  if (amount <= 0) {
    alert("Digite um valor maior que zero.");
    return;
  }

  state.profile.fixedIncomes.push({
    id: uid(),
    name,
    amount
  });

  fixedIncomeName.value = "";
  setMoneyInputValue(fixedIncomeValue, 0);
  saveState();
  renderFixedLists();
  showButtonSuccess(e.currentTarget, "+ Adicionar receita fixa");
});

addFixedExpenseBtn?.addEventListener("click", (e) => {
  const name = fixedExpenseName.value.trim() || "Gasto fixo";
  const amount = getRawMoneyInputValue(fixedExpenseValue);

  if (amount <= 0) {
    alert("Digite um valor maior que zero.");
    return;
  }

  state.profile.fixedOutflows.push({
    id: uid(),
    name,
    amount
  });

  fixedExpenseName.value = "";
  setMoneyInputValue(fixedExpenseValue, 0);
  saveState();
  renderFixedLists();
  showButtonSuccess(e.currentTarget, "+ Adicionar gasto fixo");
});

applyFixedValuesBtn?.addEventListener("click", () => {
  applyFixedValuesToCurrentMonth();
  closeSideMenu();
});

resetBtn?.addEventListener("click", () => {
  const confirmed = confirm(`Deseja realmente resetar ${monthLabel(state.selectedMonthKey)}?`);
  if (!confirmed) return;
  resetSelectedMonth();
  closeSideMenu();
});

openImportBtn?.addEventListener("click", () => {
  closeSideMenu();
  openImportModal();
});

closeImportBtn?.addEventListener("click", closeImportModal);
closeImportBackdrop?.addEventListener("click", closeImportModal);

clearImportBtn?.addEventListener("click", () => {
  importText.value = "";
});

applyImportBtn?.addEventListener("click", applyImportedContent);

exportTxtBtn?.addEventListener("click", () => {
  const fileMonth = state.selectedMonthKey.replace(/[^\w\-]+/g, "_");
  downloadFile(`financeiro_${fileMonth}.txt`, generateTxtExport(), "text/plain;charset=utf-8");
  closeSideMenu();
});

exportJsonBtn?.addEventListener("click", () => {
  const fileMonth = state.selectedMonthKey.replace(/[^\w\-]+/g, "_");
  downloadFile(
    `financeiro_${fileMonth}.json`,
    JSON.stringify(state, null, 2),
    "application/json;charset=utf-8"
  );
  closeSideMenu();
});

copySummaryBtn?.addEventListener("click", async () => {
  await copySummaryToClipboard();
  closeSideMenu();
});

skipOnboardingBtn?.addEventListener("click", () => closeOnboarding(true));
prevOnboardingBtn?.addEventListener("click", prevOnboarding);
nextOnboardingBtn?.addEventListener("click", nextOnboarding);

logoutAppBtn?.addEventListener("click", async () => {
  try {
    if (BOOT?.logout) {
      await BOOT.logout();
    }
  } catch (error) {
    console.error(error);
  }

  window.location.href = "index.html";
});

// ==========================================
// FUNÇÃO DA VIRADA DE MÊS
// ==========================================
// ==========================================
// FUNÇÃO DA VIRADA DE MÊS (Modo Produção Oficial)
// ==========================================
function checkMonthTransition() {
  // Puxa a data REAL de hoje do calendário do computador/celular
  const currentRealMonthKey = monthKeyFromDate(); 

  // 1. Se for o primeiro acesso da vida do app, cria o carimbo invisível e segue a vida
  if (!state.lastSeenRealMonth) {
    state.lastSeenRealMonth = currentRealMonthKey;
    saveState();
    return; 
  }

  // 2. Se a data de hoje for maior que a do último carimbo salvo... VIRADA DETECTADA!
  if (currentRealMonthKey > state.lastSeenRealMonth) {
    console.log("🚀 Virada de mês na vida real detectada!");
    
    const lastMonthKey = state.lastSeenRealMonth; 
    let saldoTransportado = 0;

    // 3. Faz toda a matemática de quanto sobrou do mês passado
    if (state.months[lastMonthKey]) {
      const lastMonthData = state.months[lastMonthKey];
      
      const filteredIncomes = getFilteredMonthIncomes(lastMonthData);
      const filteredOutflows = getFilteredMonthOutflows(lastMonthData);

      const totalIncome = filteredIncomes.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      const totalOutflow = filteredOutflows.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      const totalCards = getFilteredCardTotal(lastMonthKey);
      
      const opening = Number(lastMonthData.openingBalance || 0);
      const saved = Number(lastMonthData.savedThisMonth || 0);

      const remaining = opening + totalIncome - totalOutflow - totalCards - saved;
      
      saldoTransportado = remaining > 0 ? remaining : 0;
    }

    // 4. Se o mês novo não existir na memória, cria a estrutura dele
    if (!state.months[currentRealMonthKey]) {
      state.months[currentRealMonthKey] = createEmptyMonthData();
    }

    // 5. Salva o dinheiro que sobrou como Saldo Inicial e atualiza o carimbo
    state.months[currentRealMonthKey].openingBalance = saldoTransportado;
    state.lastSeenRealMonth = currentRealMonthKey;
    state.selectedMonthKey = currentRealMonthKey; 
    saveState();

    // 6. Mostra o Popup de boas-vindas na tela
    const modal = document.getElementById("welcomeMonthModal");
    const valorTxt = document.getElementById("welcomeMonthValue");

    if (modal && valorTxt) {
      valorTxt.textContent = formatCurrency(saldoTransportado);
      modal.classList.remove("hidden");
    }
  }
}
// ==========================================
// INIT FINAL DO APP
// ==========================================

// 0. CARREGA O BANCO DE DADOS PRIMEIRO (Faltava isso aqui!) 👇
loadState();

if (!state.selectedMonthKey) {
  state.selectedMonthKey = monthKeyFromDate();
}

ensureMonthExists(state.selectedMonthKey);

checkMonthTransition();

if (!state.selectedMonthKey) {
  state.selectedMonthKey = monthKeyFromDate();
}

ensureMonthExists(state.selectedMonthKey);

if (!getSelectedMonthData().saveGoal && state.profile.defaultSaveGoal) {
  getSelectedMonthData().saveGoal = state.profile.defaultSaveGoal;
}

bindMoneyInputs(document);
renderApp();

if (!state.onboardingSeen) {
  setTimeout(() => openOnboarding(true), 250);
}

function forceAppScaleNormal() {
  document.documentElement.style.zoom = "";
  document.body.style.zoom = "";

  document.documentElement.style.transform = "";
  document.documentElement.style.transformOrigin = "";

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    );
  }
}

// Quando abre a aplicação
window.addEventListener("load", () => {
  forceAppScaleNormal();
});

// Quando volta para a aba
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    forceAppScaleNormal();
  }
});