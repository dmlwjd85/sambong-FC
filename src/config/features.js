/**
 * 기능 스위치.
 * false면 화면에서 사라지고, 콘솔에서 함수를 직접 불러도 동작하지 않습니다.
 * 다시 켜려면 값을 true로 바꾼 뒤 새로고침하면 됩니다.
 *
 * 베팅은 스위치가 아닙니다. 코드에서 빼 두었고, Firestore에 남은 베팅 문서는 읽지도 지우지도 않습니다.
 */
export const FEATURES = {
  /** 장비 강화 */
  enhance: false,
  /** 상점, 스킨, 장비 구매·장착 */
  shop: false,
  /** 봉, 주급, 기록 보상, 업적 보상 */
  bong: false,
};

export function featureOn(name) {
  return FEATURES[name] === true;
}
