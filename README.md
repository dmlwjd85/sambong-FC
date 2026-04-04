# 삼봉 FC — 얼티밋 라커룸 (React / Vite)

**라이브:** [https://dmlwjd85.github.io/sambong-FC/](https://dmlwjd85.github.io/sambong-FC/)  
**저장소:** [github.com/dmlwjd85/sambong-FC](https://github.com/dmlwjd85/sambong-FC)

기존 `sambong-FC.html` 단일 파일 앱을 **Vite + React** 프로젝트로 옮긴 버전입니다. UI 마크업은 `src/app-shell.html`에 두고, 게임·Firebase 로직은 `src/game/initApp.js`에서 그대로 동작합니다.

## 개발

```bash
npm install
npm run dev
```

## 프로덕션 빌드

```bash
npm run build
```

결과물은 `dist/` 입니다.

## GitHub Pages 배포

### Jekyll vs Static HTML — 뭘 고르나요?

**아무것도 고르지 않아도 됩니다.** 화면에 그런 선택이 보인다면 예전 **“브랜치에서 배포 + Jekyll 테마”** 흐름일 수 있습니다. 이 Vite/React 앱은:

- **Settings → Pages → Build and deployment → Source** 에서 **`GitHub Actions`** 만 선택합니다.
- Jekyll 테마·Static HTML 마법사는 사용하지 않습니다. Actions가 `npm run build`로 만든 **정적 파일(`dist/`)** 을 그대로 올립니다.
- `public/.nojekyll` 이 빌드 결과에 포함되어, Pages가 Jekyll로 파일을 가공하는 일을 피합니다.

### 설정 순서

1. **Settings → Pages → Build and deployment**: **Source: GitHub Actions** (워크플로 “Deploy to GitHub Pages” 연결).
2. 저장소 루트에 `.github/workflows/deploy-pages.yml` 이 있어야 합니다.  
   - `sambong-FC`만 따로 저장소로 둘 때: 이 폴더 **내용이 저장소 루트**가 되도록 올리세요.
3. 워크플로는 `VITE_BASE=/<저장소이름>/` 로 빌드합니다 (`https://아이디.github.io/저장소이름/` 형태).

모노레포(상위 `Project` 전체가 git 루트)면 루트의 `.github/workflows/deploy-sambong-fc.yml` 을 사용하고, Pages 소스는 동일하게 **GitHub Actions** 입니다.

### 수동 배포

Actions 탭에서 **Deploy to GitHub Pages** 워크플로 → **Run workflow** (`workflow_dispatch`).

## 환경 변수

`.env.example` 을 복사해 `.env` 로 두고 필요 시 수정합니다. Firebase 키를 넣지 않으면 앱에 포함된 기본 프로젝트 설정이 사용됩니다.

프로덕션 빌드는 `.env.production` 의 `VITE_BASE=/sambong-FC/` 로 [배포 URL](https://dmlwjd85.github.io/sambong-FC/) 과 맞춥니다.

## Git / 소스 제어

**이 프로젝트의 Git 루트는 `c:\Project\sambong-FC` 입니다.** (상위 `Project`와 별도 저장소)

- `user.name`: dmlwjd85  
- `user.email`: dmlwjd85@gmail.com  
- `remote origin`: `https://github.com/dmlwjd85/sambong-FC.git`

Cursor/VS Code에서 폴더를 **`sambong-FC`만** 열면 소스 제어가 이 저장소만 표시됩니다.  
상위 `c:\Project`에도 `.git`이 있을 수 있으며, 그 경우 `Project\.gitignore`에 `sambong-FC/`가 있어 중복 추적을 막습니다.

### 다른 PC에서 클론만 하려면

```bash
git clone https://github.com/dmlwjd85/sambong-FC.git
cd sambong-FC
npm install
npm run dev
```
