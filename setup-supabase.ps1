# VendaMais Content Engine — configuração do Supabase em um comando (Windows PowerShell).
# Uso: clique com o botão direito > Executar com PowerShell, ou: powershell -ExecutionPolicy Bypass -File setup-supabase.ps1
# Requisitos: Node.js 18+, conta em supabase.com com um projeto criado, chaves da OpenAI e/ou Gemini.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "== VendaMais Content Engine · setup Supabase =="
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Write-Host "Instale o Node.js (https://nodejs.org) e rode de novo."; exit 1 }
$SB = "npx --yes supabase@latest"

$REF = Read-Host "Project ref (Project Settings > General, ex.: abcdefghijklmnop)"
$DBPASS = Read-Host "Database password (definida ao criar o projeto)"
$OPENAI = Read-Host "OPENAI_API_KEY (Enter para pular)"
$GEMINI = Read-Host "GEMINI_API_KEY (Enter para pular)"
$ANTHROPIC = Read-Host "ANTHROPIC_API_KEY (Enter para pular)"
$MCTOKEN = Read-Host "METRICOOL_USER_TOKEN (Enter para pular)"
$MCUSER = Read-Host "METRICOOL_USER_ID (Enter para pular)"

Write-Host "-- Login no Supabase (abre o navegador)"; Invoke-Expression "$SB login"
Write-Host "-- Vinculando ao projeto $REF"; Invoke-Expression "$SB link --project-ref $REF --password `"$DBPASS`""
Write-Host "-- Aplicando schema"; Invoke-Expression "$SB db push --password `"$DBPASS`""

Write-Host "-- Gravando secrets"
$args = @("TEXT_PROVIDER=openai","TEXT_MODEL=gpt-5","IMAGE_PROVIDER_DEFAULT=gemini","IMAGE_MODEL_STANDARD=gemini-3.1-flash-image","IMAGE_MODEL_PREMIUM=gemini-3-pro-image","OPENAI_IMAGE_MODEL=gpt-image-2.5")
if ($OPENAI) { $args += "OPENAI_API_KEY=$OPENAI" }
if ($GEMINI) { $args += "GEMINI_API_KEY=$GEMINI" }
if ($ANTHROPIC) { $args += "ANTHROPIC_API_KEY=$ANTHROPIC" }
if ($MCTOKEN) { $args += "METRICOOL_USER_TOKEN=$MCTOKEN" }
if ($MCUSER) { $args += "METRICOOL_USER_ID=$MCUSER" }
Invoke-Expression "$SB secrets set $($args -join ' ')"

Write-Host "-- Publicando Edge Functions"
Invoke-Expression "$SB functions deploy text-generate image-generate source-fetch trends-fetch publish-schedule --no-verify-jwt"

Write-Host ""
Write-Host "== Pronto. Copie para Configurações do Content Engine: =="
Write-Host "Project URL: https://$REF.supabase.co"
Write-Host "Anon key: Project Settings > API (anon public)."
Write-Host "Depois: Authentication > Providers > Email ativado; crie sua conta no app (primeiro usuário vira Admin)."
