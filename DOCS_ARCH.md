# 노을 위치·지도 아키텍처

시니어 걷기 내비에서 **위치 계산**과 **지도 그리기**를 나눈 이유와 파일 위치를 정리합니다. React 리렌더가 GPS 틱마다 지도를 흔들지 않게 하는 것이 목표입니다.

## 한눈에 보기

```
센서 / 가상 GPS
    │  (메인 스레드 LocationSignalManager)
    ▼
Web Worker (Kalman + 방향 퓨전)
    │  정제된 좌표·방위
    ▼
Zustand (subscribeWithSelector)
    │  필요한 필드만 구독
    ▼
MapManager 싱글톤 ──► Google Maps (moveCamera만, ≥200ms)
    ▲
MapDomView ──► 지도 DOM 부착만 (카메라 금지)
```

운영 앱 홈(`/`)은 실제 GPS만 씁니다. 가상 보행은 `/admin/test/location-sim` 전용입니다.

## 1. Web Worker — 신호 처리

| 파일 | 역할 |
|------|------|
| `src/workers/location-worker.ts` | GPS 점프 거절, 칼만 평활, 나침반·진행 방향 퓨전 |
| `src/workers/kalman-filter.ts` | 1차원 칼만, GPS(위경도) 칼만 |
| `src/workers/location-types.ts` | Worker 입출력 메시지 타입 |
| `src/workers/locationSignalManager.ts` | Worker 생성, 센서 포워딩 또는 가상 펌프 |

브라우저 Worker는 보통 `geolocation`을 직접 쓰지 못합니다. 메인 스레드가 `watchPosition` / `deviceorientation` / `devicemotion`을 듣고 Worker에 `gps` · `orientation` · `motion`만 넘깁니다.

Worker는 대략 800ms(절전 시 더 김)마다 `location`을 돌려줍니다. UI·음성·이탈 안내는 홈 페이지가 이 결과를 받습니다.

Worker 생성:

```ts
new Worker(new URL('./location-worker.ts', import.meta.url), { type: 'module' })
```

Turbopack 개발 서버와 맞추려면 이 URL 패턴을 유지하세요. webpack 전용 Worker 설정을 `next.config`에 넣으면 개발 서버가 깨질 수 있습니다.

## 2. MapManager 싱글톤 — 카메라와 폴리라인

파일: `src/services/MapManager.ts`

- `MapManager.getInstance()` 하나만 지도를 소유합니다.
- **따라가기 카메라는 `moveCamera`만** 씁니다. `setCenter` / `panTo` / `fitBounds`는 따라가기 경로에서 호출하지 않습니다.
- 카메라는 `requestAnimationFrame`으로 묶고, 연속 호출은 **200ms 이상** 간격을 둡니다.
- 걸어온 궤적(`trackPath`)은 **최대 3000점**입니다. 넘치면 앞에서 잘라 메모리가 무한히 늘지 않게 합니다.

React는 지도를 매 틱마다 다시 만들지 않습니다.

## 3. MapDomView — DOM만

파일: `src/components/MapDomView.tsx`

역할은 호스트 `div`에 지도를 붙이고, 장소·루트·선택 마커를 매니저에 전달하는 것입니다. `useEffect` 안에서 카메라를 움직이지 마세요.

## 4. Zustand + `subscribeWithSelector`

파일: `src/store/useLocationStore.ts`

```ts
create<LocationState>()(subscribeWithSelector((set) => ({ ... })))
```

위치 픽스는 `applyFix`로 넣습니다. 홈은 따라가기 플래그·헤딩업·재중심 ID를 스토어에 맞춥니다.

`MapManager.bindStore()`는 **전체 스토어가 아니라 슬라이스**만 구독합니다.

- `lat`, `lng`, `bearing`, `fromGps`, `followMode`, `arrowRotationOffset`, `recenterId`

필드가 안 바뀌면 콜백이 안 돌아서, 관계없는 React 상태 때문에 지도가 다시 그려지지 않습니다.

디버그 카운터(`moveCameraCount`, `panToCount` 등)는 `cameraDebug`로 올립니다. 안티패턴 API를 썼는지 테스트 페이지에서 바로 봅니다.

## 5. 화면 깨우기

파일: `src/components/WakeLockProvider.tsx` (`layout.tsx`에서 감쌈)

따라가기 중 화면이 꺼지지 않게 `navigator.wakeLock`을 요청합니다. 실패해도 앱은 계속됩니다.

## 6. 가상 위치 시뮬

| 파일 | 역할 |
|------|------|
| `src/workers/location-mock.ts` | 개발 전용. `public/gyeokttara-2.gpx`(계곡따라2)를 시속 4km로 따라감. GPS·나침반 노이즈, `window.__NOEUL_SIM__` 리포트 |
| `src/lib/locationSimAccess.ts` | 시뮬 허용 여부 |
| `src/app/admin/test/location-sim/page.tsx` | 허용 시에만 패널 로드 |
| `src/app/admin/test/location-sim/LocationSimPanel.tsx` | 지도 + 지표 막대 |

`LocationSignalManager.start({ useMock: true })`는 허용될 때만 가상 펌프를 켭니다. **홈(`/`)은 `useMock`을 쓰지 않고, 계곡따라2도 미리 올리지 않습니다.** 예전 `/?sim=1`은 `/admin/test/location-sim`으로 보냅니다.

### 켜고 끄기 (`NEXT_PUBLIC_ENABLE_LOCATION_SIM`)

`npm run build`(운영 빌드)는 이 값이 `true`이면 **즉시 실패**합니다. `scripts/guard-location-sim.mjs`와 `next.config.ts`가 막습니다.

| 값 | 동작 |
|----|------|
| (없음) | `next dev`에서만 시뮬 페이지가 켜짐. 운영 빌드·`next start`에서는 꺼짐 |
| `true` | 개발에서 명시적으로 켜짐. **운영 빌드는 거부** |
| `false` | 개발에서도 꺼짐 |

꺼져 있으면 `/admin/test/location-sim`은 안내 문구만 보이고, `useMock`은 에러로 거절됩니다.

## 7. PWA 서비스 워커와 화면 유지

- `public/sw.js` 캐시 이름 `noeul-walk-v4`. 홈(`/`)만 탐색 결과로 캐시합니다. `/admin`은 캐시하지 않습니다.
- Wake Lock은 서비스 워커가 아니라 `WakeLockProvider`(화면이 보일 때 `navigator.wakeLock`)가 유지합니다. 탭이 가려지면 OS가 잠금을 풀고, 다시 보이면 재요청합니다.
- 등록 시 `updateViaCache: 'none'`으로 오래된 `sw.js`를 쓰지 않습니다.
- **Web Share Target (GPX):** `public/manifest.json`의 `share_target`로 `.gpx`/`.kml` 파일 공유를 받습니다. 설치된 Chromium PWA(주로 Android Chrome)에서만 안정적으로 동작합니다. iOS Safari·데스크톱 대부분 브라우저는 Share Target을 지원하지 않으므로, **앱 안 「루트 가져오기」가 기본 가져오기 방법**입니다. 공유가 오면 SW가 `POST /share-target`을 가로채 캐시에 저장한 뒤 `/?shared=gpx`로 보냅니다.

## 8. 새 기능을 넣을 때

1. 위치 수학은 Worker에, 말·이탈·버튼은 페이지에 둡니다.
2. 지도를 움직이려면 `MapManager`만 고칩니다. 컴포넌트에서 `panTo`를 호출하지 않습니다.
3. 스토어에 필드를 추가하면 `MapManager` 구독 슬라이스에 넣을지 먼저 정합니다. 넣으면 그 필드가 바뀔 때마다 마커/궤적이 반응합니다.
4. 긴 폴리라인은 길이 상한을 둡니다.
5. 가상 GPS는 관리자 테스트 페이지와 `isLocationSimAllowed()` 뒤에서만 켭니다.
