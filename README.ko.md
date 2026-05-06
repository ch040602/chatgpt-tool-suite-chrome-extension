# ChatGPT Long Chat Loader v0.3.0

[English](README.md) | [한국어](README.ko.md)

ChatGPT 긴 대화의 로딩, 렌더링, RAM 부담을 줄이기 위한 Chrome MV3 확장입니다.

## 문제 원인

긴 ChatGPT 대화는 브라우저가 큰 conversation graph를 받고, 이를 JavaScript 객체로 파싱한 뒤, ChatGPT React 앱이 오래된 메시지까지 상태로 구성하고, 많은 Markdown/code/tool DOM 노드를 계속 유지하면서 느려질 수 있습니다. 렌더링된 뒤 오래된 DOM을 숨기면 스크롤에는 도움이 되지만, 더 큰 개선은 React가 데이터를 받기 전에 conversation 응답을 줄이는 데서 나옵니다.

## 이 확장이 하는 일

1. `document_start` 시점에 페이지 MAIN world에서 `window.fetch`를 패치합니다.
2. `GET /backend-api/conversation/<id>`와 `GET /backend-api/f/conversation/<id>` JSON 응답을 가로챕니다.
3. ChatGPT React가 소비하기 전에 현재 conversation chain의 tail만 남깁니다.
4. root/system/developer scaffolding은 보존하면서 cutoff 이전의 오래된 visible user/assistant node와 tool node를 제거합니다.
5. 전체 DOM이 이미 있는 경우 오래된 DOM turn을 `Load more` 컨트롤 뒤에 숨깁니다.
6. 지원되는 환경에서 visible turn에 `content-visibility:auto`를 적용합니다.
7. 확장 popup이 열릴 때만 예상 속도 향상을 계산합니다.

## 실페이지 확인 후 v0.3.0 변경 사항

공개 `https://chatgpt.com/` 및 `/c/<uuid>` shell은 인증된 conversation 없이도 로그인/새 채팅 shell을 로드합니다. 이 확인을 바탕으로 v0.3.0은 non-chat route에서 작업량을 줄이고 호환성을 개선했습니다.

- Route-aware observer: `/`, `/c/...`, `/share/...`, `/g/...`에서 활성화되고 app/gallery 같은 non-chat 페이지에서는 비활성화됩니다.
- MAIN-world `history.pushState`/`replaceState` 패치가 route-change event를 dispatch하여 잦은 polling 의존도를 줄입니다.
- Polling fallback을 3초로 완화했습니다.
- 기본 DOM selector를 `section` 전용 가정 대신 `[data-testid^="conversation-turn-"]`로 넓혔습니다.
- Conversation endpoint matcher가 `/backend-api/f/conversation/<id>`도 지원합니다.
- JSON이 아닌 response type은 읽거나 파싱하지 않습니다.
- retained tail 이전의 오래된 tool message는 renderable message로 세지 않으며, retained tail 안에 있지 않으면 제거됩니다.
- Status badge는 기본 off입니다.

## 기본 설정

| 설정 | 기본값 |
|---|---:|
| 최근 턴 | 4 |
| 더 보기 배치 | 4 |
| API 사전 보관 배치 | 2 |
| API response body cache | 0 |
| CSS containment | 켜짐 |
| Status badge | 꺼짐 |

기본값에서 API tail은 대략 다음 수의 메시지를 유지합니다.

```text
최근 턴 * 2 + 더 보기 배치 * API 사전 보관 배치 * 2
= 4 * 2 + 4 * 2 * 2
= 24개의 renderable user/assistant 메시지
```

## Popup-only 예상 속도 향상

이 확장은 페이지에서 속도 향상을 계속 계산하지 않습니다. Popup이 열릴 때 활성 탭에서 일회성 snapshot을 요청하고 다음 값을 바탕으로 개선치를 추정합니다.

- API message reduction
- 추가 `TextEncoder`/`Blob` buffer를 피하기 위해 string length를 사용한 API JSON size reduction
- hidden DOM turn ratio
- `content-visibility` 지원 여부
- Chromium이 `performance.memory`를 노출하는 경우 JS heap

이 값은 controlled benchmark가 아니라 추정치입니다.

## GPU 및 RAM 참고 사항

- 이 확장은 `will-change`, `translateZ(0)`, 강제 layer promotion을 사용하지 않습니다. 텍스트가 많은 긴 채팅에서는 강제 layer 생성이 GPU memory와 layer-management overhead를 늘릴 수 있습니다.
- 이 확장은 Chrome hardware acceleration을 직접 전환할 수 없습니다. GPU compositing이 의심되면 `chrome://gpu`를 수동으로 확인해야 합니다.
- 가장 중요한 RAM 절감은 conversation load 중 오래된 메시지의 전체 React state/DOM 생성을 피하는 것입니다.
- `fetch` 응답을 rewrite하는 확장 구조상 JSON response는 한 번 읽고 파싱해야 합니다. 이 peak는 완전히 제거할 수 없습니다.

## 설치

1. 이 패키지의 압축을 풉니다.
2. Chrome에서 `chrome://extensions`를 엽니다.
3. Developer mode를 켭니다.
4. **Load unpacked**를 클릭합니다.
5. `chatgpt-long-chat-loader-v0.3.0` 폴더를 선택합니다.
6. `https://chatgpt.com`에서 긴 대화를 엽니다.
7. 확장 아이콘을 클릭해 현재 탭 추정치와 설정을 확인합니다.

## 한계

- 최종 성능 수치에는 인증된 긴 conversation E2E 테스트가 필요합니다.
- ChatGPT 내부 DOM/API가 바뀌면 selector 또는 endpoint 수정이 필요할 수 있습니다.
- 전체 기록 검색, 오래된 메시지 편집, 오래된 branch 탐색에는 `전체 대화 로드하기` bypass가 필요합니다.
- Server-side model context는 줄이지 않습니다. 브라우저 UI 로딩/렌더링 부담만 줄입니다.
- Shared chat은 다른 delivery path를 사용할 수 있습니다. DOM windowing은 여전히 도움이 될 수 있지만, API trim은 보장되지 않습니다.

## Privacy

메시지 내용은 외부 서버로 전송되지 않습니다. 설정은 `chrome.storage.local`에 저장되며 MAIN-world 접근을 위해 `localStorage`로 bridge됩니다.
