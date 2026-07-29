# Команда агентов Clover для Cursor

## Как обращаться

Откройте проект Clover в Cursor и начните запрос с:

```text
@dsd Проверь текущий проект и продолжи с безопасного следующего шага.
```

Пользователь работает только с `@dsd`. Оркестратор сам вызывает узких специалистов.

## Агенты

| Агент | Назначение |
|--------|------------|
| `dsd` | Оркестратор, единый итог |
| `product` | Приоритеты, scope, критерии готовности |
| `architect` | Требования и архитектура |
| `designer` | UI/UX |
| `copywriter` | Тексты |
| `marketer` | Маркетинг и рост |
| `mentor` | Обучение работе в Cursor |
| `frontend` | React/Vite/PWA |
| `backend` | Node.js/API/очередь |
| `database` | Данные и миграции |
| `onec` | 1С УНФ |
| `qa` | Тестирование |
| `security` | Безопасность |
| `release` | Windows/GitHub/релиз |
| `reviewer` | Независимая приёмка |

## Важные ограничения

Без подтверждения пользователя агенты не должны изменять БД/1С, удалять данные, выполнять push/merge, устанавливать на сервер или работать с production / реальными заказами.

## Проверка установки

После установки в проекте должны существовать:

- `.cursor/agents/dsd.md`;
- `.cursor/agents/product.md`, `designer.md`, `marketer.md`, `mentor.md`, `copywriter.md`;
- `.cursor/rules/000-core.mdc`;
- `.cursor/skills/fact-first-debugging/SKILL.md`;
- `AGENTS.md`;
- `docs/technical/README.md`.

Перезапустите Cursor или выполните `Developer: Reload Window`, затем в новом чате введите `@dsd`.
