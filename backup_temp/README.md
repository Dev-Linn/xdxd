# 📊 Google Analytics - Coleta de Dados de Marketing

Sistema para conectar com Google Analytics e coletar dados completos de marketing automaticamente, gerando relatórios em JSON para análises e apresentações.

## 🚀 Funcionalidades

### ✅ **Autenticação OAuth2**
- Login seguro com Google
- Seleção automática de contas e propriedades GA4
- Tokens de acesso renovados automaticamente

### 📈 **Coleta Automática de Dados**
- **Métricas Gerais**: Usuários, sessões, visualizações, conversões, receita
- **Geolocalização**: Top países e cidades
- **Dispositivos**: Mobile, desktop, tablet
- **Fontes de Tráfego**: Google, Facebook, direto, referência
- **Páginas Populares**: Mais visitadas com títulos
- **Evolução Temporal**: Dados diários dos últimos 30 dias

### 📊 **Dashboard Interativo**
- Visualizações em tempo real
- Gráficos de tendências
- Métricas consolidadas
- Interface responsiva

### 💾 **Exportação de Dados**
- JSON completo automaticamente gerado
- Download direto dos relatórios
- Dados estruturados para marketing
- Histórico de coletas

## 🛠️ Tecnologias

- **Backend**: Node.js + Express
- **Autenticação**: Google OAuth2
- **API**: Google Analytics Data API v1
- **Frontend**: HTML5 + Bootstrap 5 + Chart.js
- **Sessões**: Express-session

## ⚙️ Configuração

### 1. **Pré-requisitos**
```bash
Node.js 18+ 
npm ou yarn
Conta Google with Analytics access
```

### 2. **Instalação**
```bash
git clone <seu-repositorio>
cd v1
npm install
```

### 3. **Configuração OAuth**

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione existente
3. Habilite as APIs:
   - Google Analytics Data API
   - Google Analytics Admin API
   - Google+ API (para perfil do usuário)
4. Crie credenciais OAuth 2.0
5. Configure URI de redirecionamento: `http://localhost:3000/auth/google/callback`

### 4. **Variáveis de Ambiente**
Crie um arquivo `.env`:
```env
OAUTH_CLIENT_ID=seu_client_id_aqui
OAUTH_CLIENT_SECRET=seu_client_secret_aqui  
OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
SESSION_SECRET=chave_secreta_para_sessoes
```

### 5. **Execução**
```bash
npm start
```

Acesse: http://localhost:3000

## 🎯 Como Usar

### **Fluxo Principal:**
1. **Login** → Conectar conta Google
2. **Seleção** → Escolher conta Analytics (se múltiplas)
3. **Propriedade** → Selecionar propriedade GA4
4. **Dashboard** → Visualizar dados em tempo real
5. **Dados** → Acessar JSON completo em `/account-data`

### **Exportação de Dados:**
- **Visualizar**: `/account-data` - Ver JSON formatado
- **Download**: Botão "Baixar JSON" 
- **Atualizar**: Botão "Atualizar Dados"
- **API**: `/api/account-data` - JSON puro

## 📋 Estrutura dos Dados

```json
{
  "metadata": {
    "dataCollectedAt": "2025-06-02T04:05:32.855Z",
    "period": "Últimos 30 dias",
    "description": "Dados de marketing e performance"
  },
  "resumoGeral": {
    "totalUsers": 25437,
    "totalSessions": 31254,
    "totalPageViews": 89765,
    "totalConversions": 127,
    "totalRevenue": 12540.50,
    "conversaoGeral": "0.41%"
  },
  "usuario": {
    "nome": "Nome do usuário",
    "email": "email@exemplo.com"
  },
  "propriedades": [
    {
      "displayName": "Meu Site",
      "marketingData": {
        "summary": { /* métricas gerais */ },
        "topCountries": [ /* países top */ ],
        "topCities": [ /* cidades top */ ],
        "deviceBreakdown": [ /* dispositivos */ ],
        "trafficSources": [ /* fontes tráfego */ ],
        "topPages": [ /* páginas populares */ ],
        "dailyTrend": [ /* evolução diária */ ]
      }
    }
  ],
  "dadosConsolidados": {
    "topPaises": [ /* consolidado países */ ],
    "fontesTrafegoConsolidadas": [ /* consolidado tráfego */ ]
  }
}
```

## 🔐 Segurança

- ✅ Credenciais OAuth2 seguras
- ✅ Sessões criptografadas  
- ✅ Tokens renovados automaticamente
- ✅ Dados pessoais não commitados (`.gitignore`)
- ✅ Validação de permissões

## 📁 Estrutura do Projeto

```
v1/
├── server.js              # Servidor principal
├── analytics.js           # Lógica Analytics + OAuth
├── public/
│   ├── index.html         # Página de login
│   └── dashboard.html     # Dashboard principal
├── account_data/          # JSONs gerados (gitignored)
├── .env                   # Credenciais (gitignored)
├── .gitignore
├── package.json
└── README.md
```

## 🎯 Uso para Marketing

### **Apresentações:**
- Números de usuários e engajamento
- Performance por região/dispositivo  
- ROI e conversões
- Tendências e crescimento

### **Análises:**
- Fontes de tráfego mais eficazes
- Páginas com melhor performance
- Comportamento por dispositivo
- Oportunidades de melhoria

### **Relatórios:**
- Dados consolidados de múltiplas propriedades
- Exportação para Excel/PowerBI
- Histórico temporal
- Métricas de conversão

## 🚧 Desenvolvimento

```bash
# Modo desenvolvimento com restart automático
npm install -g nodemon
nodemon server.js

# Logs detalhados
DEBUG=* npm start
```

## 📝 Licença

Este projeto é privado e proprietário.

## 🤝 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do console
2. Confirme configuração OAuth
3. Teste permissões no Google Analytics
4. Verifique variáveis de ambiente 