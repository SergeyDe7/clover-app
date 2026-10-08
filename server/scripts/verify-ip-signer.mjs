import test from 'node:test';
import assert from 'node:assert/strict';
import {fillIpSignerFromCard, suggestedMaleNameGenitive, refreshSuggestedName} from '../../src/shared/contracts/ipSigner.js';
import {fillSignerPositionGenitive} from '../../src/shared/contracts/signerPosition.js';
test('IP owner supplies missing signer and local grammatical suggestions', () => {
  const result=fillSignerPositionGenitive(fillIpSignerFromCard({type:'ip',fullName:'Индивидуальный предприниматель ОБРАЗЦОВ СЕРГЕЙ ВЯЧЕСЛАВОВИЧ'}));
  assert.equal(result.fields.signerFullName,'ОБРАЗЦОВ СЕРГЕЙ ВЯЧЕСЛАВОВИЧ');
  assert.equal(result.fields.signerFullNameGenitive,'Образцова Сергея Вячеславовича');
  assert.equal(result.fields.signerPosition,'Индивидуальный предприниматель');
  assert.equal(result.fields.signerPositionGenitive,'индивидуального предпринимателя');
});
test('explicit representative, imported grammatical forms and organizations remain unchanged', () => {
  const representative={type:'ip',fullName:'ИП Образцов Петр Петрович',signerFullName:'Петров Иван Иванович',signerPosition:'Представитель'};
  assert.deepEqual(fillIpSignerFromCard(representative),representative);
  const explicit={type:'ip',fullName:'ИП Образцов Петр Петрович',signerFullNameGenitive:'ПОДТВЕРЖДЁННАЯ ФОРМА',signerPosition:'Управляющий'};
  assert.equal(fillIpSignerFromCard(explicit).signerFullNameGenitive,explicit.signerFullNameGenitive);
  assert.equal(fillIpSignerFromCard(explicit).signerPosition,'Управляющий');
  const company={type:'ooo',fullName:'ООО Пример'};
  assert.deepEqual(fillIpSignerFromCard(company),company);
});
test('unknown names, initials and ambiguous headings are not guessed while supported coverage expands', () => {
  for(const name of ['Образцов С. В.','Пример Аноним Петрович','Образцов Сергей']) assert.equal(suggestedMaleNameGenitive(name),'');
  assert.equal(suggestedMaleNameGenitive('Тестовая Анна Ивановна'),'Тестовой Анны Ивановны');
  assert.equal(suggestedMaleNameGenitive('Примерский Сергей Вячеславович'),'Примерского Сергея Вячеславовича');
  assert.equal(suggestedMaleNameGenitive('Седых Сергей Иванович'),'Седых Сергея Ивановича');
  assert.equal(suggestedMaleNameGenitive('Черных Иван Петрович'),'Черных Ивана Петровича');
  assert.equal(suggestedMaleNameGenitive('Долгих Петр Иванович'),'Долгих Петра Ивановича');
  assert.equal(suggestedMaleNameGenitive('ЛИН СЕРГЕЙ ВЯЧЕСЛАВОВИЧ'),'Лина Сергея Вячеславовича');
  assert.deepEqual(fillIpSignerFromCard({type:'ip'}),{type:'ip'});
});

test('owned name suggestions refresh, unsupported names clear them, manual corrections survive', () => {
  const previous='Образцова Сергея Вячеславовича';
  const changed={signerFullName:'Образцов Иван Иванович',signerFullNameGenitive:previous};
  assert.equal(refreshSuggestedName(changed,previous).fields.signerFullNameGenitive,'Образцова Ивана Ивановича');
  const incomplete=refreshSuggestedName({...changed,signerFullName:'Образцов И. И.'},previous);
  assert.equal(incomplete.fields.signerFullNameGenitive,'');
  assert.equal(refreshSuggestedName({...incomplete.fields,signerFullName:'Образцов Иван Иванович'},incomplete.autoValue).fields.signerFullNameGenitive,'Образцова Ивана Ивановича');
  assert.equal(refreshSuggestedName({...changed,signerFullNameGenitive:''},null).fields.signerFullNameGenitive,'');
  assert.equal(refreshSuggestedName({...changed,signerFullNameGenitive:'Ручная форма'},previous).fields.signerFullNameGenitive,'Ручная форма');
});
