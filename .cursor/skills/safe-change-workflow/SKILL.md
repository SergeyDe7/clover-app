---
name: "safe-change-workflow"
description: "Обязательный безопасный цикл изменения Clover: план, backup, ветка, тесты, review, установка и rollback."
---


# Шаги

1. Снять baseline: `git status`, версии, процессы, health, тесты.
2. Определить риск и подтверждения пользователя.
3. Сделать backup затрагиваемых файлов/данных.
4. Создать Git-ветку.
5. Добавить воспроизводящий тест.
6. Реализовать минимальный diff.
7. Запустить lint/typecheck/unit/integration/e2e по доступности.
8. Провести security и independent review.
9. Собрать установочный пакет с checksum и rollback.
10. Попросить подтверждение на установку/БД/1С/push.
11. После установки выполнить smoke test и сравнить baseline.

