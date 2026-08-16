import { useEffect } from 'react'

/** 화면에 머무는 시간. 한 줄 알림이라 읽고 사라지기에 충분한 길이다. */
const DISMISS_MS = 4000

/**
 * 한 줄 알림 (ux-spec §3.1 의 pull 토스트). sonner 를 새로 들이지 않는다 — 필요한 것은
 * 알림 하나이고, 라이브러리는 자체 토큰·포털·애니메이션을 함께 들여온다.
 *
 * `role="status"` + `aria-live="polite"` 인 이유: 사용자가 방금 누른 버튼의 결과라
 * 하던 일을 끊을 근거가 없다. `assertive` 는 읽던 문장을 잘라먹는다.
 *
 * 사라짐은 이 컴포넌트가 타이머로 알리고 **표시 여부는 호출부가 소유한다** — 그래야
 * 새 메시지가 왔을 때 앞 토스트의 남은 시간에 잘리지 않는다(`message` 가 effect 의
 * 의존성이라 타이머가 다시 시작된다).
 */
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDismiss, DISMISS_MS)
    return () => clearTimeout(id)
    // 의존성이 `message` 뿐인 것은 의도다. `onDismiss` 를 넣으면 호출부의 인라인 화살표가
    // 매 렌더 새 함수가 되어 타이머가 영원히 다시 시작되고 토스트가 사라지지 않는다.
  }, [message])

  return (
    // 표면이 **불투명(bg-deep)** 인 것이 핵심이다 — 유리(glass-strong)로 띄우면 다크에서
    // 아래 콘텐츠가 비쳐서, 드로어처럼 텍스트 밀도가 높은 곳 위에 뜰 때 두 겹의 글자가
    // 겹쳐 보인다. 그림자가 깊이를 만들어 "위에 뜬 레이어"로 읽히게 한다.
    //
    // 우하단인 이유: pull 의 도착지인 오늘 목록 카드가 오른쪽 컬럼이라 방향이 맞고,
    // 하단 중앙은 타이머 컨트롤·드로어와 겹치는 자리였다.
    <div
      role="status"
      aria-live="polite"
      style={{ zIndex: 'var(--layer-toast)', boxShadow: 'var(--glass-shadow)' }}
      className="fixed bottom-6 right-6 rounded-md border border-glass-border bg-bg-deep px-4 py-2 text-sm text-ink"
    >
      {message}
    </div>
  )
}
