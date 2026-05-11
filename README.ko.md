# ChatGPT Long Chat Loader v0.6.0

[English README](README.md)

ChatGPT 긴 대화의 초기 로딩, 렌더링, RAM 압박을 줄이기 위한 Chrome MV3 확장입니다.

## v0.6.0 수정 사항

이 버전은 탭을 오래 켜두면 `더보기` / `전체 대화 로드하기` 버튼이 사라질 수 있던 문제를 수정합니다.

1. **trim 상태를 응답 micro-cache와 분리했습니다.** cache body와 자세한 API stats는 만료될 수 있지만, 현재 route가 API trim된 상태라는 가벼운 marker는 `sessionStorage`에 최대 6시간 유지합니다.
2. **cache 정리가 full-load 버튼을 지우지 않습니다.** maintenance가 cache body와 오래된 root attribute를 정리해도 현재 대화가 API trim되었다는 상태는 유지됩니다.
3. **일시적인 zero-message scan을 허용합니다.** ChatGPT가 streaming/re-render 중 scroll root를 바꾸는 순간 scan 결과가 0개여도 full-load 버튼을 즉시 숨기지 않습니다.
4. **v0.6 버튼은 versioned DOM id를 사용합니다.** 업데이트 전에 열려 있던 탭에 v0.5 버튼/스크립트가 남아 있는 상황과의 충돌을 줄입니다.
5. **popup 진단에 trim 상태 source를 추가했습니다.** trim 상태가 live/recent인지 session marker에서 복구된 것인지 확인할 수 있습니다.

popup은 content-script 버전, MAIN-world API patch 버전, 더보기 버튼 상태, trim-state source, micro-cache 설정, DOM count, popup-only 예상 속도 향상치를 표시합니다.

## 문제 원인

긴 ChatGPT 대화는 브라우저가 큰 conversation graph를 받고, JavaScript 객체로 파싱하고, ChatGPT React 앱이 오래된 메시지까지 state/DOM으로 구성하면서 느려집니다. 오래된 DOM을 숨기면 스크롤에는 도움이 되지만, 가장 큰 개선은 React가 읽기 전에 conversation 응답 자체를 줄이는 것입니다.

## 확장이 하는 일

1. `document_start` 시점에 page MAIN world에서 `window.fetch`를 패치합니다.
2. `GET /backend-api/conversation/<id>`와 `GET /backend-api/f/conversation/<id>` JSON 응답을 intercept합니다.
3. ChatGPT React가 읽기 전에 현재 대화 chain의 최근 tail만 남깁니다.
4. cutoff 이전의 오래된 user/assistant/tool node를 제거하고 root/system/developer scaffold는 보존합니다.
5. zero-cache 대신 기본 1개짜리 bounded micro-cache를 사용합니다.
6. 전체 DOM이 이미 존재하는 경우 오래된 DOM turn을 숨기고 floating `더보기` 버튼으로 점진 표시합니다.
7. 가벼운 trim marker를 유지해서 cache/stat 정리 후에도 `전체 대화 로드하기` 버튼을 보존합니다.
8. 지원 브라우저에서는 표시 turn에 `content-visibility:auto`를 적용합니다.
9. 채팅 탭이 visible 상태일 때 가벼운 주기적 maintenance를 실행합니다.
10. 예상 속도 향상치는 popup을 열 때만 계산합니다.

## 캐시 정책

| 항목 | 기본값 |
|---|---:|
| 응답 micro-cache 수 | 1 |
| 최대 cache 수 | 2 |
| 항목당 body 상한 | 1024 KB |
| TTL | 60초 |
| 메모리 압박 | 저장 항목 정리 |
| route 변경 | 저장 항목 정리 |

캐시는 원본 전체 대화가 아니라 trim된 응답 body만 저장합니다. 설정값은 1 미만으로 내려가지 않지만, route 변경, TTL 만료, 메모리 압박, body 크기 초과 상황에서는 runtime cache map이 일시적으로 비어 있을 수 있습니다.

## trim-state marker

`더보기` / `전체 대화 로드하기` 버튼은 cache body에 의존하면 안 됩니다. v0.6.0은 API 응답이 trim된 뒤 현재 route에 대한 작은 marker를 `sessionStorage`에 저장합니다. marker에는 message text가 없고, count, timestamp, route key만 들어갑니다.

marker는 다음 상황에서 제거됩니다.

- 다른 대화 route로 이동
- API trim 비활성화
- 사용자가 `전체 대화 로드하기` 클릭
- marker가 6시간 이상 경과

따라서 maintenance가 micro-cache와 오래된 DOM attribute를 정리해도 full-load 버튼이 사라지지 않습니다.

## 대화 중 자동 정리

- 새 메시지는 `MutationObserver`와 throttled scan으로 처리합니다.
- visible 상태의 chat tab에서는 기본 30초마다 maintenance pass가 실행됩니다.
- maintenance는 cache 개수, TTL, body 크기, memory pressure 기준으로 micro-cache를 정리합니다.
- 새 turn이 추가되어도 DOM windowing을 다시 적용해 최근 tail 중심 표시를 유지합니다.
- popup 추정치가 오래된 대화의 자세한 API trim stats를 쓰지 않도록 stale stats를 제거합니다.
- 자세한 stats가 지워진 뒤에도 가벼운 trim marker는 유지됩니다.
- 탭이 hidden 상태이거나 chat surface가 아니면 loop를 멈춥니다.

React가 소유한 DOM node를 직접 삭제하지는 않습니다. React-owned node를 제거하면 hydration, branch navigation, editing, scroll restoration이 깨질 수 있기 때문입니다. 대신 API trim으로 오래된 node 생성을 줄이고, 이미 만들어진 node는 숨김/containment로 처리합니다.

## popup 전용 예상 속도 향상치

상시 계산 루프를 돌리지 않습니다. popup을 열면 활성 탭에서 snapshot을 한 번 받아 다음 기준으로 추정합니다.

- API 메시지 감소율
- API JSON 크기 감소율
- 숨겨진 DOM turn 비율
- `content-visibility` 지원 여부
- Chromium이 제공하는 경우 JS heap 정보

이 값은 controlled benchmark가 아니라 현재 탭 상태 기반 추정치입니다.

## GPU와 RAM 관련 메모

- `will-change`, `translateZ(0)`, 강제 layer promotion은 사용하지 않습니다. 긴 텍스트 대화에서는 오히려 GPU memory와 layer 관리 비용을 늘릴 수 있습니다.
- 확장이 Chrome hardware acceleration 설정을 직접 바꾸지는 않습니다. GPU compositing 문제가 의심되면 `chrome://gpu`에서 확인해야 합니다.
- RAM 절감의 핵심은 오래된 메시지를 React state/DOM으로 만들기 전에 API 입력을 줄이는 것입니다.
- fetch 응답을 rewrite하려면 JSON 응답을 한 번 읽고 parse해야 하므로 이 peak memory는 완전히 제거할 수 없습니다.
- micro-cache는 반복 parse를 줄이기 위한 소형 cache이며, 여러 긴 대화를 오래 보관하기 위한 cache가 아닙니다.

## 설치

1. ZIP 압축을 풉니다.
2. `chrome://extensions`를 엽니다.
3. 개발자 모드를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 누릅니다.
5. `chatgpt-long-chat-loader-v0.6.0` 폴더를 선택합니다.
6. `https://chatgpt.com`의 긴 대화를 열거나 새로고침합니다.
7. 확장 아이콘을 눌러 현재 탭 추정치와 설정을 확인합니다.

이전 빌드에서 업데이트한 뒤에는 ChatGPT 탭을 새로고침하세요. 기존 탭에는 페이지를 새로고침하기 전까지 오래된 content script 또는 MAIN-world fetch patch가 메모리에 남아 있을 수 있습니다.

popup에서 `API patch: 미감지`가 표시되면 ChatGPT 탭을 새로고침하세요. DOM 최적화와 추정치 fallback은 이미 열린 탭에도 주입될 수 있지만, 초기 MAIN-world fetch patch는 페이지 새로고침 후 가장 안정적으로 동작합니다.

## 한계

- 인증된 긴 대화에서 최종 성능 수치를 얻으려면 실제 E2E 테스트가 필요합니다.
- ChatGPT 내부 DOM/API가 바뀌면 selector 또는 endpoint 수정이 필요할 수 있습니다.
- 전체 히스토리 검색, 오래된 메시지 편집, 오래된 branch navigation은 `전체 대화 로드하기` bypass가 필요합니다.
- 서버 측 모델 context는 줄이지 않습니다. 브라우저 UI 로딩/렌더링 부담만 줄입니다.
- 공유 대화는 다른 delivery path를 사용할 수 있어 API trim이 보장되지 않습니다. 이 경우 DOM windowing만 도움이 될 수 있습니다.

## 개인정보

메시지 내용은 외부 서버로 전송되지 않습니다. 설정은 `chrome.storage.local`에 저장되고, count/timestamp만 담은 작은 trim marker는 탭 단위 `sessionStorage`에 저장되며, MAIN-world 접근을 위해 설정이 `localStorage`로 bridge됩니다.
