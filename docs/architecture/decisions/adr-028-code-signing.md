# ADR-028: macOS 코드 서명 — v1.0.0 은 애드혹 서명으로 낸다

- 상태: accepted (2026-08-11) — [ADR-004](./adr-004-packaging-deploy.md) 가 `M4 에서 결정` 으로 유보한 항목을 닫는다

## Context

ADR-004 는 패키징 도구와 배포 경로(electron-builder → GitHub Releases)를 정하면서
**서명 여부만 M4 로 미뤘다.** 그 시점이 지금이다.

선택지는 둘이다.

1. **Apple Developer Program 가입 후 정식 서명 + 공증.** 연 99 USD 이며, 서명·공증
   단계가 릴리스 워크플로에 들어가고 시크릿(`CSC_LINK`·`CSC_KEY_PASSWORD`·
   `APPLE_ID` 등) 관리가 따라온다.
2. **개발자 인증서 없이 배포.** 무료이고 지금 바로 된다.

사실관계 셋이 선택을 좁힌다.

- **사용자가 1인이고 본인이다.** 이 앱은 로컬 단독이고 로그인·멀티유저가 없으며,
  받는 사람과 만드는 사람이 같다 (PRODUCT.md).
- **배포 파이프라인이 서는 것이 서명보다 먼저다.** 서명은 이미 도는 파이프라인에
  나중에 얹을 수 있지만, 파이프라인이 없으면 서명할 대상 자체가 없다.
- **"서명하지 않는다"에는 두 가지가 있고 결과가 다르다.** 이것이 이 ADR 이 실측으로
  배운 것이다 (아래 Decision §2).

## Decision

### 1. v1.0.0 은 공증하지 않는다

Apple Developer Program 에 가입하지 않는다. 그 결과 Gatekeeper 는 이 앱을 통과시키지
않으며, 다운로드한 사용자는 격리 속성을 직접 풀어야 한다. 그 절차는 README 의 설치 절이
소유한다.

**남에게 배포할 필요가 생기면 이 결정을 다시 본다.** 그때는 절차 안내로 감당할 수 없다 —
받는 사람이 "이 앱은 손상되었습니다" 를 보고 지우는 것이 기본값이 된다.

### 2. 그러나 **애드혹 서명은 한다** (`identity: '-'`)

전자와 후자가 다르다. electron-builder 의 `identity: null` 은 서명 단계를 **건너뛰고**,
그러면 번들이 Electron 바이너리의 linker-signed 서명을 그대로 물려받는다. 그 서명은
**리소스를 포함하지 않는다고 선언**하므로, 앱 리소스가 붙은 번들과 앞뒤가 맞지 않는다.

실측하면 `spctl` 이 평가를 시작조차 못 한다:

```
code has no resources but signature indicates they must be present
```

사용자에게 이것은 "확인되지 않은 개발자" 가 아니라 **손상된 앱**으로 보인다. 판정에
도달조차 못 하므로 "그래도 열기" 경로가 열리지 않는다.

`identity: '-'` 는 번들 전체를 덮는 자기완결적 서명을 만든다. 여전히 공증이 없어
`spctl` 판정은 `rejected` 지만, 그것은 **정상적인 "확인되지 않은 개발자"** 판정이고
사용자가 넘어갈 수 있는 상태다.

### 3. 엔타이틀먼트 4개를 명시한다

애드혹 + hardened runtime 조합은 `com.apple.security.cs.disable-library-validation` 을
요구한다 — 라이브러리 검증은 같은 팀 ID 로 서명된 코드만 로드하게 하는데 애드혹에는
팀 ID 가 없어 better-sqlite3 의 `.node` 가 걸릴 수 있다.

**엔타이틀먼트 파일은 electron-builder 의 기본값을 보완하지 않고 대체한다.** 그래서
그 한 줄만 담은 파일을 넣으면 기본값에 있던 JIT 권한이 사라지고 V8 이 즉사한다
(`Failed to reserve virtual memory for CodeRange`). `build/entitlements.mac.plist` 는
넷을 모두 담는다: `allow-jit` · `allow-unsigned-executable-memory` ·
`allow-dyld-environment-variables` · `disable-library-validation`.

## Consequences

- (−) **다운로드한 `.dmg` 는 그냥 열리지 않는다.** 실측: 격리 속성이 붙은 앱은 실행
  시도 시 SIGKILL 로 죽고 DB 도 만들어지지 않는다. README 가 해제 절차를 안내하지
  않으면 사용자는 앱이 깨졌다고 판단한다.
- (−) **배포 대상이 늘어나는 순간 재검토가 강제된다.** 이 결정의 근거가 "받는 사람이
  만든 사람"이라는 사실 하나에 걸려 있다.
- (−) `disable-library-validation` 은 hardened runtime 의 보호 하나를 끈다. 정식 서명으로
  가면 팀 ID 가 생기므로 이 예외는 지워야 하며, 지우는 것을 잊으면 필요 없는 구멍이 남는다.
- (+) **유료 계정 없이 배포 경로 전체가 선다.** 태그 → 빌드 → Releases 가 끝까지 돈다.
- (+) 정식 서명으로의 전환이 작다 — `identity` 값과 시크릿을 넣고 `notarize` 를 켜면
  되고, 그 밖의 패키징 설정은 그대로다.
