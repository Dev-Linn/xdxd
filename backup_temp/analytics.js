import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import fetch from 'node-fetch';
import cors from 'cors';

const router = express.Router();

// Configurar CORS
router.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

// Initialize OAuth client with required parameters
const oauth2Client = new OAuth2Client(
  process.env.OAUTH_CLIENT_ID,
  process.env.OAUTH_CLIENT_SECRET,
  process.env.OAUTH_REDIRECT_URI
);

// Função para obter informações do perfil do usuário
async function getUserProfile(accessToken) {
    try {
        console.log('🔍 Buscando perfil do usuário...');
        const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('❌ Erro na resposta da API do perfil:', response.status, response.statusText);
            throw new Error('Erro ao buscar perfil do usuário');
        }

        const userProfile = await response.json();
        console.log('✅ Perfil do usuário obtido:', { id: userProfile.id, name: userProfile.name, email: userProfile.email });
        return userProfile;
    } catch (error) {
        console.error('❌ Erro ao obter perfil do usuário:', error);
        return null;
    }
}

// Função para obter todas as contas do Analytics
async function getAllAnalyticsAccounts(accessToken) {
    try {
        const response = await fetch('https://analyticsadmin.googleapis.com/v1beta/accounts', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Erro ao buscar contas do Analytics');
        }

        const data = await response.json();
        return data.accounts || [];
    } catch (error) {
        console.error('Erro ao obter contas do Analytics:', error);
        return [];
    }
}

// Função para obter propriedades de uma conta
async function getPropertiesForAccount(accessToken, accountId) {
    try {
        const response = await fetch(
            `https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:accounts/${accountId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Erro ao buscar propriedades da conta ${accountId}`);
        }

        const data = await response.json();
        return data.properties || [];
    } catch (error) {
        console.error(`Erro ao obter propriedades da conta ${accountId}:`, error);
        return [];
    }
}

// Função para obter contas do Merchant Center
async function getMerchantCenterAccounts(accessToken) {
    try {
        const response = await fetch('https://content.googleapis.com/content/v2.1/accounts/authinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            return []; // Retorna array vazio se não tiver acesso ao Merchant Center
        }

        const authInfo = await response.json();
        const accounts = authInfo.accountIdentifiers || [];

        // Buscar detalhes de cada conta
        const detailedAccounts = await Promise.all(accounts.map(async (accId) => {
            if (!accId.merchantId && !accId.aggregatorId) return null;
            const idToFetch = accId.aggregatorId || accId.merchantId;
            
            try {
                const accDetailsRes = await fetch(`https://content.googleapis.com/content/v2.1/accounts/${idToFetch}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (accDetailsRes.ok) {
                    const detail = await accDetailsRes.json();
                    return {
                        id: detail.id,
                        name: detail.name || `Account ${detail.id}`,
                        isMCA: !!accId.aggregatorId || (detail.subaccounts && detail.subaccounts.length > 0),
                        websiteUrl: detail.websiteUrl || null,
                        businessInformation: detail.businessInformation || null
                    };
                }
            } catch (e) {
                console.warn(`Falha ao buscar detalhes da conta ${idToFetch}:`, e.message);
            }
            
            return {
                id: idToFetch,
                name: `Account ${idToFetch} (detalhes indisponíveis)`,
                isMCA: !!accId.aggregatorId
            };
        }));

        return detailedAccounts.filter(Boolean);
    } catch (error) {
        console.warn('Erro ao obter contas do Merchant Center:', error);
        return [];
    }
}

// Função para obter dados de marketing das propriedades
async function getMarketingDataForProperty(accessToken, propertyId) {
    try {
        // Dados dos últimos 30 dias
        const requestBody = {
            dateRanges: [{
                startDate: '30daysAgo',
                endDate: 'today'
            }],
            dimensions: [
                { name: 'date' },
                { name: 'country' },
                { name: 'city' },
                { name: 'deviceCategory' },
                { name: 'sessionSource' },
                { name: 'sessionMedium' },
                { name: 'pagePath' },
                { name: 'pageTitle' }
            ],
            metrics: [
                { name: 'activeUsers' },
                { name: 'newUsers' },
                { name: 'sessions' },
                { name: 'screenPageViews' },
                { name: 'averageSessionDuration' },
                { name: 'bounceRate' },
                { name: 'conversions' },
                { name: 'totalRevenue' },
                { name: 'engagementRate' },
                { name: 'eventCount' }
            ],
            limit: 10000
        };

        const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            console.warn(`Erro ao buscar dados da propriedade ${propertyId}:`, response.status);
            return null;
        }

        const data = await response.json();
        const rows = data.rows || [];

        // Processar dados para relatórios de marketing
        const marketingData = {
            // Resumo geral
            summary: {
                totalUsers: rows.reduce((sum, row) => sum + (Number(row.metricValues[0].value) || 0), 0),
                totalNewUsers: rows.reduce((sum, row) => sum + (Number(row.metricValues[1].value) || 0), 0),
                totalSessions: rows.reduce((sum, row) => sum + (Number(row.metricValues[2].value) || 0), 0),
                totalPageViews: rows.reduce((sum, row) => sum + (Number(row.metricValues[3].value) || 0), 0),
                totalConversions: rows.reduce((sum, row) => sum + (Number(row.metricValues[6].value) || 0), 0),
                totalRevenue: rows.reduce((sum, row) => sum + (Number(row.metricValues[7].value) || 0), 0),
                avgSessionDuration: rows.length > 0 ? rows.reduce((sum, row) => sum + (Number(row.metricValues[4].value) || 0), 0) / rows.length : 0,
                avgBounceRate: rows.length > 0 ? rows.reduce((sum, row) => sum + (Number(row.metricValues[5].value) || 0), 0) / rows.length : 0,
                avgEngagementRate: rows.length > 0 ? rows.reduce((sum, row) => sum + (Number(row.metricValues[8].value) || 0), 0) / rows.length : 0
            },

            // Top países
            topCountries: Object.entries(rows.reduce((acc, row) => {
                const country = row.dimensionValues[1].value;
                const sessions = Number(row.metricValues[2].value) || 0;
                acc[country] = (acc[country] || 0) + sessions;
                return acc;
            }, {}))
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([country, sessions]) => ({ country, sessions })),

            // Top cidades
            topCities: Object.entries(rows.reduce((acc, row) => {
                const city = row.dimensionValues[2].value;
                const sessions = Number(row.metricValues[2].value) || 0;
                if (city && city !== '(not set)') {
                    acc[city] = (acc[city] || 0) + sessions;
                }
                return acc;
            }, {}))
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([city, sessions]) => ({ city, sessions })),

            // Dispositivos
            deviceBreakdown: Object.entries(rows.reduce((acc, row) => {
                const device = row.dimensionValues[3].value;
                const sessions = Number(row.metricValues[2].value) || 0;
                acc[device] = (acc[device] || 0) + sessions;
                return acc;
            }, {}))
                .map(([device, sessions]) => ({ device, sessions })),

            // Fontes de tráfego
            trafficSources: Object.entries(rows.reduce((acc, row) => {
                const source = row.dimensionValues[4].value;
                const medium = row.dimensionValues[5].value;
                const key = `${source} / ${medium}`;
                const sessions = Number(row.metricValues[2].value) || 0;
                const users = Number(row.metricValues[0].value) || 0;
                if (!acc[key]) acc[key] = { sessions: 0, users: 0 };
                acc[key].sessions += sessions;
                acc[key].users += users;
                return acc;
            }, {}))
                .sort((a, b) => b[1].sessions - a[1].sessions)
                .slice(0, 15)
                .map(([sourcemedium, data]) => ({ sourcemedium, ...data })),

            // Top páginas
            topPages: Object.entries(rows.reduce((acc, row) => {
                const pagePath = row.dimensionValues[6].value;
                const pageTitle = row.dimensionValues[7].value;
                const pageViews = Number(row.metricValues[3].value) || 0;
                const key = pagePath;
                if (!acc[key]) acc[key] = { pageViews: 0, pageTitle: pageTitle };
                acc[key].pageViews += pageViews;
                return acc;
            }, {}))
                .sort((a, b) => b[1].pageViews - a[1].pageViews)
                .slice(0, 15)
                .map(([pagePath, data]) => ({ pagePath, ...data })),

            // Evolução diária (últimos 30 dias)
            dailyTrend: Object.entries(rows.reduce((acc, row) => {
                const date = row.dimensionValues[0].value;
                const users = Number(row.metricValues[0].value) || 0;
                const sessions = Number(row.metricValues[2].value) || 0;
                const pageViews = Number(row.metricValues[3].value) || 0;
                if (!acc[date]) acc[date] = { users: 0, sessions: 0, pageViews: 0 };
                acc[date].users += users;
                acc[date].sessions += sessions;
                acc[date].pageViews += pageViews;
                return acc;
            }, {}))
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, data]) => ({ date, ...data }))
        };

        return marketingData;
    } catch (error) {
        console.error(`Erro ao obter dados de marketing da propriedade ${propertyId}:`, error);
        return null;
    }
}

// Função para criar JSON completo da conta COM DADOS DE MARKETING
async function createAccountDataJSON(tokens) {
    const timestamp = new Date().toISOString();
    const accessToken = tokens.access_token;
    
    console.log('🔄 Coletando dados completos da conta e dados de marketing...');
    
    // Coletar informações básicas
    const [
        userProfile,
        analyticsAccounts,
        merchantAccounts
    ] = await Promise.all([
        getUserProfile(accessToken),
        getAllAnalyticsAccounts(accessToken),
        getMerchantCenterAccounts(accessToken)
    ]);

    // Verificar se conseguimos o perfil do usuário
    if (!userProfile) {
        console.warn('⚠️ Não foi possível obter o perfil do usuário');
    }

    // Coletar propriedades e dados de marketing para cada conta
    let allPropertiesWithData = [];
    for (const account of analyticsAccounts) {
        const accountId = account.name.split('/').pop();
        const properties = await getPropertiesForAccount(accessToken, accountId);
        
        // Para cada propriedade, coletar dados de marketing
        const propertiesWithData = await Promise.all(properties.map(async (prop) => {
            const propertyId = prop.name.split('/').pop();
            const marketingData = await getMarketingDataForProperty(accessToken, propertyId);
            
            return {
                id: propertyId,
                displayName: prop.displayName,
                createTime: prop.createTime,
                updateTime: prop.updateTime,
                timeZone: prop.timeZone,
                currencyCode: prop.currencyCode,
                industryCategory: prop.industryCategory,
                serviceLevel: prop.serviceLevel,
                marketingData: marketingData
            };
        }));
        
        allPropertiesWithData.push({
            accountId: accountId,
            accountName: account.displayName,
            properties: propertiesWithData
        });
    }

    // Calcular totais gerais para todas as propriedades
    const overallTotals = allPropertiesWithData.reduce((totals, account) => {
        account.properties.forEach(property => {
            if (property.marketingData) {
                const data = property.marketingData.summary;
                totals.totalUsers += data.totalUsers || 0;
                totals.totalSessions += data.totalSessions || 0;
                totals.totalPageViews += data.totalPageViews || 0;
                totals.totalConversions += data.totalConversions || 0;
                totals.totalRevenue += data.totalRevenue || 0;
            }
        });
        return totals;
    }, {
        totalUsers: 0,
        totalSessions: 0,
        totalPageViews: 0,
        totalConversions: 0,
        totalRevenue: 0
    });

    // Estrutura focada em dados de marketing
    const accountData = {
        metadata: {
            dataCollectedAt: timestamp,
            period: "Últimos 30 dias",
            description: "Dados de marketing e performance - Google Analytics"
        },
        resumoGeral: {
            ...overallTotals,
            numeroPropriedades: allPropertiesWithData.reduce((sum, acc) => sum + acc.properties.length, 0),
            conversaoGeral: overallTotals.totalSessions > 0 ? (overallTotals.totalConversions / overallTotals.totalSessions * 100).toFixed(2) + '%' : '0%'
        },
        usuario: {
            nome: userProfile?.name || 'N/A',
            email: userProfile?.email || 'N/A'
        },
        propriedades: allPropertiesWithData,
        dadosConsolidados: {
            // Consolidar top países de todas as propriedades
            topPaises: allPropertiesWithData
                .flatMap(acc => acc.properties.map(prop => prop.marketingData?.topCountries || []))
                .flat()
                .reduce((acc, item) => {
                    const existing = acc.find(x => x.country === item.country);
                    if (existing) existing.sessions += item.sessions;
                    else acc.push({ ...item });
                    return acc;
                }, [])
                .sort((a, b) => b.sessions - a.sessions)
                .slice(0, 10),

            // Consolidar fontes de tráfego
            fontesTrafegoConsolidadas: allPropertiesWithData
                .flatMap(acc => acc.properties.map(prop => prop.marketingData?.trafficSources || []))
                .flat()
                .reduce((acc, item) => {
                    const existing = acc.find(x => x.sourcemedium === item.sourcemedium);
                    if (existing) {
                        existing.sessions += item.sessions;
                        existing.users += item.users;
                    } else {
                        acc.push({ ...item });
                    }
                    return acc;
                }, [])
                .sort((a, b) => b.sessions - a.sessions)
                .slice(0, 10)
        }
    };

    return accountData;
}

// Função para salvar JSON em arquivo
async function saveAccountDataToFile(accountData, userId) {
    try {
        const fs = await import('fs');
        const path = await import('path');
        
        // Criar pasta para armazenar dados das contas se não existir
        const dataDir = path.resolve('./account_data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Nome do arquivo baseado no ID do usuário e timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `account_${userId}_${timestamp}.json`;
        const filePath = path.join(dataDir, fileName);
        
        // Salvar JSON formatado
        fs.writeFileSync(filePath, JSON.stringify(accountData, null, 2), 'utf8');
        
        console.log(`✅ Dados da conta salvos em: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error('❌ Erro ao salvar dados da conta:', error);
        return null;
    }
}

// Auth routes
router.get('/auth/google', (req, res) => {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  
  if (!clientId || !redirectUri) {
    return res.status(500).send(`
      <h1>Erro de Configuração</h1>
      <p>Credenciais OAuth não configuradas corretamente.</p>
      <p>Verifique seu arquivo .env</p>
    `);
  }
  
  const oauth2Client = new OAuth2Client(clientId, process.env.OAUTH_CLIENT_SECRET, redirectUri);
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/analytics.manage.users.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/content'
    ],
    prompt: 'consent',
    client_id: clientId,
    redirect_uri: redirectUri
  });
  
  res.redirect(authUrl);
});

// Google callback handler - FLUXO SIMPLIFICADO
router.get('/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            throw new Error('Código de autorização não recebido');
        }
        
        const oauth2Client = new OAuth2Client(
            process.env.OAUTH_CLIENT_ID,
            process.env.OAUTH_CLIENT_SECRET,
            process.env.OAUTH_REDIRECT_URI
        );
        
        // Obter tokens
        const { tokens } = await oauth2Client.getToken({
            code: code,
            client_id: process.env.OAUTH_CLIENT_ID,
            client_secret: process.env.OAUTH_CLIENT_SECRET,
            redirect_uri: process.env.OAUTH_REDIRECT_URI
        });
        
        // Salvar tokens na sessão
        req.session.tokens = tokens;
        
        // Criar JSON completo com dados da conta
        try {
            const accountData = await createAccountDataJSON(tokens);
            const userId = accountData.usuario?.nome?.replace(/\s+/g, '_') || accountData.usuario?.email?.split('@')[0] || 'unknown';
            const filePath = await saveAccountDataToFile(accountData, userId);
            
            req.session.accountData = accountData;
            req.session.accountDataFilePath = filePath;
            
            console.log(`✅ Dados da conta coletados para: ${accountData.usuario?.nome || 'Usuário'}`);
        } catch (error) {
            console.error('❌ Erro ao criar JSON da conta:', error);
        }
        
        // Buscar contas do usuário
        const accountsResponse = await fetch('https://analyticsadmin.googleapis.com/v1beta/accounts', {
            headers: {
                'Authorization': `Bearer ${tokens.access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!accountsResponse.ok) {
            throw new Error('Erro ao buscar contas');
        }

        const accountsData = await accountsResponse.json();
        const accounts = accountsData.accounts || [];

        if (accounts.length === 0) {
            throw new Error('Nenhuma conta encontrada');
        }

        // Se só tem uma conta, seleciona automaticamente
        if (accounts.length === 1) {
            const account = accounts[0];
            req.session.selectedAccountId = account.name.split('/').pop();
            
            return res.redirect('/select-property');
        }

        // Se tem múltiplas contas, mostra seletor
        res.redirect('/select-account');
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).send(`
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h1 style="color: #d32f2f;">Erro de Autenticação</h1>
                <p>Ocorreu um erro durante o processo de login:</p>
                <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">${error.toString()}</pre>
                <a href="/" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1976d2; color: white; text-decoration: none; border-radius: 4px;">Tentar Novamente</a>
            </div>
        `);
    }
});

// Rota para seleção de conta (quando há múltiplas)
router.get('/select-account', async (req, res) => {
    if (!req.session.tokens) {
        return res.redirect('/auth/google');
    }

    try {
        const response = await fetch('https://analyticsadmin.googleapis.com/v1beta/accounts', {
            headers: {
                'Authorization': `Bearer ${req.session.tokens.access_token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Erro ao buscar contas');
        }

        const data = await response.json();
        const accounts = data.accounts || [];

        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Selecionar Conta</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <style>
                    body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
                    .container { max-width: 800px; margin: 50px auto; }
                    .account-card { background: white; border-radius: 10px; padding: 20px; margin: 10px 0; border: 1px solid #ddd; transition: transform 0.2s; }
                    .account-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                    .btn-select { background: #1976d2; color: white; border: none; padding: 10px 20px; border-radius: 5px; text-decoration: none; }
                    .btn-select:hover { background: #1565c0; color: white; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1 class="text-center mb-4">Selecione uma Conta Google Analytics</h1>
                    <p class="text-center text-muted">Você tem acesso a múltiplas contas. Escolha qual deseja usar:</p>
                    
                    ${accounts.map(account => `
                        <div class="account-card">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h5>${account.displayName}</h5>
                                    <small class="text-muted">ID: ${account.name.split('/').pop()}</small>
                                </div>
                                <a href="/select-account/${account.name.split('/').pop()}" class="btn-select">Selecionar</a>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Erro ao carregar contas');
    }
});

// Rota para processar seleção de conta
router.get('/select-account/:accountId', async (req, res) => {
    if (!req.session.tokens) {
        return res.redirect('/auth/google');
    }

    const { accountId } = req.params;
    
    try {
        req.session.selectedAccountId = accountId;
        
        res.redirect('/select-property');
    } catch (error) {
        res.status(500).send('Erro ao selecionar conta');
    }
});

// Logout route
router.get('/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Erro ao sair:', err);
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

// Rota para seleção de propriedade
router.get('/select-property', async (req, res) => {
    if (!req.session.tokens) {
        return res.redirect('/auth/google');
    }

    if (!req.session.selectedAccountId) {
        return res.redirect('/select-account');
    }

    try {
        const accountId = req.session.selectedAccountId;
        
        const response = await fetch(
            `https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:accounts/${accountId}`,
            {
                headers: {
                    'Authorization': `Bearer ${req.session.tokens.access_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error('Erro ao buscar propriedades');
        }

        const data = await response.json();
        const properties = data.properties || [];

        if (properties.length === 0) {
            return res.send(`
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center;">
                    <h1>Nenhuma Propriedade Encontrada</h1>
                    <p>Não foram encontradas propriedades GA4 para esta conta.</p>
                    <a href="/select-account" style="display: inline-block; padding: 10px 20px; background: #1976d2; color: white; text-decoration: none; border-radius: 4px;">Escolher Outra Conta</a>
                </div>
            `);
        }

        res.send(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Selecionar Propriedade</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <style>
                    body { font-family: Arial, sans-serif; background-color: #f5f5f5; }
                    .container { max-width: 800px; margin: 50px auto; }
                    .property-card { background: white; border-radius: 10px; padding: 20px; margin: 10px 0; border: 1px solid #ddd; transition: transform 0.2s; }
                    .property-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                    .btn-select { background: #1976d2; color: white; border: none; padding: 10px 20px; border-radius: 5px; text-decoration: none; }
                    .btn-select:hover { background: #1565c0; color: white; }
                    .btn-secondary { background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 5px; text-decoration: none; margin-right: 10px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1 class="text-center mb-4">Selecione uma Propriedade</h1>
                    <p class="text-center text-muted">Escolha a propriedade GA4 que deseja analisar:</p>
                    
                    ${properties.map(property => `
                        <div class="property-card">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h5>${property.displayName}</h5>
                                    <small class="text-muted">ID: ${property.name.split('/').pop()}</small>
                                    <br><small class="text-muted">Fuso: ${property.timeZone || 'N/A'} | Moeda: ${property.currencyCode || 'N/A'}</small>
                                </div>
                                <a href="/select-property/${property.name.split('/').pop()}" class="btn-select">Selecionar</a>
                            </div>
                        </div>
                    `).join('')}
                    
                    <div class="text-center mt-4">
                        <a href="/select-account" class="btn-secondary">← Trocar Conta</a>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Erro ao carregar propriedades');
    }
});

// Rota para processar seleção de propriedade
router.get('/select-property/:propertyId', async (req, res) => {
    if (!req.session.tokens) {
        return res.redirect('/auth/google');
    }

    const { propertyId } = req.params;
    
    try {
        req.session.selectedPropertyId = propertyId;
        res.redirect('/dashboard');
    } catch (error) {
        res.status(500).send('Erro ao selecionar propriedade');
    }
});

// Rota para os dados do dashboard (API)
router.get('/api/dashboard-data', async (req, res) => {
    if (!req.session.tokens) {
        return res.status(401).json({ error: 'Não autenticado' });
    }

    if (!req.session.selectedPropertyId) {
        return res.status(400).json({ error: 'Propriedade não selecionada' });
    }

    try {
        const propertyId = req.session.selectedPropertyId;

        oauth2Client.setCredentials(req.session.tokens);

        // Verificar se o token está expirado
        if (oauth2Client.isTokenExpiring()) {
            try {
                const { tokens } = await oauth2Client.refreshAccessToken();
                req.session.tokens = tokens;
                oauth2Client.setCredentials(tokens);
            } catch (refreshError) {
                return res.status(401).json({ error: 'Sessão expirada' });
            }
        }

        const requestBody = {
            dateRanges: [{
                startDate: '30daysAgo',
                endDate: 'today',
            }],
            dimensions: [
                { name: 'date' },
                { name: 'deviceCategory' },
                { name: 'country' },
                { name: 'city' },
                { name: 'pagePath' },
                { name: 'sessionSource' },
                { name: 'sessionMedium' }
            ],
            metrics: [
                { name: 'activeUsers' },
                { name: 'newUsers' },
                { name: 'sessions' },
                { name: 'screenPageViews' },
                { name: 'averageSessionDuration' },
                { name: 'bounceRate' },
                { name: 'conversions' },
                { name: 'totalRevenue' },
                { name: 'engagedSessions' },
                { name: 'engagementRate' }
            ],
            orderBys: [{
                dimension: { dimensionName: 'date' },
                desc: true
            }],
            limit: 1000
        };

        const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${req.session.tokens.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return res.status(401).json({ error: 'Sessão expirada' });
            }
            throw new Error(`Erro na API: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.rows || data.rows.length === 0) {
            return res.status(404).json({
                error: 'Nenhum dado encontrado',
                message: 'Não há dados disponíveis para o período selecionado.'
            });
        }

        // Formatar os dados para o frontend
        const formattedData = {
            mainReport: data.rows.map(row => ({
                date: row.dimensionValues[0].value,
                deviceCategory: row.dimensionValues[1].value,
                country: row.dimensionValues[2].value,
                city: row.dimensionValues[3].value || '',
                pagePath: row.dimensionValues[4].value,
                sessionSource: row.dimensionValues[5].value,
                sessionMedium: row.dimensionValues[6].value,
                metrics: {
                    activeUsers: Number(row.metricValues[0].value) || 0,
                    newUsers: Number(row.metricValues[1].value) || 0,
                    sessions: Number(row.metricValues[2].value) || 0,
                    screenPageViews: Number(row.metricValues[3].value) || 0,
                    averageSessionDuration: Number(row.metricValues[4].value) || 0,
                    bounceRate: Number(row.metricValues[5].value) || 0,
                    conversions: Number(row.metricValues[6].value) || 0,
                    totalRevenue: Number(row.metricValues[7].value) || 0,
                    engagedSessions: Number(row.metricValues[8].value) || 0,
                    engagementRate: Number(row.metricValues[9].value) || 0
                }
            }))
        };

        res.json(formattedData);
    } catch (error) {
        res.status(500).json({
            error: 'Erro ao carregar dados do dashboard',
            message: error.message
        });
    }
});

// 🆕 ROTAS PARA GERENCIAR DADOS DA CONTA

// Rota para visualizar dados da conta em JSON
router.get('/account-data', (req, res) => {
    if (!req.session.tokens) {
        return res.redirect('/auth/google');
    }

    if (!req.session.accountData) {
        return res.status(404).send(`
            <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px;">
                <h1>📊 Dados da Conta</h1>
                <div style="background: #fff3cd; border: 1px solid #ffeeba; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <strong>⚠️ Dados não encontrados</strong><br>
                    Os dados da conta ainda não foram coletados. Faça logout e conecte novamente para gerar o JSON completo.
                </div>
                <a href="/auth/logout" style="display: inline-block; padding: 10px 20px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin-right: 10px;">Fazer Logout</a>
                <a href="/dashboard" style="display: inline-block; padding: 10px 20px; background: #1976d2; color: white; text-decoration: none; border-radius: 4px;">Voltar ao Dashboard</a>
            </div>
        `);
    }

    const accountData = req.session.accountData;
    
    res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dados da Conta - JSON Completo</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
                .header { background: #1976d2; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                .summary-card { background: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px; margin: 10px 0; }
                .json-container { background: #f8f9fa; border: 1px solid #ddd; padding: 20px; border-radius: 5px; margin: 20px 0; max-height: 600px; overflow-y: auto; }
                .btn { display: inline-block; padding: 10px 20px; text-decoration: none; border-radius: 4px; margin: 5px; }
                .btn-primary { background: #1976d2; color: white; }
                .btn-success { background: #28a745; color: white; }
                .btn-secondary { background: #6c757d; color: white; }
                pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
                .metric { display: inline-block; margin: 0 15px 10px 0; }
                .metric-value { font-size: 1.5em; font-weight: bold; color: #1976d2; }
                .metric-label { font-size: 0.9em; color: #666; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📊 Dados Completos da Conta</h1>
                <p>JSON gerado em: ${accountData.metadata.dataCollectedAt}</p>
            </div>

            <div class="summary-card">
                <h2>👤 Resumo do Perfil</h2>
                <div class="metric">
                    <div class="metric-value">${accountData.usuario?.nome || 'N/A'}</div>
                    <div class="metric-label">Nome</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${accountData.usuario?.email || 'N/A'}</div>
                    <div class="metric-label">Email</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${accountData.resumoGeral?.numeroPropriedades || 0}</div>
                    <div class="metric-label">Propriedades</div>
                </div>
            </div>

            <div class="summary-card">
                <h2>📈 Resumo dos Dados de Marketing</h2>
                <div class="metric">
                    <div class="metric-value">${accountData.resumoGeral?.totalUsers?.toLocaleString('pt-BR') || '0'}</div>
                    <div class="metric-label">Usuários Totais</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${accountData.resumoGeral?.totalSessions?.toLocaleString('pt-BR') || '0'}</div>
                    <div class="metric-label">Sessões Totais</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${accountData.resumoGeral?.totalPageViews?.toLocaleString('pt-BR') || '0'}</div>
                    <div class="metric-label">Visualizações</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${accountData.resumoGeral?.conversaoGeral || '0%'}</div>
                    <div class="metric-label">Taxa de Conversão</div>
                </div>
                <div class="metric">
                    <div class="metric-value">R$ ${accountData.resumoGeral?.totalRevenue?.toLocaleString('pt-BR', {minimumFractionDigits: 2}) || '0,00'}</div>
                    <div class="metric-label">Receita Total</div>
                </div>
            </div>

            <div>
                <h2>🔗 Ações</h2>
                <a href="/download-account-data" class="btn btn-success">💾 Baixar JSON</a>
                <a href="/account-data/refresh" class="btn btn-primary">🔄 Atualizar Dados</a>
                <a href="/dashboard" class="btn btn-secondary">🏠 Voltar ao Dashboard</a>
            </div>

            <div class="json-container">
                <h3>📋 JSON Completo</h3>
                <pre><code>${JSON.stringify(accountData, null, 2)}</code></pre>
            </div>

            <script>
                // Função para copiar JSON para área de transferência
                function copyToClipboard() {
                    const jsonText = document.querySelector('pre code').textContent;
                    navigator.clipboard.writeText(jsonText).then(() => {
                        alert('JSON copiado para a área de transferência!');
                    });
                }
                
                // Adicionar botão de copiar
                document.querySelector('h3').innerHTML += ' <button onclick="copyToClipboard()" style="margin-left: 10px; padding: 5px 10px; background: #17a2b8; color: white; border: none; border-radius: 3px; cursor: pointer;">📋 Copiar</button>';
            </script>
        </body>
        </html>
    `);
});

// Rota para baixar o JSON da conta
router.get('/download-account-data', (req, res) => {
    if (!req.session.tokens) {
        return res.redirect('/auth/google');
    }

    if (!req.session.accountData) {
        return res.status(404).json({ error: 'Dados da conta não encontrados' });
    }

    const accountData = req.session.accountData;
    const fileName = `dados_conta_${accountData.usuario?.nome?.replace(/\s+/g, '_') || accountData.usuario?.email?.split('@')[0] || 'unknown'}_${new Date().toISOString().split('T')[0]}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(accountData, null, 2));
});

// Rota para atualizar/recoletar dados da conta
router.get('/account-data/refresh', async (req, res) => {
    if (!req.session.tokens) {
        return res.redirect('/auth/google');
    }

    try {
        console.log('🔄 Atualizando dados da conta...');
        
        // Verificar se o token ainda é válido
        oauth2Client.setCredentials(req.session.tokens);
        if (oauth2Client.isTokenExpiring()) {
            console.log('⚠️ Token expirado, tentando renovar...');
            try {
                const { tokens } = await oauth2Client.refreshAccessToken();
                req.session.tokens = tokens;
                oauth2Client.setCredentials(tokens);
            } catch (refreshError) {
                console.error('❌ Erro ao renovar token:', refreshError);
                return res.redirect('/auth/google');
            }
        }

        // Recoletar dados
        const accountData = await createAccountDataJSON(req.session.tokens);
        
        // Salvar novo arquivo
        const userId = accountData.usuario?.nome?.replace(/\s+/g, '_') || accountData.usuario?.email?.split('@')[0] || 'unknown';
        const filePath = await saveAccountDataToFile(accountData, userId);
        
        // Atualizar sessão
        req.session.accountData = accountData;
        req.session.accountDataFilePath = filePath;
        
        console.log('✅ Dados da conta atualizados com sucesso!');
        res.redirect('/account-data');
        
    } catch (error) {
        console.error('❌ Erro ao atualizar dados da conta:', error);
        res.status(500).send(`
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
                <h1 style="color: #d32f2f;">Erro ao Atualizar Dados</h1>
                <p>Ocorreu um erro ao tentar atualizar os dados da conta:</p>
                <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">${error.message}</pre>
                <a href="/account-data" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1976d2; color: white; text-decoration: none; border-radius: 4px;">Voltar</a>
            </div>
        `);
    }
});

// API endpoint para obter dados da conta em JSON puro
router.get('/api/account-data', (req, res) => {
    if (!req.session.tokens) {
        return res.status(401).json({ error: 'Não autenticado' });
    }

    if (!req.session.accountData) {
        return res.status(404).json({ error: 'Dados da conta não encontrados' });
    }

    res.json(req.session.accountData);
});

// Rota do Dashboard
router.get('/dashboard', (req, res) => {
    if (!req.session.tokens) {
        return res.redirect('/auth/google');
    }

    if (!req.session.selectedPropertyId) {
        return res.redirect('/select-property');
    }

    res.sendFile('dashboard.html', { root: './public' });
});

export default router; 