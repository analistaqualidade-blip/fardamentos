export const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG'];

export const UNIDADES_PADRAO = [
  'Fortaleza',
  'Pacajus',
  'Maracanaú',
  'Caucaia',
  'Eusébio',
  'Sobral'
];

export const STATUS_LIST = [
  'AGUARDANDO_FATURAMENTO',
  'AGUARDANDO_PAGAMENTO',
  'PAGO',
  'EM_FABRICACAO',
  'EM_TRANSITO',
  'RECEBIDO_UNIDADE',
  'CONCLUIDO'
];

export const STATUS_CONFIG = {
  AGUARDANDO_FATURAMENTO: {
    label: 'Aguardando Faturamento',
    shortLabel: 'Ag. Faturamento',
    icon: 'file-clock',
    step: 1,
    badgeClass: 'status-AGUARDANDO_FATURAMENTO'
  },
  AGUARDANDO_PAGAMENTO: {
    label: 'Aguardando Pagamento',
    shortLabel: 'Ag. Pagamento',
    icon: 'clock-alert',
    step: 2,
    badgeClass: 'status-AGUARDANDO_PAGAMENTO'
  },
  PAGO: {
    label: 'Pago',
    shortLabel: 'Pago',
    icon: 'badge-check',
    step: 3,
    badgeClass: 'status-PAGO'
  },
  EM_FABRICACAO: {
    label: 'Em Fabricação',
    shortLabel: 'Em Fabricação',
    icon: 'factory',
    step: 4,
    badgeClass: 'status-EM_FABRICACAO'
  },
  EM_TRANSITO: {
    label: 'Em Trânsito',
    shortLabel: 'Em Trânsito',
    icon: 'truck',
    step: 5,
    badgeClass: 'status-EM_TRANSITO'
  },
  RECEBIDO_UNIDADE: {
    label: 'Recebido na Unidade',
    shortLabel: 'Recebido Unidade',
    icon: 'package-open',
    step: 6,
    badgeClass: 'status-RECEBIDO_UNIDADE'
  },
  CONCLUIDO: {
    label: 'Concluído',
    shortLabel: 'Concluído',
    icon: 'check-circle-2',
    step: 7,
    badgeClass: 'status-CONCLUIDO'
  }
};

export const ROLES_CONFIG = {
  supervisao: {
    label: 'Supervisão',
    setor: 'Supervisão de Unidade',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200'
  },
  financeiro: {
    label: 'Financeiro',
    setor: 'Financeiro',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200'
  },
  patrimonio: {
    label: 'Patrimônio / Logística',
    setor: 'Patrimônio / Logística',
    badgeClass: 'bg-slate-200 text-slate-800 border-slate-300'
  },
  admin: {
    label: 'Administrador',
    setor: 'Administração / Gestão',
    badgeClass: 'bg-brand-900 text-white border-brand-900'
  }
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

export function cleanCnpj(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 14);
}

export function maskCnpj(value) {
  const digits = cleanCnpj(value);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function isValidCnpj(value) {
  const cnpj = cleanCnpj(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base, weights) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i += 1) {
      sum += Number(base[i]) * weights[i];
    }
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(cnpj, w1);
  const d2 = calcDigit(cnpj, w2);
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

export async function buscarCnpjBrasilApi(cnpjInput) {
  const digits = cleanCnpj(cnpjInput);
  if (digits.length !== 14) {
    throw new Error('Informe os 14 dígitos do CNPJ para consultar.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('CNPJ não encontrado na base da Receita Federal.');
      }
      if (response.status === 429) {
        throw new Error('Muitas consultas seguidas na BrasilAPI. Aguarde alguns segundos.');
      }
      throw new Error(`Falha ao consultar CNPJ (HTTP ${response.status}).`);
    }

    const data = await response.json();
    const nomeFantasia = (data.nome_fantasia || '').trim();
    const razaoSocial = (data.razao_social || '').trim();
    const nomePrincipal = nomeFantasia || razaoSocial;

    if (!nomePrincipal) {
      throw new Error('CNPJ encontrado, porém sem razão social informada.');
    }

    return {
      cnpjFormatado: maskCnpj(digits),
      nomeEmpresa: razaoSocial && nomeFantasia && razaoSocial !== nomeFantasia
        ? `${nomeFantasia} (${razaoSocial})`
        : nomePrincipal,
      razaoSocial,
      nomeFantasia,
      situacao: data.descricao_situacao_cadastral || '',
      municipio: data.municipio || '',
      uf: data.uf || ''
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao consultar a BrasilAPI. Preencha manualmente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6));
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return parseLocalIsoDate(value);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function parseLocalIsoDate(yyyyMmDd) {
  if (!yyyyMmDd || typeof yyyyMmDd !== 'string') return null;
  const parts = yyyyMmDd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function formatDate(value, fallback = '—') {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

export function formatDateTime(value, fallback = 'Agora mesmo') {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatIsoDateBR(yyyyMmDd) {
  const date = parseLocalIsoDate(yyyyMmDd);
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

export function getTodayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIsoDate(baseIso, days) {
  const date = parseLocalIsoDate(baseIso) || new Date();
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getVencimentoInfo(yyyyMmDd) {
  const target = parseLocalIsoDate(yyyyMmDd);
  if (!target) {
    return {
      status: 'indefinido',
      label: 'Sem vencimento',
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-300',
      diasDiff: null
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 86400000;
  const diasDiff = Math.round((target.getTime() - today.getTime()) / msPerDay);

  if (diasDiff < 0) {
    const atraso = Math.abs(diasDiff);
    return {
      status: 'vencido',
      label: `Vencido há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`,
      badgeClass: 'bg-red-100 text-red-800 border-red-300',
      diasDiff
    };
  }

  if (diasDiff === 0) {
    return {
      status: 'vence_hoje',
      label: 'Vence Hoje',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      diasDiff
    };
  }

  if (diasDiff <= 3) {
    return {
      status: 'em_breve',
      label: `Vence em ${diasDiff} ${diasDiff === 1 ? 'dia' : 'dias'}`,
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      diasDiff
    };
  }

  return {
    status: 'no_prazo',
    label: 'No Prazo',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    diasDiff
  };
}

export function diffInHours(startVal, endVal) {
  const start = toDate(startVal);
  const end = toDate(endVal);
  if (!start || !end) return null;
  const diff = (end.getTime() - start.getTime()) / 3600000;
  return diff >= 0 ? diff : null;
}

export function formatDurationHours(hours) {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '—';
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins} min`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1).replace('.', ',')} h`;
  }
  const days = hours / 24;
  return `${days.toFixed(1).replace('.', ',')} d`;
}

export function emptyGrade() {
  return { PP: 0, P: 0, M: 0, G: 0, GG: 0, XG: 0 };
}

export function calcularGradeItens(itens = []) {
  const grade = emptyGrade();
  for (const item of itens) {
    const tam = item?.tamanho;
    const qtd = Number(item?.quantidade) || 0;
    if (Object.prototype.hasOwnProperty.call(grade, tam)) {
      grade[tam] += qtd;
    }
  }
  return grade;
}

export function calcularGradePedidos(pedidos = []) {
  const grade = emptyGrade();
  for (const ped of pedidos) {
    const g = calcularGradeItens(ped.itens || []);
    for (const tam of TAMANHOS) {
      grade[tam] += g[tam];
    }
  }
  return grade;
}

export function sumGrade(grade) {
  return TAMANHOS.reduce((acc, tam) => acc + (Number(grade?.[tam]) || 0), 0);
}

export function formatGradeResumo(grade) {
  const partes = TAMANHOS
    .filter((tam) => (Number(grade?.[tam]) || 0) > 0)
    .map((tam) => `${grade[tam]} ${tam}`);
  return partes.length ? partes.join(' • ') : '0 peças';
}

export function renderGradePills(grade) {
  const items = TAMANHOS
    .filter((tam) => (Number(grade?.[tam]) || 0) > 0)
    .map(
      (tam) =>
        `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-800">${tam}: <span class="text-brand-900">${Number(grade[tam])}</span></span>`
    );
  return items.length
    ? `<div class="flex flex-wrap gap-1.5">${items.join('')}</div>`
    : '<span class="text-xs text-gray-400">Sem itens</span>';
}

export function renderStatusBadge(status) {
  const cfg = STATUS_CONFIG[status] || {
    label: status || 'Desconhecido',
    icon: 'help-circle',
    badgeClass: 'status-AGUARDANDO_FATURAMENTO'
  };
  return `<span class="status-badge ${cfg.badgeClass}">
    <i data-lucide="${cfg.icon}" class="w-3.5 h-3.5 shrink-0"></i>
    <span>${escapeHtml(cfg.label)}</span>
  </span>`;
}

export function getInitials(name) {
  const parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function refreshIcons(root = document) {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root });
  }
}

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const palettes = {
    success: 'bg-brand-900 text-white border-brand-700',
    error: 'bg-red-700 text-white border-red-800',
    warning: 'bg-amber-600 text-white border-amber-700',
    info: 'bg-gray-800 text-white border-gray-900'
  };
  const icons = {
    success: 'check-circle-2',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info'
  };

  const toast = document.createElement('div');
  toast.className = `pointer-events-auto animate-toast-in flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium ${palettes[type] || palettes.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 shrink-0 mt-0.5"></i>
    <span class="flex-1 leading-snug">${escapeHtml(message)}</span>
    <button type="button" class="opacity-75 hover:opacity-100 shrink-0" aria-label="Fechar aviso">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;

  const removeToast = () => {
    toast.remove();
  };

  toast.querySelector('button')?.addEventListener('click', removeToast);
  container.appendChild(toast);
  refreshIcons(toast);

  setTimeout(removeToast, 4500);
}

let activeModalCloseHandler = null;

export function closeModal() {
  const container = document.getElementById('modal-container');
  if (!container) return;
  container.classList.add('hidden');
  container.innerHTML = '';
  if (typeof activeModalCloseHandler === 'function') {
    const cb = activeModalCloseHandler;
    activeModalCloseHandler = null;
    cb();
  }
}

export function openModal({
  title,
  subtitle = '',
  bodyHtml = '',
  footerHtml = '',
  size = 'lg',
  onRender = null,
  onClose = null
}) {
  const container = document.getElementById('modal-container');
  if (!container) return;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl'
  };

  activeModalCloseHandler = onClose;

  container.innerHTML = `
    <div class="min-h-screen px-4 py-6 flex items-center justify-center bg-gray-900/60 backdrop-blur-[1px]" data-modal-backdrop>
      <div class="w-full ${sizes[size] || sizes.lg} bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden animate-modal-in flex flex-col max-h-[90vh]">
        <div class="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-4 shrink-0">
          <div class="min-w-0">
            <h3 class="text-base sm:text-lg font-bold text-gray-900 truncate">${escapeHtml(title)}</h3>
            ${subtitle ? `<p class="text-xs text-gray-600 mt-0.5">${escapeHtml(subtitle)}</p>` : ''}
          </div>
          <button type="button" data-modal-close class="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition shrink-0" aria-label="Fechar modal">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        <div id="modal-body" class="p-5 overflow-y-auto flex-1">${bodyHtml}</div>
        ${footerHtml ? `<div id="modal-footer" class="px-5 py-3.5 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-end gap-2 shrink-0">${footerHtml}</div>` : ''}
      </div>
    </div>
  `;

  container.classList.remove('hidden');
  refreshIcons(container);

  container.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  const backdrop = container.querySelector('[data-modal-backdrop]');
  backdrop?.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  });

  if (typeof onRender === 'function') {
    onRender(container);
  }
}

export function confirmAction({
  title = 'Confirmar ação',
  message = 'Deseja realmente prosseguir?',
  confirmLabel = 'Confirmar',
  confirmVariant = 'primary'
}) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(val);
    };

    const btnClass =
      confirmVariant === 'danger'
        ? 'bg-red-700 hover:bg-red-800 text-white'
        : 'btn-primary';

    openModal({
      title,
      size: 'sm',
      bodyHtml: `<p class="text-sm text-gray-700 leading-relaxed">${escapeHtml(message)}</p>`,
      footerHtml: `
        <button type="button" id="confirm-cancel-btn" class="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-100">
          Cancelar
        </button>
        <button type="button" id="confirm-ok-btn" class="px-4 py-2 rounded-lg text-sm font-semibold ${btnClass}">
          ${escapeHtml(confirmLabel)}
        </button>
      `,
      onClose: () => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      },
      onRender: (modalEl) => {
        modalEl.querySelector('#confirm-cancel-btn')?.addEventListener('click', () => finish(false));
        modalEl.querySelector('#confirm-ok-btn')?.addEventListener('click', () => finish(true));
      }
    });
  });
}
