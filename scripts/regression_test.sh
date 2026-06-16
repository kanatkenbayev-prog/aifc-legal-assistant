#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  AIFC Legal Assistant — Regression Test Suite
#  Запускай перед каждым деплоем: bash scripts/regression_test.sh
#  Проверяет 8 контрольных вопросов на которых ассистент спотыкался
# ═══════════════════════════════════════════════════════════════

WORKER_URL="https://aifc-legal-worker.kanatkenbayev-prog.workers.dev"
PASS=0
FAIL=0
WARN=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ask() {
  local question="$1"
  curl -s -X POST "$WORKER_URL/chat" \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"$question\"}],\"area\":\"Финансовые услуги\",\"lang\":\"ru\"}" \
    --max-time 30 2>/dev/null
}

check() {
  local label="$1"
  local response="$2"
  local must_contain="$3"    # текст ДОЛЖЕН присутствовать
  local must_not_contain="$4" # текст НЕ должен присутствовать

  local ok=true

  if [ -n "$must_contain" ] && ! echo "$response" | grep -qi "$must_contain"; then
    ok=false
    echo -e "${RED}✗ FAIL${NC} [$label] — не найдено: «$must_contain»"
    echo "   Ответ (первые 300 симв): ${response:0:300}"
    FAIL=$((FAIL+1))
    return
  fi

  if [ -n "$must_not_contain" ] && echo "$response" | grep -qi "$must_not_contain"; then
    ok=false
    echo -e "${RED}✗ FAIL${NC} [$label] — недопустимая фраза найдена: «$must_not_contain»"
    echo "   Ответ (первые 300 симв): ${response:0:300}"
    FAIL=$((FAIL+1))
    return
  fi

  echo -e "${GREEN}✓ PASS${NC} [$label]"
  PASS=$((PASS+1))
}

echo ""
echo "═══════════════════════════════════════════════════"
echo "  AIFC Legal Assistant — Regression Test"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════════════════"
echo ""

# ── ТЕСТ 1: Fund Administration — критический баг (исторический)
echo "Тест 1/8: Fund Administration — отдельная лицензия"
R=$(ask "Может ли компания с лицензией Managing CIS автоматически быть Fund Administrator для другого фонда?")
check "Fund Admin License" "$R" "Administering" "автоматически"

# ── ТЕСТ 2: Exempt Fund — аудит обязателен
echo "Тест 2/8: Exempt Fund — аудит"
R=$(ask "Нужен ли аудит для Exempt Fund в МФЦА?")
check "Exempt Fund Audit" "$R" "обязан" "не обязан"

# ── ТЕСТ 3: Резидентство МФЦА — не нерезидент РК
echo "Тест 3/8: Резидентство МФЦА"
R=$(ask "Является ли компания МФЦА нерезидентом Казахстана для налоговых целей?")
check "AIFC Residency" "$R" "резидент" "нерезидент РК"

# ── ТЕСТ 4: Дивиденды ТОО → МФЦА — не применять ст.645 НК
echo "Тест 4/8: Дивиденды ТОО→МФЦА, WHT"
R=$(ask "ТОО выплачивает дивиденды холдингу в МФЦА. Нужно ли удерживать 15% КПН у источника?")
check "Dividends WHT" "$R" "резидент" "15%"

# ── ТЕСТ 5: НДС РК — ставка 16%, не 12%
echo "Тест 5/8: Ставка НДС РК"
R=$(ask "Какая ставка НДС применяется к консалтинговым услугам компании МФЦА, оказываемым казахстанскому ТОО?")
check "VAT Rate" "$R" "16%" "12%"

# ── ТЕСТ 6: Валютный контроль — расчёты с ТОО в USD
echo "Тест 6/8: Валютный контроль МФЦА↔ТОО"
R=$(ask "Компания МФЦА хочет платить за услуги казахстанскому ТОО в долларах США. Это допустимо?")
check "FX Control" "$R" "валютн" "свободно"

# ── ТЕСТ 7: Налоговая льгота — не автоматическая
echo "Тест 7/8: Автоматическая льгота КПН"
R=$(ask "Если открою компанию в МФЦА для IT-консалтинга, получу ли автоматически 0% КПН?")
check "Auto Exemption" "$R" "substance\|Qualifying\|не автомат\|условие" "автоматически"

# ── ТЕСТ 8: Увольнение — AIFC Employment Regs, не ТК РК
echo "Тест 8/8: Трудовое право — увольнение"
R=$(ask "Как уволить сотрудника компании МФЦА? Какой закон применяется?")
check "Labor Law" "$R" "Employment Regulations" "Трудовой кодекс РК"

# ── Итог ─────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo -e "  Итог: ${GREEN}${PASS} PASS${NC} / ${RED}${FAIL} FAIL${NC}"
echo "═══════════════════════════════════════════════════"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}⛔ Деплой не рекомендован — есть регрессии. Исправь промпт и запусти снова.${NC}"
  exit 1
else
  echo -e "${GREEN}✅ Все тесты пройдены — можно деплоить.${NC}"
  exit 0
fi
