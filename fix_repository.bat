@echo off
echo Criando repositório limpo sem arquivos sensíveis...

REM Cria backup dos arquivos importantes
echo Fazendo backup dos arquivos importantes...
mkdir backup_temp
copy *.js backup_temp\
copy *.md backup_temp\
copy package*.json backup_temp\
copy .gitignore backup_temp\
xcopy /E /I public backup_temp\public
xcopy /E /I account_data backup_temp\account_data

REM Remove .git e reinicializa
echo Removendo histórico Git atual...
rmdir /S /Q .git

REM Inicializa novo repositório
echo Inicializando novo repositório...
git init
git branch -M main

REM Adiciona arquivos limpos
echo Adicionando arquivos limpos...
git add .

REM Faz primeiro commit limpo
echo Fazendo commit inicial limpo...
git commit -m "Commit inicial sem arquivos sensíveis"

REM Adiciona remote
echo Adicionando remote...
git remote add origin https://github.com/Dev-Linn/xdxd.git

echo Repositório limpo criado! Agora você pode fazer:
echo git push -f origin main
echo.
echo IMPORTANTE: 
echo 1. Regenere suas credenciais do Google OAuth
echo 2. Crie um novo arquivo .env com as novas credenciais
echo 3. NÃO commite o arquivo .env novamente
pause 