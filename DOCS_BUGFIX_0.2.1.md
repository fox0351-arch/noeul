# 버그픽스 검증 0.2.1

날짜: 2026-08-24  
환경: 로컬 `next dev`, Chromium 웹뷰  
시뮬 입구: [http://localhost:3000/?sim=1](http://localhost:3000/?sim=1)  
실제 시뮬 화면: [http://localhost:3000/admin/test/location-sim](http://localhost:3000/admin/test/location-sim)

`?sim=1` 은 관리자 위치 시뮬 페이지로 보냅니다. 가상 GPS는 개발 서버에서만 동작합니다.

## 1. 린트

`src/app/page.tsx` 첨부 사진 `<img>`에 `@next/next/no-img-element` 예외만 달았습니다. 표시 로직은 그대로입니다. `npx tsc --noEmit` 통과.

## 2. 시뮬 데이터 (계곡따라2)

- 원본 트랙: `public/gyeokttara-2.gpx` (이름 **계곡따라2**)
- 가상 보행: `src/workers/location-mock.ts` 가 같은 좌표를 시속 4km로 따라갑니다.
- 시작점: 북위 35.3218, 동경 129.2184 (기장 계곡, 서울 기본 중심 37.5665/126.9780 아님)

따라가기 카메라는 끄고, 루트를 그린 뒤 `MapManager.fitRouteBounds()` → `map.fitBounds` 를 호출합니다.

## 3. 화면 확인 결과

| 항목 | 결과 |
| --- | --- |
| 가상 사용자 위치로 중심 | **통과.** 파란 화살표가 루트 시작점에 있고, 서울 도심 타일이 아닙니다. GPS 카운트가 올라갑니다. |
| 계곡따라2 전체 `fitBounds` | **통과.** 빨간 폴리라인이 시작(화살표)부터 끝(화면 오른쪽 위)까지 한 화면에 들어옵니다. 디버그 막대의 `fitBounds` 숫자는 따라가기 카메라 디버그가 꺼져 있어 0으로 남을 수 있습니다. 실제 화면은 루트 전체가 보입니다. |
| 남성 음성 | **부분 통과.** 홈에서 「남성」이 선택됩니다. 이 Chromium에는 한국어 음성이 `Microsoft Heami` 하나뿐이라 남성 전용 보이스는 없습니다. 남성 패턴에 맞는 음성이 없는 기기는 그 음성으로 말합니다. |

## 4. 현장 테스트 전 참고

- 시뮬 URL: `http://localhost:3000/?sim=1`
- 운영 빌드에는 가상 GPS를 넣지 마세요.
- 현장에서는 실제 GPS·실제 GPX 가져오기로 다시 확인하면 됩니다.
