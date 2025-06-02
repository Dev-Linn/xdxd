@echo off
echo Limpando arquivos sensíveis do repositório...

REM Remove os arquivos do índice
git rm --cached .env
git rm --cached "client_secret_335166406346-rrc2vf3kofitjl0p8pvlqitdvkvq562s.apps.googleusercontent.com.json"

REM Atualiza o .gitignore para garantir que está correto
echo .env >> .gitignore
echo client_secret_*.json >> .gitignore

REM Faz commit das mudanças
git add .gitignore
git commit -m "Remove arquivos sensíveis e atualiza .gitignore"

echo Arquivos sensíveis removidos do índice. Agora você pode fazer push.
echo IMPORTANTE: Regenere suas credenciais do Google OAuth por segurança.
pause 