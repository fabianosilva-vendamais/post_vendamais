#!/usr/bin/env bash
# VendaMais Content Engine — configuração do Supabase em um comando.
# Uso: bash setup-supabase.sh
# Requisitos: Node.js 18+ (para npx), conta em supabase.com com um projeto criado, chaves da OpenAI e/ou Gemini.
set -euo pipefail
cd "$(dirname "$0")"

echo "== VendaMais Content Engine · setup Supabase =="
command -v npx >/dev/null || { echo "Instale o Node.js (https://nodejs.org) e rode de novo."; exit 1; }
SB="npx --yes supabase@latest"

read -rp "Project ref (em Project Settings > General, ex.: abcdefghijklmnop): " REF
read -rsp "Database password (definida ao criar o projeto): " DBPASS; echo
read -rp "OPENAI_API_KEY (Enter para pular): " OPENAI
read -rp "GEMINI_API_KEY (Enter para pular): " GEMINI
read -rp "ANTHROPIC_API_KEY (Enter para pular): " ANTHROPIC
read -rp "METRICOOL_USER_TOKEN (Enter para pular): " MCTOKEN
read -rp "METRICOOL_USER_ID (Enter para pular): " MCUSER

echo "-- Login no Supabase (abre o navegador)"; $SB login
echo "-- Vinculando ao projeto $REF"; $SB link --project-ref "$REF" --password "$DBPASS"
echo "-- Aplicando schema (tabelas, RLS, buckets)"; $SB db push --password "$DBPASS"

echo "-- Gravando secrets"
ARGS=(TEXT_PROVIDER=openai TEXT_MODEL=gpt-5 IMAGE_PROVIDER_DEFAULT=gemini IMAGE_MODEL_STANDARD=gemini-3.1-flash-image IMAGE_MODEL_PREMIUM=gemini-3-pro-image OPENAI_IMAGE_MODEL=gpt-image-2.5)
[ -n "$OPENAI" ] && ARGS+=("OPENAI_API_KEY=$OPENAI")
[ -n "$GEMINI" ] && ARGS+=("GEMINI_API_KEY=$GEMINI")
[ -n "$ANTHROPIC" ] && ARGS+=("ANTHROPIC_API_KEY=$ANTHROPIC")
[ -n "$MCTOKEN" ] && ARGS+=("METRICOOL_USER_TOKEN=$MCTOKEN")
[ -n "$MCUSER" ] && ARGS+=("METRICOOL_USER_ID=$MCUSER")
$SB secrets set "${ARGS[@]}"

echo "-- Publicando Edge Functions"
$SB functions deploy text-generate image-generate source-fetch trends-fetch publish-schedule --no-verify-jwt

echo
echo "== Pronto. Agora copie para Configurações do Content Engine: =="
$SB projects api-keys --project-ref "$REF" 2>/dev/null || true
echo "Project URL: https://$REF.supabase.co"
echo "Anon key: em Project Settings > API (anon public)."
echo "Depois: Authentication > Providers > Email ativado; Sign in / Sign up no app (primeiro usuário vira Admin)."
