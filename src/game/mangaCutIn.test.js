import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANGA_SCENES,
  mangaAssetUrl,
  peekFcGoalSpecial,
  pickFcMangaScene,
  shouldSkipMangaCutIn,
} from './sim/mangaCutIn.js';

test('시험 속도(ts=0)와 움직임 줄이기에서는 한 컷을 건너뛴다', () => {
  assert.equal(shouldSkipMangaCutIn({ timeScale: 0, reducedMotion: false }), true);
  assert.equal(shouldSkipMangaCutIn({ timeScale: 1, reducedMotion: true }), true);
  assert.equal(shouldSkipMangaCutIn({ timeScale: 1, reducedMotion: false }), false);
  assert.equal(shouldSkipMangaCutIn({ timeScale: 0.28, reducedMotion: false }), false);
});

test('골 한 컷은 레드·블루 유니폼을 고르고, 해트트릭이 역전보다 앞선다', () => {
  assert.equal(pickFcMangaScene({ kind: 'goal', attackA: true }), 'fc-goal-red');
  assert.equal(pickFcMangaScene({ kind: 'goal', attackA: false }), 'fc-goal-blue');
  assert.equal(pickFcMangaScene({ kind: 'superSave' }), 'fc-save');
  assert.equal(pickFcMangaScene({ kind: 'goal', attackA: false, special: 'comeback' }), 'fc-comeback');
  assert.equal(pickFcMangaScene({ kind: 'goal', attackA: true, special: 'hattrick' }), 'fc-hattrick');
  assert.equal(pickFcMangaScene({ kind: 'keyPass' }), null);
});

test('해트트릭과 역전 판정은 중계 줄과 같은 규칙을 쓴다', () => {
  assert.equal(peekFcGoalSpecial({ scorerGoalsBefore: 2, mine: 3, theirs: 2, lastLeader: false, attackA: true }), 'hattrick');
  assert.equal(peekFcGoalSpecial({ scorerGoalsBefore: 0, mine: 2, theirs: 1, lastLeader: false, attackA: true }), 'comeback');
  assert.equal(peekFcGoalSpecial({ scorerGoalsBefore: 0, mine: 1, theirs: 0, lastLeader: null, attackA: true }), null);
  assert.equal(peekFcGoalSpecial({ scorerGoalsBefore: 0, mine: 1, theirs: 1, lastLeader: false, attackA: true }), null);
});

test('한 컷 그림 주소와 효과음 글자는 그림 파일이 아니라 코드에 있다', () => {
  for (const [id, scene] of Object.entries(MANGA_SCENES)) {
    assert.ok(scene.src.endsWith('.webp'), id);
    assert.ok(scene.sfx.length > 0, id);
    assert.match(mangaAssetUrl(scene.src), /\/manga\/fc-.*\.webp$/);
  }
  assert.equal(Object.keys(MANGA_SCENES).length, 5);
});
