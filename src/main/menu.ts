import { app, Menu, type MenuItemConstructorOptions } from 'electron'

/**
 * 초기화 항목의 id. e2e 가 이 id 로 항목을 찾아 `click()` 한다 — 네이티브 메뉴는
 * Playwright 가 화면에서 클릭할 수 없으므로 프로그램적으로 부를 손잡이가 필요하다.
 */
export const RESET_MENU_ITEM_ID = 'reset-all-data'

export type AppMenuOptions = {
  onResetAllData: () => void
}

/**
 * 앱 메뉴를 만든다.
 *
 * **표준 메뉴를 다시 선언하는 것이 이 함수 분량의 대부분이고, 그것이 요점이다.**
 * `Menu.setApplicationMenu` 는 Electron 의 기본 메뉴를 **대체**한다 — 데이터 메뉴 하나만
 * 담아 넘기면 macOS 에서 Cmd+Q(종료)·Cmd+C/V(복사·붙여넣기)·Cmd+M(최소화)이 전부 사라진다.
 * 입력창이 있는 앱에서 복사가 죽는 것은 기능 하나를 얻고 앱을 망가뜨리는 거래다.
 *
 * 손으로 서브메뉴를 쓰지 않고 role 을 쓴다. role 은 플랫폼별 라벨·단축키·활성 조건을
 * Electron 이 관리하므로 번역과 관용구를 공짜로 얻고, macOS 전용 항목(서비스·가리기)은
 * 다른 플랫폼에서 알아서 빠진다.
 *
 * 창을 인자로 받지 않는 이유: 초기화는 창 상태와 무관하게 항상 가능해야 하고, 콜백이
 * 자기 클로저에서 창을 찾는다.
 */
export function buildAppMenu(opts: AppMenuOptions): Menu {
  const template: MenuItemConstructorOptions[] = [
    // macOS 의 앱 이름 메뉴 — 정보·서비스·가리기·**종료**. 다른 플랫폼에서는 빈 항목이
    // 되지 않도록 아래 View 메뉴가 종료를 따로 갖는다.
    ...(process.platform === 'darwin'
      ? ([{ role: 'appMenu' }] satisfies MenuItemConstructorOptions[])
      : []),
    // 타협 불가 — 없으면 모든 입력창에서 Cmd+C·Cmd+V 가 죽는다.
    { role: 'editMenu' },
    {
      label: '보기',
      submenu: [
        // 개발용 항목은 패키징된 앱에 내보내지 않는다. 사용자가 실수로 DevTools 를 열면
        // 프레임리스 창의 레이아웃이 그대로 깨진다.
        ...(app.isPackaged
          ? []
          : ([
              { role: 'reload' },
              { role: 'forceReload' },
              { role: 'toggleDevTools' },
              { type: 'separator' }
            ] satisfies MenuItemConstructorOptions[])),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      label: '데이터',
      submenu: [
        {
          id: RESET_MENU_ITEM_ID,
          // 말줄임표는 "다이얼로그가 뒤따른다" 는 플랫폼 관례다 — 누르는 즉시 지워지지
          // 않는다는 신호를 라벨 자체가 준다.
          label: '모든 데이터 초기화…',
          // **단축키를 달지 않는다.** 되돌릴 수 없는 전체 삭제에 키스트로크를 붙이면
          // 오타 한 번이 사고가 된다. 메뉴를 열어 고르는 마찰이 여기서는 기능이다.
          click: opts.onResetAllData
        }
      ]
    },
    // Windows·Linux 에는 앱 메뉴가 없으므로 종료 경로를 여기에 둔다. macOS 는 role:
    // 'appMenu' 가 이미 갖고 있어 중복이 된다.
    ...(process.platform === 'darwin'
      ? []
      : ([{ label: '파일', submenu: [{ role: 'quit' }] }] satisfies MenuItemConstructorOptions[]))
  ]

  return Menu.buildFromTemplate(template)
}
