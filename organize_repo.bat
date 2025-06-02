@echo off
echo Organizando e limpando repositório...

REM Remove arquivos de backup e scripts desnecessários
echo Removendo arquivos desnecessários...
rmdir /S /Q backup_temp
del clean_repo.bat
del fix_repository.bat

REM Remove este próprio script dos arquivos a serem commitados
git rm --cached organize_repo.bat 2>nul

REM Adiciona mudanças
echo Adicionando mudanças...
git add .

REM Faz commit das limpezas
echo Fazendo commit da organização...
git commit -m "Organiza repositório removendo arquivos desnecessários"

REM Push das mudanças
echo Fazendo push das mudanças...
git push origin main

echo ✅ Repositório organizado com sucesso!
echo.
echo Estrutura final:
echo - analytics.js (API do Google Analytics)
echo - merchant.js (API do Merchant Center)  
echo - server.js (servidor principal)
echo - package.json e package-lock.json (dependências)
echo - public/ (arquivos HTML do frontend)
echo - account_data/ (dados dos usuários)
echo - README.md (documentação)
echo - .gitignore (ignora arquivos sensíveis)

REM Auto-deleta este script
del "%~f0" 