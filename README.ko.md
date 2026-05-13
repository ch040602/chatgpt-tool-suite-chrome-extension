# ChatGPT Long Chat Loader

긴 ChatGPT 대화의 브라우저 로딩과 RAM 부담을 줄이기 위한 Chrome MV3 확장입니다.

기본 README는 영어입니다. 한국어 문서는 이 파일이며, popup의 **한국어 README** 버튼으로 열 수 있습니다.

## v1.4.0 핵심 변경

v1.4.0은 “확장은 켜져 있는데 대화 축약/윈도잉이 전혀 안 되는 경우”와 “첫 로딩이 여전히 너무 느린 경우”를 줄이는 데 초점을 맞췄습니다. stable conversation refresh를 계속 trim하고, 자동 정리 주기마다 DOM windowing을 다시 강제 적용합니다.

### 수정/추가 사항

- live/thinking 보호로 인해 원본 통과된 최초 conversation GET이 잘못해서 “초기 trim 완료”로 기록되는 문제를 수정했습니다.
- stable conversation refresh는 최초 1회 이후에도 계속 trim합니다. 이전처럼 첫 trim 이후 전체 원본 transcript를 통과시키지 않습니다.
- stable conversation 응답을 실제로 파싱하고 trim했거나, 충분히 작다고 확인한 경우에만 route별 trim 상태로 기록합니다.
- 답변 생성, thinking, reasoning, stream recovery 중인 응답은 route 최적화 완료로 기록하지 않습니다.
- live-reply 보호 중이어도 자동 정리 주기마다 DOM windowing을 다시 적용합니다. streaming 중 전체 transcript가 렌더링되어도 오래된 메시지가 계속 보이는 상태로 남지 않게 합니다.
- 완료된 과거 thinking/reasoning 조각은 오래된 메시지 보호 대상으로 보지 않고, 현재 live tail만 보호합니다.
- **더 보기**로 불러온 과거 메시지는 다음 자동 정리 주기에 다시 접히도록 loaded-message auto-collapse를 추가했습니다.
- 이미 열려 있던 탭이나 static content-script 주입이 누락된 경우를 위한 MAIN-world fallback injection을 추가했습니다.
- popup에 **빠른 초기 로딩 프리셋**과 **패치 재주입** 버튼을 추가했습니다.
- 첫 로딩 기본값을 더 공격적으로 낮췄습니다.
- **더보기**로 불러온 과거 메시지를 자동 정리 주기마다 다시 접는 기능을 추가했습니다.
- Chrome 관리형 업데이트 확인 버튼을 추가했습니다. Web Store, self-hosted CRX, enterprise-managed 설치에서는 동작할 수 있지만, 개발자 모드 unpacked 설치는 릴리스 ZIP 다운로드 후 폴더 교체가 필요합니다.

## 기본값

| 설정 | 기본값 |
|---|---:|
| 확장 사용 | 켜짐 |
| 초기 API 응답 줄이기 | 켜짐 |
| 네트워크 안전 모드 | 켜짐 |
| 처음 표시할 최근 턴 | 2 |
| 더 보기 배치 | 2 |
| API 사전 보관 배치 | 0 |
| response micro-cache | 1개 |
| cache 항목 상한 | 256 KB |
| 자동 정리 주기 | 60초 |
| 불러온 과거 메시지 주기적 접기 | 켜짐 |
| 상태 배지 | 꺼짐 |

이 기본값은 최신 메시지 window만 표시합니다. 이미 DOM에 렌더된 오래된 메시지는 숨겨지고, **더보기**로 batch 단위 복구할 수 있습니다. ChatGPT가 렌더링하기 전에 API에서 잘린 메시지는 전체 대화 로드 버튼으로 새로고침해야 볼 수 있습니다.

## popup 진단 항목

popup이 열려 있을 때만 추정치를 계산합니다.

- 예상 로딩 개선 정도
- API trim 메시지 수와 추정 크기 감소
- DOM 표시/숨김 개수
- 응답 진행 보호 상태
- Thinking Shield 상태
- live API 원본 통과 상태
- 보안 안전 잠금 상태
- micro-cache 상태
- 패치 상태와 fallback injection 상태
- content/main script 버전

## 설치

1. ZIP 압축을 풉니다.
2. `chrome://extensions`를 엽니다.
3. 개발자 모드를 켭니다.
4. **Load unpacked**를 누릅니다.
5. 압축 해제한 확장 폴더를 선택합니다.
6. 기존 ChatGPT 탭을 새로고침합니다.
7. popup에서 `API patch: MAIN 1.4.0`을 확인합니다.

## 축약이 안 될 때 확인할 것

popup에서 다음을 확인합니다.

- `API patch`: `MAIN 1.4.0`이어야 합니다.
- `패치 상태`: `MAIN 감지`가 포함되어야 합니다.
- `Safe original pass`: idle 상태에서 계속 활성화되어 있으면 안 됩니다.
- DOM 숨김 개수: 긴 대화에서는 0보다 커야 합니다. 계속 0이면 **패치 재주입** 후 탭을 새로고침하세요.
- `Thinking shield`: 답변 완료 후에는 대기 상태로 돌아와야 합니다.

이미 열려 있던 탭에는 **패치 재주입**을 사용할 수 있습니다. 첫 로딩을 가장 빠르게 하려면 **빠른 초기 로딩 프리셋**을 적용한 뒤 ChatGPT 탭을 새로고침하세요.

## Unusual activity 경고 관련

이 확장은 OpenAI 보안 시스템을 우회하지 않습니다. ChatGPT에 unusual/suspicious activity 경고가 표시되면 safety lock 상태로 들어가 conversation response rewrite를 임시 중단합니다. VPN, proxy, 브라우저/기기 세션, 네트워크 평판, 계정 보안 상태도 확장과 무관하게 경고를 유발할 수 있습니다.

## 업데이트 helper

popup에 GitHub 업데이트 버튼이 있습니다. 저장소 주소는 내부 고정값을 사용하고, 별도 링크/입력란으로 표시하지 않습니다.

- **Chrome 자동 업데이트 시도**는 `chrome.runtime.requestUpdateCheck()`를 호출합니다.
- **최신 ZIP 다운로드**는 GitHub release/source ZIP을 다운로드합니다.

개발자 모드 unpacked extension은 스스로 로컬 파일을 교체할 수 없습니다. 릴리스 기준 자동 업데이트를 사용하려면 고정 key로 CRX를 패키징하고 Chrome이 관리하는 update manifest를 배포해야 합니다. 자세한 내용은 [`UPDATE_HOSTING.md`](./UPDATE_HOSTING.md)를 참고하세요.

## 한계

- ChatGPT 서버 응답은 확장이 trim하기 전에 먼저 다운로드되어야 합니다. 이 확장은 주로 ChatGPT React 앱에 전달되는 JSON, DOM 렌더링, layout, RAM 압력을 줄입니다.
- 인증된 실제 긴 대화 E2E benchmark는 사용자 ChatGPT 세션에서 직접 확인해야 합니다.
- ChatGPT DOM/API가 바뀌면 selector 또는 trim 로직 수정이 필요할 수 있습니다.
- 서버 측 모델 context 자체를 줄이는 것은 아니며, 브라우저 로딩·렌더링·메모리 부담을 줄이는 확장입니다.

## v1.4.0 변경 사항

새로고침 후에도 모든 메시지가 계속 보이는 경우를 방지하도록 수정했습니다.

- 안정된 idle 상태의 conversation GET은 1회만이 아니라 계속 trim합니다.
- CSS 주입이 늦거나 누락되어도 inline `display: none !important`로 오래된 메시지를 강제로 숨깁니다.
- 답변 생성, 생각 중, stream recovery 영역은 계속 보이게 보호하면서 오래된 메시지만 접습니다.
- 더보기로 펼친 오래된 메시지는 답변 생성 중이 아닐 때 maintenance 주기 후 다시 접습니다.
- 전체 대화를 표시하게 만들 수 있는 오래된 저장 설정값은 업데이트 시 안전값으로 보정합니다.
