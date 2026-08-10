import { Flame } from 'lucide-react'

/**
 * 뽀모 소진을 도트로 보여준다. 이모지가 아니라 토큰 색 원이다 (principles §6).
 *
 * **`neutral` 변형이 따로 있는 이유**: 기타 행은 계획이 없어 est 가 0 이다 (§3.4).
 * default 규칙을 그대로 적용하면 소진 전부가 est 를 넘으므로 **모든 도트가 초과(앰버)로
 * 렌더되고 `+N` 배지까지 붙는다** — 계획한 적 없는 소진을 초과라고 부르는 셈이다.
 * neutral 은 소진만 틸로 채우고 미채움·extra·배지를 전부 뺀다.
 *
 * 도트에는 전이가 없다 — 개수가 바뀌면 즉시 다시 그린다. 모션이 붙는 것은 주간
 * 게이지 바뿐이고 그 `prefers-reduced-motion` 처리는 그쪽이 소유한다.
 */
export function PomoDots({
  spent,
  est,
  variant = 'default'
}: {
  spent: number
  est: number
  variant?: 'default' | 'neutral'
}) {
  const neutral = variant === 'neutral'
  // default 에서만 est 를 기준으로 삼는다. 채움은 est 안쪽까지, 그 밖은 extra 다.
  const filled = neutral ? spent : Math.min(spent, est)
  const empty = neutral ? 0 : Math.max(0, est - spent)
  const extra = neutral ? 0 : Math.max(0, spent - est)

  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label={neutral ? `뽀모 ${spent}` : `뽀모 ${spent}/${est}`}
    >
      {Array.from({ length: filled }, (_, i) => (
        <span key={`f${i}`} data-testid="pomo-dot-filled" className="size-2 rounded-full bg-teal" />
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <span
          key={`e${i}`}
          data-testid="pomo-dot-empty"
          className="size-2 rounded-full border border-ink-faint"
        />
      ))}
      {/* 초과 도트의 글로우는 정적이다 — 무한 펄스 금지 (principles §4). */}
      {Array.from({ length: extra }, (_, i) => (
        <span
          key={`x${i}`}
          data-testid="pomo-dot-extra"
          className="size-2 rounded-full bg-amber"
          style={{ boxShadow: '0 0 4px var(--glow-amber)' }}
        />
      ))}
      <span className="ml-1 font-mono text-xs tabular-nums text-ink-dim">
        {neutral ? spent : `${spent}/${est}`}
      </span>
      {extra > 0 ? (
        <span className="inline-flex items-center gap-0.5 font-mono text-xs tabular-nums text-amber">
          <Flame aria-hidden="true" className="size-3" />
          {`+${extra}`}
        </span>
      ) : null}
    </span>
  )
}
