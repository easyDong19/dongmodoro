import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@renderer/shared/lib/utils'

/* shadcn 원본에서 구조·접근성만 남기고 스킨은 토큰으로 교체했다 (ADR-003).
   원본이 쓰던 색 이름(primary·secondary·accent·background·ring·destructive)은
   shadcn 자체 토큰 세트라 우리 테마에 존재하지 않는다 — 그대로 두면 유틸리티가
   생성되지 않아 배경 없는 버튼이 된다.

   ⚠️ 이 매핑은 잠정이다. 시안 v7 의 버튼 스킨은 아직 그려지지 않았고, 여기서는
   "토큰만으로 렌더된다"를 확인할 최소한만 입혔다. 실제 스킨은 첫 화면을 짤 때
   design-system/principles.md 를 근거로 확정한다.

   원본에서 의도적으로 뺀 것:
   - outline-none / focus-visible:ring-* — 포커스 링은 global.css 의 :focus-visible 이
     소유한다. 링을 지우고 다시 그리면 ADR-004 가 정한 2px·--ink 기준을 벗어난다.
   - dark:* 변형 — 테마 전환은 토큰 값 재정의로 처리한다. 클래스로 분기하지 않는다
     (design-system ADR-008: 토큰 이름은 그대로, 값만 바뀐다).

   spacing(h-9·px-4 등)은 Tailwind 기본 스케일이다. spacing 토큰화는 실측할 레이아웃이
   생길 때까지 미뤘다 — tokens.md §10. */
const buttonVariants = cva(
  // `control` = 컨트롤 레벨 backdrop (design-system ADR-002 §1). link 변형은 아래에서
  // 무력하지만(배경이 없어 blur 할 대상이 없다) 기본에 두는 편이 변형마다 빠뜨리는 것보다 낫다.
  "control inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'control-raised bg-teal text-bg-deep hover:bg-teal/90',
        destructive: 'control-raised bg-danger text-bg-deep hover:bg-danger/90',
        outline: 'border border-control-border bg-glass text-ink hover:bg-glass-strong',
        secondary: 'bg-glass-strong text-ink hover:bg-glass',
        ghost: 'text-ink hover:bg-glass',
        // link 는 표면이 아니라 글자다 — control 을 붙이지 않는다.
        link: 'text-teal underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
