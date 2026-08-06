import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn 컴포넌트가 쓰는 클래스 병합 헬퍼. 뒤에 온 유틸리티가 앞을 이긴다. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
