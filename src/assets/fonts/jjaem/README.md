# 쨈 폰트 v1.0.5 웹 조각

이 폴더의 `jjaem-web.css`와 `fonts/`는 `scripts/fonts/build-jjaem-web.py`가 만든 파일이에요. 손으로 고치지 말고 스크립트를 다시 돌려 주세요.

```
pip install fonttools brotli
python3 scripts/fonts/build-jjaem-web.py --src <쨈폰트_v1.0.5 묶음 폴더>
```

- `fonts/slices/`: 쨈 본문 Regular·Bold를 한글 쓰임 빈도별로 나눈 조각이에요. 나눔 표는 Google Fonts 한국어 글꼴과 같은 `scripts/fonts/noto-kr-slices.json`이에요. 화면에 나온 글자가 든 조각만 받아요.
- 이모지(Unicode 16 emoji-data의 Emoji·Emoji_Component, 단 글자처럼 쓰는 `# * 0-9 © ® ™`는 남김)는 조각에 넣지 않아요. ⚽❤⚠ 같은 글자는 기기의 컬러 이모지로 그려져요.
- 입장 화면 로고는 글꼴이 아니라 SVG예요(`src/assets/logo/sambong-fc-logo.svg`). 쨈 제목 컬러로 `scripts/fonts/build-logo-svg.py`가 만들어요. 로고 글자를 바꾸면 그 스크립트를 다시 돌려 주세요.
- 라이선스: 쨈 제목 계열은 `쨈제목_사용조건.md`(서브셋·형식 바꾸기 허용, 저작권 표기 유지), 쨈 본문은 `OFL.txt`(SIL OFL 1.1, 예약 이름 'Source'는 쓰지 않음)를 따라요. 조각마다 원래 이름 표(저작권·라이선스)를 그대로 남겨요.
