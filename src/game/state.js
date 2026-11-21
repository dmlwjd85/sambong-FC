/** window에 올려 두는 공용 상태의 처음 값 */
window.seasonInfo = window.seasonInfo || { season: 1, started: false, startedAt: null };

window.playerState = { id: '', isGM: false, isGuest: false, name: '', inventory: [], itemLevels: {}, equipHead: null, equipHandL: null, equipHandR: null, equipFootL: null, equipFootR: null, equipFace: null, equipSkin: null, equipKit: null };
window.allPlayersData = [];
window.checkedInPlayers = new Set();
window.selectedPlayerId = null;
window.targetTeamCount = 2;
window.compareTargetId = null;
window.currentSortKey = 'ovr';
window.lockerViewMode = 'default';
