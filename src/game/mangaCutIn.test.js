import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANGA_SCENES,
  mangaAssetUrl,
  mangaGenderOf,
  peekFcGoalSpecial,
  pickFcMangaScene,
  shouldSkipMangaCutIn,
} from './sim/mangaCutIn.js';

test('시험 속도(ts=0)에서만 한 컷을 건너뛰고, 움직임 줄이기에서는 보여 준다', () => {
  assert.equal(shouldSkipMangaCutIn({ timeScale: 0, reducedMotion: false }), true);
  assert.equal(shouldSkipMangaCutIn({ timeScale: 0, reducedMotion: true }), true);
  assert.equal(shouldSkipMangaCutIn({ timeScale: 1, reducedMotion: true }), false);
  assert.equal(shouldSkipMangaCutIn({ timeScale: 1, reducedMotion: false }), false);
  assert.equal(shouldSkipMangaCutIn({ timeScale: 0.28, reducedMotion: false }), false);
});

test('골·선방 한 컷은 팀 색과 성별을 맞추고, 해트트릭이 역전보다 앞선다', () => {
  assert.equal(pickFcMangaScene({ kind: 'goal', attackA: true, gender: 'M' }), 'fc-goal-red-m');
  assert.equal(pickFcMangaScene({ kind: 'goal', team: 'blue', gender: 'F' }), 'fc-goal-blue-f');
  assert.equal(pickFcMangaScene({ kind: 'superSave', team: 'blue', gender: 'M' }), 'fc-save-blue-m');
  assert.equal(pickFcMangaScene({ kind: 'superSave', team: 'red', gender: 'F' }), 'fc-save-red-f');
  assert.equal(pickFcMangaScene({ kind: 'goal', team: 'red', gender: 'F', special: 'comeback' }), 'fc-comeback-red-f');
  assert.equal(pickFcMangaScene({ kind: 'goal', attackA: false, gender: 'M', special: 'hattrick' }), 'fc-hattrick-blue-m');
  assert.equal(pickFcMangaScene({ kind: 'keyPass', gender: 'F', team: 'red' }), null);
});

test('해트트릭과 역전 판정은 중계 줄과 같은 규칙을 쓴다', () => {
  assert.equal(peekFcGoalSpecial({ scorerGoalsBefore: 2, mine: 3, theirs: 2, lastLeader: false, attackA: true }), 'hattrick');
  assert.equal(peekFcGoalSpecial({ scorerGoalsBefore: 0, mine: 2, theirs: 1, lastLeader: false, attackA: true }), 'comeback');
  assert.equal(peekFcGoalSpecial({ scorerGoalsBefore: 0, mine: 1, theirs: 0, lastLeader: null, attackA: true }), null);
  assert.equal(peekFcGoalSpecial({ scorerGoalsBefore: 0, mine: 1, theirs: 1, lastLeader: false, attackA: true }), null);
});

test('성별은 선수 기록 → 이름 기본값 → 모르면 남', () => {
  assert.equal(mangaGenderOf({ gender: 'F' }), 'F');
  assert.equal(mangaGenderOf({ gender: 'M' }), 'M');
  assert.equal(mangaGenderOf({ name: '자동 보조 1' }), 'M');
  assert.equal(mangaGenderOf(null), 'M');
});

test('한 컷 그림 주소와 효과음 글자는 그림 파일이 아니라 코드에 있다', () => {
  assert.equal(Object.keys(MANGA_SCENES).length, 16);
  for (const [id, scene] of Object.entries(MANGA_SCENES)) {
    assert.ok(scene.src.endsWith('.webp'), id);
    assert.equal(scene.src, `manga/${id}.webp`, id);
    assert.ok(scene.sfx.length > 0, id);
    assert.match(mangaAssetUrl(scene.src), /\/manga\/fc-.*\.webp$/);
  }
});
