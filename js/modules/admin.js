import {
  STATUS_LIST,
  STATUS_CONFIG,
  ROLES_CONFIG,
  escapeHtml,
  formatDateTime,
  diffInHours,
  formatDurationHours,
  renderStatusBadge,
  openModal,
  closeModal,
  confirmAction,
  showToast,
  refreshIcons,
  toDate
} from '../utils.js';
import { isDemoMode } from '../auth.js';
import {
  getState,
  salvarUsuario,
  atualizarStatusUsuario,
  salvarUnidades,
  popularDadosSeed,
  resetarDadosDemo
} from '../store.js';

const viewState = {
  subTab: 'dashboard', // 'dashboard' | 'equipe' | 'auditoria'
  unidadeFiltro: 'TODAS',
  statusFiltro: 'TODOS',
  empresaFiltro: '',
  auditSetorFiltro: 'TODOS',
  auditBusca: ''
};

export function renderAdminModule(container, { user, state, onOpenRaioX }) {
  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-gray-900">Painel Executivo, SLA &amp; Administração</h2>
          <p class="text-sm text-gray-600">Visão consolidada de todas as unidades, tempo médio por etapa, auditoria e gestão da equipe.</p>
        </div>
      </div>

      <!-- Sub-navegação Admin -->
      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="border-b border-gray-200 px-4 pt-3 flex flex-wrap gap-2 bg-gray-50">
          ${renderAdminSubTab('dashboard', 'Dashboard & SLA', 'layout-dashboard')}
          ${renderAdminSubTab('equipe', 'Equipe & Unidades', 'users')}
          ${renderAdminSubTab('auditoria', 'Auditoria & Setup/Seed', 'shield-alert')}
        </div>

        <div class="p-4 sm:p-5">
          ${
            viewState.subTab === 'dashboard'
              ? renderDashboardExecutivo(state)
              : viewState.subTab === 'equipe'
              ? renderEquipeUnidades(state, user)
              : renderAuditoriaSeed(state)
          }
        </div>
      </div>
    </div>
  `;

  refreshIcons(container);
  bindAdminEvents(container, { user, state, onOpenRaioX });
}

function renderAdminSubTab(id, label, icon) {
  const active = viewState.subTab === id;
  return `
    <button type="button" data-admin-tab="${id}"
      class="px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl border-b-2 inline-flex items-center gap-2 transition ${
        active
          ? 'bg-white text-brand-900 border-brand-900'
          : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-100'
      }">
      <i data-lucide="${icon}" class="w-4 h-4"></i>
      <span>${label}</span>
    </button>
  `;
}

function computeSlaMetrics(pedidos) {
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const solToFat = [];
  const fatToPag = [];
  const envioToReceb = [];

  for (const p of pedidos) {
    const h1 = diffInHours(p.criadoEm, p.financeiro?.dataEmissaoBoleto);
    if (h1 !== null) solToFat.push(h1);

    const h2 = diffInHours(p.financeiro?.dataEmissaoBoleto, p.financeiro?.dataPagamento);
    if (h2 !== null) fatToPag.push(h2);

    const h3 = diffInHours(p.patrimonio?.dataEnvioUnidade, p.patrimonio?.dataRecebimentoUnidade);
    if (h3 !== null) envioToReceb.push(h3);
  }

  return {
    solToFat: avg(solToFat),
    fatToPag: avg(fatToPag),
    envioToReceb: avg(envioToReceb)
  };
}

function renderDashboardExecutivo(state) {
  const pedidos = state.pedidos;

  const totalPecas = pedidos.reduce((acc, p) => acc + (Number(p.totalPecas) || 0), 0);
  const agPagamento = pedidos.filter((p) => p.status === 'AGUARDANDO_PAGAMENTO');
  const agPagamentoPecas = agPagamento.reduce((acc, p) => acc + (Number(p.totalPecas) || 0), 0);
  const emFabricacao = pedidos.filter((p) => p.status === 'EM_FABRICACAO');
  const emFabricacaoPecas = emFabricacao.reduce((acc, p) => acc + (Number(p.totalPecas) || 0), 0);

  const pendentesEntregaPedidos = pedidos.filter((p) =>
    ['EM_TRANSITO', 'RECEBIDO_UNIDADE'].includes(p.status)
  );
  const jovensPendentesEntrega = pedidos.reduce((acc, p) => {
    const pend = (p.itens || []).filter((it) => !it.entregueAoJovem).length;
    return acc + pend;
  }, 0);

  const sla = computeSlaMetrics(pedidos);

  // Gráficos de barras CSS por unidade
  const mapUnidade = {};
  for (const u of state.unidades) mapUnidade[u] = 0;
  for (const p of pedidos) {
    mapUnidade[p.unidade] = (mapUnidade[p.unidade] || 0) + (Number(p.totalPecas) || 0);
  }
  const unidadeEntries = Object.entries(mapUnidade).sort((a, b) => b[1] - a[1]);
  const maxUnitPecas = Math.max(1, ...unidadeEntries.map((e) => e[1]));

  // Distribuição por status
  const statusCounts = STATUS_LIST.map((st) => ({
    status: st,
    label: STATUS_CONFIG[st].shortLabel,
    count: pedidos.filter((p) => p.status === st).length
  }));
  const maxStatusCount = Math.max(1, ...statusCounts.map((s) => s.count));

  // Tabela filtrada
  const pedidosFiltrados = pedidos.filter((p) => {
    if (viewState.unidadeFiltro !== 'TODAS' && p.unidade !== viewState.unidadeFiltro) return false;
    if (viewState.statusFiltro !== 'TODOS' && p.status !== viewState.statusFiltro) return false;
    if (viewState.empresaFiltro.trim()) {
      const q = viewState.empresaFiltro.trim().toLowerCase();
      const hit =
        String(p.empresaNome || '').toLowerCase().includes(q) ||
        String(p.codigo || '').toLowerCase().includes(q) ||
        String(p.empresaCnpj || '').toLowerCase().includes(q) ||
        String(p.turma || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  return `
    <div class="space-y-6">
      <!-- 4 KPIs Executivos -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-xl border border-gray-200 bg-brand-900 text-white p-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-brand-100">Total de Fardas Solicitadas</span>
            <i data-lucide="shirt" class="w-4 h-4 text-brand-100"></i>
          </div>
          <p class="text-3xl font-extrabold mt-2">${totalPecas}</p>
          <p class="text-xs text-brand-100/80 mt-1">Em ${pedidos.length} pedidos registrados</p>
        </div>

        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500">Aguardando Pagamento</span>
            <i data-lucide="clock-alert" class="w-4 h-4 text-amber-600"></i>
          </div>
          <p class="text-3xl font-extrabold text-amber-700 mt-2">${agPagamento.length}</p>
          <p class="text-xs text-gray-500 mt-1">${agPagamentoPecas} peças com boleto em aberto</p>
        </div>

        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500">Em Fabricação</span>
            <i data-lucide="factory" class="w-4 h-4 text-sky-700"></i>
          </div>
          <p class="text-3xl font-extrabold text-sky-800 mt-2">${emFabricacaoPecas}</p>
          <p class="text-xs text-gray-500 mt-1">peças em ${emFabricacao.length} pedido(s) na fábrica</p>
        </div>

        <div class="rounded-xl border border-gray-200 bg-white p-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500">Pendentes de Entrega ao Jovem</span>
            <i data-lucide="user-check" class="w-4 h-4 text-teal-700"></i>
          </div>
          <p class="text-3xl font-extrabold text-teal-800 mt-2">${jovensPendentesEntrega}</p>
          <p class="text-xs text-gray-500 mt-1">${pendentesEntregaPedidos.length} pedidos em trânsito/unidade</p>
        </div>
      </div>

      <!-- SLA + Gráficos -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div class="lg:col-span-4 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <h3 class="text-sm font-bold text-gray-900 flex items-center gap-2">
            <i data-lucide="timer" class="w-4 h-4 text-brand-700"></i>
            <span>SLA Médio por Etapa</span>
          </h3>
          <div class="space-y-2.5 text-xs">
            <div class="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-between">
              <span class="text-gray-600">Solicitação → Boleto</span>
              <strong class="text-sm text-gray-900">${formatDurationHours(sla.solToFat)}</strong>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-between">
              <span class="text-gray-600">Boleto → Pagamento</span>
              <strong class="text-sm text-gray-900">${formatDurationHours(sla.fatToPag)}</strong>
            </div>
            <div class="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-between">
              <span class="text-gray-600">Despacho → Receb. Unidade</span>
              <strong class="text-sm text-gray-900">${formatDurationHours(sla.envioToReceb)}</strong>
            </div>
          </div>
        </div>

        <div class="lg:col-span-4 rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h3 class="text-sm font-bold text-gray-900">Peças Solicitadas por Unidade</h3>
          <div class="space-y-2.5">
            ${unidadeEntries
              .map(([unit, count]) => {
                const w = Math.round((count / maxUnitPecas) * 100);
                return `
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-medium text-gray-700">${escapeHtml(unit)}</span>
                  <span class="font-bold text-gray-900">${count} pç</span>
                </div>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill" style="width: ${w}%"></div>
                </div>
              </div>
            `;
              })
              .join('')}
          </div>
        </div>

        <div class="lg:col-span-4 rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h3 class="text-sm font-bold text-gray-900">Pedidos por Status (Funil)</h3>
          <div class="space-y-2.5">
            ${statusCounts
              .map((item) => {
                const w = Math.round((item.count / maxStatusCount) * 100);
                return `
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-medium text-gray-700">${escapeHtml(item.label)}</span>
                  <span class="font-bold text-gray-900">${item.count}</span>
                </div>
                <div class="chart-bar-track">
                  <div class="chart-bar-fill bg-emerald-600" style="width: ${w}%"></div>
                </div>
              </div>
            `;
              })
              .join('')}
          </div>
        </div>
      </div>

      <!-- Filtros & Tabela Global -->
      <div class="space-y-3">
        <div class="flex flex-col md:flex-row md:items-center gap-3">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" id="adm-search-empresa" value="${escapeHtml(viewState.empresaFiltro)}"
              placeholder="Filtrar por empresa parceira, código (#PED), CNPJ ou turma..."
              class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" />
          </div>
          <div class="flex flex-wrap gap-2">
            <select id="adm-unit-filter" class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <option value="TODAS" ${viewState.unidadeFiltro === 'TODAS' ? 'selected' : ''}>Todas as Unidades</option>
              ${state.unidades
                .map(
                  (u) =>
                    `<option value="${escapeHtml(u)}" ${viewState.unidadeFiltro === u ? 'selected' : ''}>${escapeHtml(u)}</option>`
                )
                .join('')}
            </select>
            <select id="adm-status-filter" class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <option value="TODOS" ${viewState.statusFiltro === 'TODOS' ? 'selected' : ''}>Todos os Status</option>
              ${STATUS_LIST.map(
                (st) =>
                  `<option value="${st}" ${viewState.statusFiltro === st ? 'selected' : ''}>${escapeHtml(STATUS_CONFIG[st].label)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="overflow-x-auto border border-gray-200 rounded-xl">
          <table class="min-w-full text-sm text-left">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
              <tr>
                <th class="px-4 py-3 font-semibold">Pedido</th>
                <th class="px-4 py-3 font-semibold">Unidade</th>
                <th class="px-4 py-3 font-semibold">Empresa Parceira / Turma</th>
                <th class="px-4 py-3 font-semibold">Peças</th>
                <th class="px-4 py-3 font-semibold">Status</th>
                <th class="px-4 py-3 font-semibold">Criado em</th>
                <th class="px-4 py-3 font-semibold text-right">Raio-X</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              ${
                pedidosFiltrados.length === 0
                  ? `<tr><td colspan="7" class="px-4 py-8 text-center text-xs text-gray-500">Nenhum pedido encontrado com os filtros selecionados.</td></tr>`
                  : pedidosFiltrados
                      .map(
                        (ped) => `
                  <tr class="hover:bg-gray-50 cursor-pointer" data-row-raiox="${escapeHtml(ped.id)}">
                    <td class="px-4 py-3 whitespace-nowrap font-mono font-bold text-xs text-brand-900">${escapeHtml(ped.codigo)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-xs font-semibold text-gray-700">${escapeHtml(ped.unidade)}</td>
                    <td class="px-4 py-3">
                      <div class="font-semibold text-gray-900">${escapeHtml(ped.empresaNome)}</div>
                      <div class="text-xs text-gray-500">Turma ${escapeHtml(ped.turma)} • ${escapeHtml(ped.empresaCnpj)}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-xs font-semibold text-gray-800">
                      ${ped.totalPecas} pç (${(ped.itens || []).length} jovens)
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">${renderStatusBadge(ped.status)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-xs text-gray-600">${formatDateTime(ped.criadoEm)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-right">
                      <button type="button" data-action="raio-x" data-pedido-id="${escapeHtml(ped.id)}"
                        class="px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-brand-50 hover:border-brand-700 text-xs font-semibold text-gray-700">
                        Abrir Raio-X
                      </button>
                    </td>
                  </tr>
                `
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderEquipeUnidades(state, currentUser) {
  return `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Gestão de Usuários -->
      <div class="lg:col-span-8 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 class="text-base font-bold text-gray-900">Equipe &amp; Permissões</h3>
            <p class="text-xs text-gray-500">Cadastre colaboradores e defina seus perfis (Supervisão, Financeiro, Patrimônio, Admin) e unidades.</p>
          </div>
          <button type="button" id="btn-novo-usuario"
            class="btn-primary px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 self-start">
            <i data-lucide="user-plus" class="w-4 h-4"></i>
            <span>Cadastrar Usuário</span>
          </button>
        </div>

        <div class="overflow-x-auto border border-gray-200 rounded-xl">
          <table class="min-w-full text-sm text-left">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500 border-b border-gray-200">
              <tr>
                <th class="px-4 py-3 font-semibold">Nome / E-mail</th>
                <th class="px-4 py-3 font-semibold">Perfil</th>
                <th class="px-4 py-3 font-semibold">Unidade</th>
                <th class="px-4 py-3 font-semibold">Status</th>
                <th class="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              ${state.users
                .map((u) => {
                  const roleInfo = ROLES_CONFIG[u.role] || { label: u.role, badgeClass: 'bg-gray-100 text-gray-800' };
                  const isSelf = u.uid === currentUser.uid;
                  return `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3">
                    <div class="font-semibold text-gray-900">${escapeHtml(u.nome)} ${isSelf ? '<span class="text-[11px] text-brand-700 font-bold">(Você)</span>' : ''}</div>
                    <div class="text-xs text-gray-500">${escapeHtml(u.email)}</div>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleInfo.badgeClass}">${escapeHtml(roleInfo.label)}</span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-xs font-medium text-gray-700">${escapeHtml(u.unidade)}</td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${u.ativo !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
                      ${u.ativo !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-right">
                    <div class="inline-flex items-center gap-1.5">
                      <button type="button" data-edit-user="${escapeHtml(u.uid)}"
                        class="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100">
                        Editar
                      </button>
                      ${
                        !isSelf
                          ? `<button type="button" data-toggle-user="${escapeHtml(u.uid)}" data-next-active="${u.ativo === false ? 'true' : 'false'}"
                              class="px-2.5 py-1 rounded-lg border ${u.ativo === false ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-50' : 'border-red-200 text-red-700 hover:bg-red-50'} text-xs font-medium">
                              ${u.ativo === false ? 'Ativar' : 'Desativar'}
                            </button>`
                          : ''
                      }
                    </div>
                  </td>
                </tr>
              `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Gestão de Unidades -->
      <div class="lg:col-span-4 space-y-4">
        <div>
          <h3 class="text-base font-bold text-gray-900">Unidades Atendidas</h3>
          <p class="text-xs text-gray-500">Polos disponíveis para solicitações e filtros.</p>
        </div>

        <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <form id="form-add-unidade" class="flex gap-2">
            <input id="input-nova-unidade" type="text" required placeholder="Ex: Juazeiro do Norte"
              class="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" />
            <button type="submit" class="btn-primary px-3 py-2 rounded-lg text-xs font-semibold shrink-0">Adicionar</button>
          </form>

          <div class="divide-y divide-gray-200 bg-white rounded-lg border border-gray-200">
            ${state.unidades
              .map(
                (unit) => `
              <div class="px-3 py-2 flex items-center justify-between text-sm">
                <span class="font-medium text-gray-800">${escapeHtml(unit)}</span>
                <button type="button" data-remove-unidade="${escapeHtml(unit)}"
                  class="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="Remover unidade">
                  <i data-lucide="x" class="w-4 h-4"></i>
                </button>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAuditoriaSeed(state) {
  // Consolida todos os logs de todos os pedidos
  const allLogs = [];
  for (const ped of state.pedidos) {
    for (const log of ped.historicoLogs || []) {
      allLogs.push({
        pedidoId: ped.id,
        codigo: ped.codigo,
        unidade: ped.unidade,
        empresaNome: ped.empresaNome,
        ...log
      });
    }
  }
  allLogs.sort((a, b) => (toDate(b.data)?.getTime() || 0) - (toDate(a.data)?.getTime() || 0));

  const setoresDisponiveis = [...new Set(allLogs.map((l) => l.setor).filter(Boolean))];
  const logsFiltrados = allLogs.filter((l) => {
    if (viewState.auditSetorFiltro !== 'TODOS' && l.setor !== viewState.auditSetorFiltro) return false;
    if (viewState.auditBusca.trim()) {
      const q = viewState.auditBusca.trim().toLowerCase();
      const hit =
        String(l.codigo || '').toLowerCase().includes(q) ||
        String(l.usuario || '').toLowerCase().includes(q) ||
        String(l.acao || '').toLowerCase().includes(q) ||
        String(l.empresaNome || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  return `
    <div class="space-y-6">
      <!-- Card Seed / Dados de Demonstração -->
      <div class="rounded-xl border border-brand-100 bg-brand-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 class="text-sm font-bold text-brand-900 flex items-center gap-2">
            <i data-lucide="database" class="w-4 h-4"></i>
            <span>Modo Demonstração &amp; Seed Inicial do Banco</span>
          </h3>
          <p class="text-xs text-gray-700 mt-1">
            Popule automaticamente pedidos em todos os 7 status, boletos e lotes de fabricação para testar ou validar o sistema.
          </p>
        </div>

        <div class="flex flex-wrap gap-2 shrink-0">
          ${
            isDemoMode()
              ? `<button type="button" id="btn-reset-demo-db"
                  class="px-3.5 py-2 rounded-lg border border-brand-700 bg-white text-brand-900 hover:bg-brand-100 text-xs font-semibold inline-flex items-center gap-1.5">
                  <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
                  <span>Resetar Dados Demo</span>
                </button>`
              : `<button type="button" id="btn-seed-firestore"
                  class="btn-primary px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
                  <i data-lucide="sparkles" class="w-4 h-4"></i>
                  <span>Popular Dados de Teste (Seed)</span>
                </button>`
          }
        </div>
      </div>

      <!-- Feed de Auditoria Global -->
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 class="text-base font-bold text-gray-900">Trilha de Auditoria Consolidada (${logsFiltrados.length})</h3>
          <div class="flex flex-wrap gap-2">
            <input type="text" id="audit-search" value="${escapeHtml(viewState.auditBusca)}"
              placeholder="Buscar usuário, ação ou pedido..."
              class="px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white" />
            <select id="audit-setor-filter" class="px-3 py-1.5 text-xs border border-gray-300 rounded-lg bg-white">
              <option value="TODOS" ${viewState.auditSetorFiltro === 'TODOS' ? 'selected' : ''}>Todos os Setores</option>
              ${setoresDisponiveis
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s)}" ${viewState.auditSetorFiltro === s ? 'selected' : ''}>${escapeHtml(s)}</option>`
                )
                .join('')}
            </select>
          </div>
        </div>

        <div class="border border-gray-200 rounded-xl divide-y divide-gray-200 max-h-[480px] overflow-y-auto bg-white">
          ${
            logsFiltrados.length === 0
              ? `<p class="p-6 text-center text-xs text-gray-500">Nenhum evento de auditoria registrado.</p>`
              : logsFiltrados
                  .slice(0, 100)
                  .map(
                    (log) => `
                <div class="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-gray-50">
                  <div class="space-y-0.5 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 text-xs">
                      <button type="button" data-action="raio-x" data-pedido-id="${escapeHtml(log.pedidoId)}"
                        class="font-mono font-bold text-brand-900 hover:underline">${escapeHtml(log.codigo)}</button>
                      <span class="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">${escapeHtml(log.setor)}</span>
                      <span class="text-gray-500">${escapeHtml(log.unidade)}</span>
                    </div>
                    <p class="text-sm text-gray-800">${escapeHtml(log.acao)}</p>
                  </div>
                  <div class="text-left sm:text-right text-xs text-gray-500 shrink-0">
                    <div class="font-medium text-gray-700">${escapeHtml(log.usuario)}</div>
                    <div>${formatDateTime(log.data)}</div>
                  </div>
                </div>
              `
                  )
                  .join('')
          }
        </div>
      </div>
    </div>
  `;
}

function bindAdminEvents(container, { user, state, onOpenRaioX }) {
  const rerenderCurrent = () => renderAdminModule(container, { user, state: getState(), onOpenRaioX });

  container.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewState.subTab = btn.getAttribute('data-admin-tab');
      rerenderCurrent();
    });
  });

  // Filtros Dashboard
  container.querySelector('#adm-search-empresa')?.addEventListener('input', (e) => {
    viewState.empresaFiltro = e.target.value;
    rerenderCurrent();
    const el = container.querySelector('#adm-search-empresa');
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  container.querySelector('#adm-unit-filter')?.addEventListener('change', (e) => {
    viewState.unidadeFiltro = e.target.value;
    rerenderCurrent();
  });

  container.querySelector('#adm-status-filter')?.addEventListener('change', (e) => {
    viewState.statusFiltro = e.target.value;
    rerenderCurrent();
  });

  container.querySelectorAll('[data-action="raio-x"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpenRaioX(btn.getAttribute('data-pedido-id'));
    });
  });

  container.querySelectorAll('[data-row-raiox]').forEach((row) => {
    row.addEventListener('click', () => onOpenRaioX(row.getAttribute('data-row-raiox')));
  });

  // Equipe & Unidades
  container.querySelector('#btn-novo-usuario')?.addEventListener('click', () => {
    openUsuarioModal(null, state.unidades);
  });

  container.querySelectorAll('[data-edit-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const uid = btn.getAttribute('data-edit-user');
      const target = state.users.find((u) => u.uid === uid);
      if (target) openUsuarioModal(target, state.unidades);
    });
  });

  container.querySelectorAll('[data-toggle-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-toggle-user');
      const nextActive = btn.getAttribute('data-next-active') === 'true';
      try {
        await atualizarStatusUsuario(uid, nextActive);
        showToast(nextActive ? 'Usuário reativado.' : 'Usuário desativado.', 'success');
      } catch (error) {
        showToast(error.message || 'Erro ao atualizar status do usuário.', 'error');
      }
    });
  });

  container.querySelector('#form-add-unidade')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = container.querySelector('#input-nova-unidade');
    const nova = String(input?.value || '').trim();
    if (!nova) return;
    try {
      await salvarUnidades([...state.unidades, nova]);
      if (input) input.value = '';
      showToast(`Unidade "${nova}" adicionada.`, 'success');
    } catch (error) {
      showToast(error.message || 'Erro ao salvar unidade.', 'error');
    }
  });

  container.querySelectorAll('[data-remove-unidade]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const unit = btn.getAttribute('data-remove-unidade');
      const ok = await confirmAction({
        title: 'Remover Unidade',
        message: `Remover "${unit}" da lista de unidades selecionáveis? Pedidos antigos não serão apagados.`,
        confirmLabel: 'Remover',
        confirmVariant: 'danger'
      });
      if (!ok) return;
      try {
        await salvarUnidades(state.unidades.filter((u) => u !== unit));
        showToast(`Unidade "${unit}" removida.`, 'info');
      } catch (error) {
        showToast(error.message || 'Erro ao remover unidade.', 'error');
      }
    });
  });

  // Auditoria & Seed
  container.querySelector('#audit-search')?.addEventListener('input', (e) => {
    viewState.auditBusca = e.target.value;
    rerenderCurrent();
    const el = container.querySelector('#audit-search');
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  container.querySelector('#audit-setor-filter')?.addEventListener('change', (e) => {
    viewState.auditSetorFiltro = e.target.value;
    rerenderCurrent();
  });

  container.querySelector('#btn-reset-demo-db')?.addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Resetar Dados de Demonstração',
      message: 'Restaurar todos os pedidos, lotes e usuários de demonstração para o estado inicial?',
      confirmLabel: 'Restaurar'
    });
    if (!ok) return;
    resetarDadosDemo();
    showToast('Dados de demonstração restaurados.', 'success');
  });

  container.querySelector('#btn-seed-firestore')?.addEventListener('click', async () => {
    const force = state.pedidos.length > 0;
    const ok = await confirmAction({
      title: 'Popular Dados de Teste (Seed)',
      message: force
        ? 'O Firestore já possui pedidos. Deseja inserir mais 8 pedidos de exemplo e 2 lotes?'
        : 'Inserir 8 pedidos realistas (em todos os 7 status), 2 lotes de fabricação e unidades padrão no Firestore?',
      confirmLabel: 'Popular Banco'
    });
    if (!ok) return;

    try {
      const res = await popularDadosSeed(force);
      showToast(`Seed concluído: ${res.createdPedidos} pedidos e ${res.createdLotes} lotes criados!`, 'success');
    } catch (error) {
      showToast(error.message || 'Erro ao executar seed.', 'error');
    }
  });
}

function openUsuarioModal(existingUser, unidades) {
  const isNew = !existingUser;
  const demo = isDemoMode();
  const initialRole = existingUser?.role || 'supervisao';

  openModal({
    title: isNew ? 'Cadastrar Usuário na Equipe' : `Editar Usuário — ${existingUser.nome}`,
    subtitle: demo
      ? 'Modo Demonstração: salvo localmente no navegador.'
      : 'Em Firebase real, cria a conta no Authentication (sem sair da sua sessão) e grava o perfil em users/{uid}.',
    size: 'md',
    bodyHtml: `
      <form id="form-usuario-modal" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">Nome Completo *</label>
          <input id="usr-nome" type="text" required value="${escapeHtml(existingUser?.nome || '')}"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
        </div>

        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">E-mail Institucional *</label>
          <input id="usr-email" type="email" required ${!isNew && !demo ? 'readonly' : ''}
            value="${escapeHtml(existingUser?.email || '')}"
            class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg ${!isNew && !demo ? 'bg-gray-100' : ''}" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-gray-700 mb-1">Perfil (Role) *</label>
            <select id="usr-role" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="supervisao" ${initialRole === 'supervisao' ? 'selected' : ''}>Supervisão</option>
              <option value="financeiro" ${initialRole === 'financeiro' ? 'selected' : ''}>Financeiro</option>
              <option value="patrimonio" ${initialRole === 'patrimonio' ? 'selected' : ''}>Patrimônio / Logística</option>
              <option value="admin" ${initialRole === 'admin' ? 'selected' : ''}>Administrador</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-700 mb-1">Unidade *</label>
            <select id="usr-unidade" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="Todas" ${existingUser?.unidade === 'Todas' ? 'selected' : ''}>Todas (Setores Globais)</option>
              ${unidades
                .map(
                  (u) =>
                    `<option value="${escapeHtml(u)}" ${existingUser?.unidade === u ? 'selected' : ''}>${escapeHtml(u)}</option>`
                )
                .join('')}
            </select>
          </div>
        </div>

        ${
          isNew && !demo
            ? `<div class="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-700 mb-1">Senha Inicial (mín. 6 caracteres)</label>
                  <input id="usr-senha" type="password" minlength="6" placeholder="Cria automaticamente no Firebase Auth"
                    class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Ou informe um UID existente no Firebase Auth (opcional)</label>
                  <input id="usr-uid-manual" type="text" placeholder="Ex: xYz123Abc..."
                    class="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-lg bg-white" />
                </div>
              </div>`
            : ''
        }

        <label class="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input id="usr-ativo" type="checkbox" ${existingUser?.ativo !== false ? 'checked' : ''}
            class="w-4 h-4 rounded border-gray-300 accent-[#064E3B]" />
          <span>Usuário ativo no sistema</span>
        </label>
      </form>
    `,
    footerHtml: `
      <button type="button" data-modal-close class="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100">
        Cancelar
      </button>
      <button type="submit" form="form-usuario-modal" id="btn-save-user-modal"
        class="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">
        ${isNew ? 'Cadastrar Usuário' : 'Salvar Alterações'}
      </button>
    `,
    onRender: (modalEl) => {
      const roleSel = modalEl.querySelector('#usr-role');
      const unitSel = modalEl.querySelector('#usr-unidade');

      roleSel?.addEventListener('change', () => {
        if (['financeiro', 'patrimonio', 'admin'].includes(roleSel.value)) {
          unitSel.value = 'Todas';
        } else if (unitSel.value === 'Todas' && unidades[0]) {
          unitSel.value = unidades[0];
        }
      });

      modalEl.querySelector('#form-usuario-modal')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = modalEl.querySelector('#btn-save-user-modal');
        const nome = modalEl.querySelector('#usr-nome')?.value || '';
        const email = modalEl.querySelector('#usr-email')?.value || '';
        const role = roleSel?.value || 'supervisao';
        const unidade = unitSel?.value || 'Todas';
        const ativo = modalEl.querySelector('#usr-ativo')?.checked ?? true;
        const senha = modalEl.querySelector('#usr-senha')?.value || '';
        const uidManual = modalEl.querySelector('#usr-uid-manual')?.value || '';

        if (role === 'supervisao' && unidade === 'Todas') {
          showToast('Selecione uma unidade específica para o perfil Supervisão.', 'warning');
          return;
        }

        try {
          if (btn) btn.disabled = true;
          await salvarUsuario({
            uid: isNew ? uidManual : existingUser.uid,
            nome,
            email,
            senha,
            role,
            unidade,
            ativo,
            isNew
          });
          closeModal();
          showToast(isNew ? 'Usuário cadastrado com sucesso!' : 'Usuário atualizado!', 'success');
        } catch (error) {
          showToast(error.message || 'Erro ao salvar usuário.', 'error');
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    }
  });
}
