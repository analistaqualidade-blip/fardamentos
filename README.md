# Sistema de Gestão de Fardamentos — Jovens Aprendizes

Aplicação web estática (GitHub Pages / PWA-ready), responsiva (mobile-first) e em tempo real para gerenciar o fluxo completo ponta a ponta de **solicitação, faturamento, fabricação, expedição e entrega individual de fardamentos** para jovens aprendizes em instituições de ensino/aprendizagem com múltiplas unidades (Fortaleza, Pacajus, Maracanaú, Caucaia, Eusébio, Sobral e polos adicionais).

---

## Sumário

- [Visão Geral do Fluxo (7 Status)](#visão-geral-do-fluxo-7-status)
- [Stack & Arquitetura de Arquivos](#stack--arquitetura-de-arquivos)
- [Módulos por Perfil de Acesso](#módulos-por-perfil-de-acesso)
- [Modo Demonstração (Teste Imediato sem Firebase)](#modo-demonstração-teste-imediato-sem-firebase)
- [Configuração Completa do Firebase (Passo a Passo)](#configuração-completa-do-firebase-passo-a-passo)
- [Regras de Segurança do Firestore (`firestore.rules`)](#regras-de-segurança-do-firestore-firestorerules)
- [Criando o Primeiro Administrador e Dados Iniciais (Seed)](#criando-o-primeiro-administrador-e-dados-iniciais-seed)
- [Publicação no GitHub Pages](#publicação-no-github-pages)

---

## Visão Geral do Fluxo (7 Status)

1. **`AGUARDANDO_FATURAMENTO`** — Supervisão da unidade solicita as fardas (com busca automática do CNPJ via BrasilAPI) e informa turma + lista nominal de jovens e tamanhos (`PP`, `P`, `M`, `G`, `GG`, `XG`).
2. **`AGUARDANDO_PAGAMENTO`** — Financeiro registra o número do boleto e a data de vencimento; o sistema calcula automaticamente badges de vencimento (**No Prazo**, **Vence Hoje / Em breve**, **Vencido há X dias**).
3. **`PAGO`** — Financeiro confirma a liquidação do boleto; o pedido entra instantaneamente na fila de produção do Patrimônio.
4. **`EM_FABRICACAO`** — Patrimônio seleciona pedidos pagos no Consolidador Inteligente de grade e gera uma Ordem de Fabricação (`lotes_fabricacao`).
5. **`EM_TRANSITO`** — Patrimônio recebe o lote da fábrica, visualiza o **Mapa de Separação por Unidade**, imprime o **Romaneio A4** (`window.print()`) e confirma o despacho.
6. **`RECEBIDO_UNIDADE`** — Supervisão da unidade de destino confirma o recebimento físico do lote/pedido.
7. **`CONCLUIDO`** — Supervisão marca a entrega individual no **Checklist de Entrega ao Jovem**; quando 100% dos jovens do pedido recebem a farda, o status muda automaticamente para `CONCLUIDO`.

---

## Stack & Arquitetura de Arquivos

- **Frontend:** HTML5 semântico, Tailwind CSS (CDN), CSS3 customizado (`@media print` para romaneio), Lucide Icons e JavaScript Vanilla (ES6+ Modules).
- **Backend / BaaS:** Firebase SDK v10.14.1 Modular via CDN (Firebase Authentication + Cloud Firestore com listeners `onSnapshot`).
- **PWA:** `manifest.json` + `sw.js` com caminhos relativos compatíveis com GitHub Pages.
- **API Pública:** [BrasilAPI CNPJ](https://brasilapi.com.br/docs#tag/CNPJ) (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`).

```text
Fardamentos/
├── index.html                 # Shell principal, tela de login, modais e romaneio
├── manifest.json              # Manifesto PWA
├── sw.js                      # Service Worker (cache do shell estático)
├── firestore.rules            # Regras de segurança do Cloud Firestore
├── README.md                  # Documentação e guia de implantação
├── assets/
│   └── icon.svg               # Ícone institucional PWA
├── css/
│   └── styles.css             # Tema Verde Escuro/Cinza e layout de impressão A4
└── js/
    ├── app.js                 # Roteador adaptativo, sidebar, Raio-X do pedido
    ├── auth.js                # Sessão Firebase Auth, verificação de perfil e Modo Demo
    ├── firebase-config.js     # Credenciais e inicialização modular do Firebase v10
    ├── store.js               # Estado central, listeners onSnapshot e operações em lote
    ├── utils.js               # Máscaras, BrasilAPI, datas locais, grades, modais e toasts
    └── modules/
        ├── supervisao.js      # Solicitação, acompanhamento e checklist mobile
        ├── financeiro.js      # Faturamento, cobranças com alertas e histórico
        ├── patrimonio.js      # Consolidador de grade, lotes, mapa e romaneio
        └── admin.js           # KPIs, SLA, gráficos, equipe/unidades, auditoria e seed
```

---

## Módulos por Perfil de Acesso

| Perfil (`role`) | Escopo de Unidade | Funcionalidades |
| :--- | :--- | :--- |
| `supervisao` | Restrito à sua `unidade` | Criar pedidos com BrasilAPI, acompanhar pedidos da unidade, confirmar recebimento (`EM_TRANSITO` → `RECEBIDO_UNIDADE`), baixar entregas individuais aos jovens. |
| `financeiro` | Global (`Todas`) | Registrar boletos e vencimentos, monitorar cobranças vencidas/a vencer, confirmar pagamentos (`PAGO`) e consultar histórico por período. |
| `patrimonio` | Global (`Todas`) | Consolidar pedidos pagos por grade de tamanhos, gerar ordens de fabricação (`lotes_fabricacao`), gerar mapa de separação por unidade, imprimir romaneio e despachar. |
| `admin` | Global (`Todas`) | Acesso completo ao Dashboard Executivo, SLA médio entre etapas, trilha de auditoria consolidada, alternância entre todos os módulos, gestão de equipe/unidades e Seed inicial. |

---

## Modo Demonstração (Teste Imediato sem Firebase)

Se você abrir a aplicação antes de configurar o `js/firebase-config.js` (ou quiser demonstrar o sistema offline/localmente), a tela inicial oferece o painel **Modo Demonstração (Sem Firebase)** com 5 perfis prontos (Administrador, Supervisão Fortaleza, Supervisão Pacajus, Financeiro e Patrimônio).

Os dados ficam salvos no `localStorage` do navegador com o mesmo schema do Firestore, permitindo testar toda a jornada ponta a ponta e alternar de perfil em tempo real pelo seletor no topo da tela.

---

## Configuração Completa do Firebase (Passo a Passo)

### 1. Criar Projeto no Firebase
1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Clique em **Adicionar projeto** (ou *Create a project*), informe um nome (ex: `gestao-fardamentos`) e conclua a criação.

### 2. Ativar o Authentication (E-mail e Senha)
1. No menu lateral do projeto, clique em **Criação** (Build) → **Authentication**.
2. Clique em **Vamos começar** (Get started).
3. Na aba **Sign-in method** (Método de login), selecione **E-mail/senha**.
4. Ative a primeira chave (**E-mail/senha**) e clique em **Salvar**.

### 3. Criar o Banco Cloud Firestore
1. No menu lateral, clique em **Criação** (Build) → **Firestore Database**.
2. Clique em **Criar banco de dados**.
3. Escolha a localização mais próxima (ex: `southamerica-east1` — São Paulo).
4. Inicie em **Modo de produção** e clique em **Criar**.

> **Observação sobre Índices:** As queries deste sistema foram projetadas para não dependerem de índices compostos manuais (a ordenação temporal é feita no cliente após o `onSnapshot`).

### 4. Registrar o App Web e Configurar `js/firebase-config.js`
1. No menu lateral, clique no ícone de engrenagem ao lado de **Visão geral do projeto** → **Configurações do projeto**.
2. Em **Seus aplicativos**, clique no ícone Web (`</>`).
3. Dê um apelido (ex: `Fardamentos Web`) — não é necessário marcar Firebase Hosting caso vá hospedar no GitHub Pages — e clique em **Registrar app**.
4. Copie o objeto `firebaseConfig` exibido e cole em [`js/firebase-config.js`](js/firebase-config.js) substituindo os placeholders:

```javascript
export const firebaseConfig = {
  apiKey: 'SUA_API_KEY_REAL',
  authDomain: 'seu-projeto.firebaseapp.com',
  projectId: 'seu-projeto',
  storageBucket: 'seu-projeto.appspot.com',
  messagingSenderId: '123456789000',
  appId: '1:123456789000:web:abcdef123456'
};
```

---

## Regras de Segurança do Firestore (`firestore.rules`)

No Firebase Console, acesse **Firestore Database → Regras (Rules)**, substitua o conteúdo padrão pelo conteúdo de [`firestore.rules`](firestore.rules) abaixo e clique em **Publicar**:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ===============================================================
    // Helper Functions
    // ===============================================================

    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    function isDocOwner() {
      return isAuthenticated() && request.auth.uid == resource.data.uid;
    }

    function uidUnchanged() {
      return !('uid' in request.resource.data) ||
        request.resource.data.uid == request.auth.uid;
    }

    function uidNotModified() {
      return !('uid' in resource.data) ||
        request.resource.data.uid == resource.data.uid;
    }

    function hasRequiredFields(fields) {
      return request.resource.data.keys().hasAll(fields);
    }

    function hasOnlyAllowedFields(fields) {
      return request.resource.data.keys().hasOnly(fields);
    }

    function areImmutableFieldsUnchanged(fields) {
      return !request.resource.data.diff(resource.data).affectedKeys().hasAny(fields);
    }

    function validStringLength(field, minLen, maxLen) {
      return request.resource.data[field] is string &&
        request.resource.data[field].size() >= minLen &&
        request.resource.data[field].size() <= maxLen;
    }

    function isValidEmail(email) {
      return email is string &&
        email.size() >= 3 &&
        email.size() <= 150 &&
        email.matches('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$');
    }

    function isPositive(field) {
      return request.resource.data[field] is number && request.resource.data[field] > 0;
    }

    function isValidList(list, maxSize) {
      return list is list && list.size() <= maxSize;
    }

    function isValidMap(mapData, allowedKeys) {
      return mapData is map && mapData.keys().hasOnly(allowedKeys);
    }

    // ===============================================================
    // Auth & Role Lookup Helpers
    // ===============================================================

    function userPath() {
      return /databases/$(database)/documents/users/$(request.auth.uid);
    }

    function userDocExists() {
      return exists(userPath());
    }

    function getUserData() {
      return get(userPath()).data;
    }

    function isActiveUser() {
      return isAuthenticated() &&
        userDocExists() &&
        'ativo' in getUserData() &&
        getUserData().ativo == true;
    }

    function hasRole(role) {
      return isActiveUser() &&
        'role' in getUserData() &&
        getUserData().role == role;
    }

    function isAdmin() {
      return isAuthenticated() && (
        (
          userDocExists() &&
          'ativo' in getUserData() &&
          getUserData().ativo == true &&
          'role' in getUserData() &&
          getUserData().role == 'admin'
        ) ||
        (
          'role' in request.auth.token &&
          request.auth.token.role == 'admin' &&
          (!userDocExists() || ('ativo' in getUserData() && getUserData().ativo == true))
        )
      );
    }

    // ===============================================================
    // Domain Validators
    // ===============================================================

    function isValidUser(data, userId) {
      return data is map &&
        data.keys().hasOnly(['uid', 'nome', 'email', 'role', 'unidade', 'ativo']) &&
        data.keys().hasAll(['uid', 'nome', 'email', 'role', 'unidade', 'ativo']) &&
        data.uid is string && data.uid == userId && data.uid.size() >= 1 && data.uid.size() <= 128 &&
        data.nome is string && data.nome.size() >= 1 && data.nome.size() <= 100 &&
        isValidEmail(data.email) &&
        data.role in ['supervisao', 'financeiro', 'patrimonio', 'admin'] &&
        data.unidade is string && data.unidade.size() >= 1 && data.unidade.size() <= 80 &&
        data.ativo is bool;
    }

    function isValidUnitName(val) {
      return val is string && val.size() >= 1 && val.size() <= 80;
    }

    function isValidConfigUnidades(data) {
      return data is map &&
        data.keys().hasOnly(['lista']) &&
        data.keys().hasAll(['lista']) &&
        data.lista is list &&
        data.lista.size() >= 1 &&
        data.lista.size() <= 100 &&
        isValidUnitName(data.lista[0]) &&
        (data.lista.size() < 2 || isValidUnitName(data.lista[1])) &&
        (data.lista.size() < 3 || isValidUnitName(data.lista[2])) &&
        (data.lista.size() < 4 || isValidUnitName(data.lista[3])) &&
        (data.lista.size() < 5 || isValidUnitName(data.lista[4])) &&
        (data.lista.size() < 6 || isValidUnitName(data.lista[5])) &&
        (data.lista.size() < 7 || isValidUnitName(data.lista[6])) &&
        (data.lista.size() < 8 || isValidUnitName(data.lista[7])) &&
        (data.lista.size() < 9 || isValidUnitName(data.lista[8])) &&
        (data.lista.size() < 10 || isValidUnitName(data.lista[9])) &&
        isValidUnitName(data.lista[data.lista.size() - 1]);
    }

    function isValidPedidoItem(item) {
      return item is map &&
        item.keys().hasOnly(['idItem', 'jovemNome', 'tamanho', 'quantidade', 'entregueAoJovem', 'dataEntregaJovem']) &&
        item.keys().hasAll(['idItem', 'jovemNome', 'tamanho', 'quantidade', 'entregueAoJovem', 'dataEntregaJovem']) &&
        item.idItem is string && item.idItem.size() >= 1 && item.idItem.size() <= 80 &&
        item.jovemNome is string && item.jovemNome.size() >= 1 && item.jovemNome.size() <= 120 &&
        item.tamanho in ['PP', 'P', 'M', 'G', 'GG', 'XG'] &&
        item.quantidade is number && item.quantidade > 0 && item.quantidade <= 50 &&
        item.entregueAoJovem is bool &&
        (item.dataEntregaJovem == null || item.dataEntregaJovem is timestamp);
    }

    function isValidPedidoItensList(itens) {
      return itens is list &&
        itens.size() >= 1 &&
        itens.size() <= 200 &&
        isValidPedidoItem(itens[0]) &&
        (itens.size() < 2 || isValidPedidoItem(itens[1])) &&
        (itens.size() < 3 || isValidPedidoItem(itens[2])) &&
        (itens.size() < 4 || isValidPedidoItem(itens[3])) &&
        (itens.size() < 5 || isValidPedidoItem(itens[4])) &&
        isValidPedidoItem(itens[itens.size() - 1]);
    }

    function isValidFinanceiroMap(fin) {
      return fin is map &&
        fin.keys().hasOnly(['numeroBoleto', 'dataEmissaoBoleto', 'dataVencimento', 'dataPagamento', 'registradoPor']) &&
        fin.keys().hasAll(['numeroBoleto', 'dataEmissaoBoleto', 'dataVencimento', 'dataPagamento', 'registradoPor']) &&
        (fin.numeroBoleto == null || (fin.numeroBoleto is string && fin.numeroBoleto.size() >= 1 && fin.numeroBoleto.size() <= 80)) &&
        (fin.dataEmissaoBoleto == null || fin.dataEmissaoBoleto is timestamp) &&
        (fin.dataVencimento == null || (fin.dataVencimento is string && fin.dataVencimento.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))) &&
        (fin.dataPagamento == null || fin.dataPagamento is timestamp) &&
        (fin.registradoPor == null || (fin.registradoPor is string && fin.registradoPor.size() >= 1 && fin.registradoPor.size() <= 100));
    }

    function isValidPatrimonioMap(pat) {
      return pat is map &&
        pat.keys().hasOnly(['loteFabricacaoId', 'dataEnvioUnidade', 'dataRecebimentoUnidade']) &&
        pat.keys().hasAll(['loteFabricacaoId', 'dataEnvioUnidade', 'dataRecebimentoUnidade']) &&
        (pat.loteFabricacaoId == null || (pat.loteFabricacaoId is string && pat.loteFabricacaoId.size() >= 1 && pat.loteFabricacaoId.size() <= 128)) &&
        (pat.dataEnvioUnidade == null || pat.dataEnvioUnidade is timestamp) &&
        (pat.dataRecebimentoUnidade == null || pat.dataRecebimentoUnidade is timestamp);
    }

    function isValidLogEntry(entry) {
      return entry is map &&
        entry.keys().hasOnly(['data', 'usuario', 'setor', 'acao']) &&
        entry.keys().hasAll(['data', 'usuario', 'setor', 'acao']) &&
        entry.data is timestamp &&
        entry.usuario is string && entry.usuario.size() >= 1 && entry.usuario.size() <= 100 &&
        entry.setor is string && entry.setor.size() >= 1 && entry.setor.size() <= 60 &&
        entry.acao is string && entry.acao.size() >= 1 && entry.acao.size() <= 300;
    }

    function isValidHistoricoLogsList(logs) {
      return logs is list &&
        logs.size() >= 1 &&
        logs.size() <= 500 &&
        isValidLogEntry(logs[0]) &&
        (logs.size() < 2 || isValidLogEntry(logs[1])) &&
        (logs.size() < 3 || isValidLogEntry(logs[2])) &&
        (logs.size() < 4 || isValidLogEntry(logs[3])) &&
        (logs.size() < 5 || isValidLogEntry(logs[4])) &&
        isValidLogEntry(logs[logs.size() - 1]);
    }

    function isValidPedido(data) {
      return data is map &&
        data.keys().hasOnly([
          'codigo', 'unidade', 'empresaNome', 'empresaCnpj', 'turma', 'status',
          'itens', 'totalPecas', 'financeiro', 'patrimonio', 'historicoLogs',
          'criadoPor', 'criadoPorUid', 'criadoEm'
        ]) &&
        data.keys().hasAll([
          'codigo', 'unidade', 'empresaNome', 'empresaCnpj', 'turma', 'status',
          'itens', 'totalPecas', 'financeiro', 'patrimonio', 'historicoLogs',
          'criadoPor', 'criadoPorUid', 'criadoEm'
        ]) &&
        data.codigo is string && data.codigo.size() >= 1 && data.codigo.size() <= 40 &&
        data.unidade is string && data.unidade.size() >= 1 && data.unidade.size() <= 80 &&
        data.empresaNome is string && data.empresaNome.size() >= 1 && data.empresaNome.size() <= 180 &&
        data.empresaCnpj is string && data.empresaCnpj.size() >= 14 && data.empresaCnpj.size() <= 20 &&
        data.turma is string && data.turma.size() >= 1 && data.turma.size() <= 80 &&
        data.status in [
          'AGUARDANDO_FATURAMENTO',
          'AGUARDANDO_PAGAMENTO',
          'PAGO',
          'EM_FABRICACAO',
          'EM_TRANSITO',
          'RECEBIDO_UNIDADE',
          'CONCLUIDO'
        ] &&
        isValidPedidoItensList(data.itens) &&
        data.totalPecas is number && data.totalPecas > 0 && data.totalPecas <= 10000 &&
        isValidFinanceiroMap(data.financeiro) &&
        isValidPatrimonioMap(data.patrimonio) &&
        isValidHistoricoLogsList(data.historicoLogs) &&
        data.criadoPor is string && data.criadoPor.size() >= 1 && data.criadoPor.size() <= 100 &&
        data.criadoPorUid is string && data.criadoPorUid.size() >= 1 && data.criadoPorUid.size() <= 128 &&
        data.criadoEm is timestamp;
    }

    function isValidPedidoInitialState(data) {
      return data.status == 'AGUARDANDO_FATURAMENTO' &&
        data.financeiro.numeroBoleto == null &&
        data.financeiro.dataEmissaoBoleto == null &&
        data.financeiro.dataVencimento == null &&
        data.financeiro.dataPagamento == null &&
        data.financeiro.registradoPor == null &&
        data.patrimonio.loteFabricacaoId == null &&
        data.patrimonio.dataEnvioUnidade == null &&
        data.patrimonio.dataRecebimentoUnidade == null &&
        data.historicoLogs.size() == 1 &&
        data.itens[0].entregueAoJovem == false &&
        data.itens[0].dataEntregaJovem == null;
    }

    function isValidPedidoLogsAppend(oldLogs, newLogs) {
      return oldLogs is list &&
        oldLogs.size() >= 1 &&
        newLogs is list &&
        newLogs.size() >= oldLogs.size() + 1 &&
        newLogs.size() <= oldLogs.size() + 2 &&
        newLogs[0] == oldLogs[0] &&
        newLogs[oldLogs.size() - 1] == oldLogs[oldLogs.size() - 1] &&
        isValidLogEntry(newLogs[newLogs.size() - 1]) &&
        (newLogs.size() == oldLogs.size() + 1 || isValidLogEntry(newLogs[newLogs.size() - 2]));
    }

    function isValidItemMetadataUnchanged(prevItem, nextItem) {
      return nextItem.idItem == prevItem.idItem &&
        nextItem.jovemNome == prevItem.jovemNome &&
        nextItem.tamanho == prevItem.tamanho &&
        nextItem.quantidade == prevItem.quantidade;
    }

    function isValidItensDeliveryUpdate(prevItens, nextItens) {
      return nextItens.size() == prevItens.size() &&
        isValidItemMetadataUnchanged(prevItens[0], nextItens[0]) &&
        (prevItens.size() < 2 || isValidItemMetadataUnchanged(prevItens[1], nextItens[1])) &&
        (prevItens.size() < 3 || isValidItemMetadataUnchanged(prevItens[2], nextItens[2])) &&
        (prevItens.size() < 4 || isValidItemMetadataUnchanged(prevItens[3], nextItens[3])) &&
        (prevItens.size() < 5 || isValidItemMetadataUnchanged(prevItens[4], nextItens[4])) &&
        isValidItemMetadataUnchanged(prevItens[prevItens.size() - 1], nextItens[nextItens.size() - 1]);
    }

    function isValidFinanceiroTransition() {
      let prev = resource.data;
      let next = request.resource.data;
      return (hasRole('financeiro') || isAdmin()) &&
        next.diff(prev).affectedKeys().hasOnly(['status', 'financeiro', 'historicoLogs']) &&
        (
          (
            prev.status == 'AGUARDANDO_FATURAMENTO' &&
            next.status == 'AGUARDANDO_PAGAMENTO' &&
            next.financeiro.numeroBoleto is string &&
            next.financeiro.numeroBoleto.size() >= 1 &&
            next.financeiro.numeroBoleto.size() <= 80 &&
            next.financeiro.dataEmissaoBoleto == request.time &&
            next.financeiro.dataVencimento is string &&
            next.financeiro.dataVencimento.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$') &&
            next.financeiro.dataPagamento == null &&
            next.financeiro.registradoPor is string &&
            next.financeiro.registradoPor.size() >= 1 &&
            next.financeiro.registradoPor.size() <= 100
          ) ||
          (
            prev.status == 'AGUARDANDO_PAGAMENTO' &&
            next.status == 'PAGO' &&
            next.financeiro.dataPagamento == request.time &&
            next.financeiro.numeroBoleto == prev.financeiro.numeroBoleto &&
            next.financeiro.dataEmissaoBoleto == prev.financeiro.dataEmissaoBoleto &&
            next.financeiro.dataVencimento == prev.financeiro.dataVencimento &&
            next.financeiro.registradoPor == prev.financeiro.registradoPor
          )
        );
    }

    function isValidPatrimonioTransition() {
      let prev = resource.data;
      let next = request.resource.data;
      return (hasRole('patrimonio') || isAdmin()) &&
        next.diff(prev).affectedKeys().hasOnly(['status', 'patrimonio', 'historicoLogs']) &&
        (
          (
            prev.status == 'PAGO' &&
            next.status == 'EM_FABRICACAO' &&
            next.patrimonio.loteFabricacaoId is string &&
            next.patrimonio.loteFabricacaoId.size() >= 1 &&
            next.patrimonio.loteFabricacaoId.size() <= 128 &&
            next.patrimonio.dataEnvioUnidade == prev.patrimonio.dataEnvioUnidade &&
            next.patrimonio.dataRecebimentoUnidade == prev.patrimonio.dataRecebimentoUnidade
          ) ||
          (
            prev.status == 'EM_FABRICACAO' &&
            next.status == 'EM_TRANSITO' &&
            next.patrimonio.dataEnvioUnidade == request.time &&
            next.patrimonio.loteFabricacaoId == prev.patrimonio.loteFabricacaoId &&
            next.patrimonio.dataRecebimentoUnidade == prev.patrimonio.dataRecebimentoUnidade
          )
        );
    }

    function isValidSupervisaoTransition() {
      let prev = resource.data;
      let next = request.resource.data;
      return (isAdmin() || (hasRole('supervisao') && prev.unidade == getUserData().unidade)) &&
        (
          (
            prev.status == 'EM_TRANSITO' &&
            next.status == 'RECEBIDO_UNIDADE' &&
            next.diff(prev).affectedKeys().hasOnly(['status', 'patrimonio', 'historicoLogs']) &&
            next.patrimonio.dataRecebimentoUnidade == request.time &&
            next.patrimonio.loteFabricacaoId == prev.patrimonio.loteFabricacaoId &&
            next.patrimonio.dataEnvioUnidade == prev.patrimonio.dataEnvioUnidade
          ) ||
          (
            prev.status in ['RECEBIDO_UNIDADE', 'CONCLUIDO'] &&
            next.status in ['RECEBIDO_UNIDADE', 'CONCLUIDO'] &&
            next.diff(prev).affectedKeys().hasOnly(['status', 'itens', 'historicoLogs']) &&
            isValidItensDeliveryUpdate(prev.itens, next.itens)
          )
        );
    }

    function isValidPedidoIdStr(id) {
      return id is string && id.size() >= 1 && id.size() <= 128;
    }

    function isValidPedidosIdsList(ids) {
      return ids is list &&
        ids.size() >= 1 &&
        ids.size() <= 300 &&
        isValidPedidoIdStr(ids[0]) &&
        (ids.size() < 2 || isValidPedidoIdStr(ids[1])) &&
        (ids.size() < 3 || isValidPedidoIdStr(ids[2])) &&
        (ids.size() < 4 || isValidPedidoIdStr(ids[3])) &&
        (ids.size() < 5 || isValidPedidoIdStr(ids[4])) &&
        isValidPedidoIdStr(ids[ids.size() - 1]);
    }

    function isValidGradeValue(val) {
      return val is number && val >= 0 && val <= 100000;
    }

    function isValidGradeConsolidada(grade) {
      return grade is map &&
        grade.keys().hasOnly(['PP', 'P', 'M', 'G', 'GG', 'XG']) &&
        grade.keys().hasAll(['PP', 'P', 'M', 'G', 'GG', 'XG']) &&
        isValidGradeValue(grade.PP) &&
        isValidGradeValue(grade.P) &&
        isValidGradeValue(grade.M) &&
        isValidGradeValue(grade.G) &&
        isValidGradeValue(grade.GG) &&
        isValidGradeValue(grade.XG);
    }

    function isValidLoteFabricacao(data) {
      return data is map &&
        data.keys().hasOnly([
          'codigo', 'dataCriacao', 'status', 'pedidosIds', 'gradeConsolidada',
          'totalGeralPecas', 'observacoesFabricante', 'criadoPor', 'criadoPorUid',
          'dataFinalizacao'
        ]) &&
        data.keys().hasAll([
          'codigo', 'dataCriacao', 'status', 'pedidosIds', 'gradeConsolidada',
          'totalGeralPecas', 'observacoesFabricante', 'criadoPor', 'criadoPorUid',
          'dataFinalizacao'
        ]) &&
        data.codigo is string && data.codigo.size() >= 1 && data.codigo.size() <= 40 &&
        data.dataCriacao is timestamp &&
        (
          (data.status == 'EM_FABRICACAO' && data.dataFinalizacao == null) ||
          (data.status == 'FINALIZADO_FABRICA' && data.dataFinalizacao is timestamp)
        ) &&
        isValidPedidosIdsList(data.pedidosIds) &&
        isValidGradeConsolidada(data.gradeConsolidada) &&
        data.totalGeralPecas is number &&
        data.totalGeralPecas > 0 &&
        data.totalGeralPecas <= 100000 &&
        data.totalGeralPecas == (
          data.gradeConsolidada.PP +
          data.gradeConsolidada.P +
          data.gradeConsolidada.M +
          data.gradeConsolidada.G +
          data.gradeConsolidada.GG +
          data.gradeConsolidada.XG
        ) &&
        data.observacoesFabricante is string &&
        data.observacoesFabricante.size() >= 0 &&
        data.observacoesFabricante.size() <= 1000 &&
        data.criadoPor is string && data.criadoPor.size() >= 1 && data.criadoPor.size() <= 100 &&
        data.criadoPorUid is string && data.criadoPorUid.size() >= 1 && data.criadoPorUid.size() <= 128;
    }

    // ===============================================================
    // Collection Rules
    // ===============================================================

    match /{document=**} {
      allow read, write: if false;
    }

    match /users/{userId} {
      allow read: if isOwner(userId) || isAdmin();
      allow create: if isAdmin() && isValidUser(request.resource.data, userId);
      allow update: if isAdmin() &&
        isValidUser(request.resource.data, userId) &&
        uidNotModified() &&
        (userId != request.auth.uid || (request.resource.data.ativo == true && request.resource.data.role == 'admin'));
      allow delete: if false;
    }

    match /config/unidades {
      allow read: if isActiveUser();
      allow create, update: if isAdmin() && isValidConfigUnidades(request.resource.data);
      allow delete: if false;
    }

    match /pedidos/{pedidoId} {
      allow read: if isAdmin() ||
        hasRole('financeiro') ||
        hasRole('patrimonio') ||
        (hasRole('supervisao') && resource.data.unidade == getUserData().unidade);

      allow create: if isValidPedido(request.resource.data) &&
        request.resource.data.criadoPorUid == request.auth.uid &&
        (
          isAdmin() ||
          (
            hasRole('supervisao') &&
            request.resource.data.unidade == getUserData().unidade &&
            request.resource.data.criadoEm == request.time &&
            isValidPedidoInitialState(request.resource.data)
          )
        );

      allow update: if isActiveUser() &&
        isValidPedido(request.resource.data) &&
        areImmutableFieldsUnchanged([
          'codigo',
          'unidade',
          'empresaNome',
          'empresaCnpj',
          'turma',
          'totalPecas',
          'criadoPor',
          'criadoPorUid',
          'criadoEm'
        ]) &&
        isValidPedidoLogsAppend(resource.data.historicoLogs, request.resource.data.historicoLogs) &&
        (
          isValidFinanceiroTransition() ||
          isValidPatrimonioTransition() ||
          isValidSupervisaoTransition()
        );

      allow delete: if false;
    }

    match /lotes_fabricacao/{loteId} {
      allow read: if hasRole('patrimonio') || isAdmin();

      allow create: if isValidLoteFabricacao(request.resource.data) &&
        request.resource.data.criadoPorUid == request.auth.uid &&
        (
          isAdmin() ||
          (
            hasRole('patrimonio') &&
            request.resource.data.status == 'EM_FABRICACAO' &&
            request.resource.data.dataFinalizacao == null &&
            request.resource.data.dataCriacao == request.time
          )
        );

      allow update: if (hasRole('patrimonio') || isAdmin()) &&
        isValidLoteFabricacao(request.resource.data) &&
        areImmutableFieldsUnchanged([
          'codigo',
          'dataCriacao',
          'pedidosIds',
          'gradeConsolidada',
          'totalGeralPecas',
          'observacoesFabricante',
          'criadoPor',
          'criadoPorUid'
        ]) &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'dataFinalizacao']) &&
        resource.data.status == 'EM_FABRICACAO' &&
        request.resource.data.status == 'FINALIZADO_FABRICA' &&
        request.resource.data.dataFinalizacao == request.time;

      allow delete: if false;
    }
  }
}
```

---

## Criando o Primeiro Administrador e Dados Iniciais (Seed)

1. No Firebase Console, vá em **Authentication → Users** e clique em **Adicionar usuário**.
2. Informe o e-mail e a senha do primeiro Administrador e copie o **UID do usuário** gerado.
3. Vá em **Firestore Database → Dados**, clique em **Iniciar coleção**, digite `users` e avance.
4. No **ID do documento**, cole exatamente o **UID** copiado no passo 2 e crie os seguintes campos:
   - `uid` (`string`): mesmo UID
   - `nome` (`string`): `Administrador Geral`
   - `email` (`string`): mesmo e-mail do Auth
   - `role` (`string`): `admin`
   - `unidade` (`string`): `Todas`
   - `ativo` (`boolean`): `true`
5. Faça login na aplicação com esse e-mail e senha.
6. No módulo **Gestão & Dashboard → Auditoria & Setup/Seed**, clique em **Popular Dados de Teste (Seed)** se quiser carregar pedidos e lotes iniciais de demonstração no Firestore, ou comece a cadastrar sua equipe em **Equipe & Unidades**.

---

## Publicação no GitHub Pages

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta na branch `main`.
2. No GitHub, acesse **Settings → Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**, escolha a branch `main` e a pasta `/ (root)`, e clique em **Save**.
4. **Importante no Firebase:** Após o GitHub Pages gerar sua URL (ex: `https://seu-usuario.github.io`), adicione o domínio `seu-usuario.github.io` em **Firebase Console → Authentication → Settings → Domínios autorizados**.
