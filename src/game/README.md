# src/game 모듈 지도

예전 `initApp.js` 한 파일(약 4,900줄)을 기능별로 나눈 것입니다. 코드 내용은 그대로 옮겼고,
화면에서 부르는 `window.*` 함수 이름도 바뀌지 않았습니다.

| 파일 | 하는 일 |
| --- | --- |
| `initApp.js` | 진입점. 모듈을 모두 불러온 뒤 로그인 화면 준비 → 화면 이벤트 연결 → `initApp()` 순서로 시작 |
| `boot.js` | Firebase 연결(`db`, `auth`), `initApp()`, 실시간 구독 |
| `state.js` | `window.playerState`, `window.allPlayersData` 같은 공용 상태의 처음 값 |
| `constants.js` | 선수 명단, 능력치 이름, 포지션 가중치, 팁, 업적, 강화표, 상점 품목 |
| `utils.js` | 날짜(KST), 이스케이프, 섞기, `sleep` 같은 작은 도우미 |
| `ui.js` | 알림·확인창 큐, 기능 스위치·시즌 표시, 아바타, 축하 효과 |
| `stats.js` | 능력치·OVR·티어·레벨·성장 계산 |
| `login.js` | 이름 고르기·PIN 화면, `handleLogin`, `logout` |
| `nav.js` | 탭 이동, 하단 탭(자주 쓰는 메뉴 최대 6개, 기기·사람별 저장)·전체 메뉴 시트, 오늘의 팁 |
| `locker.js` | 라커룸, 출석 체크, 팀 분류표(최대 6팀·팀당 12명), 편성 적용(`applyTeamPlan`), 감독 포지션 변경 |
| `playerCard.js` | 선수 카드, 레이더 차트, 경험치 처리 |
| `activity.js` | 훈련·경기 기록 추가와 되돌리기 |
| `shop.js` | 상점·강화·장착 (지금은 `config/features.js`에서 꺼져 있음) |
| `gm.js` | 감독 도구: 능력치 수정, 시즌 시작·초기화, 출석 저장, 공지·쇼츠, 선수 추가·삭제 |
| `records.js` | 기록실: 전체 능력치표, 리더보드, 비교, 업적 |
| `sim/roster.js` | 팀 짜기 화면, 경기 대진(홈·원정), 출전 5명·교체 명단 |
| `sim/broadcast.js` | 중계 자막·효과 |
| `sim/pitch.js` | 경기장 그리기(전술판용), 대기 화면 |
| `sim/liveScene.js` | 라이브 코트: 선수·공 연속 애니메이션(패스·드리블·슛·선방·가로채기·파울·코너킥), 가로/세로 보기, 단계별 자막 |
| `sim/formation.js` | 포메이션 위치 저장(localStorage)·계산 |
| `sim/tactical.js` | 전술판 선수 그리기, 드래그·기본 포메이션 |
| `sim/match.js` | 경기 진행(`runSimMatch`): 체력·교체, 파울·경고·10m 프리킥, 코너킥, 역습, 어시스트, 경기 속도, 경기 후 기록 |
| `teamBuilder.js` | 팀 자동 편성(포지션 우선·능력치 우선·밸런스형·완전 랜덤, 고정 선수 유지)과 출전 5명 고르기 (테스트: `teamBuilder.test.js`) |
| `renderGate.js` | 감독이 숫자 칸에 입력하는 동안 실시간 갱신으로 화면이 다시 그려지지 않게 미룸 |
| `attendanceDates.js` | 출석부 날짜 목록 계산 (테스트: `attendanceDates.test.js`) |
| `activityUndo.js`, `seasonDate.js`, `mangaFace.js` | 원래부터 따로 있던 도우미 (테스트: `activityUndo.test.js`) |

## 고칠 때 알아 둘 것

- 다른 파일의 값을 쓰려면 `import` 하세요. `let`으로 된 값(`db`, `auth`, 로그인 상태 등)은
  **선언한 파일 안에서만 바꿀 수 있습니다.** 다른 파일에서 바꿔야 하면 그 파일에 바꾸는 함수를 만드세요.
- 파일을 불러올 때 바로 실행되는 코드는 두지 마세요. 시작할 때 할 일은 함수로 만들어 `initApp.js`에서 부릅니다.
