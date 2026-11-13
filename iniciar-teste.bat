@echo off
title Pokemon Simulator Evolution - Teste
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js 22.12 ou mais novo: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primeira execucao: instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)

echo Iniciando o jogo. O navegador abre sozinho; feche esta janela para encerrar.
call npm run dev -w @pokesim-evolution/web -- --open
if errorlevel 1 (
  echo.
  echo O servidor foi encerrado com erro.
  pause
)
