/* vite 가 처리하는 에셋 import 의 타입 선언. `vite/client` 를 통째로 켜지 않는 이유는
   tsconfig.web.json 의 types 를 빈 배열로 유지해 renderer 가 의도치 않은 전역 타입을
   집어오지 못하게 하기 위해서다 (ADR-008 의 프로세스 경계). */
declare module '*.css' {
  const content: string
  export default content
}
