# План рефакторинга CSS в Clover

**Статус:** черновик плана, к обсуждению. Изменений в коде не вносилось.
**Дата замеров:** 2026-08-31.
**Область:** `clover-app/src/**` (React 19 + Vite).
**Автор документа:** подготовлено по результатам инструментального аудита, все числа воспроизводимы командами из раздела «Методика».

---

## 1. Резюме (TL;DR)

1. Стилей в проекте **20 963 строки** и **5 102 `!important`** (24.3% строк содержат `!important`).
2. Из них **6 263 строки и 907 `!important` лежат не в `.css`, а внутри `.js`/`.jsx`** — это скрытый слой, который не виден при чтении `src/styles/`. Основной блок — `APP_STYLES` в `src/shared/appHelpers.js`, строки 990–6610 (5 621 строка CSS в шаблонной строке).
3. **Корневая причина `!important` установлена и подтверждается порядком каскада, а не догадкой.** `src/styles/clover-theme.css` подключается в `<head>` (через `src/main.jsx`), а `APP_STYLES` рендерится React-ом как `<style>` **внутри `<body>`** (`src/App.jsx:300`, `:1912`, `:2044`). При равной специфичности выигрывает то, что позже в документе, то есть `APP_STYLES`. Единственный способ для темы «победить» — `!important`. Отсюда 4 095 `!important` в `clover-theme.css` — это не небрежность, а вынужденное следствие архитектуры подключения.
4. Дальше эскалация пошла вглубь: `MATRIX_STOREFRONT_CARD_STYLES` (`src/screens/client/matrixStorefrontCardStyles.js`) вставляется в `document.head` в `useEffect` и содержит **73% строк с `!important`**, а inline-`<style>` в `src/screens/client/OrderEditor.jsx:872–1246` — **67%**. Комментарии в коде это прямо фиксируют: `/** Injected last when matrix panel mounts — beats APP_STYLES / generic .product-card. */`.
5. Боль «одну правку приходится искать в шести блоках» подтверждена численно: `.product-price` описан в **45 отдельных правилах**, разбросанных по **5 источникам** и **5 медиа-контекстам**; `.unit-choice` — в **27 правилах** по **5 источникам**.
6. Брейкпоинтов **28 различных условий `@media`**, из них **20 различных px-значений**. Граница «мобильный/десктоп» одновременно проходит и по `820/821px`, и по `900/901px` — это самостоятельный источник багов.
7. Цветовых литералов **1 667 штук**, **271 уникальный** hex + **121 уникальный** `rgba()`, при том что токены уже есть (91 определение `--*`), но `var()` используется всего 440 раз. Пример: `--clover-green: #5b9d57` объявлена, а сам `#5b9d57` вписан руками 48 раз.
8. `src/Catalog.css` (911 строк) **не импортируется ниоткуда** — мёртвый код.

**Цель плана:** довести до состояния, когда однострочная визуальная правка (выровнять цену, выровнять кнопки единиц измерения) делается **в одном месте**, а не в 14 блоках, и при этом не ломает соседей.

---

## 2. Методика (как воспроизвести все числа)

Все команды запускаются из `/opt/clover/clover-app`. Ни одна из них не меняет файлы.

**2.1 Базовые метрики по `.css`:**

```bash
for f in $(find src -name "*.css" | sort); do
  echo "$f | $(wc -l < "$f") | $(grep -o '!important' "$f" | wc -l) | $(grep -c '@media' "$f")"
done
```

**2.2 Извлечение CSS, спрятанного в JS** (в `/tmp`, исходники не трогаются):

```bash
mkdir -p /tmp/cssjs && node -e "
const fs=require('fs');
function dump(file, marker, out){
  const src=fs.readFileSync(file,'utf8');
  const i=src.indexOf(marker); const start=src.indexOf('\`',i)+1;
  let j=start; while(j<src.length){ if(src[j]==='\\\\'){j+=2;continue;} if(src[j]==='\`')break; j++; }
  fs.writeFileSync(out, src.slice(start,j));
}
dump('src/shared/appHelpers.js','export const APP_STYLES','/tmp/cssjs/APP_STYLES.css');
dump('src/screens/client/matrixStorefrontCardStyles.js','export const MATRIX_STOREFRONT_CARD_STYLES','/tmp/cssjs/MATRIX.css');
dump('src/screens/client/OrderEditor.jsx','<style>{\`','/tmp/cssjs/OrderEditor.css');
"
```

**2.3 Разбор всех правил (селектор + медиа-контекст) — база для остальных таблиц:**

```bash
perl -0777 -ne '
  s{/\*.*?\*/}{}gs; my $f=$ARGV; my @stack; my $buf="";
  for my $c (split //, $_) {
    if ($c eq "{") { my $p=$buf; $p=~s/^\s+|\s+$//g; $p=~s/\s+/ /g;
      if ($p=~/^\@/) { push @stack,$p }
      else { my $ctx=join(" >> ", grep {!/^SEL::/} @stack); $ctx="(base)" unless $ctx;
             print "$f\t$p\t$ctx\n"; push @stack,"SEL::$p" }
      $buf="";
    } elsif ($c eq "}") { pop @stack; $buf="" } else { $buf .= $c }
  }
' $(find src -name "*.css") /tmp/cssjs/*.css > /tmp/all_rules.tsv
wc -l /tmp/all_rules.tsv
```

**2.4 Топ дублируемых целевых селекторов** (последний компонент цепочки — то, что реально правит инженер):

```bash
awk -F'\t' '{n=split($2,s,","); for(i=1;i<=n;i++){x=s[i]; gsub(/^ +| +$/,"",x);
  if(x=="" || x ~ /^(from|to|[0-9]+%)$/) continue;
  m=split(x,pp," "); t=pp[m]; sub(/::?[a-z-]+(\(.*)?$/,"",t);
  if(t=="" || t !~ /^\./) continue; print t"\t"$1"\t"$3}}' /tmp/all_rules.tsv > /tmp/all_tok.tsv
awk -F'\t' '{b[$1]++; mqk[$1 SUBSEP $3]=1; fk[$1 SUBSEP $2]=1}
  END{for(k in mqk){split(k,a,SUBSEP); mc[a[1]]++}
      for(k in fk){split(k,a,SUBSEP); fc[a[1]]++}
      for(k in b) printf "%s\t%d\t%d\t%d\n",k,b[k],mc[k],fc[k]}' /tmp/all_tok.tsv \
  | sort -t$'\t' -k2 -rn | head -20
```

**2.5 Брейкпоинты:**

```bash
cat $(find src -name '*.css') /tmp/cssjs/*.css | grep -o '@media[^{]*' \
  | sed 's/[[:space:]]\+/ /g; s/ $//' | sort | uniq -c | sort -rn
```

**2.6 Цвета и токены:**

```bash
cat $(find src -name '*.css') /tmp/cssjs/*.css | grep -oiE '#[0-9a-f]{3,8}\b' | wc -l
cat $(find src -name '*.css') /tmp/cssjs/*.css | grep -oiE 'rgba?\([^)]*\)' | tr -d ' ' | sort -u | wc -l
grep -rhoE '^[[:space:]]*--[A-Za-z0-9_-]+[[:space:]]*:' src --include=*.css | sed 's/[[:space:]]//g; s/:$//' | sort -u | wc -l
cat $(find src -name '*.css') /tmp/cssjs/*.css | grep -oE 'var\(--' | wc -l
```

**2.7 Импорты CSS:**

```bash
grep -rn "\.css" src --include=*.jsx --include=*.js | grep -i import | sort
grep -rn "<style>" src --include=*.jsx | sort
```

---

## 3. Измерения

### 3.1 Файлы `.css`

| Файл | Строк | `!important` | Правил (блоков) | Селекторов | `@media` |
|---|---:|---:|---:|---:|---:|
| `src/styles/clover-theme.css` | 9 810 | 4 095 | 1 155 | 1 655 | 50 |
| `src/screens/storefront/storefront.css` | 2 049 | 15 | 408 | 491 | 7 |
| `src/App.css` | 1 344 | 80 | 267 | 303 | 16 |
| `src/Catalog.css` | 911 | 4 | 137 | 144 | 6 |
| `src/components/AddressManager.css` | 205 | 0 | 28 | 34 | 2 |
| `src/components/CustomProductForm.css` | 189 | 1 | 26 | 32 | 1 |
| `src/components/ClientProfile.css` | 161 | 0 | 23 | 25 | 2 |
| `src/index.css` | 31 | 0 | 4 | 10 | 0 |
| **Итого `.css`** | **14 700** | **4 195** | **2 048** | **2 684** | **84** |

Плотность `!important` в `src/styles/clover-theme.css` — **41.7%** строк.

### 3.2 Скрытый слой: CSS внутри JS/JSX

Это не второстепенная деталь: по объёму это второй по величине файл стилей в проекте, но он не находится ни поиском по `*.css`, ни stylelint-ом, ни подсветкой синтаксиса.

| Источник | Диапазон строк | Строк CSS | `!important` | Доля строк с `!important` | Правил | `@media` |
|---|---|---:|---:|---:|---:|---:|
| `src/shared/appHelpers.js` → `APP_STYLES` | 990–6610 | 5 621 | 461 | 8% | 1 062 | 15 |
| `src/screens/client/OrderEditor.jsx` → inline `<style>` | 872–1246 | 375 | 251 | **67%** | 35 | 4 |
| `src/screens/client/matrixStorefrontCardStyles.js` → `MATRIX_STOREFRONT_CARD_STYLES` | 2–268 | 267 | 195 | **73%** | 26 | 2 |
| **Итого CSS-in-JS** | | **6 263** | **907** | | **1 123** | **21** |

**Общий итог по проекту: 20 963 строки CSS, 5 102 `!important`, 3 171 правило, 4 062 селектора, 105 блоков `@media`.**

### 3.3 Порядок каскада — то, что всё объясняет

| Слой | Где подключается | Куда попадает в DOM | Позиция в каскаде |
|---|---|---|---|
| `src/index.css` | `src/main.jsx:3` | `<head>` | 1 (слабейший) |
| `src/styles/clover-theme.css` | `src/main.jsx:4` | `<head>` | 2 |
| `src/App.css` | `src/App.jsx:2` | `<head>` (Vite) | 3 |
| `src/screens/storefront/storefront.css` | `src/screens/storefront/StorefrontApp.jsx:10` | `<head>` (Vite) | 3 |
| `*.css` компонентов | `src/components/*.jsx:2` | `<head>` (Vite) | 3 |
| `MATRIX_STOREFRONT_CARD_STYLES` | `src/screens/client/ClientMatrixPanel.jsx:41–54`, `document.head.appendChild` в `useEffect` | конец `<head>`, **в рантайме** | 4 |
| `APP_STYLES` | `src/App.jsx:300`, `:1912`, `:2044` — `<style>{APP_STYLES}</style>` | **`<body>`**, внутри React-дерева | 5 |
| inline `<style>` | `src/screens/client/OrderEditor.jsx:872` | **`<body>`**, глубже в дереве | 6 (сильнейший) |

Ключевой факт: React 19 поднимает `<style>` в `<head>` **только** при наличии атрибута `precedence`. Здесь его нет, поэтому `<style>{APP_STYLES}</style>` остаётся в теле документа и при равной специфичности бьёт всё, что пришло из `<head>`.

`src/styles/clover-theme.css` по названию и по комментарию в шапке (`/* Clover visual system: tokens + refresh overrides (поверх APP_STYLES / App.css). */`) задуман как **верхний** слой, но физически подключён **вторым снизу**. Разрыв между замыслом и реальностью закрыт четырьмя тысячами `!important`.

### 3.4 Топ-20 дублируемых селекторов

Считается конечный компонент цепочки — то, что инженер ищет, когда правит вид элемента. «Блоков» — сколько отдельных правил его задают; «медиа-контекстов» — сколько разных `@media` (включая базовый) участвуют; «источников» — по скольким файлам/строкам-шаблонам это размазано.

| # | Селектор | Блоков | Медиа-контекстов | Источников |
|---:|---|---:|---:|---:|
| 1 | `.product-code` | 49 | 4 | 4 |
| 2 | `.secondary-button` | 47 | 6 | 3 |
| 3 | `.quantity-input` | 45 | 4 | 4 |
| 4 | `.product-price` | 45 | 5 | 5 |
| 5 | `.primary-button` | 42 | 5 | 3 |
| 6 | `.product-card-controls` | 38 | 4 | 4 |
| 7 | `.product-image-wrap` | 37 | 6 | 4 |
| 8 | `.category-button` | 36 | 4 | 4 |
| 9 | `.client-matrix-card` | 32 | 5 | 3 |
| 10 | `.catalog-search` | 30 | 4 | 4 |
| 11 | `.product-card` | 28 | 5 | 4 |
| 12 | `.unit-choice` | 27 | 4 | 5 |
| 13 | `.category-list` | 27 | 4 | 4 |
| 14 | `.quantity-control` | 25 | 4 | 5 |
| 15 | `.unit-choice.unit-choice-single` | 22 | 4 | 4 |
| 16 | `.product-image-placeholder` | 21 | 4 | 3 |
| 17 | `.category-button.active` | 21 | 2 | 4 |
| 18 | `.quantity-input-wrap` | 19 | 4 | 4 |
| 19 | `.product-grid` | 19 | 8 | 3 |
| 20 | `.client-order-catalog-toolbar` | 19 | 3 | 3 |

Для полноты по тегам (без классов) картина ещё хуже: `button` встречается как цель в **158** блоках, `input` — в 50, `h2` — в 48. Отдельно: `button { min-height }` задаётся в **75** разных правилах, `button { width }` — в 74, `button { font-size }` — в 65.

**Разбор случая «выровнять цену»** — почему правка занимает полдня. `.product-price` (45 блоков) распределён так:

| Источник | Медиа-контекст | Блоков |
|---|---|---:|
| `src/styles/clover-theme.css` | `@media (max-width: 820px)` | 8 |
| `src/styles/clover-theme.css` | `@media (min-width: 901px)` | 7 |
| `src/styles/clover-theme.css` | `(base)` | 6 |
| `APP_STYLES` (`appHelpers.js`) | `(base)` | 6 |
| `APP_STYLES` (`appHelpers.js`) | `@media (max-width: 900px)` | 5 |
| `APP_STYLES` (`appHelpers.js`) | `@media (max-width: 480px)` | 3 |
| `src/styles/clover-theme.css` | `@media (max-width: 900px)` | 3 |
| `src/Catalog.css` | `(base)` | 1 (мёртвый файл) |
| `APP_STYLES` (`appHelpers.js`) | `@media (min-width: 901px)` | 1 |
| `APP_STYLES` (`appHelpers.js`) | `@media (max-width: 820px)` | 1 |
| `MATRIX_STOREFRONT_CARD_STYLES` | `(base)` / `@media (max-width: 900px)` / `@media (min-width: 901px)` | 3 |
| `OrderEditor.jsx` inline | `@media (min-width: 901px)` | 1 |

**14 различных пар (источник × медиа-контекст).** Ощущение «шести дублей» — заниженная оценка.

Аналогично `.unit-choice` (кнопки единиц измерения): `clover-theme.css` — 16 блоков, `APP_STYLES` — 7, `MATRIX_STOREFRONT_CARD_STYLES` — 2, `OrderEditor.jsx` inline — 1, `Catalog.css` — 1.

### 3.5 Горячие точки специфичности

Из 2 684 селекторов в `.css`-файлах:

| Метрика | Значение | Доля |
|---|---:|---:|
| Селекторов, начинающихся с `.clover-app` | 1 163 | 43% |
| Содержат `:not(...)` | 213 | 7.9% |
| Содержат ≥2 `:not(...)` | 33 | 1.2% |
| Содержат ≥3 `:not(...)` | 4 | 0.1% |
| ≥4 классов в цепочке | 460 | 17% |
| ≥5 классов в цепочке | 254 | 9.5% |
| ≥6 классов в цепочке | 129 | 4.8% |
| ≥4 уровня вложенности | 475 | 18% |
| ≥5 уровней вложенности | 192 | 7.2% |

Распределение по числу классов в селекторе: `1 → 1125`, `2 → 707`, `3 → 367`, `4 → 206`, `5 → 125`, `6 → 89`, `7 → 36`, `8 → 4`.

Самые длинные цепочки (первые 6):

```
.clover-app .page-content-client .embedded-catalog.client-order-catalog .product-card:not(.product-card-list) .quantity-input::-webkit-outer-spin-button
.clover-app .page-content-client .embedded-catalog.client-order-catalog .product-grid:not(.product-grid-list) .product-card:not(.product-card-list)
.clover-app .page-content-client .embedded-catalog .product-grid:not(.product-grid-list) .unit-choice.unit-choice-single button:last-child
.clover-app .page-content-client .embedded-catalog.client-order-catalog .product-card:not(.product-card-list) .quantity-control > button
.clover-app input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not(.quantity-input):focus-visible
.clover-app .page-content-client .embedded-catalog.client-order-catalog .product-grid:not(.product-grid-list) .product-image-placeholder
```

Специфичность верхней строки — `(0, 7, 1)`. Чтобы что-то переопределить поверх такого, остаётся только `!important`. Это второй, вторичный механизм эскалации: сначала `!important` для обхода порядка каскада, потом длинные цепочки для обхода чужих `!important`, потом `!important` поверх длинных цепочек.

### 3.6 Импорты и мёртвый код

| Файл | Импортируется из | Живой |
|---|---|---|
| `src/index.css` | `src/main.jsx:3` | да |
| `src/styles/clover-theme.css` | `src/main.jsx:4` | да |
| `src/App.css` | `src/App.jsx:2` | да |
| `src/screens/storefront/storefront.css` | `src/screens/storefront/StorefrontApp.jsx:10` | да |
| `src/components/AddressManager.css` | `src/components/AddressManager.jsx:2` | да |
| `src/components/ClientProfile.css` | `src/components/ClientProfile.jsx:2` | да |
| `src/components/CustomProductForm.css` | `src/components/CustomProductForm.jsx:2` | да |
| `src/Catalog.css` | **никем** | **нет — мёртвый** |

`src/Catalog.css` — 911 строк, 137 правил, 111 hex-литералов. Файла `src/Catalog.jsx` не существует; в `src/**/*.jsx` нет ни одного импорта этого файла. При этом он содержит определения `.product-price` и `.unit-choice`, которые при чтении легко принять за действующие, — то есть он не просто мёртвый, он активно вводит в заблуждение при отладке.

`docs/architecture/` до этого документа не существовало.

### 3.7 Дубли и конфликты свойств

Внутри одного блока одно и то же свойство объявлено дважды и более в **12 блоках**:

| Файл | Селектор | Контекст | Дубли |
|---|---|---|---|
| `src/styles/clover-theme.css` | `.order-thankyou-mobile` | `(base)` | `min-height` ×5 |
| `src/App.css` | `.login-page` | `(base)` | `padding-top` ×2, `padding-bottom` ×2, `height` ×2, `padding-right` ×2, `padding-left` ×2 |
| `src/App.css` | `.login-page` | `@media (max-height: 700px)` | `padding-bottom` ×2, `padding-top` ×2 |
| `src/App.css` | `.login-page` | `@media (min-width: 821px) and (min-height: 780px)` | `padding-top` ×2 |
| `src/App.css` | `.login-page` | `@media (max-width: 820px), (display-mode: standalone), (display-mode: fullscreen)` | `padding-top` ×2 |
| `src/App.css` | `.login-page` | `@media (max-height: 500px) and (orientation: landscape)` | `padding-top` ×2 |
| `src/App.css` | `html.login-lock, html.login-lock body, html.login-lock #root` | `(base)` | `height` ×2 |
| `src/App.css` | `.page` | `(base)` | `min-height` ×2 |
| `src/index.css` | `html, body` | `(base)` | `min-height` ×2 |
| `src/screens/storefront/storefront.css` | `html.sf-root, body.sf-body` | `(base)` | `color-scheme` ×2 |
| `src/screens/storefront/storefront.css` | `html.sf-catalog-lock, ... #root` | `(base)` | `height` ×2 |
| `src/styles/clover-theme.css` | `body` | `(base)` | `min-height` ×2 |

Важная оговорка: часть этих дублей — **осознанный fallback-приём** (`min-height: 100vh; min-height: 100dvh`), их трогать не нужно. Реально подозрительны `.order-thankyou-mobile { min-height ×5 }` и блок `.login-page` в `App.css`, где пять свойств задублированы подряд.

Существенно опаснее другой класс дублей: **одно и то же свойство для одного и того же селектора, объявленное в разных блоках одного файла и одного медиа-контекста** — таких ключей `(файл, селектор, контекст, свойство)` **104**. Пример: селектор `.clover-app .page-content-client .embedded-catalog.client-order-catalog .product-grid:not(.product-grid-list) .product-image-wrap, ...` внутри `@media (min-width: 901px)` задаёт `width`, `height`, `max-height`, `margin`, `overflow`, `flex`, `border`, `border-radius`, `background`, `aspect-ratio` дважды — двумя блоками, разнесёнными по файлу. Здесь редактор физически не может увидеть оба места одновременно.

### 3.8 Брейкпоинты

28 различных условий `@media`, 20 различных px-значений.

| Условие | Использований |
|---|---:|
| `@media (max-width: 820px)` | 23 |
| `@media (max-width: 900px)` | 16 |
| `@media (min-width: 901px)` | 12 |
| `@media (max-width: 700px)` | 7 |
| `@media (max-width: 640px)` | 5 |
| `@media (min-width: 821px)` | 4 |
| `@media (max-width: 760px)` | 4 |
| `@media (max-width: 520px)` | 4 |
| `@media (prefers-reduced-motion: reduce)` | 3 |
| `@media (max-width: 720px)` | 3 |
| `@media (max-width: 360px)` | 3 |
| `@media (max-width: 1100px)` | 3 |
| `@media (max-width: 980px)` | 2 |
| `@media (max-height: 700px)` | 2 |
| `@media print` | 1 |
| `@media (prefers-reduced-motion:reduce)` | 1 |
| `@media (min-width: 900px)` | 1 |
| `@media (min-width: 821px) and (min-height: 780px)` | 1 |
| `@media (min-width: 1440px)` | 1 |
| `@media (max-width: 850px)` | 1 |
| `@media (max-width: 820px), (display-mode: standalone), (display-mode: fullscreen)` | 1 |
| `@media(max-width:800px)` | 1 |
| `@media (max-width: 560px)` | 1 |
| `@media(max-width:500px)` | 1 |
| `@media (max-width: 480px)` | 1 |
| `@media (max-width: 1180px)` | 1 |
| `@media (max-height: 500px) and (orientation: landscape)` | 1 |
| `@media (hover: none)` | 1 |

Находки:

- **Две конкурирующие границы «мобильный/десктоп»**: `820/821px` (27 использований) и `900/901px` (29 использований). В диапазоне **821–900px** элемент одновременно «десктопный» по одному набору правил и «мобильный» по другому. Именно здесь живут самые неприятные баги вёрстки.
- `@media (min-width: 900px)` (1 раз) перекрывается с `@media (max-width: 900px)` (16 раз) — на ровно 900px срабатывают оба.
- Соседние значения без внятного различия: `480/500/520/560`, `640/700/720/760`, `800/820/850`, `900/980`, `1100/1180`.
- Разное форматирование одного и того же: `@media(max-width:800px)` и `@media (max-width: 820px)`; `prefers-reduced-motion:reduce` и `prefers-reduced-motion: reduce`. Это ломает поиск по проекту.

### 3.9 Токены против хардкода

| Метрика | Значение |
|---|---:|
| Определений `--*` в `.css` | 91 |
| Различных переменных, используемых через `var()` | 84 |
| Всего вызовов `var(--...)` (включая CSS-in-JS) | 440 |
| Hex-литералов всего | 1 667 |
| **Различных hex-литералов** | **271** |
| `rgba()`/`rgb()` всего | 270 |
| Различных `rgba()`/`rgb()` | 121 |
| **Итого различных цветовых литералов** | **392** |

Распределение по файлам:

| Файл | hex-литералов | `var(--` | определений `--*` |
|---|---:|---:|---:|
| `src/styles/clover-theme.css` | 506 | 322 | 109 |
| `src/screens/storefront/storefront.css` | 179 | 70 | 22 |
| `src/App.css` | 153 | 4 | 0 |
| `src/Catalog.css` | 111 | 0 | 0 |
| `APP_STYLES` (`appHelpers.js`) | 615 | 41 | 0 |
| `src/components/AddressManager.css` | 30 | 0 | 0 |
| `src/components/CustomProductForm.css` | 27 | 0 | 0 |
| `src/components/ClientProfile.css` | 21 | 0 | 0 |
| `MATRIX_STOREFRONT_CARD_STYLES` | 7 | 0 | 0 |
| `src/index.css` | 4 | 0 | 0 |

Самые частые литералы: `#fff` ×157, `#5b9d57` ×48, `#4f9a52` ×45, `#ffffff` ×37, `#f4f8f2` ×32, `#d5dfd2` ×26, `#394639` ×26, `#386f37` ×23, `#fbfdfb` ×22, `#6b6f6b` ×19.

Здесь три отдельные проблемы:

1. **Токен есть, но им не пользуются.** `--clover-green: #5b9d57` объявлена в `src/styles/clover-theme.css:9`, а голый `#5b9d57` вписан 48 раз. То же для `--clover-green-deep: #386f37` (23 хардкода). Смена фирменного зелёного сегодня — это 70+ правок вручную.
2. **`#fff` и `#ffffff` — один цвет, две записи** (157 + 37). Любой `grep` по цвету заведомо неполон.
3. **`--muted` используется, но нигде не определена** — `src/styles/clover-theme.css:8191` и `:8640` содержат `color: var(--muted, #5b675c)`. Работает только fallback. Это уже дефект, а не стилистика.

Определены, но ни разу не использованы (кандидаты на удаление): `--catalog-add-card-row-h`, `--catalog-order-mobile-chrome-h`, `--clover-disabled-bg`, `--clover-disabled-text`, `--clover-header-offset`, `--clover-info-bg`, `--clover-info-text`, `--clover-l3-hover-bg`.

### 3.10 Churn: цена проблемы в коммитах

```bash
git log --oneline -- src/styles/clover-theme.css | wc -l   # 66
git log --oneline | wc -l                                   # 229
```

`src/styles/clover-theme.css` менялся в **66 из 229 коммитов (29%)**. `src/screens/storefront/storefront.css` — в 29. Это самый горячий файл в репозитории, и одновременно самый рискованный для правки. Такое сочетание и есть определение технического долга: максимальная частота изменений при максимальной цене ошибки.

---

## 4. Диагноз: откуда взялись 5 102 `!important`

Не «разработчики ленились». Механизм воспроизводится по шагам и подтверждается замерами:

**Шаг 1. Базовый слой оказался внизу каскада.** `clover-theme.css` задуман как слой «поверх» (комментарий в шапке файла), но подключён через `main.jsx` в `<head>`, тогда как `APP_STYLES` рендерится в `<body>`. При равной специфичности выигрывает `APP_STYLES`. Единственный доступный рычаг для темы — `!important`. Результат: 4 095 `!important` в одном файле, из них 2 276 в базовых правилах и 1 818 внутри `@media`.

**Шаг 2. Медиа-запросы не повышают приоритет.** В CSS `@media` не добавляет специфичности. Поэтому правило внутри `@media (max-width: 820px)` в `clover-theme.css` **не** перебивает базовое правило из `APP_STYLES`. Значит, каждый мобильный оверрайд тоже обязан нести `!important`. Отсюда 1 818 `!important` внутри `@media` — 44% всех `!important` файла.

**Шаг 3. Эскалация специфичности.** Когда `!important` появился с обеих сторон, побеждает более специфичный селектор. Так родились цепочки вида `.clover-app .page-content-client .embedded-catalog.client-order-catalog .product-grid:not(.product-grid-list) .product-image-wrap` — 129 селекторов с шестью и более классами, 213 с `:not()`. `:not()` здесь используется не по назначению (описать «какой элемент»), а как **инструмент повышения веса** и как способ исключить чужое правило, до которого нельзя дотянуться иначе.

**Шаг 4. Гонка порядка вставки.** Когда и `!important`, и специфичность исчерпаны, остаётся вставить стиль позже всех. `MATRIX_STOREFRONT_CARD_STYLES` вставляется в `document.head` из `useEffect` — комментарий в файле честно объясняет цель: «Injected last when matrix panel mounts — beats APP_STYLES». Плотность `!important` там 73%. Финальная стадия — `<style>` прямо в JSX `OrderEditor.jsx` с 67% `!important`.

**Шаг 5. Копирование блока вместо правки.** Когда «где именно это переопределяется» стало неотслеживаемым, дешевле дописать новый блок, чем найти старый. Отсюда 45 блоков на `.product-price` и 104 случая, когда одно свойство одного селектора в одном медиа-контексте задано дважды в разных местах файла.

**Вывод:** `!important` — не болезнь, а симптом. Лечение — не удалять `!important`, а **исправить порядок каскада**, чтобы он перестал быть нужным. Массовое удаление `!important` без этого исправления мгновенно сломает вёрстку, потому что `APP_STYLES` немедленно перехватит все спорные свойства.

---

## 5. Целевая архитектура

### 5.1 Порядок слоёв через `@layer`

`@layer` решает ровно ту проблему, которая здесь болит: **приоритет определяется принадлежностью к слою, а не специфичностью и не порядком в документе**. Правило из более позднего слоя выигрывает у более раннего, даже если его селектор — одиночный класс, а у конкурента — цепочка из семи. `!important` перестаёт быть нужным как механизм.

Объявляем порядок один раз, в самом начале `src/index.css`:

```css
@layer reset, tokens, base, layout, components, screens, overrides;
```

| Слой | Содержимое | Кто пишет |
|---|---|---|
| `reset` | нормализация, `box-sizing`, шрифт | почти никогда не меняется |
| `tokens` | только `:root { --* }`, никаких селекторов | дизайн-система |
| `base` | голые теги: `button`, `input`, `h1..h3`, `a` | редко |
| `layout` | сетки, каркас страницы, `.page`, `.page-content-*` | редко |
| `components` | переиспользуемые: `.product-card`, `.quantity-control`, `.unit-choice`, `.primary-button` | часто |
| `screens` | специфика экрана: storefront / client / manager / admin | часто |
| `overrides` | временный карантин для мигрирующего кода | должен стремиться к нулю |

Свойства слоёв, важные для этой миграции:

- Код **вне** любого слоя сильнее кода **внутри** любого слоя. Значит, немигрированный `APP_STYLES` продолжит работать как раньше и ничего не сломает, пока мы переносим файлы в слои. Это позволяет мигрировать по одному файлу.
- Обёртка существующего файла целиком: `@import "./x.css" layer(components);` — переносит его в слой **без единой правки внутри файла**. Ровно то, что нужно для обратимых шагов.
- `!important` внутри слоёв инвертирует порядок слоёв. Поэтому `!important` нельзя оставлять «на всякий случай»: после перевода файла в слой каждый оставшийся `!important` становится ловушкой. Их убирают в том же шаге, что и перевод слоя, а не отдельно.

### 5.2 Слой токенов

Единственное место, где допустим цветовой литерал, — `src/styles/tokens.css`. Всё остальное — только `var()`.

```css
@layer tokens {
  :root {
    /* brand */
    --clover-green: #5b9d57;
    --clover-green-deep: #386f37;
    /* surfaces */
    --surface-app: #f4f8f2;
    --surface-card: #fbfdfb;
    /* text */
    --text-strong: #394639;
    --text-muted: #6b6f6b;
    /* spacing / radii / sizes */
    --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
    --radius-card: 14px;
    --control-h: 44px;
  }
}
```

Объём работы виден из замеров: 392 различных цветовых литерала нужно свести к нескольким десяткам токенов. Начинать следует с топ-10 (`#fff`, `#5b9d57`, `#4f9a52`, `#ffffff`, `#f4f8f2`, `#d5dfd2`, `#394639`, `#386f37`, `#fbfdfb`, `#6b6f6b`) — они дают 435 из 1 667 вхождений при десяти заменах.

Отдельно: определить `--muted` (сейчас используется без определения) и удалить 8 неиспользуемых переменных.

### 5.3 Один канонический набор брейкпоинтов

Вместо 20 значений — четыре, и **mobile-first** (только `min-width`), чтобы исключить пары `820/821` и `900/901`:

| Имя | Значение | Назначение |
|---|---|---|
| `sm` | `480px` | узкий телефон → обычный телефон |
| `md` | `768px` | телефон → планшет |
| `lg` | `1024px` | планшет → десктоп |
| `xl` | `1440px` | широкий десктоп |

Переход на mobile-first — самая рискованная часть всей затеи, потому что нынешняя граница «мобильный/десктоп» проходит по 820/900px, а `md: 768px` и `lg: 1024px` её не совпадают. Поэтому: **на первом проходе разрешается зафиксировать текущие границы** как `--bp-mobile: 900px` и переписать всё в один стиль (`max-width: 900px` / `min-width: 901px`), убрав 820/821 и остальные 18 значений. Смена самих чисел — отдельная задача после того, как их станет одно.

`@custom-media` требует PostCSS-плагина; без него значения фиксируются в комментарии-контракте и проверяются линтером (`media-feature-name-value-allowed-list`).

### 5.4 Разбиение файлов по владельцу

Структура повторяет то, что уже есть в `src/screens/`, — придумывать новую таксономию не надо:

```
src/styles/
  layers.css              @layer ... ;  единственный источник порядка
  tokens.css              tokens
  reset.css               reset
  base.css                base  (button, input, h1..h3)
  layout.css              layout
  components/
    product-card.css      components
    quantity-control.css  components
    unit-choice.css       components
    buttons.css           components
    catalog-search.css    components
  screens/
    storefront.css        screens  (← src/screens/storefront/storefront.css)
    client.css            screens  (← части clover-theme.css + APP_STYLES + OrderEditor + matrix)
    manager.css           screens
    admin.css             screens
  legacy/
    clover-theme.legacy.css   overrides  (уменьшается до нуля)
    app-styles.legacy.css     overrides  (уменьшается до нуля)
```

Правило владения: **у каждого класса ровно один файл-владелец**. `.product-price` живёт в `components/product-card.css` — и только там. Если клиентскому кабинету нужен другой размер цены, он задаёт это не новым селектором, а токеном-модификатором на контейнере:

```css
/* components/product-card.css — единственное место, где определён размер цены */
@layer components {
  .product-card { --price-size: 18px; }
  .product-price { font-size: var(--price-size); }
}

/* screens/client.css — контекстная настройка без роста специфичности */
@layer screens {
  .page-content-client .product-card { --price-size: 16px; }
}
```

Это и есть искомый результат: «выровнять цену» — одна правка в `components/product-card.css`, а не обход 14 пар (источник × медиа).

Разделение по объёму (ориентир из замеров разбивки селекторов по префиксам): `.clover-app*` — 1 163 селектора (кабинет + менеджер + админка), `.sf-*` — около 130 (витрина), `.login-*` — около 60 (аутентификация). То есть львиная доля работы приходится на `screens/client.css` и `screens/manager.css`.

### 5.5 Что делать с CSS-in-JS

Строковые CSS-константы должны стать `.css`-файлами. Это не косметика: 6 263 строки стилей сейчас невидимы для линтера, для sourcemap, для поиска по `*.css` и для code review. Но это же и самый опасный шаг, потому что именно их позиция в DOM держит текущую вёрстку. Порядок:

1. Сначала перевести все `.css`-файлы в `@layer` (немигрированный `APP_STYLES` остаётся вне слоёв и продолжает выигрывать — вёрстка не меняется).
2. Затем перенести `APP_STYLES` в `.css`-файл, положить его в слой `overrides` (самый сильный) — приоритет сохраняется, DOM-инъекция исчезает.
3. Затем постепенно переносить куски из `overrides` в `components`/`screens`, снимая `!important`.

Промежуточный вариант с меньшим риском, если нужно быстро: оставить `<style>`, но добавить React-атрибут `precedence` — React 19 поднимет тег в `<head>`. Однако это **меняет** порядок каскада и потому требует полного визуального прогона; отдельным шагом делать не рекомендуется.

---

## 6. Поэтапная миграция

Принципы: каждый этап отдельно поставляется, отдельно откатывается, помещается в один обозримый ревью. Никаких этапов, которые «имеют смысл только вместе со следующим».

### Этап 0 — Измерение и инструментарий (риск: нулевой)

**Что делается:** ни строчки CSS не меняется.

- Скрипт `scripts/css/audit.mjs`, воспроизводящий все команды раздела 2 и печатающий сводку (строки, `!important`, топ дублей, брейкпоинты, цветовые литералы) в JSON и в текст.
- Фиксируется baseline: `!important = 5102`, строк CSS `= 20963`, различных брейкпоинтов `= 28`, различных цветовых литералов `= 392`.
- `npm run css:audit` в `package.json`.

**Проверка:** скрипт на текущем `HEAD` печатает те же числа, что в этом документе.
**Откат:** удалить скрипт.
**Оценка:** 0.5–1 день.

### Этап 1 — Каркас визуальных тестов (риск: нулевой)

**Что делается:** Playwright-снапшоты **до** любых правок CSS. `playwright-core@1.49.1` уже есть в `node_modules`. Детали — в разделе 7.

**Проверка:** два прогона подряд на неизменном коде дают 0 расхождений (тесты стабильны, нет ложных срабатываний от анимаций).
**Откат:** удалить каталог тестов.
**Оценка:** 2–3 дня (основное время — стабилизация флака: анимации, шрифты, скелетоны, данные).

**Этапы 0 и 1 обязательны до любого касания CSS.** Без них дальше идти нельзя.

### Этап 2 — Удаление мёртвого кода (риск: очень низкий)

**Что делается:**

- Удалить `src/Catalog.css` (911 строк, ни одного импорта).
- Удалить 8 неиспользуемых переменных `--*`.
- Определить `--muted` в токенах со значением текущего fallback `#5b675c`, чтобы `var(--muted, #5b675c)` в `clover-theme.css:8191` и `:8640` перестал быть скрытым дефектом.

**Проверка:** визуальные снапшоты Этапа 1 — ноль расхождений (по определению: файл не подключён, переменные не читаются).
**Откат:** `git revert` одного коммита.
**Оценка:** 0.5 дня. **Эффект:** −911 строк (−4.3% объёма) при нулевом риске. Хороший первый коммит для проверки самой процедуры.

### Этап 3 — Объявление слоёв, без перемещения кода (риск: низкий)

**Что делается:**

- В начало `src/index.css` добавить `@layer reset, tokens, base, layout, components, screens, overrides;`.
- Ни один существующий файл не переносится в слой. Всё остаётся вне слоёв.

**Проверка:** снапшоты — ноль расхождений. Объявление слоёв без наполнения не меняет каскад.
**Откат:** удалить одну строку.
**Оценка:** 1 час. Это «холостой выстрел», который подтверждает, что порядок слоёв согласован и попал в прод без последствий.

### Этап 4 — Перенос листьев в слои (риск: низкий, по одному файлу за коммит)

**Что делается:** по одному файлу за раз, начиная с самых безобидных:

| Порядок | Файл | Строк | `!important` | Целевой слой |
|---:|---|---:|---:|---|
| 1 | `src/index.css` | 31 | 0 | `reset` |
| 2 | `src/components/ClientProfile.css` | 161 | 0 | `components` |
| 3 | `src/components/AddressManager.css` | 205 | 0 | `components` |
| 4 | `src/components/CustomProductForm.css` | 189 | 1 | `components` |
| 5 | `src/screens/storefront/storefront.css` | 2 049 | 15 | `screens` |
| 6 | `src/App.css` | 1 344 | 80 | `layout` |

Механика: содержимое файла оборачивается в `@layer <name> { ... }` (или подключается через `@import ... layer(<name>)`), внутри — **никаких других правок**. Диффу полагается быть двумя строками плюс сдвиг отступов; для ревью удобно смотреть с `git diff -w`.

Первые четыре файла содержат суммарно 1 `!important` — риск минимален. `storefront.css` идёт пятым, потому что витрина визуально изолирована (`.sf-*`) и хорошо покрывается снапшотами. `App.css` идёт последним из этой группы: он содержит `.login-page` с задублированными свойствами, требует внимательности.

**Проверка:** снапшоты после каждого файла. Дополнительно — Playwright-проверка вычисленных стилей для контрольного списка элементов (`.product-price`, `.unit-choice button`, `.quantity-input`, `.primary-button`): `getComputedStyle` до и после должен совпадать.
**Откат:** revert одного коммита — файл выходит из слоя, каскад возвращается к прежнему.
**Риск:** файл, попавший в слой, становится **слабее** всего, что вне слоёв. Если внутри него были правила, выигрывавшие у `APP_STYLES` только за счёт позиции, они проиграют. Именно это и ловят снапшоты. Пойманное чинится точечно — переносом конкретного правила в `overrides`.
**Оценка:** 3–5 дней на все шесть файлов, вместе с разбором находок.

### Этап 5 — `APP_STYLES` из JS в CSS (риск: средний — самый ответственный этап)

**Что делается:**

- Содержимое `APP_STYLES` (`src/shared/appHelpers.js:990–6610`) переносится **без изменений** в `src/styles/legacy/app-styles.legacy.css`, обёрнутое в `@layer overrides { ... }` — то есть в самый сильный слой, чтобы приоритет сохранился.
- Три вхождения `<style>{APP_STYLES}</style>` в `src/App.jsx` удаляются, файл импортируется в `src/main.jsx` последним.
- Аналогично: `MATRIX_STOREFRONT_CARD_STYLES` и inline-`<style>` из `OrderEditor.jsx` — в `overrides`, после `app-styles.legacy.css` (они и сейчас идут после него).

Здесь неизбежно правятся и `.jsx`, и `.css` в одном коммите — это единственное разрешённое исключение из правила «не смешивать» (раздел 9), потому что удаление тега и появление файла обязаны быть атомарными. Компенсируется тем, что JSX-правка сводится к удалению трёх строк и одного `useEffect`, без логики.

**Тонкости, которые обязательно проверить:**

- `MATRIX_STOREFRONT_CARD_STYLES` вставляется в `useEffect` **при монтировании** `ClientMatrixPanel`. Сейчас на страницах без матрицы этих стилей нет вовсе. После переноса в статический CSS они появятся везде. Нужно либо ограничить их областью (`.client-matrix-panel ...`), либо убедиться, что их селекторы и так достаточно узкие.
- В `overrides` три источника должны лежать ровно в том порядке, в каком они сейчас попадают в документ: `app-styles` → `matrix` → `order-editor`.

**Проверка:** полный прогон снапшотов по всем четырём контекстам + ручная проверка клиентского кабинета: матрица, редактор заказа, корзина, оформление.
**Откат:** revert одного коммита. Коммит крупный, но механический — конфликтов при откате не будет.
**Оценка:** 3–4 дня. **Эффект:** −6 263 строки невидимого CSS, весь объём стилей становится доступен линтеру и поиску.

### Этап 6 — Токены (риск: низкий, порциями)

**Что делается:** `src/styles/tokens.css` + замена литералов на `var()`, по одному цвету за коммит, начиная с самых частых.

| Порядок | Литерал | Вхождений | Токен |
|---:|---|---:|---|
| 1 | `#fff` + `#ffffff` | 194 | `--surface-white` |
| 2 | `#5b9d57` | 48 | `--clover-green` |
| 3 | `#4f9a52` | 45 | `--clover-green-alt` |
| 4 | `#f4f8f2` | 32 | `--surface-app` |
| 5 | `#d5dfd2` | 26 | `--border-soft` |
| 6 | `#394639` | 26 | `--text-strong` |
| 7 | `#386f37` | 23 | `--clover-green-deep` |
| 8 | `#fbfdfb` | 22 | `--surface-card` |
| 9 | `#6b6f6b` | 19 | `--text-muted` |
| 10 | `#d7e1d4` | 18 | `--border-soft-2` |

Первые десять коммитов закрывают 453 из 1 667 литералов.

**Проверка:** замена литерала на переменную с тем же значением визуально нейтральна по построению. Снапшоты должны показать **ровно ноль** расхождений; любое расхождение означает опечатку в hex — тест ловит её мгновенно. Это самый «дешёвый» с точки зрения риска этап.
**Откат:** revert коммита.
**Оценка:** 3–4 дня.

### Этап 7 — Один набор брейкпоинтов (риск: средний)

**Что делается:** приведение 28 условий к одному стилю. Порядок внутри этапа:

1. Косметика без изменения поведения: `@media(max-width:800px)` → `@media (max-width: 800px)`, `prefers-reduced-motion:reduce` → с пробелом. Нулевой риск, отдельный коммит.
2. Схлопывание близких значений внутри одной группы — по одному значению за коммит: `850px` → `820px`, `800px` → `820px`, `980px` → `900px`, `760px`/`720px` → `700px`, `560px`/`520px`/`500px`/`480px` → одно значение. Каждое схлопывание меняет поведение в узкой полосе ширин, поэтому снапшоты должны включать ширины **по обе стороны** от каждой затрагиваемой границы.
3. Устранение конфликта `900/901` против `820/821`: выбрать одну границу «мобильный/десктоп» и свести к ней. Это самый рискованный коммит всего этапа — отдельный, с полным ручным прогоном на реальных устройствах.
4. Устранение перекрытия `min-width: 900px` / `max-width: 900px`.

**Проверка:** снапшоты на расширенном наборе ширин: 360, 390, 480, 520, 700, 768, 820, 821, 860, 900, 901, 1024, 1280, 1440. Полосу 821–900px проверить особенно внимательно.
**Откат:** по коммитам.
**Оценка:** 4–6 дней.

### Этап 8 — Расселение по владельцам и снятие `!important` (риск: средний, длинный хвост)

**Что делается:** итеративно, по одному компоненту за коммит, в порядке боли (таблица 3.4):

`.product-price` → `.unit-choice` → `.quantity-input` / `.quantity-control` → `.product-card` / `.product-card-controls` → `.secondary-button` / `.primary-button` → `.category-button` → `.product-image-wrap` → `.catalog-search` → остальное.

Процедура для одного компонента:

1. Собрать **все** его правила из всех источников (командой 2.4 с фильтром по селектору).
2. Записать целевые вычисленные значения через Playwright `getComputedStyle` во всех четырёх контекстах — это спецификация ожидаемого результата.
3. Написать одну каноническую реализацию в `src/styles/components/<name>.css`, слой `components`, с контекстными настройками через токены-модификаторы.
4. Удалить старые правила из `overrides`.
5. Убедиться, что `getComputedStyle` совпал со снятыми значениями, и снапшоты чистые.

`!important` снимается **вместе** с переносом правила, никогда отдельно.

**Проверка:** `getComputedStyle` до/после + снапшоты.
**Откат:** по коммитам; `overrides` до конца этапа остаётся рабочей страховкой.
**Оценка:** 1–1.5 дня на компонент; топ-10 компонентов — 10–15 дней. Хвост можно тянуть фоном месяцами: каждый шаг самодостаточен, и незавершённая миграция не хуже текущего состояния.

**Готово, когда `overrides` пуст.** Тогда `!important` не нужен нигде, а изменение цены правится в одном файле.

---

## 7. Защита от регрессий

### 7.1 Почему именно снапшоты

Юнит-тесты CSS не ловят. Единственное, что ловит «цена уехала на 3px» — попиксельное сравнение. `playwright-core@1.49.1` уже установлен, и Playwright на этом проекте уже применялся для проверки вычисленных стилей и координат элементов, так что инфраструктура знакома команде.

Для полноценных снапшотов с автоматическим сравнением нужен `@playwright/test` (`toHaveScreenshot`). Альтернатива без новой зависимости — собственный сравниватель на `page.screenshot()` + `pixelmatch`. Рекомендуется `@playwright/test`: `toHaveScreenshot` уже умеет ретраи до стабилизации, маскирование областей и порог различий, и переписывать это вручную — потерянное время. Это единственная новая зависимость во всём плане.

### 7.2 Матрица покрытия

Четыре контекста × страницы. Локальный dev-сервер на порту `5273` (`vite.config.js`). Витрина в dev доступна по префиксу `/vitrina` (см. `src/screens/storefront/mode.js`), кабинет — по `/lk` (`CABINET_PATH` в `src/config/urls.js`).

| Контекст | Viewport | Эмуляция | Страницы |
|---|---|---|---|
| **storefront mobile** | 390×844 (iPhone 14) | `deviceScaleFactor: 2`, touch | `/vitrina`, `/vitrina/catalog`, `/vitrina/catalog/<категория>`, `/vitrina/product/<код>`, `/vitrina/cart`, `/vitrina/checkout`, `/vitrina/contacts` |
| **storefront desktop** | 1440×900 | `deviceScaleFactor: 1` | те же 7 |
| **client cabinet mobile** | 390×844 | touch | `/lk` (вход), матрица, редактор заказа, корзина, оформление, профиль, адреса, список заказов |
| **client cabinet desktop** | 1440×900 | | те же 8 |

Дополнительные ширины — только для Этапа 7 (брейкпоинты), в остальное время не нужны: 360, 480, 700, 768, 820, 821, 860, 900, 901, 1024, 1280.

Итого базовый набор: 30 снимков. Это укладывается примерно в минуту прогона и не мешает работать.

Менеджерская и админская части снапшотами **не покрываются**: изменчивого контента там больше, а цена визуальной регрессии несопоставимо ниже — это внутренний инструмент. Для них достаточно проверок `getComputedStyle` по контрольному списку элементов.

### 7.3 Стабильность (без неё тесты бесполезны)

Флакающий визуальный тест хуже отсутствующего: его начинают перезапускать, потом игнорировать, потом отключают. Обязательные меры:

- Отключить анимации и переходы: инжектить `* { animation: none !important; transition: none !important; }` через `page.addStyleTag` **только в тестовом контексте** (это единственное место в проекте, где `!important` останется законным).
- Фиксированные данные: стабильный тестовый аккаунт и замороженный список товаров через мок сетевого слоя, иначе новый товар в каталоге сломает все снимки.
- Дождаться шрифтов: `await page.evaluate(() => document.fonts.ready)` — `manrope.css` грузится из `index.html`, без этого возможна подмена шрифта на первом кадре.
- Скрыть заведомо изменчивое: даты, таймеры, «boot splash» (`#clover-boot-splash`, живёт до 2.5с по `src/main.jsx`) — через `mask` в `toHaveScreenshot`.
- Порог: `maxDiffPixelRatio: 0.001`. Ноль недостижим из-за сглаживания шрифтов, а более мягкий порог пропустит сдвиг на 1–2px — то самое, что мы и ловим.
- Прогон только в Chromium: цель — ловить наши регрессии, а не различия движков.

### 7.4 Процесс утверждения эталонов

- Эталоны лежат в `clover-app/tests/visual/__screenshots__/`, коммитятся в git, генерируются в Docker-образе с теми же шрифтами, что в CI, — иначе снимки с машины разработчика и из CI не совпадут никогда.
- Разница по умолчанию = провал сборки.
- Обновление эталонов возможно **только** отдельным коммитом, где нет ничего, кроме файлов `__screenshots__`. Такой коммит легко заметить в истории и просмотреть глазами.
- В описании PR с обновлением эталонов обязательны: причина изменения и подтверждение, что новый вид — намеренный. Правило простое: **обновление эталонов — это тоже изменение продукта, и оно ревьюится как изменение продукта.**
- HTML-отчёт Playwright с попиксельным diff прикладывается артефактом CI, чтобы ревьюер видел разницу, а не верил на слово.

---

## 8. Ограждения от возврата долга

### 8.1 Stylelint с убывающим потолком `!important`

Добавляется `stylelint` + `stylelint-config-standard`. Ключевая часть — не набор «правильных» правил, а **бюджет, который может только уменьшаться**.

`.stylelintrc.json` (ориентир):

```json
{
  "extends": ["stylelint-config-standard"],
  "rules": {
    "declaration-no-important": [true, { "severity": "warning" }],
    "selector-max-specificity": ["0,4,1", { "severity": "warning" }],
    "selector-max-compound-selectors": [4, { "severity": "warning" }],
    "color-no-hex": [true, { "severity": "warning" }],
    "media-feature-name-value-allowed-list": {
      "max-width": ["/^(480|900)px$/"],
      "min-width": ["/^(481|901|1440)px$/"]
    },
    "no-duplicate-selectors": true,
    "declaration-block-no-duplicate-properties": [true, {
      "ignore": ["consecutive-duplicates-with-different-syntaxes"]
    }]
  }
}
```

`severity: warning` на старте — иначе линтер даст 5 000 ошибок и его немедленно отключат. Ужесточение до `error` происходит по мере того, как соответствующая метрика доходит до нуля.

Скрипт `scripts/css/budget.mjs` проверяет бюджеты и роняет сборку при превышении:

| Метрика | Baseline (31.08.2026) | Потолок после Этапа 5 | Этапа 6 | Этапа 8 | Цель |
|---|---:|---:|---:|---:|---:|
| `!important` всего | 5 102 | 5 102 | 5 102 | убывает | 0 |
| Строк CSS в `.js`/`.jsx` | 6 263 | 0 | 0 | 0 | 0 |
| Различных цветовых литералов | 392 | 392 | ≤ 200 | ≤ 60 | ≤ 60 |
| Различных условий `@media` | 28 | 28 | 28 | ≤ 8 | ≤ 8 |
| Селекторов с ≥5 классами | 254 | 254 | 254 | убывает | 0 |
| Правил на `.product-price` | 45 | 45 | 45 | 1 | 1 |

Правило потолка: **число в CI может только уменьшаться**. Скрипт хранит текущий потолок в `scripts/css/budget.json`; если фактическое значение стало меньше — потолок автоматически подтягивается вниз в том же коммите (ratchet). Обратно поднять его можно только явной правкой файла, что видно в ревью.

### 8.2 Запрет на новый `!important`

Отдельная проверка в CI: `!important` **в добавленных строках** диффа PR запрещён, даже если общий бюджет не превышен.

```bash
git diff origin/main...HEAD -- '*.css' '*.jsx' '*.js' \
  | grep -E '^\+' | grep -v '^\+\+\+' | grep -c '!important'
```

Ненулевой результат — провал проверки. Исключение оформляется комментарием `/* stylelint-disable-next-line declaration-no-important -- причина */` и требует одобрения второго ревьюера. Смысл в том, чтобы `!important` перестал быть безмолвным решением по умолчанию и стал явным, обсуждаемым выбором.

### 8.3 Запрет на новый CSS-in-JS

После Этапа 5 — проверка, что в `src/**/*.jsx` нет `<style>`, а в `src/**/*.js` нет строковых констант с CSS:

```bash
grep -rn "<style>" src --include=*.jsx && exit 1
grep -rnE "^export const [A-Z_]*STYLES\s*=\s*\`" src --include=*.js && exit 1
```

### 8.4 Дежурная сводка

`npm run css:audit` печатает текущие метрики против baseline. Прогонять раз в спринт и держать динамику на виду — иначе миграция с длинным хвостом (Этап 8) тихо остановится на середине.

---

## 9. Чего делать нельзя

**Нельзя: большой единовременный переписывание.** 20 963 строки, 3 171 правило, живой продакшн. Переписывание «с нуля» невозможно ни отревьюить, ни откатить, ни выкатить частями. Оно неизбежно застрянет в состоянии «старое сломано, новое не готово». Все изменения — только маленькими обратимыми коммитами.

**Нельзя: массово вырезать `!important` регуляркой.** `!important` здесь **несёт смысл**: он компенсирует то, что `clover-theme.css` подключён раньше `APP_STYLES`. Удаление 4 095 `!important` из `clover-theme.css` мгновенно передаст управление `APP_STYLES` и переломает вёрстку кабинета целиком. `!important` снимается только вместе с переносом правила в правильный слой (Этап 8), правило за правилом, под снапшотами. Ни один автоматический инструмент это не сделает.

**Нельзя: переименовывать классы, на которые опирается JSX.** `.product-price`, `.unit-choice`, `.clover-app`, `.page-content-client`, `.sf-*` и прочие приходят из `className` в компонентах, а часть — из строковых вычислений. Переименование требует синхронной правки JSX, ломает атомарность коммитов и лишает возможности откатить только CSS. Классы остаются как есть; меняется только то, **где** и **в каком слое** они определены. Наведение порядка в именах — отдельная задача, после завершения этого плана.

**Нельзя: править CSS и JSX в одном коммите.** Иначе при регрессии нельзя откатить стили, не откатив логику. Единственное исключение — Этап 5, где перенос `<style>` из JSX в `.css` физически обязан быть атомарным; там JSX-правка сводится к удалению тега без изменения логики.

**Нельзя: чинить визуальный баг добавлением нового блока.** Именно так и накопились 45 правил на `.product-price`. С момента принятия этого плана правка идёт в файл-владелец компонента; если владельца ещё нет — сначала маленький Этап 8 для этого компонента, потом правка.

**Нельзя: удлинять селектор ради приоритета.** Никаких новых `:not(...)` для веса и никаких новых цепочек из шести классов. Если правило не побеждает — оно лежит не в том слое; это чинится слоем, а не специфичностью.

**Нельзя: менять брейкпоинты и переносить код в слой в одном коммите.** Оба изменения меняют, какое правило выигрывает. Смешав их, при регрессии невозможно понять причину.

**Нельзя: обновлять эталонные снимки «заодно» с правкой кода.** Обновление эталонов — всегда отдельный коммит, состоящий только из `__screenshots__`. Иначе визуальная регрессия проскочит под видом ожидаемого изменения.

**Нельзя: включать stylelint сразу в режиме `error`.** 5 000 ошибок на старте гарантированно приведут к тому, что линтер отключат или начнут повсеместно ставить `stylelint-disable`. Только `warning` + убывающий бюджет.

---

## 10. Трудозатраты и порядок

| Этап | Содержание | Оценка | Риск | Эффект |
|---|---|---|---|---|
| 0 | Аудит-скрипт, baseline | 0.5–1 д | нулевой | видимость прогресса |
| 1 | Каркас Playwright-снапшотов | 2–3 д | нулевой | **разблокирует всё остальное** |
| 2 | Мёртвый код: `Catalog.css`, `--muted`, 8 переменных | 0.5 д | очень низкий | −911 строк, −1 скрытый дефект |
| 3 | Объявление `@layer` | 1 ч | низкий | фундамент |
| 4 | 6 файлов `.css` → слои | 3–5 д | низкий | предсказуемый каскад |
| 5 | CSS-in-JS → `.css` (`APP_STYLES` и др.) | 3–4 д | средний | −6 263 невидимых строк, весь CSS под линтером |
| 6 | Токены, топ-10 цветов | 3–4 д | низкий | смена бренд-цвета = 1 правка |
| 7 | Единые брейкпоинты | 4–6 д | средний | конец багам в полосе 821–900px |
| 8 | Топ-10 компонентов по владельцам, снятие `!important` | 10–15 д | средний | **правка цены = 1 файл** |
| — | Хвост Этапа 8 | фоново | низкий | `overrides` → 0 |

**Итого до основного облегчения: 27–39 рабочих дней** (примерно 6–8 недель одного инженера, с запасом на разбор находок в Этапе 4).

**Рекомендуемый порядок — тот же, что нумерация, с одним замечанием.** Этапы 0–3 (около 4 дней) не дают немедленного облегчения, но без них любой последующий шаг — игра вслепую; сокращать их нельзя. Дальше порядок выстроен так, чтобы быстро набрать доверие к процессу: Этап 2 — заведомо безопасный коммит, проверяющий саму процедуру; Этап 4 начинается с четырёх файлов, где суммарно один `!important`.

Если нужно раньше показать пользу — **можно вынести часть Этапа 8 для `.product-price` и `.unit-choice` сразу после Этапа 4**, до переноса `APP_STYLES`. Это ровно те два компонента, из-за которых написан этот документ. Технически возможно: компонент собирается в `components`, а конфликтующие определения из `APP_STYLES` временно гасятся в `overrides`. Обойдётся в 2–3 дополнительных дня (часть работы придётся переделать после Этапа 5), зато боль от выравнивания цены и кнопок единиц измерения уходит примерно на месяц раньше. Решение — за командой; если сроки не горят, дешевле идти по порядку.

**Чего делать не стоит ни при каком сценарии** — начинать с Этапа 8 или Этапа 6 в обход Этапа 1. Без снапшотов первая же тихая регрессия на проде остановит всю затею, и вернуться к ней потом будет намного труднее.

---

## 11. Критерии готовности

План считается выполненным, когда одновременно верно:

1. `grep -c '!important'` по всем стилям = 0 (baseline: 5 102).
2. В `src/**/*.jsx` нет `<style>`, в `src/**/*.js` нет CSS-констант (baseline: 6 263 строки).
3. `src/styles/legacy/` пуст, слой `overrides` не содержит правил.
4. Различных условий `@media` ≤ 8 (baseline: 28); границы «мобильный/десктоп» ровно одна.
5. Цветовые литералы встречаются только в `src/styles/tokens.css`; различных литералов ≤ 60 (baseline: 392).
6. Каждый класс из топ-20 таблицы 3.4 определён **ровно в одном** файле-владельце (baseline для `.product-price`: 45 правил в 5 источниках).
7. Селекторов с ≥5 классами = 0 (baseline: 254).
8. Визуальные снапшоты по четырём контекстам зелёные, эталоны не обновлялись ради «протолкнуть» изменение.
9. Проверка «нет новых `!important`» включена в CI и работает.

Практический критерий, ради которого всё затевалось: **правка «выровнять цену в карточке товара» делается в `src/styles/components/product-card.css`, занимает одну строку и не может сломать соседнее правило.**
