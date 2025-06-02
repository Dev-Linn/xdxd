// server.js
import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import analyticsRouter from './analytics.js';
import merchantRouter from './merchant.js';

// Load environment variables early
dotenv.config();

// Validate critical environment variables
const requiredEnvVars = ['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_REDIRECT_URI', 'SESSION_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please check your .env file');
  process.exit(1);
}

// Initialize Express app
const app = express();

// Configurar pasta pública para arquivos estáticos
app.use(express.static('public'));

// Configure session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: true,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Adicionar middleware para processar dados de formulário
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Middleware para verificar autenticação
app.use((req, res, next) => {
  const publicPaths = ['/auth/google', '/auth/google/callback', '/auth/logout', '/'];
  if (!publicPaths.includes(req.path) && !req.session.tokens) {
    return res.redirect('/auth/google');
  }
  next();
});

// Home route - página de login
app.get('/', (req, res) => {
  if (!req.session.tokens) {
    return res.sendFile('index.html', { root: './public' });
  }
  // Se já está logado, vai direto para o dashboard
  res.redirect('/dashboard');
});

// Usar o router do Analytics
app.use('/', analyticsRouter);

// Usar o router do Merchant
app.use('/', merchantRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Erro na aplicação:', err);
  res.status(500).send(`
    <h1>Erro na Aplicação</h1>
    <p>Ocorreu um erro inesperado:</p>
    <pre>${err.message}</pre>
    <p><a href="/">Voltar para Home</a></p>
  `);
});

// Start the server
const PORT = process.env.PORT || 3000;
try {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Try another port.`);
    } else {
      console.error('Server error:', error);
    }
  });
} catch (error) {
  console.error('Failed to start server:', error);
}