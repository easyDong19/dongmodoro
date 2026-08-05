# ADR-004: 패키징·배포 — pnpm + electron-builder + GitHub Releases

- 상태: accepted (2026-08-03) — 단, macOS 코드 서명 여부는 미결정 (M4 에서 결정)

## Context

v1 은 1인용 로컬 앱이고 자동 업데이트가 필수는 아니다. 레포의 브랜치 전략
(CONTRIBUTING.md)이 "태그 push = 배포 트리거"를 이미 규정하고 있어, 배포 파이프라인이
이 규칙과 맞물려야 한다.

## Decision

1. **패키지 매니저는 pnpm.**
2. **패키징은 electron-builder**, 산출물은 **GitHub Releases 에 업로드, 수동 다운로드**로 시작한다.
3. 배포 흐름: release 브랜치에서 태그 push → GitHub Actions → electron-builder
   빌드 → GitHub Releases 업로드. CONTRIBUTING.md 의 릴리즈 규칙과 정확히 일치한다.
4. macOS 코드 서명·공증은 v1 에서 결정 유보 — 패키징 단계(M4)에서
   미서명 배포 vs Apple Developer 계정(+notarization) 중 선택한다.

## Consequences

- (+) electron-builder 의 `publish: github` 설정으로 릴리즈 업로드까지 자동화 가능.
- (+) 이후 electron-updater 로 자동 업데이트를 붙일 때 GitHub Releases 가 그대로
  업데이트 서버 역할을 한다 — 확장 경로가 깔끔.
- (−) **pnpm 10+ 은 의존성의 빌드 스크립트를 기본 차단한다** (postinstall 이 공급망
  공격의 주요 통로이기 때문). 네이티브 모듈을 컴파일하는 better-sqlite3 가 정확히
  그것을 필요로 하므로 허용 목록 지정이 필수이고, 누락 시 "설치는 됐는데 바이너리가
  없음" 류의 오류가 난다. **설정 위치와 이름은 pnpm 11 에서 바뀌었다** — `package.json`
  의 `pnpm` 필드는 더 이상 읽히지 않고, `onlyBuiltDependencies` 는 `allowBuilds` 로
  대체됐다. 현재 형식은 `pnpm-workspace.yaml` 의 맵이다:

  ```yaml
  allowBuilds:
    better-sqlite3: true
    esbuild: true
  ```

  electron 은 이 목록에 넣어도 효과가 없다 — **v42 부터 설치 스크립트를 아예 제공하지
  않고**(같은 공급망 사유) 첫 실행 때 런타임 바이너리를 스스로 내려받는다.
  받는 시점을 앞당기고 싶으면 `install-electron` bin 을 직접 호출한다.
  > 결정(pnpm 사용)은 그대로이고 이 항목은 그 결정을 실현하는 수단의 현행화다.
  > 확인 시점 2026-08-05 / pnpm 11.1.3 / electron 43.
- (−) 미서명 macOS 앱은 Gatekeeper 경고를 받는다. 본인 사용은 우회 가능하지만
  "상용처럼"이 목표라면 서명·공증 경험도 가치가 있다 — M4 에서 재논의.
- 태그 push 는 배포 트리거이므로 사용자 확인 없이 push 하지 않는다 (CONTRIBUTING.md).
