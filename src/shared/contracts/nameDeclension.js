import rules from './vendorfiles/rules.js';

// Conservative coverage gate: suffix rules alone cannot establish that a word is a name.
const maleNames = new Set('Александр Алексей Анатолий Андрей Антон Аркадий Артём Артем Богдан Борис Вадим Валентин Валерий Василий Виктор Виталий Владимир Владислав Вячеслав Геннадий Георгий Глеб Григорий Даниил Денис Дмитрий Евгений Егор Иван Игорь Илья Кирилл Константин Лев Леонид Максим Михаил Никита Николай Олег Павел Пётр Петр Роман Руслан Семён Семен Сергей Станислав Степан Тимофей Фёдор Федор Юрий Ярослав'.toLocaleLowerCase('ru-RU').split(' '));
const femaleNames = new Set('Александра Алёна Алена Алина Алла Анастасия Ангелина Анна Валентина Валерия Варвара Вера Вероника Виктория Галина Дарья Диана Евгения Екатерина Елена Елизавета Зоя Инна Ирина Ксения Лариса Лидия Любовь Людмила Маргарита Марина Мария Надежда Наталья Наталия Нина Оксана Ольга Полина Светлана София Софья Таисия Тамара Татьяна Юлия Яна'.toLocaleLowerCase('ru-RU').split(' '));
const word = '[А-ЯЁа-яё]{2,}(?:-[А-ЯЁа-яё]{2,})*';
const fullNamePattern = new RegExp(`^${word} ${word} ${word}$`, 'u');
const title = part => part[0].toLocaleUpperCase('ru-RU') + part.slice(1).toLocaleLowerCase('ru-RU');
const unresolved = reason => ({ status: 'unresolved', value: '', reason, source: 'petrovich-local' });

// Same ordered exceptions/suffixes and modifiers as pinned MIT Petrovich,
// with explicit rule coverage and true first_word tags instead of silent unchanged fallback.
function inflect(value, kind, gender) {
  const parts = value.split('-');
  const output = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = title(parts[index]);
    const lower = part.toLocaleLowerCase('ru-RU');
    let selected;
    for (const [group, whole] of [[rules[kind].exceptions || [], true], [rules[kind].suffixes || [], false]]) {
      selected = group.find(rule => (rule.gender === gender || rule.gender === 'androgynous') &&
        (!rule.tags?.length || (index === 0 && parts.length > 1 && rule.tags.includes('first_word'))) &&
        rule.test.some(sample => whole ? lower === sample : lower.endsWith(sample)));
      if (selected) break;
    }
    if (!selected) return '';
    let result = part;
    for (const character of selected.mods[0]) {
      if (character === '-') result = result.slice(0, -1);
      else if (character !== '.') result += character;
    }
    output.push(result);
  }
  return output.join('-');
}

export function analyzeSignerName(fullName) {
  if (typeof fullName !== 'string') return unresolved('Введите полные фамилию, имя и отчество.');
  const normalized = fullName.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!fullNamePattern.test(normalized)) return unresolved('Для склонения нужны полные фамилия, имя и отчество без инициалов.');
  const [surname, name, patronymic] = normalized.split(' ');
  const gender = /(?:ович|евич|ильич|фомич|кузьмич|лукич|никитич|саввич)$/iu.test(patronymic) ? 'male' :
    /(?:овна|евна|ична|инична)$/iu.test(patronymic) ? 'female' : null;
  if (!gender) return unresolved('Не удалось однозначно определить склонение по отчеству.');
  const knownNames = gender === 'male' ? maleNames : femaleNames;
  if (name.split('-').some(part => !knownNames.has(part.toLocaleLowerCase('ru-RU')))) return unresolved('Имя не входит в проверенный словарь либо противоречит отчеству.');
  // Upstream spells the irregular exception with ё; normalize only this known name.
  const first = inflect(name.replace(/^Петр$/iu, 'Пётр'), 'firstname', gender);
  const last = inflect(surname, 'lastname', gender);
  const middle = inflect(patronymic, 'middlename', gender);
  if (!first || !last || !middle) return unresolved('Для части ФИО не найдено поддерживаемое правило склонения.');
  return { status: 'resolved', value: `${last} ${first} ${middle}`, reason: '', gender, source: 'petrovich-local' };
}

// Imported/manual genitives are retained; ownership refresh is handled separately.
export function fillSignerNameGenitive(fields, previousAutoValue = null) {
  const current = String(fields.signerFullNameGenitive || '');
  if (current.trim() && (previousAutoValue === null || current !== previousAutoValue)) return { fields, autoValue: null };
  const analysis = analyzeSignerName(fields.signerFullName);
  return { fields: { ...fields, signerFullNameGenitive: analysis.value }, autoValue: analysis.value };
}
