import {
  TAMANHOS,
  STATUS_CONFIG,
  STATUS_LIST,
  escapeHtml,
  generateId,
  maskCnpj,
  cleanCnpj,
  buscarCnpjBrasilApi,
  calcularGradeItens,
  formatGradeResumo,
  renderGradePills,
  renderStatusBadge,
  formatDateTime,
  formatIsoDateBR,
  openModal,
  closeModal,
  confirmAction,
  showToast,
  refreshIcons
} from '../utils.js';
import {
  getState,
  criarPedido,
  confirmarRecebimentoUnidade,
  registrarEntregaJovem
} from '../store.js';

const viewState = {
  formOpen: false,
  unidadeFiltro: 'TODAS',
  statusFiltro: 'TODOS',
  busca: '',
  draftItens: [],
  draftForm: {
    cnpj: '',
    empresaNome: '',
    unidade: '',
    turma: ''
  },
  activeChecklistPedidoId: null
};

export function renderSupervisaoModule(container, { user, state, onOpenRaioX }) {
  const isSupervisor = user.role === 'supervisao';
  const unidadeEfetiva = isSupervisor ? user.unidade : viewState.unidadeFiltro;

  if (!viewState.draftForm.unidade) {
    viewState.draftForm.unidade = isSupervisor
      ? user.unidade
      : state.unidades[0] || 'Fortaleza';
  }

  // Filtra pedidos pela unidade (automático para supervisão)
  const pedidosDaUnidade = state.pedidos.filter((ped) => {
    if (isSupervisor) return ped.unidade === user.unidade;
    if (unidadeEfetiva && unidadeEfetiva !== 'TODAS') {
      return ped.unidade === unidadeEfetiva;
    }
    return true;
  });

  const emTransito = pedidosDaUnidade.filter((p) => p.status === 'EM_TRANSITO');
  const paraEntregar = pedidosDaUnidade.filter((p) => p.status === 'RECEBIDO_UNIDADE');

  const pedidosFiltrados = pedidosDaUnidade.filter((ped) => {
    if (viewState.statusFiltro !== 'TODOS' && ped.status !== viewState.statusFiltro) {
      return false;
    }
    if (viewState.busca.trim()) {
      const q = viewState.busca.trim().toLowerCase();
      const hit =
        String(ped.codigo || '').toLowerCase().includes(q) ||
        String(ped.empresaNome || '').toLowerCase().includes(q) ||
        String(ped.empresaCnpj || '').toLowerCase().includes(q) ||
        String(ped.turma || '').toLowerCase().includes(q) ||
        (ped.itens || []).some((it) => String(it.jovemNome || '').toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });

  const totalPecasUnidade = pedidosDaUnidade.reduce((acc, p) => acc + (Number(p.totalPecas) || 0), 0);
  const concluidosCount = pedidosDaUnidade.filter((p) => p.status === 'CONCLUIDO').length;

  container.innerHTML = `
    <div class="space-y-6">
      <!-- Cabeçalho e Ação Principal -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 text-xs font-semibold text-brand-900 bg-brand-100 px-2.5 py-1 rounded-full mb-1.5">
            <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
            <span>${isSupervisor ? `Unidade: ${escapeHtml(user.unidade)}` : 'Visão Multi-Unidades (Supervisão)'}</span>
          </div>
          <h2 class="text-xl font-bold text-gray-900">Solicitação &amp; Entrega nas Unidades</h2>
          <p class="text-sm text-gray-600">Crie pedidos de fardamento por empresa/turma e faça a baixa individual ao jovem aprendiz.</p>
        </div>

        <button type="button" id="btn-toggle-nova-solicitacao"
          class="btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm shrink-0">
          <i data-lucide="${viewState.formOpen ? 'chevron-up' : 'plus-circle'}" class="w-4 h-4"></i>
          <span>${viewState.formOpen ? 'Ocultar Formulário' : 'Nova Solicitação de Fardamento'}</span>
        </button>
      </div>

      <!-- KPIs Rápidos da Unidade -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Pedidos da Unidade</p>
          <p class="text-2xl font-bold text-gray-900 mt-1">${pedidosDaUnidade.length}</p>
          <p class="text-xs text-gray-500 mt-1">${totalPecasUnidade} peças solicitadas</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Em Trânsito (Receber)</p>
          <p class="text-2xl font-bold ${emTransito.length ? 'text-amber-700' : 'text-gray-900'} mt-1">${emTransito.length}</p>
          <p class="text-xs text-gray-500 mt-1">Aguardando conferência</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Prontos p/ Entregar</p>
          <p class="text-2xl font-bold ${paraEntregar.length ? 'text-teal-700' : 'text-gray-900'} mt-1">${paraEntregar.length}</p>
          <p class="text-xs text-gray-500 mt-1">Checklist individual</p>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-4">
          <p class="text-xs font-medium text-gray-500">Concluídos</p>
          <p class="text-2xl font-bold text-brand-900 mt-1">${concluidosCount}</p>
          <p class="text-xs text-gray-500 mt-1">100% entregues aos jovens</p>
        </div>
      </div>

      <!-- Alertas de Ação Imediata (EM_TRANSITO / RECEBIDO_UNIDADE) -->
      ${renderAlertasUnidade(emTransito, paraEntregar)}

      <!-- Formulário de Nova Solicitação -->
      ${viewState.formOpen ? renderNovaSolicitacaoCard(user, state.unidades) : ''}

      <!-- Filtros e Lista de Acompanhamento -->
      <div class="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row md:items-center gap-3">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" id="sup-search-input" value="${escapeHtml(viewState.busca)}"
              placeholder="Buscar por código, empresa, CNPJ, turma ou nome do jovem..."
              class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            ${
              !isSupervisor
                ? `<select id="sup-unit-filter" class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
                    <option value="TODAS" ${viewState.unidadeFiltro === 'TODAS' ? 'selected' : ''}>Todas as Unidades</option>
                    ${state.unidades
                      .map(
                        (u) =>
                          `<option value="${escapeHtml(u)}" ${viewState.unidadeFiltro === u ? 'selected' : ''}>${escapeHtml(u)}</option>`
                      )
                      .join('')}
                  </select>`
                : ''
            }
            <select id="sup-status-filter" class="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
              <option value="TODOS" ${viewState.statusFiltro === 'TODOS' ? 'selected' : ''}>Todos os Status</option>
              ${STATUS_LIST.map(
                (st) =>
                  `<option value="${st}" ${viewState.statusFiltro === st ? 'selected' : ''}>${escapeHtml(STATUS_CONFIG[st].label)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="p-4">
          ${
            pedidosFiltrados.length === 0
              ? `<div class="text-center py-12">
                  <div class="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                    <i data-lucide="inbox" class="w-6 h-6"></i>
                  </div>
                  <p class="text-sm font-semibold text-gray-700">Nenhum pedido encontrado</p>
                  <p class="text-xs text-gray-500 mt-1">Ajuste os filtros ou clique em "Nova Solicitação de Fardamento".</p>
                </div>`
              : `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  ${pedidosFiltrados.map((ped) => renderPedidoCard(ped)).join('')}
                </div>`
          }
        </div>
      </div>
    </div>
  `;

  refreshIcons(container);
  bindSupervisaoEvents(container, { user, state, onOpenRaioX });
}

function renderAlertasUnidade(emTransito, paraEntregar) {
  if (emTransito.length === 0 && paraEntregar.length === 0) return '';

  return `
    <div class="space-y-3">
      ${emTransito
        .map(
          (ped) => `
        <div class="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <i data-lucide="truck" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">CHEGANDO NA UNIDADE</span>
                <span class="text-sm font-bold text-gray-900">${escapeHtml(ped.codigo)} • ${escapeHtml(ped.empresaNome)}</span>
              </div>
              <p class="text-xs text-gray-700 mt-1">
                Turma <strong>${escapeHtml(ped.turma)}</strong> • ${ped.totalPecas} peças (${(ped.itens || []).length} jovens) • Enviado em ${formatDateTime(ped.patrimonio?.dataEnvioUnidade)}
              </p>
            </div>
          </div>
          <button type="button" data-action="confirmar-recebimento" data-pedido-id="${escapeHtml(ped.id)}"
            class="btn-primary px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0">
            <i data-lucide="package-check" class="w-4 h-4"></i>
            <span>Confirmar Recebimento na Unidade</span>
          </button>
        </div>
      `
        )
        .join('')}

      ${paraEntregar
        .map((ped) => {
          const itens = ped.itens || [];
          const entregues = itens.filter((i) => i.entregueAoJovem).length;
          return `
        <div class="rounded-xl border border-teal-300 bg-teal-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
              <i data-lucide="clipboard-check" class="w-5 h-5"></i>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-bold px-2 py-0.5 rounded bg-teal-200 text-teal-900">AGUARDANDO BAIXA AO JOVEM</span>
                <span class="text-sm font-bold text-gray-900">${escapeHtml(ped.codigo)} • ${escapeHtml(ped.empresaNome)}</span>
              </div>
              <p class="text-xs text-gray-700 mt-1">
                Turma <strong>${escapeHtml(ped.turma)}</strong> • Progresso: <strong>${entregues}/${itens.length}</strong> jovens receberam as fardas.
              </p>
            </div>
          </div>
          <button type="button" data-action="abrir-checklist" data-pedido-id="${escapeHtml(ped.id)}"
            class="px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0">
            <i data-lucide="check-square" class="w-4 h-4"></i>
            <span>Checklist de Entrega Individual</span>
          </button>
        </div>
      `;
        })
        .join('')}
    </div>
  `;
}

function renderNovaSolicitacaoCard(user, unidades) {
  const isSupervisor = user.role === 'supervisao';
  const grade = calcularGradeItens(viewState.draftItens);
  const totalPecas = viewState.draftItens.reduce((acc, it) => acc + (Number(it.quantidade) || 0), 0);

  return `
    <div class="bg-white rounded-2xl border-2 border-brand-900/20 shadow-sm overflow-hidden">
      <div class="px-5 py-4 bg-brand-50 border-b border-brand-100 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-brand-900 text-white flex items-center justify-center">
            <i data-lucide="file-plus-2" class="w-4 h-4"></i>
          </div>
          <div>
            <h3 class="text-base font-bold text-gray-900">Nova Solicitação de Fardamento</h3>
            <p class="text-xs text-gray-600">Consulte o CNPJ pela BrasilAPI e adicione os jovens aprendizes da turma.</p>
          </div>
        </div>
      </div>

      <form id="form-novo-pedido" class="p-5 space-y-6">
        <!-- Dados da Empresa e Turma -->
        <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div class="md:col-span-4">
            <label for="ped-cnpj" class="block text-xs font-semibold text-gray-700 mb-1">CNPJ da Empresa Parceira *</label>
            <div class="flex gap-2">
              <input id="ped-cnpj" type="text" inputmode="numeric" maxlength="18"
                value="${escapeHtml(viewState.draftForm.cnpj)}"
                placeholder="00.000.000/0000-00"
                class="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg" />
              <button type="button" id="btn-buscar-cnpj"
                class="px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0">
                <i data-lucide="search" class="w-3.5 h-3.5"></i>
                <span>Buscar CNPJ</span>
              </button>
            </div>
            <p id="cnpj-api-status" class="text-[11px] text-gray-500 mt-1">Consulta automática via BrasilAPI</p>
          </div>

          <div class="md:col-span-4">
            <label for="ped-empresa" class="block text-xs font-semibold text-gray-700 mb-1">Razão Social / Nome Fantasia *</label>
            <input id="ped-empresa" type="text" required
              value="${escapeHtml(viewState.draftForm.empresaNome)}"
              placeholder="Nome da empresa parceira"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
          </div>

          <div class="md:col-span-2">
            <label for="ped-unidade" class="block text-xs font-semibold text-gray-700 mb-1">Unidade *</label>
            <select id="ped-unidade" ${isSupervisor ? 'disabled' : ''}
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg ${isSupervisor ? 'bg-gray-100 text-gray-700 cursor-not-allowed' : 'bg-white'}">
              ${unidades
                .map((u) => {
                  const selected = isSupervisor ? u === user.unidade : u === viewState.draftForm.unidade;
                  return `<option value="${escapeHtml(u)}" ${selected ? 'selected' : ''}>${escapeHtml(u)}</option>`;
                })
                .join('')}
            </select>
          </div>

          <div class="md:col-span-2">
            <label for="ped-turma" class="block text-xs font-semibold text-gray-700 mb-1">Turma *</label>
            <input id="ped-turma" type="text" required
              value="${escapeHtml(viewState.draftForm.turma)}"
              placeholder="Ex: ADM-2026.1"
              class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg" />
          </div>
        </div>

        <!-- Adição Dinâmica de Jovens -->
        <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h4 class="text-sm font-bold text-gray-900">Jovens Aprendizes do Pedido</h4>
              <p class="text-xs text-gray-600">Adicione cada jovem com seu respectivo tamanho e quantidade de fardas.</p>
            </div>
            <div class="text-xs font-semibold text-brand-900 bg-brand-100 px-3 py-1 rounded-full self-start sm:self-auto">
              ${viewState.draftItens.length} jovens • ${totalPecas} peças
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
            <div class="sm:col-span-6">
              <label for="item-jovem-nome" class="block text-xs font-medium text-gray-700 mb-1">Nome Completo do Jovem</label>
              <input id="item-jovem-nome" type="text" placeholder="Ex: Maria Eduarda Santos"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" />
            </div>
            <div class="sm:col-span-2">
              <label for="item-tamanho" class="block text-xs font-medium text-gray-700 mb-1">Tamanho</label>
              <select id="item-tamanho" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white">
                ${TAMANHOS.map((t) => `<option value="${t}" ${t === 'M' ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="sm:col-span-2">
              <label for="item-quantidade" class="block text-xs font-medium text-gray-700 mb-1">Qtd</label>
              <input id="item-quantidade" type="number" min="1" max="20" value="2"
                class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white" />
            </div>
            <div class="sm:col-span-2">
              <button type="button" id="btn-add-jovem-item"
                class="w-full px-3 py-2 rounded-lg bg-brand-700 hover:bg-brand-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                <i data-lucide="user-plus" class="w-4 h-4"></i>
                <span>Adicionar</span>
              </button>
            </div>
          </div>

          <!-- Lista de Jovens Adicionados -->
          ${
            viewState.draftItens.length === 0
              ? `<div class="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-center text-xs text-gray-500">
                  Nenhum jovem adicionado ainda. Preencha os campos acima e clique em <strong>Adicionar</strong>.
                </div>`
              : `<div class="space-y-2">
                  <div class="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-60 overflow-y-auto">
                    ${viewState.draftItens
                      .map(
                        (item, idx) => `
                      <div class="px-3 py-2.5 flex items-center justify-between gap-3 text-sm">
                        <div class="min-w-0 flex items-center gap-2.5">
                          <span class="text-xs font-bold text-gray-400 w-5">${idx + 1}.</span>
                          <span class="font-medium text-gray-900 truncate">${escapeHtml(item.jovemNome)}</span>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          <span class="px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-xs font-bold text-gray-800">${escapeHtml(item.tamanho)}</span>
                          <span class="text-xs font-semibold text-gray-700">${item.quantidade} un.</span>
                          <button type="button" data-remove-draft-item="${escapeHtml(item.idItem)}"
                            class="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label="Remover jovem">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                          </button>
                        </div>
                      </div>
                    `
                      )
                      .join('')}
                  </div>
                  <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span class="text-xs font-medium text-gray-600">Resumo da grade:</span>
                    ${renderGradePills(grade)}
                  </div>
                </div>`
          }
        </div>

        <!-- Rodapé do Formulário -->
        <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button type="button" id="btn-cancel-pedido"
            class="px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" id="btn-salvar-pedido"
            class="btn-primary px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2">
            <i data-lucide="send" class="w-4 h-4"></i>
            <span>Enviar para Faturamento (${totalPecas} peças)</span>
          </button>
        </div>
      </form>
    </div>
  `;
}

function renderPedidoCard(ped) {
  const itens = ped.itens || [];
  const entregues = itens.filter((i) => i.entregueAoJovem).length;
  const stepAtual = STATUS_CONFIG[ped.status]?.step || 1;
  const pct = Math.round((stepAtual / 7) * 100);
  const grade = calcularGradeItens(itens);

  return `
    <article class="rounded-xl border border-gray-200 bg-white p-4 hover:border-brand-700/40 transition flex flex-col justify-between gap-4">
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold font-mono text-brand-900 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded">${escapeHtml(ped.codigo || ped.id)}</span>
              <span class="text-xs font-semibold text-gray-600">${escapeHtml(ped.unidade)}</span>
            </div>
            <h3 class="text-sm sm:text-base font-bold text-gray-900 mt-1.5 leading-snug">${escapeHtml(ped.empresaNome)}</h3>
            <p class="text-xs text-gray-500 mt-0.5">
              CNPJ ${escapeHtml(ped.empresaCnpj)} • Turma <strong>${escapeHtml(ped.turma)}</strong>
            </p>
          </div>
          <div class="shrink-0 self-start">${renderStatusBadge(ped.status)}</div>
        </div>

        <!-- Barra de progresso das 7 etapas -->
        <div>
          <div class="flex items-center justify-between text-[11px] text-gray-500 mb-1">
            <span>Etapa ${stepAtual} de 7</span>
            <span>${itens.length} jovens • <strong>${ped.totalPecas} peças</strong></span>
          </div>
          <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full bg-brand-700 rounded-full transition-all" style="width: ${pct}%"></div>
          </div>
        </div>

        <!-- Resumo financeiro/logístico contextual -->
        <div class="text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 space-y-1">
          <div class="flex flex-wrap items-center justify-between gap-1">
            <span>Grade:</span>
            <span class="font-medium text-gray-800">${escapeHtml(formatGradeResumo(grade))}</span>
          </div>
          ${
            ped.financeiro?.numeroBoleto
              ? `<div class="flex flex-wrap items-center justify-between gap-1">
                  <span>Boleto <strong>${escapeHtml(ped.financeiro.numeroBoleto)}</strong>:</span>
                  <span>${
                    ped.financeiro.dataPagamento
                      ? `<span class="text-emerald-700 font-semibold">Pago em ${formatDateTime(ped.financeiro.dataPagamento)}</span>`
                      : `Vence ${formatIsoDateBR(ped.financeiro.dataVencimento)}`
                  }</span>
                </div>`
              : `<div class="text-gray-500">Aguardando emissão de boleto pelo Financeiro</div>`
          }
          ${
            ped.status === 'RECEBIDO_UNIDADE' || ped.status === 'CONCLUIDO'
              ? `<div class="flex items-center justify-between pt-1 border-t border-gray-200">
                  <span>Entregas aos jovens:</span>
                  <span class="font-bold text-brand-900">${entregues}/${itens.length} entregues</span>
                </div>`
              : ''
          }
        </div>
      </div>

      <!-- Ações do Card -->
      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
        <button type="button" data-action="raio-x" data-pedido-id="${escapeHtml(ped.id)}"
          class="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 inline-flex items-center gap-1.5">
          <i data-lucide="history" class="w-3.5 h-3.5"></i>
          <span>Raio-X / Histórico</span>
        </button>

        <div class="flex flex-wrap gap-2">
          ${
            ped.status === 'EM_TRANSITO'
              ? `<button type="button" data-action="confirmar-recebimento" data-pedido-id="${escapeHtml(ped.id)}"
                  class="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
                  <i data-lucide="package-check" class="w-3.5 h-3.5"></i>
                  <span>Confirmar Recebimento</span>
                </button>`
              : ''
          }
          ${
            ped.status === 'RECEBIDO_UNIDADE' || ped.status === 'CONCLUIDO'
              ? `<button type="button" data-action="abrir-checklist" data-pedido-id="${escapeHtml(ped.id)}"
                  class="px-3 py-1.5 rounded-lg ${
                    ped.status === 'CONCLUIDO'
                      ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                      : 'bg-teal-700 text-white hover:bg-teal-800'
                  } text-xs font-semibold inline-flex items-center gap-1.5">
                  <i data-lucide="check-square" class="w-3.5 h-3.5"></i>
                  <span>${ped.status === 'CONCLUIDO' ? 'Ver Entregas' : 'Entregar Fardas'}</span>
                </button>`
              : ''
          }
        </div>
      </div>
    </article>
  `;
}

function bindSupervisaoEvents(container, { user, state, onOpenRaioX }) {
  const rerenderCurrent = () => renderSupervisaoModule(container, { user, state: getState(), onOpenRaioX });

  container.querySelector('#btn-toggle-nova-solicitacao')?.addEventListener('click', () => {
    viewState.formOpen = !viewState.formOpen;
    rerenderCurrent();
  });

  container.querySelector('#btn-cancel-pedido')?.addEventListener('click', () => {
    viewState.formOpen = false;
    rerenderCurrent();
  });

  container.querySelector('#sup-search-input')?.addEventListener('input', (e) => {
    viewState.busca = e.target.value;
    rerenderCurrent();
    const input = container.querySelector('#sup-search-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  container.querySelector('#sup-unit-filter')?.addEventListener('change', (e) => {
    viewState.unidadeFiltro = e.target.value;
    rerenderCurrent();
  });

  container.querySelector('#sup-status-filter')?.addEventListener('change', (e) => {
    viewState.statusFiltro = e.target.value;
    rerenderCurrent();
  });

  // Inputs do formulário de novo pedido (preservam estado ao adicionar jovens)
  const cnpjInput = container.querySelector('#ped-cnpj');
  const empresaInput = container.querySelector('#ped-empresa');
  const unidadeSelect = container.querySelector('#ped-unidade');
  const turmaInput = container.querySelector('#ped-turma');

  cnpjInput?.addEventListener('input', (e) => {
    e.target.value = maskCnpj(e.target.value);
    viewState.draftForm.cnpj = e.target.value;
  });

  empresaInput?.addEventListener('input', (e) => {
    viewState.draftForm.empresaNome = e.target.value;
  });

  unidadeSelect?.addEventListener('change', (e) => {
    viewState.draftForm.unidade = e.target.value;
  });

  turmaInput?.addEventListener('input', (e) => {
    viewState.draftForm.turma = e.target.value;
  });

  // Consulta BrasilAPI
  container.querySelector('#btn-buscar-cnpj')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-buscar-cnpj');
    const statusEl = container.querySelector('#cnpj-api-status');
    const digits = cleanCnpj(cnpjInput?.value || '');

    if (digits.length !== 14) {
      showToast('Digite os 14 dígitos do CNPJ antes de consultar.', 'warning');
      cnpjInput?.focus();
      return;
    }

    try {
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.textContent = 'Consultando Receita Federal via BrasilAPI...';
      const data = await buscarCnpjBrasilApi(digits);
      viewState.draftForm.cnpj = data.cnpjFormatado;
      viewState.draftForm.empresaNome = data.nomeEmpresa;
      if (cnpjInput) cnpjInput.value = data.cnpjFormatado;
      if (empresaInput) empresaInput.value = data.nomeEmpresa;
      if (statusEl) {
        statusEl.textContent = `${data.situacao || 'CNPJ localizado'} ${data.municipio ? `• ${data.municipio}/${data.uf}` : ''}`;
      }
      showToast('Empresa preenchida automaticamente via BrasilAPI!', 'success');
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message;
      showToast(error.message || 'Erro ao buscar CNPJ.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // Adicionar jovem à lista
  const addJovemHandler = () => {
    const nomeEl = container.querySelector('#item-jovem-nome');
    const tamEl = container.querySelector('#item-tamanho');
    const qtdEl = container.querySelector('#item-quantidade');

    const nome = String(nomeEl?.value || '').trim();
    const tamanho = tamEl?.value || 'M';
    const quantidade = Math.max(1, Math.min(20, Number(qtdEl?.value) || 2));

    if (nome.length < 3) {
      showToast('Informe o nome completo do jovem aprendiz.', 'warning');
      nomeEl?.focus();
      return;
    }

    viewState.draftItens.push({
      idItem: generateId(),
      jovemNome: nome,
      tamanho,
      quantidade
    });

    rerenderCurrent();
    container.querySelector('#item-jovem-nome')?.focus();
  };

  container.querySelector('#btn-add-jovem-item')?.addEventListener('click', addJovemHandler);
  container.querySelector('#item-jovem-nome')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addJovemHandler();
    }
  });

  container.querySelectorAll('[data-remove-draft-item]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idItem = btn.getAttribute('data-remove-draft-item');
      viewState.draftItens = viewState.draftItens.filter((it) => it.idItem !== idItem);
      rerenderCurrent();
    });
  });

  // Salvar novo pedido
  container.querySelector('#form-novo-pedido')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const empresaNome = String(viewState.draftForm.empresaNome || empresaInput?.value || '').trim();
    const empresaCnpj = String(viewState.draftForm.cnpj || cnpjInput?.value || '').trim();
    const turma = String(viewState.draftForm.turma || turmaInput?.value || '').trim();
    const unidade = user.role === 'supervisao' ? user.unidade : (unidadeSelect?.value || viewState.draftForm.unidade);

    if (cleanCnpj(empresaCnpj).length !== 14) {
      showToast('Informe um CNPJ válido com 14 dígitos.', 'warning');
      return;
    }
    if (!empresaNome || !turma) {
      showToast('Preencha o nome da empresa e a identificação da turma.', 'warning');
      return;
    }
    if (viewState.draftItens.length === 0) {
      showToast('Adicione pelo menos um jovem aprendiz à lista antes de salvar.', 'warning');
      return;
    }

    const submitBtn = container.querySelector('#btn-salvar-pedido');
    try {
      if (submitBtn) submitBtn.disabled = true;
      const itensToSend = [...viewState.draftItens];
      viewState.draftItens = [];
      viewState.draftForm = {
        cnpj: '',
        empresaNome: '',
        unidade: user.role === 'supervisao' ? user.unidade : (state.unidades[0] || 'Fortaleza'),
        turma: ''
      };
      viewState.formOpen = false;
      const created = await criarPedido({
        unidade,
        empresaNome,
        empresaCnpj,
        turma,
        itens: itensToSend
      });
      showToast(`Pedido ${created.codigo} enviado para o Financeiro!`, 'success');
      rerenderCurrent();
    } catch (error) {
      viewState.formOpen = true;
      showToast(error.message || 'Erro ao salvar solicitação.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Ações nos cards
  container.querySelectorAll('[data-action="raio-x"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pedidoId = btn.getAttribute('data-pedido-id');
      onOpenRaioX(pedidoId);
    });
  });

  container.querySelectorAll('[data-action="confirmar-recebimento"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pedidoId = btn.getAttribute('data-pedido-id');
      const ped = state.pedidos.find((p) => p.id === pedidoId);
      if (!ped) return;

      const ok = await confirmAction({
        title: 'Confirmar Recebimento na Unidade',
        message: `Confirma que as ${ped.totalPecas} peças do pedido ${ped.codigo} (${ped.empresaNome}) chegaram fisicamente na unidade ${ped.unidade}?`,
        confirmLabel: 'Confirmar Recebimento'
      });
      if (!ok) return;

      try {
        await confirmarRecebimentoUnidade(pedidoId);
        showToast(`Recebimento do pedido ${ped.codigo} confirmado! Checklist liberado.`, 'success');
      } catch (error) {
        showToast(error.message || 'Falha ao confirmar recebimento.', 'error');
      }
    });
  });

  container.querySelectorAll('[data-action="abrir-checklist"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pedidoId = btn.getAttribute('data-pedido-id');
      openChecklistModal(pedidoId, state.pedidos);
    });
  });
}

export function openChecklistModal(pedidoId, pedidosList) {
  const ped = pedidosList.find((p) => p.id === pedidoId);
  if (!ped) return;

  viewState.activeChecklistPedidoId = pedidoId;
  let filtroNome = '';

  const renderChecklistContent = (modalEl) => {
    const currentPed = pedidosList.find((p) => p.id === pedidoId) || ped;
    const itens = currentPed.itens || [];
    const entregues = itens.filter((it) => it.entregueAoJovem).length;
    const pct = itens.length ? Math.round((entregues / itens.length) * 100) : 0;

    const visiveis = itens.filter((it) =>
      !filtroNome.trim() || it.jovemNome.toLowerCase().includes(filtroNome.trim().toLowerCase())
    );

    const bodyEl = modalEl.querySelector('#modal-body');
    if (!bodyEl) return;

    bodyEl.innerHTML = `
      <div class="space-y-4">
        <div class="rounded-xl bg-gray-50 border border-gray-200 p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold font-mono text-brand-900">${escapeHtml(currentPed.codigo)}</span>
              ${renderStatusBadge(currentPed.status)}
            </div>
            <p class="text-sm font-bold text-gray-900 mt-1">${escapeHtml(currentPed.empresaNome)}</p>
            <p class="text-xs text-gray-500">Unidade ${escapeHtml(currentPed.unidade)} • Turma ${escapeHtml(currentPed.turma)}</p>
          </div>
          <div class="sm:text-right">
            <p class="text-xs text-gray-500">Entregas Realizadas</p>
            <p class="text-lg font-extrabold text-brand-900">${entregues} / ${itens.length} jovens</p>
          </div>
        </div>

        <div>
          <div class="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full bg-brand-700 rounded-full transition-all" style="width: ${pct}%"></div>
          </div>
        </div>

        <div class="relative">
          <i data-lucide="search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
          <input type="text" id="checklist-search" value="${escapeHtml(filtroNome)}" placeholder="Filtrar jovem pelo nome..."
            class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg" />
        </div>

        <div class="divide-y divide-gray-200 border border-gray-200 rounded-xl overflow-hidden">
          ${visiveis
            .map(
              (item) => `
            <div class="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${item.entregueAoJovem ? 'bg-emerald-50/70' : 'bg-white'}">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-gray-900">${escapeHtml(item.jovemNome)}</p>
                <p class="text-xs text-gray-600 mt-0.5">
                  Tamanho: <strong class="text-gray-900">${escapeHtml(item.tamanho)}</strong> • Quantidade: <strong>${item.quantidade} fardas</strong>
                  ${item.entregueAoJovem && item.dataEntregaJovem ? ` • Entregue em ${formatDateTime(item.dataEntregaJovem)}` : ''}
                </p>
              </div>
              <button type="button"
                data-toggle-entrega="${escapeHtml(item.idItem)}"
                data-next-state="${item.entregueAoJovem ? 'false' : 'true'}"
                class="px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 transition ${
                  item.entregueAoJovem
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                    : 'btn-primary'
                }">
                <i data-lucide="${item.entregueAoJovem ? 'check-circle-2' : 'hand'}" class="w-4 h-4"></i>
                <span>${item.entregueAoJovem ? 'Farda Entregue' : 'Entregar Farda'}</span>
              </button>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;

    refreshIcons(bodyEl);

    const searchInput = bodyEl.querySelector('#checklist-search');
    searchInput?.addEventListener('input', (e) => {
      filtroNome = e.target.value;
      renderChecklistContent(modalEl);
      const refocused = modalEl.querySelector('#checklist-search');
      if (refocused) {
        refocused.focus();
        refocused.setSelectionRange(refocused.value.length, refocused.value.length);
      }
    });

    bodyEl.querySelectorAll('[data-toggle-entrega]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idItem = btn.getAttribute('data-toggle-entrega');
        const nextState = btn.getAttribute('data-next-state') === 'true';
        btn.disabled = true;
        try {
          const updated = await registrarEntregaJovem(pedidoId, idItem, nextState);
          // Atualiza cópia local caso o store ainda esteja propagando
          const targetIdx = pedidosList.findIndex((p) => p.id === pedidoId);
          if (targetIdx >= 0 && updated) {
            pedidosList[targetIdx] = { ...pedidosList[targetIdx], ...updated };
          }
          if (updated?.status === 'CONCLUIDO') {
            showToast('Último jovem marcado! Pedido concluído automaticamente.', 'success');
          } else {
            showToast(nextState ? 'Entrega registrada para o jovem.' : 'Entrega desmarcada.', 'info');
          }
          renderChecklistContent(modalEl);
        } catch (error) {
          showToast(error.message || 'Erro ao atualizar entrega.', 'error');
          btn.disabled = false;
        }
      });
    });
  };

  openModal({
    title: 'Checklist de Entrega Individual ao Jovem',
    subtitle: 'Marque a entrega para cada jovem aprendiz. Ao entregar a todos, o pedido é concluído.',
    size: 'lg',
    bodyHtml: '<div></div>',
    footerHtml: `
      <button type="button" data-modal-close class="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100">
        Fechar
      </button>
    `,
    onClose: () => {
      viewState.activeChecklistPedidoId = null;
    },
    onRender: (modalEl) => {
      renderChecklistContent(modalEl);
    }
  });
}
