import { isFirebaseConfigured } from './firebase-config.js';
import {
  initAuth,
  loginWithEmail,
  resetPassword,
  logout,
  enterDemoMode,
  switchDemoProfile,
  getCurrentUser,
  isDemoMode
} from './auth.js';
import { startListeners, stopListeners, subscribe, getState, editarPedidoAdmin, excluirPedidoAdmin } from './store.js';
import { TAMANHOS, STATUS_LIST, maskCnpj, cleanCnpj, generateId, confirmAction } from './utils.js';
import {
  ROLES_CONFIG,
  STATUS_CONFIG,
  escapeHtml,
  getInitials,
  formatDateTime,
  formatIsoDateBR,
  getVencimentoInfo,
  calcularGradeItens,
  renderGradePills,
  renderStatusBadge,
  openModal,
  closeModal,
  showToast,
  refreshIcons
} from './utils.js';
import { renderSupervisaoModule } from './modules/supervisao.js';
import { renderFinanceiroModule } from './modules/financeiro.js';
import { renderPatrimonioModule } from './modules/patrimonio.js';
import { renderAdminModule } from './modules/admin.js';

const MODULE_META = {
  admin: {
    label: 'Gestão & Dashboard',
    title: 'Dashboard Executivo & Gestão',
    subtitle: 'Indicadores globais, SLA, auditoria e controle de equipe',
    icon: 'layout-dashboard'
  },
  supervisao: {
    label: 'Supervisão de Unidade',
    title: 'Solicitação & Entrega nas Unidades',
    subtitle: 'Criação de pedidos, recebimento e baixa individual ao jovem aprendiz',
    icon: 'clipboard-list'
  },
  financeiro: {
    label: 'Financeiro',
    title: 'Faturamento & Cobranças',
    subtitle: 'Emissão de boletos, controle de vencimentos e confirmações de pagamento',
    icon: 'receipt'
  },
  patrimonio: {
    label: 'Patrimônio / Logística',
    title: 'Produção & Expedição',
    subtitle: 'Consolidação de lotes de fabricação, mapa de separação e romaneios',
    icon: 'factory'
  }
};

let activeRoute = null;
let unsubscribeStore = null;

function getAllowedRoutes(user) {
  if (!user) return [];
  if (user.role === 'admin') return ['admin', 'supervisao', 'financeiro', 'patrimonio'];
  if (user.role === 'supervisao') return ['supervisao'];
  if (user.role === 'financeiro') return ['financeiro'];
  if (user.role === 'patrimonio') return ['patrimonio'];
  return ['supervisao'];
}

function getDefaultRoute(user) {
  const allowed = getAllowedRoutes(user);
  return allowed[0] || 'supervisao';
}

function toggleMobileSidebar(open) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('mobile-sidebar-backdrop');
  if (!sidebar || !backdrop) return;

  if (open) {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
  }
}

function renderSidebarNav(user) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const allowed = getAllowedRoutes(user);
  const state = getState();

  const badgeCounts = {
    supervisao: state.pedidos.filter(
      (p) =>
        (user.role !== 'supervisao' || p.unidade === user.unidade) &&
        ['EM_TRANSITO', 'RECEBIDO_UNIDADE'].includes(p.status)
    ).length,
    financeiro: state.pedidos.filter((p) =>
      ['AGUARDANDO_FATURAMENTO', 'AGUARDANDO_PAGAMENTO'].includes(p.status)
    ).length,
    patrimonio: state.pedidos.filter((p) => ['PAGO', 'EM_FABRICACAO'].includes(p.status)).length,
    admin: 0
  };

  nav.innerHTML = allowed
    .map((route) => {
      const meta = MODULE_META[route];
      const active = route === activeRoute;
      const badge = badgeCounts[route] || 0;

      return `
        <button type="button" data-nav-route="${route}"
          class="w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
            active
              ? 'bg-white text-brand-900 font-bold shadow-sm'
              : 'text-brand-100 hover:bg-white/10 hover:text-white'
          }">
          <span class="flex items-center gap-2.5 min-w-0">
            <i data-lucide="${meta.icon}" class="w-4 h-4 shrink-0"></i>
            <span class="truncate">${escapeHtml(meta.label)}</span>
          </span>
          ${
            badge > 0
              ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  active ? 'bg-brand-100 text-brand-900' : 'bg-brand-700 text-white'
                }">${badge}</span>`
              : ''
          }
        </button>
      `;
    })
    .join('');

  refreshIcons(nav);

  nav.querySelectorAll('[data-nav-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeRoute = btn.getAttribute('data-nav-route');
      toggleMobileSidebar(false);
      renderShellAndModule();
    });
  });
}

function updateHeaderAndUserInfo(user) {
  const roleInfo = ROLES_CONFIG[user.role] || { label: user.role };
  const meta = MODULE_META[activeRoute] || MODULE_META.supervisao;

  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  const avatar = document.getElementById('sidebar-user-avatar');
  const userName = document.getElementById('sidebar-user-name');
  const userMeta = document.getElementById('sidebar-user-meta');
  const unitText = document.getElementById('header-unit-text');
  const modeIndicator = document.getElementById('mode-indicator');
  const demoSwitcherWrap = document.getElementById('demo-switcher-wrap');
  const demoSwitcher = document.getElementById('demo-role-switcher');

  if (pageTitle) pageTitle.textContent = meta.title;
  if (pageSubtitle) pageSubtitle.textContent = meta.subtitle;
  if (avatar) avatar.textContent = getInitials(user.nome);
  if (userName) userName.textContent = user.nome;
  if (userMeta) userMeta.textContent = `${roleInfo.label} • ${user.unidade}`;
  if (unitText) {
    unitText.textContent = user.role === 'supervisao' ? `Unidade ${user.unidade}` : `${roleInfo.label} (${user.unidade})`;
  }

  if (modeIndicator) {
    if (isDemoMode()) {
      modeIndicator.className =
        'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-amber-50 text-amber-900 border-amber-200';
      modeIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span><span>Modo Demo Local</span>';
    } else {
      modeIndicator.className =
        'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-900 border-emerald-200';
      modeIndicator.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-600"></span><span>Firestore Tempo Real</span>';
    }
  }

  if (demoSwitcherWrap && demoSwitcher) {
    if (isDemoMode()) {
      demoSwitcherWrap.classList.remove('hidden');
      demoSwitcherWrap.classList.add('flex');
      if (user.demoKey) demoSwitcher.value = user.demoKey;
    } else {
      demoSwitcherWrap.classList.add('hidden');
      demoSwitcherWrap.classList.remove('flex');
    }
  }
}

function renderActiveModule() {
  const user = getCurrentUser();
  const main = document.getElementById('main-content');
  if (!user || !main) return;

  const state = getState();

  if (state.loading && !state.initialized) {
    main.innerHTML = `
      <div class="bg-white rounded-2xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
        <div class="w-10 h-10 rounded-full border-4 border-brand-100 border-t-brand-900 animate-spin mb-3"></div>
        <p class="text-sm font-semibold text-gray-800">Sincronizando dados em tempo real...</p>
        <p class="text-xs text-gray-500 mt-1">Conectando ao Cloud Firestore.</p>
      </div>
    `;
    return;
  }

  const allowed = getAllowedRoutes(user);
  if (!allowed.includes(activeRoute)) {
    activeRoute = getDefaultRoute(user);
  }

  const ctx = {
    user,
    state,
    onOpenRaioX: (pedidoId) => openRaioXModal(pedidoId),
    onEditPedido: (pedidoId) => openEditarPedidoModal(pedidoId),
    onDeletePedido: (pedidoId) => handleExcluirPedidoAdmin(pedidoId)
  };

  if (activeRoute === 'admin') {
    renderAdminModule(main, ctx);
  } else if (activeRoute === 'financeiro') {
    renderFinanceiroModule(main, ctx);
  } else if (activeRoute === 'patrimonio') {
    renderPatrimonioModule(main, ctx);
  } else {
    renderSupervisaoModule(main, ctx);
  }
}

function renderShellAndModule() {
  const user = getCurrentUser();
  if (!user) return;
  updateHeaderAndUserInfo(user);
  renderSidebarNav(user);
  renderActiveModule();
}

export function openRaioXModal(pedidoId) {
  const { pedidos, lotes } = getState();
  const ped = pedidos.find((p) => p.id === pedidoId);
  if (!ped) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  const stepAtual = STATUS_CONFIG[ped.status]?.step || 1;
  const pct = Math.round((stepAtual / 7) * 100);
  const grade = calcularGradeItens(ped.itens || []);
  const loteVinc = ped.patrimonio?.loteFabricacaoId
    ? lotes.find((l) => l.id === ped.patrimonio.loteFabricacaoId)
    : null;
  const vencInfo = ped.financeiro?.dataVencimento
    ? getVencimentoInfo(ped.financeiro.dataVencimento)
    : null;
  const logs = [...(ped.historicoLogs || [])].reverse();

  openModal({
    title: `Raio-X do Pedido ${ped.codigo || ''}`,
    subtitle: `${ped.empresaNome} • Unidade ${ped.unidade} • Turma ${ped.turma}`,
    size: 'xl',
    bodyHtml: `
      <div class="space-y-5">
        <!-- Cabeçalho Resumo -->
        <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-xs text-gray-500">CNPJ ${escapeHtml(ped.empresaCnpj)} • Criado por <strong>${escapeHtml(ped.criadoPor)}</strong> em ${formatDateTime(ped.criadoEm)}</p>
            </div>
            <div>${renderStatusBadge(ped.status)}</div>
          </div>

          <div>
            <div class="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Progresso do fluxo (Etapa ${stepAtual} de 7)</span>
              <span><strong>${ped.totalPecas} peças</strong> (${(ped.itens || []).length} jovens)</span>
            </div>
            <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div class="h-full bg-brand-700 rounded-full" style="width: ${pct}%"></div>
            </div>
          </div>

          <div>
            <span class="text-xs font-semibold text-gray-600 block mb-1">Grade do Pedido:</span>
            ${renderGradePills(grade)}
          </div>
        </div>

        <!-- Setores: Financeiro e Patrimônio -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="rounded-xl border border-gray-200 p-4 space-y-2 text-xs">
            <h4 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <i data-lucide="receipt" class="w-4 h-4 text-amber-600"></i>
              <span>Dados Financeiros</span>
            </h4>
            <div class="flex justify-between gap-2">
              <span class="text-gray-500">Nº do Boleto:</span>
              <strong class="font-mono text-gray-900">${escapeHtml(ped.financeiro?.numeroBoleto || 'Não emitido')}</strong>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-gray-500">Emissão:</span>
              <span>${ped.financeiro?.dataEmissaoBoleto ? formatDateTime(ped.financeiro.dataEmissaoBoleto) : '—'}</span>
            </div>
            <div class="flex justify-between items-center gap-2">
              <span class="text-gray-500">Vencimento:</span>
              <span>
                ${ped.financeiro?.dataVencimento ? formatIsoDateBR(ped.financeiro.dataVencimento) : '—'}
                ${
                  ped.status === 'AGUARDANDO_PAGAMENTO' && vencInfo
                    ? `<span class="ml-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${vencInfo.badgeClass}">${escapeHtml(vencInfo.label)}</span>`
                    : ''
                }
              </span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-gray-500">Pagamento:</span>
              <strong class="${ped.financeiro?.dataPagamento ? 'text-emerald-700' : 'text-gray-500'}">
                ${ped.financeiro?.dataPagamento ? formatDateTime(ped.financeiro.dataPagamento) : 'Pendente'}
              </strong>
            </div>
          </div>

          <div class="rounded-xl border border-gray-200 p-4 space-y-2 text-xs">
            <h4 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <i data-lucide="factory" class="w-4 h-4 text-brand-700"></i>
              <span>Logística &amp; Entrega</span>
            </h4>
            <div class="flex justify-between gap-2">
              <span class="text-gray-500">Lote de Fabricação:</span>
              <strong class="font-mono text-gray-900">${escapeHtml(loteVinc?.codigo || (ped.patrimonio?.loteFabricacaoId ? 'Vinculado' : 'Aguardando lote'))}</strong>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-gray-500">Despachado p/ Unidade:</span>
              <span>${ped.patrimonio?.dataEnvioUnidade ? formatDateTime(ped.patrimonio.dataEnvioUnidade) : '—'}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-gray-500">Recebido na Unidade:</span>
              <span>${ped.patrimonio?.dataRecebimentoUnidade ? formatDateTime(ped.patrimonio.dataRecebimentoUnidade) : '—'}</span>
            </div>
            <div class="flex justify-between gap-2">
              <span class="text-gray-500">Entregues ao Jovem:</span>
              <strong>${(ped.itens || []).filter((i) => i.entregueAoJovem).length} / ${(ped.itens || []).length}</strong>
            </div>
          </div>
        </div>

        <!-- Lista de Jovens -->
        <div class="space-y-2">
          <h4 class="text-sm font-bold text-gray-900">Jovens Aprendizes (${(ped.itens || []).length})</h4>
          <div class="border border-gray-200 rounded-xl overflow-hidden">
            <table class="min-w-full text-xs text-left">
              <thead class="bg-gray-50 text-gray-500 uppercase border-b border-gray-200">
                <tr>
                  <th class="px-3 py-2 font-semibold">Jovem Aprendiz</th>
                  <th class="px-3 py-2 font-semibold">Tam.</th>
                  <th class="px-3 py-2 font-semibold">Qtd</th>
                  <th class="px-3 py-2 font-semibold">Entrega</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${(ped.itens || [])
                  .map(
                    (it) => `
                  <tr>
                    <td class="px-3 py-2 font-medium text-gray-900">${escapeHtml(it.jovemNome)}</td>
                    <td class="px-3 py-2 font-bold">${escapeHtml(it.tamanho)}</td>
                    <td class="px-3 py-2">${it.quantidade}</td>
                    <td class="px-3 py-2">
                      ${
                        it.entregueAoJovem
                          ? `<span class="text-emerald-700 font-semibold">Entregue (${formatDateTime(it.dataEntregaJovem)})</span>`
                          : `<span class="text-gray-500">Pendente</span>`
                      }
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Linha do Tempo Completa (historicoLogs) -->
        <div class="space-y-2.5">
          <h4 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <i data-lucide="history" class="w-4 h-4 text-brand-700"></i>
            <span>Linha do Tempo / Auditoria (${logs.length} eventos)</span>
          </h4>

          <div class="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
            ${
              logs.length === 0
                ? '<p class="text-xs text-gray-500">Nenhum evento registrado.</p>'
                : logs
                    .map(
                      (log, idx) => `
                  <div class="flex gap-3">
                    <div class="flex flex-col items-center">
                      <span class="w-2.5 h-2.5 rounded-full ${idx === 0 ? 'bg-brand-700' : 'bg-gray-300'} mt-1.5"></span>
                      ${idx < logs.length - 1 ? '<span class="w-px flex-1 bg-gray-200 mt-1"></span>' : ''}
                    </div>
                    <div class="pb-2 flex-1 min-w-0">
                      <div class="flex flex-wrap items-center justify-between gap-1 text-xs">
                        <span class="font-bold text-gray-900">${escapeHtml(log.setor)}</span>
                        <span class="text-gray-500">${formatDateTime(log.data)}</span>
                      </div>
                      <p class="text-sm text-gray-800 mt-0.5">${escapeHtml(log.acao)}</p>
                      <p class="text-[11px] text-gray-500 mt-0.5">Responsável: ${escapeHtml(log.usuario)}</p>
                    </div>
                  </div>
                `
                    )
                    .join('')
            }
          </div>
        </div>
      </div>
    `,
    footerHtml: `
      ${
        getCurrentUser()?.role === 'admin'
          ? `<button type="button" id="btn-raiox-excluir" class="px-4 py-2 rounded-lg border border-red-300 bg-white text-sm font-semibold text-red-700 hover:bg-red-50 inline-flex items-center gap-1.5 mr-auto">
              <i data-lucide="trash-2" class="w-4 h-4"></i><span>Excluir Pedido</span>
            </button>
            <button type="button" id="btn-raiox-editar" class="px-4 py-2 rounded-lg border border-brand-700 bg-brand-50 text-sm font-semibold text-brand-900 hover:bg-brand-100 inline-flex items-center gap-1.5">
              <i data-lucide="pencil" class="w-4 h-4"></i><span>Editar Pedido</span>
            </button>`
          : ''
      }
      <button type="button" data-modal-close class="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100">
        Fechar
      </button>
    `,
    onRender: (modalEl) => {
      modalEl.querySelector('#btn-raiox-editar')?.addEventListener('click', () => {
        closeModal();
        openEditarPedidoModal(pedidoId);
      });
      modalEl.querySelector('#btn-raiox-excluir')?.addEventListener('click', () => {
        closeModal();
        handleExcluirPedidoAdmin(pedidoId);
      });
    }
  });
}

export async function handleExcluirPedidoAdmin(pedidoId) {
  const ped = getState().pedidos.find((p) => p.id === pedidoId);
  if (!ped) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }
  const ok = await confirmAction({
    title: 'Excluir Pedido',
    message: `Excluir definitivamente o pedido ${ped.codigo} (${ped.empresaNome} — ${ped.unidade})? Esta ação não pode ser desfeita.${ped.patrimonio?.loteFabricacaoId ? ' O pedido também será removido do lote de fabricação vinculado.' : ''}`,
    confirmLabel: 'Excluir',
    confirmVariant: 'danger'
  });
  if (!ok) return;
  try {
    await excluirPedidoAdmin(pedidoId);
    showToast(`Pedido ${ped.codigo} excluído.`, 'success');
  } catch (error) {
    showToast(error.message || 'Erro ao excluir pedido.', 'error');
  }
}

export function openEditarPedidoModal(pedidoId) {
  const { pedidos, unidades } = getState();
  const ped = pedidos.find((p) => p.id === pedidoId);
  if (!ped) {
    showToast('Pedido não encontrado.', 'error');
    return;
  }

  const itens = (ped.itens || []).map((it) => ({
    idItem: it.idItem,
    jovemNome: it.jovemNome,
    tamanho: it.tamanho,
    quantidade: it.quantidade,
    entregueAoJovem: Boolean(it.entregueAoJovem),
    dataEntregaJovem: it.dataEntregaJovem || null
  }));
  const unidadeOpts = [...new Set([...(unidades || []), ped.unidade])];
  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white';

  const renderItens = (modalEl) => {
    const list = modalEl.querySelector('#edit-itens-list');
    if (!list) return;
    list.innerHTML = itens
      .map(
        (it, idx) => `
      <div class="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-gray-200 bg-white">
        <input type="text" data-idx="${idx}" data-field="jovemNome" value="${escapeHtml(it.jovemNome)}" placeholder="Nome do jovem"
          class="col-span-12 sm:col-span-5 px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <select data-idx="${idx}" data-field="tamanho" class="col-span-4 sm:col-span-2 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
          ${TAMANHOS.map((t) => `<option value="${t}" ${t === it.tamanho ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <input type="number" min="1" max="50" data-idx="${idx}" data-field="quantidade" value="${it.quantidade}"
          class="col-span-3 sm:col-span-2 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
        <label class="col-span-3 sm:col-span-2 inline-flex items-center gap-1.5 text-xs text-gray-700">
          <input type="checkbox" data-idx="${idx}" data-field="entregueAoJovem" ${it.entregueAoJovem ? 'checked' : ''} class="w-4 h-4 accent-[#064E3B]" />
          Entregue
        </label>
        <button type="button" data-remove-idx="${idx}" class="col-span-2 sm:col-span-1 p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label="Remover jovem">
          <i data-lucide="trash-2" class="w-4 h-4 mx-auto"></i>
        </button>
      </div>`
      )
      .join('');
    refreshIcons(list);
    const total = itens.reduce((acc, it) => acc + (Number(it.quantidade) || 0), 0);
    const totalEl = modalEl.querySelector('#edit-total');
    if (totalEl) totalEl.textContent = `${itens.length} jovens • ${total} peças`;
  };

  openModal({
    title: `Editar Pedido ${ped.codigo}`,
    subtitle: 'Edição administrativa — a alteração é registrada na linha do tempo do pedido.',
    size: 'xl',
    bodyHtml: `
      <form id="form-editar-pedido" class="space-y-5">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div class="md:col-span-4">
            <label class="block text-xs font-semibold text-gray-700 mb-1">Empresa *</label>
            <input id="edit-empresa" type="text" value="${escapeHtml(ped.empresaNome)}" class="${inputCls}" />
          </div>
          <div class="md:col-span-3">
            <label class="block text-xs font-semibold text-gray-700 mb-1">CNPJ *</label>
            <input id="edit-cnpj" type="text" maxlength="18" value="${escapeHtml(ped.empresaCnpj)}" class="${inputCls}" />
          </div>
          <div class="md:col-span-2">
            <label class="block text-xs font-semibold text-gray-700 mb-1">Turma *</label>
            <input id="edit-turma" type="text" value="${escapeHtml(ped.turma)}" class="${inputCls}" />
          </div>
          <div class="md:col-span-3">
            <label class="block text-xs font-semibold text-gray-700 mb-1">Unidade *</label>
            <select id="edit-unidade" class="${inputCls}">
              ${unidadeOpts.map((u) => `<option value="${escapeHtml(u)}" ${u === ped.unidade ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div class="md:col-span-4">
            <label class="block text-xs font-semibold text-gray-700 mb-1">Status do Pedido</label>
            <select id="edit-status" class="${inputCls}">
              ${STATUS_LIST.map((st) => `<option value="${st}" ${st === ped.status ? 'selected' : ''}>${escapeHtml(STATUS_CONFIG[st].label)}</option>`).join('')}
            </select>
          </div>
          <div class="md:col-span-4">
            <label class="block text-xs font-semibold text-gray-700 mb-1">Nº do Boleto</label>
            <input id="edit-boleto" type="text" value="${escapeHtml(ped.financeiro?.numeroBoleto || '')}" class="${inputCls} font-mono" />
          </div>
          <div class="md:col-span-4">
            <label class="block text-xs font-semibold text-gray-700 mb-1">Vencimento</label>
            <input id="edit-venc" type="date" value="${escapeHtml(ped.financeiro?.dataVencimento || '')}" class="${inputCls}" />
          </div>
          <p class="md:col-span-12 text-[11px] text-gray-500">Boleto e vencimento são obrigatórios para qualquer status após "Aguardando Faturamento". Ao voltar para "Aguardando Faturamento", os dados de boleto são limpos.</p>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-bold text-gray-900">Jovens Aprendizes</h4>
            <span id="edit-total" class="text-xs font-semibold text-brand-900 bg-brand-100 px-2.5 py-1 rounded-full"></span>
          </div>
          <div id="edit-itens-list" class="space-y-2"></div>
          <button type="button" id="btn-edit-add-jovem" class="px-3 py-2 rounded-lg border border-dashed border-gray-400 text-xs font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5">
            <i data-lucide="user-plus" class="w-4 h-4"></i><span>Adicionar jovem</span>
          </button>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" data-modal-close class="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100">Cancelar</button>
      <button type="submit" form="form-editar-pedido" id="btn-salvar-edicao" class="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">Salvar Alterações</button>
    `,
    onRender: (modalEl) => {
      renderItens(modalEl);

      const cnpjEl = modalEl.querySelector('#edit-cnpj');
      cnpjEl?.addEventListener('input', (e) => {
        e.target.value = maskCnpj(e.target.value);
      });

      const list = modalEl.querySelector('#edit-itens-list');
      const onFieldChange = (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        const field = e.target.getAttribute('data-field');
        if (Number.isNaN(idx) || !field || !itens[idx]) return;
        itens[idx][field] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (field === 'quantidade') {
          const total = itens.reduce((acc, it) => acc + (Number(it.quantidade) || 0), 0);
          const totalEl = modalEl.querySelector('#edit-total');
          if (totalEl) totalEl.textContent = `${itens.length} jovens • ${total} peças`;
        }
      };
      list?.addEventListener('input', onFieldChange);
      list?.addEventListener('change', onFieldChange);
      list?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-idx]');
        if (!btn) return;
        itens.splice(Number(btn.getAttribute('data-remove-idx')), 1);
        renderItens(modalEl);
      });

      modalEl.querySelector('#btn-edit-add-jovem')?.addEventListener('click', () => {
        itens.push({
          idItem: generateId(),
          jovemNome: '',
          tamanho: 'M',
          quantidade: 2,
          entregueAoJovem: false,
          dataEntregaJovem: null
        });
        renderItens(modalEl);
      });

      modalEl.querySelector('#form-editar-pedido')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = modalEl.querySelector('#btn-salvar-edicao');
        try {
          if (btn) btn.disabled = true;
          await editarPedidoAdmin(pedidoId, {
            empresaNome: modalEl.querySelector('#edit-empresa')?.value,
            empresaCnpj: cleanCnpj(modalEl.querySelector('#edit-cnpj')?.value),
            turma: modalEl.querySelector('#edit-turma')?.value,
            unidade: modalEl.querySelector('#edit-unidade')?.value,
            status: modalEl.querySelector('#edit-status')?.value,
            numeroBoleto: modalEl.querySelector('#edit-boleto')?.value,
            dataVencimento: modalEl.querySelector('#edit-venc')?.value,
            itens
          });
          closeModal();
          showToast(`Pedido ${ped.codigo} atualizado pelo Administrador.`, 'success');
        } catch (error) {
          showToast(error.message || 'Erro ao salvar edição.', 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }
  });
}

function showScreen(mode) {
  const bootLoader = document.getElementById('boot-loader');
  const authScreen = document.getElementById('auth-screen');
  const appShell = document.getElementById('app-shell');

  bootLoader?.classList.add('hidden');
  if (mode === 'app') {
    authScreen?.classList.add('hidden');
    appShell?.classList.remove('hidden');
  } else {
    appShell?.classList.add('hidden');
    authScreen?.classList.remove('hidden');
  }
}

function bindGlobalUiEvents() {
  const banner = document.getElementById('firebase-config-banner');
  if (banner && !isFirebaseConfigured()) {
    banner.classList.remove('hidden');
  }

  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginBtn = document.getElementById('btn-login-submit');

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) {
      loginError.classList.add('hidden');
      loginError.textContent = '';
    }
    const email = document.getElementById('login-email')?.value || '';
    const password = document.getElementById('login-password')?.value || '';

    try {
      if (loginBtn) loginBtn.disabled = true;
      await loginWithEmail(email, password);
    } catch (error) {
      if (loginError) {
        loginError.textContent = error.message || 'Erro ao fazer login.';
        loginError.classList.remove('hidden');
      }
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  });

  document.getElementById('btn-forgot-password')?.addEventListener('click', async () => {
    const email = document.getElementById('login-email')?.value || '';
    try {
      await resetPassword(email);
      showToast('E-mail de redefinição de senha enviado! Confira sua caixa de entrada.', 'success');
    } catch (error) {
      showToast(error.message || 'Não foi possível enviar o e-mail de redefinição.', 'warning');
    }
  });

  document.querySelectorAll('.demo-login-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const demoRole = btn.getAttribute('data-demo-role');
      enterDemoMode(demoRole);
      showToast('Modo Demonstração ativado com dados locais.', 'info');
    });
  });

  document.getElementById('demo-role-switcher')?.addEventListener('change', (e) => {
    switchDemoProfile(e.target.value);
    showToast('Perfil de demonstração alternado.', 'info');
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    toggleMobileSidebar(false);
    await logout();
  });

  document.getElementById('btn-open-sidebar')?.addEventListener('click', () => toggleMobileSidebar(true));
  document.getElementById('btn-close-sidebar')?.addEventListener('click', () => toggleMobileSidebar(false));
  document.getElementById('mobile-sidebar-backdrop')?.addEventListener('click', () => toggleMobileSidebar(false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      toggleMobileSidebar(false);
    }
  });
}

function bootstrap() {
  bindGlobalUiEvents();
  refreshIcons(document);

  initAuth((user, authErrorMessage) => {
    if (typeof unsubscribeStore === 'function') {
      unsubscribeStore();
      unsubscribeStore = null;
    }

    if (!user) {
      stopListeners();
      activeRoute = null;
      showScreen('auth');
      if (authErrorMessage) {
        const loginError = document.getElementById('login-error');
        if (loginError) {
          loginError.textContent = authErrorMessage;
          loginError.classList.remove('hidden');
        }
        showToast(authErrorMessage, 'error');
      }
      refreshIcons(document);
      return;
    }

    activeRoute = getDefaultRoute(user);
    showScreen('app');

    unsubscribeStore = subscribe(() => {
      renderShellAndModule();
    });

    startListeners(user);
    renderShellAndModule();
  });
}

bootstrap();
