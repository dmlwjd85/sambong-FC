/**
 * 게임 진입점. 기능별 모듈을 불러온 뒤, 예전과 같은 순서로 화면을 준비하고 앱을 시작합니다.
 * (모듈 지도는 src/game/README.md 참고)
 */
import './state.js';
import './constants.js';
import './utils.js';
import './ui.js';
import './stats.js';
import './login.js';
import './boot.js';
import './nav.js';
import './locker.js';
import './shop.js';
import './playerCard.js';
import './activity.js';
import './gm.js';
import './records.js';
import './sim/roster.js';
import './sim/broadcast.js';
import './sim/pitch.js';
import './sim/formation.js';
import './sim/tactical.js';
import './sim/match.js';
import { bootLoginForm } from './login.js';
import { bindSimTeamBoardUi } from './locker.js';
import { bindSimTacticalUi } from './sim/tactical.js';
import { initApp } from './boot.js';
import { renderTeamModePicker, openSimFoldsOnWide } from './sim/roster.js';

bootLoginForm();
bindSimTeamBoardUi();
bindSimTacticalUi();
renderTeamModePicker();
openSimFoldsOnWide();
initApp();
