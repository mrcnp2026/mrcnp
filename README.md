# 사무실 근태관리 — 앱 코드

기획 문서는 `근태관리\01 빌드 프롬프트\`에 있다 (이 폴더로 복사하지 않는다). 진행 상태는 `근태관리\CURRENT_STATUS.md`.
문서 우선순위: **부록(1.5판) > ①②③ 본문**.

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 앱 켜기 — http://localhost:4123 |
| `npm run verify` | 자동 검사 전체 (계정 없이 도는 것 + 열쇠가 있으면 권한 회귀 검사) |
| `npm run verify:rls` | 권한 회귀 검사만. `SUPABASE_DB_URL`이 없으면 **실패**한다. 마이그레이션 적용 후 매번 (부록 R-12-6) |
| `npm run check:db` | 열쇠 파일(`.env.local`)이 제대로 들어갔는지 확인 |
| `npm run db:apply -- <파일>` | 마이그레이션 1개를 한 트랜잭션으로 적용 (적용 뒤 `verify:rls`) |
| `npm run admin:invite -- --no <사번> [--name 이름]` | **비상 관리자 초대** (부록 R-2의 4). 첫 관리자 만들기도 이것으로 |
| `npm run e2e:gate3 -- <관리자 초대 링크>` | 실제 Chrome + 가상 인증기로 등록·로그인 확인, 360px 캡처 (⚠️ 사번 `test` 직원을 만든다 — 이미 있으면 실패) |
| `npm run audit:overflow` | **가로 넘침 검수** — 모든 화면 × 폭 7가지(320~1280) × 영어·한국어. 화면을 고칠 때마다 (사번 test를 잠깐 관리자로 바꿨다 되돌림) |
| `npm run i18n:export` | 번역 검수 표(CSV) 내보내기 → `checks/번역-검수.csv` (부록 R-15) |

## 열쇠 파일

`.env.sample`을 복사해 `.env.local`로 저장하고 값을 넣는다. `.env.local`은 git에 올라가지 않는다.
`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이다 — `src/lib/supabase/admin.ts`만 쓰고, 이 파일은 브라우저 코드에서 import하면 빌드가 실패한다.

## 데이터베이스

- 프로젝트: Supabase `출퇴근관리`, **서울 리전**(`ap-northeast-2`) — 부록 R-1
- 표 만들기 파일: `supabase/migrations/` (번호 순서대로, 이미 적용한 파일은 고치지 않는다 — R-12-6)
- 권한 잠금 세 겹:
  1. 브라우저 로그인 세션은 **읽기 정책만** 있다 (직원은 자기 것, 관리자는 전체)
  2. 브라우저 쪽 역할(anon·authenticated)에서 **쓰기 권한 자체를 회수**했다
  3. **트리거**: 서버도 `punch_events`를 고치거나 지우지 못한다. 정정·연장·패스키 표는 사실 칸을 못 바꾼다
- 기록을 쓰는 것은 서버 API(`service_role`)뿐이다 (마스터 6장 1.3판)

## 알려진 한계 (마스터 지시로 여기에 적는다)

- **사무실 WiFi 확인은 완전한 대리 출근 방지가 아니다.** WiFi가 닿는 곳(주차장·옆 건물)에서도 찍힌다. 목표는 재택·외부 출근 기록을 걸러내는 것이다.
- **폰 1대 고정은 엄밀하지 않다.** 아이폰·안드로이드의 패스키는 같은 사람의 애플·구글 계정 안에서 다른 기기로 동기화될 수 있다. 대리 출근을 하려면 그 계정까지 넘겨야 하므로 문턱은 충분히 높지만, 완전한 "1기기 고정"은 아니다. 동기화 여부는 등록 때 `user_passkeys.backed_up`에 기록만 한다 (4-11).
- **폰 등록은 앱 주소(도메인)에 묶인다.** `localhost`에서 등록한 것은 배포 주소에서 안 되고, 배포 도메인을 바꾸면 전 직원이 다시 등록해야 한다. 실제 도메인은 게이트 9에서 정한 뒤 직원을 등록한다.
- **미기록 배너는 직원이 앱을 열어야 보인다.** 며칠 앱을 안 연 직원에게는 그동안 안 보이므로 관리자 화면의 '미기록' 표시가 함께 필요하다 (7-8).
- **서버는 생체정보를 받지 않는다.** 지문·얼굴 확인은 폰 안에서 끝나고, 서버에는 공개키·서명 횟수·기기 종류만 저장된다.
- **로그인 실패 안내**: 등록되지 않은 폰과 사용자가 취소한 경우를 브라우저가 구분해 주지 않아(개인정보 보호), 둘을 합친 문구를 보여 준다.

## 로그인 방식 (마스터 8-3)

비밀번호가 없다. 폰의 패스키를 서버가 검증한 뒤 Supabase 1회용 로그인 링크를 서버 안에서 바로 세션으로 바꾼다 (`src/lib/session.ts`). 직원 계정 이메일은 받는 사람이 없는 `{사번}@staff.invalid`.

## 배포 (게이트 9)

- 주소: **https://mrcnp-saas.vercel.app** (Vercel 팀 `mrcnp`, 프로젝트 `mrcnp-saas`). 폰 등록(패스키)이 이 주소에 묶인다 — 바꾸면 전 직원 재등록 (B-13)
- GitHub `mrcnp2026/mrcnp`의 `main`에 올리면 자동 배포된다. 이 PC의 로컬 브랜치는 `master` → `git push origin master:main`
- ⚠️ Vercel 무료(Hobby) 팀은 **팀 멤버가 아닌 사람이 만든 커밋의 배포를 막는다(BLOCKED)**. 그래서 이 저장소의 커밋 작성자는 `mrcnp2026`으로 설정해 두었다 (`git config user.name/user.email`, 저장소 단위)
- 서버 열쇠: Vercel → Settings → Environment Variables에 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SERVICE_ROLE_KEY`(sensitive)·`APP_ORIGIN`. `SUPABASE_DB_URL`은 서버에 두지 않는다 (PC 검사용)
