// 도움말 내용 (2026-10-26 의뢰인: 다우오피스 서비스 가이드 · 고객지원 챗봇을 보고, PC 화면 기준 · 한국어 먼저 · 직원용 + 관리자용).
// ★ 화면에 실제로 있는 이름만 쓴다 — 메뉴 · 단추 이름은 messages/ko.json의 것과 같게 [대괄호]로 적는다(화면에서 굵게 보인다).
// ★ 확인하지 못한 동작은 적지 않는다. 바뀌면 이 파일만 고치면 된다(화면 코드는 건드리지 않는다).
// 번역: 화면 틀(제목 · 단추)은 messages의 help 열쇠, 내용은 한국어만 있다 — 영어로 보는 사람에게는 한국어 내용이 그대로 보인다.
export type Audience = 'staff' | 'admin';
export type Block =
  | { t: 'p'; text: string }
  | { t: 'steps'; items: string[] }
  | { t: 'list'; items: string[] }
  | { t: 'note'; tone: 'tip' | 'warn'; text: string };
export type Section = { id: string; title: string; blocks: Block[] };
export type Article = { id: string; audience: Audience; group: string; title: string; summary: string; updated: string; sections: Section[]; related?: string[] };
export type Faq = { id: string; audience: Audience; q: string; a: string; article?: string };

/** 왼쪽 차례의 묶음 — 순서 그대로 보인다 */
export const GROUPS: { id: string; audience: Audience; title: string }[] = [
  { id: 'start', audience: 'staff', title: '시작하기' },
  { id: 'punch', audience: 'staff', title: '출퇴근' },
  { id: 'leave', audience: 'staff', title: '휴가 · 요청' },
  { id: 'pay', audience: 'staff', title: '급여' },
  { id: 'pay-month', audience: 'admin', title: '매달 급여 처리' },
  { id: 'pay-setup', audience: 'admin', title: '급여 기준 정하기' },
  { id: 'pay-after', audience: 'admin', title: '퇴직' },
  { id: 'admin-etc', audience: 'admin', title: '그 밖에' },
];

const U = '2026-10-26';

export const ARTICLES: Article[] = [
  // ───────────── 직원 ─────────────
  {
    id: 'staff-first-login', audience: 'staff', group: 'start', title: '처음 로그인하고 출퇴근 기기 등록하기', updated: U,
    summary: '관리자에게 받은 초대로 로그인한 뒤, 평소 쓰는 내 폰을 출퇴근 기기로 한 번 등록합니다.',
    sections: [
      { id: 'login', title: '로그인', blocks: [
        { t: 'steps', items: ['관리자에게 받은 초대 링크를 폰에서 엽니다.', '화면 안내에 따라 비밀번호를 정합니다.', '다음부터는 로그인 화면의 [지문·얼굴로 로그인]을 누르면 됩니다.'] },
      ] },
      { id: 'device', title: '출퇴근 기기 등록', blocks: [
        { t: 'p', text: '출퇴근은 등록한 기기 1대에서만 찍을 수 있습니다. 평소 들고 다니는 본인 폰에서 등록하세요.' },
        { t: 'steps', items: ['폰에서 로그인한 뒤 홈 화면으로 갑니다.', '[이 기기를 출퇴근 기기로 등록]을 누릅니다.', '화면 안내에 따라 지문·얼굴(또는 화면 잠금)로 본인을 확인합니다.'] },
        { t: 'note', tone: 'tip', text: '지문·얼굴 정보는 기기 밖으로 나가지 않습니다. 회사는 지문으로 되돌릴 수 없는 보안 키만 저장합니다.' },
        { t: 'note', tone: 'warn', text: '폰의 설정에서 화면 잠금(PIN · 패턴 · 지문)이 켜져 있어야 등록할 수 있습니다.' },
      ] },
      { id: 'change', title: '폰을 바꿨을 때', blocks: [
        { t: 'p', text: '새 폰에서는 출퇴근을 찍을 수 없습니다. 관리자에게 출퇴근 기기 해제를 요청한 뒤, 새 폰에서 다시 등록하세요.' },
      ] },
    ],
    related: ['staff-punch', 'staff-home'],
  },
  {
    id: 'staff-home', audience: 'staff', group: 'start', title: '홈 화면 보는 법', updated: U,
    summary: '오늘 근무, 출근·퇴근 단추, 이번 주 근무를 한 화면에서 봅니다.',
    sections: [
      { id: 'what', title: '홈에서 볼 수 있는 것', blocks: [
        { t: 'list', items: ['오늘의 근무와 [출근하기] · [퇴근하기] 단추', '이번 주 근무 일정과 근무 시간'] },
        { t: 'p', text: '왼쪽 메뉴에서 [출퇴근], [휴가], [요청], [급여], [소통]으로 이동합니다.' },
      ] },
    ],
    related: ['staff-punch', 'staff-leave', 'staff-payslip'],
  },
  {
    id: 'staff-punch', audience: 'staff', group: 'punch', title: '출근하기 · 퇴근하기', updated: U,
    summary: '홈 화면의 단추를 누르고 지문(또는 얼굴)으로 확인하면 기록됩니다.',
    sections: [
      { id: 'daily', title: '매일 하는 방법', blocks: [
        { t: 'steps', items: ['앱을 엽니다.', '[출근하기]를 누릅니다. 퇴근할 때는 [퇴근하기]를 누릅니다.', '지문(또는 얼굴)으로 본인을 확인합니다. 한 번이면 됩니다.'] },
        { t: 'p', text: '찍은 시각은 [출퇴근]의 [내 출퇴근기록]에서 확인합니다.' },
      ] },
      { id: 'device', title: '찍히지 않을 때', blocks: [
        { t: 'list', items: ['「이 기기는 출퇴근 기기로 등록되어 있지 않습니다」가 보이면 등록한 폰이 아닙니다. 등록한 폰에서 찍거나, 폰을 바꿨다면 관리자에게 기기 해제를 요청하세요.', '위치 권한이 꺼져 있으면 근무지 안에서도 바로 기록되지 않을 수 있습니다. 위치 권한을 허용해 주세요.'] },
      ] },
    ],
    related: ['staff-outside', 'staff-correction', 'staff-first-login'],
  },
  {
    id: 'staff-outside', audience: 'staff', group: 'punch', title: '근무지 밖에서 찍었을 때', updated: U,
    summary: '출퇴근 장소 반경 밖에서는 바로 기록되지 않고, 관리자가 승인해야 기록됩니다.',
    sections: [
      { id: 'what', title: '어떻게 되나요', blocks: [
        { t: 'p', text: '출퇴근 장소 반경 밖에서 찍으면 기록 대신 요청이 만들어집니다. 아직 기록된 것이 아니고, 관리자가 승인하면 찍은 시각으로 기록됩니다.' },
        { t: 'p', text: '위치를 확인하지 못한 경우도 같습니다. 위치 권한을 허용하면, 반경 안에서는 바로 기록됩니다.' },
        { t: 'note', tone: 'tip', text: '승인 결과는 [요청]에서 확인할 수 있습니다.' },
      ] },
    ],
    related: ['staff-requests', 'staff-punch'],
  },
  {
    id: 'staff-correction', audience: 'staff', group: 'punch', title: '출퇴근 기록을 빠뜨렸을 때 (정정 요청)', updated: U,
    summary: '출근이나 퇴근을 찍지 못했다면 정정 요청으로 보내고, 관리자의 승인을 기다립니다.',
    sections: [
      { id: 'how', title: '정정 요청하기', blocks: [
        { t: 'steps', items: ['빠진 기록은 홈 화면에 안내가 나옵니다. [내 출퇴근기록]에서 그 날짜를 찾아도 됩니다.', '[정정 요청]을 누릅니다.', '맞는 시각과 사유를 적어 보냅니다.'] },
        { t: 'p', text: '요청한 뒤에는 「정정 요청 검토 중」으로 보입니다. 관리자가 승인하면 기록이 고쳐집니다.' },
      ] },
      { id: 'after', title: '마감된 달은 어떻게 되나요', blocks: [
        { t: 'note', tone: 'warn', text: '회사가 그 달의 근태를 마감했다면 기록을 바로 고칠 수 없습니다. 관리자에게 알려 다시 열어 달라고 요청하세요.' },
      ] },
    ],
    related: ['staff-requests'],
  },
  {
    id: 'staff-leave', audience: 'staff', group: 'leave', title: '휴가 신청하고 남은 연차 보기', updated: U,
    summary: '[휴가]에서 남은 연차를 보고 신청합니다. 승인되면 남은 연차에서 빠집니다.',
    sections: [
      { id: 'balance', title: '남은 연차 보기', blocks: [
        { t: 'p', text: '[휴가]를 열면 「남은 연차」가 보입니다. 승인을 기다리는 일수는 승인되면 남은 연차에서 빠집니다.' },
      ] },
      { id: 'apply', title: '휴가 신청하기', blocks: [
        { t: 'steps', items: ['[휴가]에서 [휴가 신청]을 누릅니다.', '휴가 종류와 날짜(또는 시간)를 고릅니다.', '[신청하기]를 누릅니다. 관리자가 확인합니다.'] },
        { t: 'p', text: '신청한 내용은 [내 신청]에 모이고, 승인 전에는 [신청 취소]로 취소할 수 있습니다.' },
      ] },
    ],
    related: ['staff-requests'],
  },
  {
    id: 'staff-requests', audience: 'staff', group: 'leave', title: '내 요청 확인하고 취소하기', updated: U,
    summary: '낸 요청(정정, 휴가 등)이 어떻게 처리됐는지 한 곳에서 봅니다.',
    sections: [
      { id: 'see', title: '처리 결과 보기', blocks: [
        { t: 'p', text: '[요청]을 열면 대기 중인 요청과 완료된 요청이 나뉘어 보입니다. 처리되면 알림이 오고, 왼쪽 메뉴에도 새 결과 수가 표시됩니다.' },
        { t: 'p', text: '아직 처리되지 않은 요청은 [취소하기]로 취소할 수 있습니다.' },
      ] },
    ],
    related: ['staff-correction', 'staff-leave'],
  },
  {
    id: 'staff-payslip', audience: 'staff', group: 'pay', title: '내 급여명세서 보기', updated: U,
    summary: '회사가 공개한 명세서만 [급여]의 [내 급여 조회]에 보입니다. 메일로도 받을 수 있습니다.',
    sections: [
      { id: 'app', title: '앱에서 보기', blocks: [
        { t: 'steps', items: ['왼쪽 메뉴에서 [급여]의 [내 급여 조회]를 엽니다.', '월별 목록에서 보고 싶은 달을 누르면 지급 · 공제 항목과 실지급액이 보입니다.'] },
        { t: 'p', text: '회사가 이달 명세서를 공개하기 전에는 「아직 공개된 명세서가 없습니다」라고 보입니다.' },
      ] },
      { id: 'mail', title: '메일로 받기', blocks: [
        { t: 'p', text: '명세서를 공개하면 메일도 같이 나갑니다. 메일의 PDF는 비밀번호로 잠겨 있고, 비밀번호는 생년월일 6자리(예: 900131)입니다.' },
        { t: 'note', tone: 'tip', text: '메일에 금액은 쓰여 있지 않습니다. 금액은 첨부 PDF와 앱에서만 볼 수 있습니다.' },
      ] },
      { id: 'wrong', title: '금액이 맞지 않을 때', blocks: [
        { t: 'p', text: '회사 관리자에게 알려 주세요. 고쳐지면 정정 명세서가 새로 공개됩니다.' },
      ] },
    ],
    related: ['staff-home'],
  },

  // ───────────── 관리자 ─────────────
  {
    id: 'admin-pay-flow', audience: 'admin', group: 'pay-month', title: '한 달 급여 처리 순서', updated: U,
    summary: '기록 확정부터 명세서 공개까지 매달 같은 순서로 합니다. 앞 단계가 끝나지 않으면 다음 단계는 막힙니다.',
    sections: [
      { id: 'order', title: '순서 한눈에 보기', blocks: [
        { t: 'steps', items: [
          '출퇴근 기록을 확정합니다. 확정한 기록만 급여에 쓰입니다. ([근태]의 출퇴근 화면)',
          '[급여]의 [근태 마감]에서 그 달을 마감합니다. 마감 뒤에는 기록을 확정할 수 없으니, 반드시 확정을 먼저 합니다.',
          '[급여 점검]에서 계약 · 세무 · 보험 설정이 빠진 사람이 없는지 봅니다.',
          '[급여대장]에서 [급여대장 생성] → [계산하기] → [검토 완료] → [확정하기] 순서로 진행합니다.',
          '[공개]를 누르면 직원이 [내 급여 조회]에서 보고, 명세서 메일도 같이 나갑니다.',
        ] },
        { t: 'note', tone: 'tip', text: '사원별 급여(계약 · 세무 · 고정 항목)는 입사 · 인상 · 변경 때만 고치면 됩니다. 매달 하는 일이 아닙니다.' },
      ] },
      { id: 'blocked', title: '계산이 막히면', blocks: [
        { t: 'p', text: '앱은 모르는 값을 0원으로 채우지 않고 그 사람의 계산을 멈춥니다. 급여대장의 직원 줄에 사유가 글로 보입니다.' },
        { t: 'p', text: '자주 만나는 사유는 「계산이 막혔을 때 확인할 것」 글을 보세요.' },
      ] },
      { id: 'correct', title: '확정한 뒤에 고치려면', blocks: [
        { t: 'p', text: '확정한 대장은 바꿀 수 없습니다. [정정 시작]으로 판 번호를 올린 새 초안을 만들어 고치고, 다시 확정 · 공개하면 직원에게 정정 명세서가 공개됩니다.' },
      ] },
    ],
    related: ['admin-blocked', 'admin-close', 'admin-slip-mail', 'admin-staff-pay'],
  },
  {
    id: 'admin-blocked', audience: 'admin', group: 'pay-month', title: '계산이 막혔을 때 확인할 것', updated: U,
    summary: '급여대장 직원 줄의 사유를 보고 아래 표대로 고칩니다. 고친 뒤 다시 [계산하기]를 누릅니다.',
    sections: [
      { id: 'list', title: '사유별 해결', blocks: [
        { t: 'list', items: [
          '「이 달의 근태를 마감하지 않았습니다」 → [급여]의 [근태 마감]에서 마감합니다. 미확정 기록이 있으면 먼저 기록을 확정합니다.',
          '「계약이 없습니다」 · 「세무 · 보험 설정이 없습니다」 → [사원별 급여]에서 계약과 세무 · 보험을 등록합니다.',
          '「비과세 한도가 없습니다 (식대 등)」 → [통합설정]의 급여 설정에서 그 항목의 비과세 한도를 넣습니다.',
          '「신고 보수가 없습니다」 → 보험 기준이 「신고 보수」인데 직원에게 값이 없는 경우입니다. [사원별 급여]의 세무 · 보험에서 넣습니다.',
          '「달 중간에 입사 · 퇴사했거나 계약이 달 중간에 시작됐습니다」 → 일할 계산은 자동으로 하지 않습니다. 기본급을 금액 조정으로 직접 넣습니다.',
          '「귀속 기간 중 기준이 바뀌었습니다」 → 그 달 중간에 항목이나 정책의 새 판이 시작된 경우입니다. 기준 날짜를 확인합니다.',
          '「승인된 기준 자료가 없습니다」 → [통합설정]의 사회보험 요율표 · 근로소득 간이세액표를 확인합니다.',
        ] },
      ] },
    ],
    related: ['admin-pay-flow', 'admin-insurance-basis'],
  },
  {
    id: 'admin-close', audience: 'admin', group: 'pay-month', title: '근태 마감과 다시 열기', updated: U,
    summary: '그 달의 출퇴근을 확정한 뒤 마감하면 기록을 고칠 수 없게 잠기고, 급여 계산이 그 기록을 씁니다.',
    sections: [
      { id: 'close', title: '마감하기', blocks: [
        { t: 'steps', items: ['출퇴근 기록을 모두 확정합니다.', '[급여]의 [근태 마감]에서 직원을 고르고 [고른 N명 마감]을 누릅니다.'] },
        { t: 'note', tone: 'warn', text: '마감한 기간에는 기록을 확정할 수 없습니다. 순서가 바뀌지 않게 주의하세요.' },
      ] },
      { id: 'reopen', title: '다시 열기', blocks: [
        { t: 'p', text: '마감한 달을 고쳐야 하면 [다시 열기]를 누르고 사유를 적습니다. 다시 열면 그 달의 기록을 고칠 수 있고, 다시 연 기록이 남습니다.' },
        { t: 'p', text: '다른 관리자의 확인이 필요한 경우에는 「다시 열기 확인 대기」로 바뀌고, 그 관리자가 [확인하고 열기]를 누르면 열립니다.' },
        { t: 'note', tone: 'tip', text: '다시 열었다가 닫으면 새 판으로 마감됩니다. 이미 계산한 급여대장은 다시 [계산하기]를 눌러야 반영됩니다.' },
      ] },
    ],
    related: ['admin-pay-flow'],
  },
  {
    id: 'admin-slip-mail', audience: 'admin', group: 'pay-month', title: '명세서 공개와 메일 발송', updated: U,
    summary: '[공개]를 누르면 직원 앱에 명세서가 보이고, 같은 때 메일이 자동으로 나갑니다.',
    sections: [
      { id: 'publish', title: '공개하기', blocks: [
        { t: 'p', text: '급여대장을 확정한 뒤 [공개하지 않은 N명에게 공개]를 누르면 직원의 [내 급여 조회]에 보입니다. 한 사람씩 [공개]할 수도 있습니다.' },
      ] },
      { id: 'mail', title: '메일', blocks: [
        { t: 'p', text: '공개하는 순간 명세서 메일이 자동으로 나갑니다. 메일의 PDF는 직원 생년월일 6자리로 잠기고, 본문에는 금액이 없습니다.' },
        { t: 'p', text: '누구에게 갔고 누구에게 안 갔는지는 [이력 · 내역]의 [급여명세서 발송]에서 봅니다. 이메일 주소나 생년월일이 없는 직원은 보내지 못하고 사유가 남습니다.' },
        { t: 'note', tone: 'warn', text: '메일을 보내는 계정이 아직 설정되지 않았다면 이메일은 나가지 않습니다(공개와 앱 알림은 됩니다).' },
      ] },
    ],
    related: ['admin-pay-flow', 'staff-payslip'],
  },
  {
    id: 'admin-staff-pay', audience: 'admin', group: 'pay-setup', title: '사원별 급여 — 계약 · 세무 · 고정 항목', updated: U,
    summary: '한 번 넣어 두면 매달 자동으로 쓰입니다. 입사 · 인상 · 변경 때만 고칩니다.',
    sections: [
      { id: 'tabs', title: '무엇을 넣나요', blocks: [
        { t: 'list', items: ['계약: 급여 형태(월급 · 연봉 · 시급)와 금액', '세무 · 보험: 부양가족 수, 4대보험 가입 여부와 신고 보수', '고정 수당 · 공제: 직책수당 · 식대 · 상조회비처럼 매달 같은 항목'] },
        { t: 'p', text: '[급여] › [사원별 급여]에서 직원을 눌러 입력합니다.' },
      ] },
      { id: 'versions', title: '고치면 새 기록이 쌓입니다', blocks: [
        { t: 'p', text: '계약과 세무는 고치면 지우지 않고 새 판이 쌓입니다. 적용 시작일을 정하고, 이미 있는 판보다 앞선 날짜로는 새 판을 만들 수 없습니다.' },
        { t: 'note', tone: 'tip', text: '성과급처럼 달마다 다른 금액은 고정 항목으로 두고 급여대장에서 그 달만 금액 조정을 하거나, 직접 입력 항목으로 만듭니다.' },
      ] },
      { id: 'family', title: '소득세 부양가족', blocks: [
        { t: 'p', text: '소득세는 부양가족 수(본인 포함)에 따라 달라집니다. 회사에 부양가족 신고가 반영되어 있는지 실제 명세서의 소득세와 견주어 확인하세요.' },
      ] },
    ],
    related: ['admin-insurance-basis', 'admin-items'],
  },
  {
    id: 'admin-insurance-basis', audience: 'admin', group: 'pay-setup', title: '4대보험은 어떤 금액으로 뗄까 (신고 보수)', updated: U,
    summary: '국민연금 · 건강보험은 그 달 급여가 아니라 공단에 신고된 기준액으로 떼는 회사가 많습니다. 회사 방식에 맞게 고릅니다.',
    sections: [
      { id: 'basis', title: '세 가지 기준', blocks: [
        { t: 'list', items: ['그 달 급여 기준: 그 달 과세 급여에 요율을 곱합니다.', '신고 보수 기준: 직원마다 넣은 신고 기준액(기준소득월액 · 보수월액)에 요율을 곱합니다.', '고지 보험료 기준: 공단이 고지한 보험료를 그대로 씁니다.'] },
        { t: 'p', text: '보험마다 따로 고를 수 있습니다. 예: 국민연금 · 건강은 신고 보수, 고용보험은 그 달 급여.' },
      ] },
      { id: 'where', title: '어디서 고르나요', blocks: [
        { t: 'steps', items: ['[통합설정] › 급여 설정의 [급여대장 기본값]에서 보험 기준을 고릅니다.', '[사원별 급여]의 세무 · 보험에서 직원마다 신고 보수를 넣습니다. 국민연금과 건강보험의 신고 기준액은 서로 다를 수 있습니다.'] },
        { t: 'note', tone: 'warn', text: '회사 기준이 「그 달 급여」일 때 신고 보수를 넣어도 계산에는 쓰이지 않습니다. 세무 · 보험 입력 칸 아래에 그렇게 안내가 나옵니다.' },
      ] },
      { id: 'check', title: '맞는지 확인하는 방법', blocks: [
        { t: 'p', text: '실제 급여명세서의 국민연금 · 건강보험 금액을 요율로 거꾸로 나눠 보면 어떤 기준액을 썼는지 알 수 있습니다. 같은 금액이 나오면 기준이 맞는 것입니다.' },
      ] },
    ],
    related: ['admin-staff-pay', 'admin-blocked'],
  },
  {
    id: 'admin-items', audience: 'admin', group: 'pay-setup', title: '지급 · 공제 항목 만들기', updated: U,
    summary: '식대 · 직책수당 · 성과급 같은 항목을 만들고, 과세와 퇴직금 계산에서의 취급을 정합니다.',
    sections: [
      { id: 'make', title: '항목 만들기', blocks: [
        { t: 'p', text: '[통합설정] › 급여 설정의 [지급항목] · [공제항목]에서 만듭니다. 금액을 매달 같게 넣을 항목은 계산 방법을 「고정 금액」, 달마다 다르면 「직접 입력」으로 합니다.' },
      ] },
      { id: 'tax', title: '과세 구분과 비과세 한도', blocks: [
        { t: 'p', text: '식대처럼 일부 비과세인 항목은 한도(월 20만 원 등)를 꼭 넣어야 합니다. 한도가 비어 있으면 계산이 멈춥니다.' },
        { t: 'p', text: '이름을 보고 과세 구분을 추천해 줍니다. 고르는 것은 사람이 하고, 한도는 세무 담당자에게 확인하세요.' },
      ] },
      { id: 'avg', title: '퇴직금 평균임금에서', blocks: [
        { t: 'p', text: '퇴직금을 계산할 때 이 항목을 어떻게 볼지 정합니다.' },
        { t: 'list', items: ['월 임금으로 본다: 최근 3개월 임금에 넣습니다.', '연 상여로 본다: 직전 1년 상여로 보아 3/12만 반영합니다.', '뺀다: 평균임금에 넣지 않습니다.', '정하지 않음: 월 임금으로 계산하고, 퇴직급여 화면에 안내가 나옵니다.'] },
        { t: 'note', tone: 'tip', text: '성과급이 매달 같은 금액이면 월 임금으로 보든 연 상여로 보든 결과가 같습니다. 연 1회만 받는다면 연 상여로 정하세요.' },
      ] },
    ],
    related: ['admin-retirement', 'admin-staff-pay'],
  },
  {
    id: 'admin-retirement', audience: 'admin', group: 'pay-after', title: '퇴직급여 계산하기', updated: U,
    summary: '마지막 근무일을 넣고 [자료에서 채우기]를 누르면 3개월 임금과 상여가 채워집니다. 확인하고 고친 뒤 만듭니다.',
    sections: [
      { id: 'how', title: '계산 순서', blocks: [
        { t: 'steps', items: ['[급여] › [퇴직급여]에서 종류(예상 · 퇴직 정산 · 중간정산)와 [마지막 근무일 (기준일)]을 고릅니다.', '[자료에서 채우기]를 누릅니다.', '채워진 값을 확인하고 고칩니다.', '[이 값으로 만들기]를 누릅니다.'] },
      ] },
      { id: 'fill', title: '무엇이 채워지나요', blocks: [
        { t: 'list', items: ['계속근로 시작일: 재직 기간(없으면 입사일). 확정한 중간정산이 있으면 그 다음 날.', '3개월 임금: 마지막 근무일이 월말일 때만, 그 석 달의 확정한 정규 급여로 채웁니다. 석 달이 다 있지 않으면 비워 두니 직접 넣습니다.', '직전 1년 상여: 확정한 상여 대장과, 항목을 「연 상여」로 정한 급여 항목의 합계.'] },
        { t: 'note', tone: 'warn', text: '연차수당 · 통상임금 · 제외 기간은 채우지 않습니다. 직접 넣어 주세요. 퇴직소득세는 계산하지 않고 확인된 값을 손으로 넣습니다.' },
      ] },
      { id: 'dc', title: '퇴직연금(DC)에 가입한 직원이라면', blocks: [
        { t: 'p', text: '회사가 계좌에 넣은 부담금이 퇴직급여의 중심이고, 이 계산은 법정 기준과 견주어 보는 참고값입니다.' },
      ] },
    ],
    related: ['admin-pension', 'admin-items'],
  },
  {
    id: 'admin-pension', audience: 'admin', group: 'pay-after', title: '퇴직연금(DC) 부담금과 계좌 평가금액', updated: U,
    summary: '매달 그 달 지급 합계의 12분의 1을 부담금으로 쌓고, 계좌 평가금액을 적어 두면 운용수익을 참고로 봅니다.',
    sections: [
      { id: 'rule', title: '부담금 계산', blocks: [
        { t: 'p', text: 'DC형은 연간 임금총액의 12분의 1 이상을 근로자 계좌에 넣습니다. 앱은 매달 「그 달 확정한 급여명세의 지급 합계 ÷ 12」로 쌓습니다.' },
      ] },
      { id: 'member', title: '가입자 넣기', blocks: [
        { t: 'steps', items: ['[급여] › [퇴직연금]에서 가입자를 넣습니다.', '처음 적립금과 그 기준일(은행 자료의 납입원금)을 적습니다.', '필요하면 [계좌 평가금액]과 그 기준일을 적습니다.'] },
        { t: 'note', tone: 'tip', text: '평가금액은 참고 표시용입니다. 입력하면 「평가금액 − 그날까지 앱에 쌓은 원금」으로 운용수익이 보입니다. 회사가 줄 금액이 아닙니다.' },
      ] },
    ],
    related: ['admin-retirement'],
  },
  {
    id: 'admin-console', audience: 'admin', group: 'admin-etc', title: '통합설정은 무엇을 하는 곳인가요', updated: U,
    summary: '회사 전체와 각 업무의 기준을 정하는 곳입니다. 날마다 하는 처리는 관리자 화면에서 합니다.',
    sections: [
      { id: 'map', title: '어디에 무엇이 있나요', blocks: [
        { t: 'list', items: ['회사설정: 회사 기본 · 조직 · 권한과 보안 · 데이터 보관(백업)', 'App 관리: 근태 · 휴가 · 요청 · 메시지 · 리포트 · 급여 · 인사 설정'] },
        { t: 'p', text: '위쪽 띠의 톱니 모양을 누르면 열립니다. 최고관리자만 보이고, 여기서 바꾼 기준은 회사 전체에 적용됩니다.' },
        { t: 'note', tone: 'tip', text: '설정이 어디 있는지 모르겠으면 통합설정 안의 [설정 찾기]에 이름을 입력해 보세요.' },
      ] },
    ],
    related: ['admin-pay-flow'],
  },
];

export const FAQS: Faq[] = [
  // 직원
  { id: 'f-nomark', audience: 'staff', q: '출근을 찍었는데 기록이 안 보여요', a: '근무지 반경 밖이었거나 위치를 확인하지 못했다면 기록 대신 요청이 만들어지고, 관리자가 승인해야 기록됩니다. [요청]에서 처리 상태를 확인하세요.', article: 'staff-outside' },
  { id: 'f-nodevice', audience: 'staff', q: '「출퇴근 기기로 등록되어 있지 않습니다」라고 나와요', a: '출퇴근은 등록한 기기 1대에서만 찍을 수 있습니다. 등록한 폰에서 찍거나, 폰을 바꿨다면 관리자에게 기기 해제를 요청한 뒤 새 폰에서 다시 등록하세요.', article: 'staff-first-login' },
  { id: 'f-forgot-out', audience: 'staff', q: '퇴근을 안 찍고 퇴근했어요', a: '[내 출퇴근기록]에서 그 날짜의 [정정 요청]으로 맞는 시각과 사유를 보내세요. 관리자가 승인하면 고쳐집니다.', article: 'staff-correction' },
  { id: 'f-leave-left', audience: 'staff', q: '남은 연차는 어디서 보나요', a: '[휴가]를 열면 「남은 연차」가 보입니다. 승인을 기다리는 신청은 승인되는 순간 남은 연차에서 빠집니다.', article: 'staff-leave' },
  { id: 'f-slip-empty', audience: 'staff', q: '급여명세서가 안 보여요', a: '회사가 그 달 명세서를 공개해야 [내 급여 조회]에 보입니다. 공개 전에는 「아직 공개된 명세서가 없습니다」라고 나옵니다.', article: 'staff-payslip' },
  { id: 'f-slip-pw', audience: 'staff', q: '메일로 온 명세서 PDF 비밀번호가 뭔가요', a: '생년월일 6자리입니다. 예를 들어 1990년 1월 31일생이면 900131입니다.', article: 'staff-payslip' },
  { id: 'f-slip-wrong', audience: 'staff', q: '명세서 금액이 맞지 않아요', a: '회사 관리자에게 알려 주세요. 고쳐지면 정정 명세서가 새로 공개됩니다.' },
  // 관리자
  { id: 'f-blocked', audience: 'admin', q: '급여 계산이 막혔어요', a: '앱은 모르는 값을 0원으로 채우지 않고 그 사람의 계산을 멈춥니다. 급여대장의 직원 줄에 사유가 글로 나오니, 사유별 해결 방법을 따라 고치고 다시 [계산하기]를 누르세요.', article: 'admin-blocked' },
  { id: 'f-order', audience: 'admin', q: '기록 확정과 근태 마감 중 무엇을 먼저 하나요', a: '기록 확정을 먼저 하고 마감합니다. 마감한 기간에는 기록을 확정할 수 없습니다. 마감 뒤에 고쳐야 하면 [다시 열기]를 쓰세요.', article: 'admin-close' },
  { id: 'f-basis', audience: 'admin', q: '신고 보수를 넣었는데 국민연금이 그대로예요', a: '회사 보험 기준이 「그 달 급여」면 신고 보수는 계산에 쓰이지 않습니다. [통합설정] › 급여 설정의 [급여대장 기본값]에서 국민연금 · 건강을 「신고 보수」로 고르세요.', article: 'admin-insurance-basis' },
  { id: 'f-exempt', audience: 'admin', q: '식대 때문에 「비과세 한도가 없습니다」가 나와요', a: '일부 비과세 항목은 한도를 꼭 넣어야 합니다. [통합설정] › 급여 설정의 [지급항목]에서 식대의 비과세 한도를 넣고 다시 계산하세요.', article: 'admin-items' },
  { id: 'f-confirmed', audience: 'admin', q: '확정한 급여를 고치고 싶어요', a: '확정한 대장은 바꿀 수 없습니다. [정정 시작]으로 새 판의 초안을 만들어 고치고 다시 확정 · 공개하면 직원에게 정정 명세서가 공개됩니다.', article: 'admin-pay-flow' },
  { id: 'f-midmonth', audience: 'admin', q: '달 중간에 입사 · 퇴사한 직원은 어떻게 계산하나요', a: '일할 계산은 자동으로 하지 않습니다. 사유에 「일할 계산은 자동으로 하지 않습니다」가 나오면 기본급을 금액 조정으로 직접 넣으세요.', article: 'admin-blocked' },
  { id: 'f-slip-mail', audience: 'admin', q: '명세서 메일이 안 나갔어요', a: '[이력 · 내역]의 [급여명세서 발송]에서 누구에게 갔는지와 사유를 봅니다. 이메일 주소나 생년월일이 없으면 보내지 못하고, 메일 계정이 설정되지 않았다면 이메일은 나가지 않습니다.', article: 'admin-slip-mail' },
];

export const articleById = (id: string): Article | undefined => ARTICLES.find((a) => a.id === id);
/** 이 사람(직원 · 관리자)이 볼 수 있는 내용만. 관리자는 직원용도 본다 */
export const visibleFor = (isAdmin: boolean) => ({
  articles: ARTICLES.filter((a) => isAdmin || a.audience === 'staff'),
  faqs: FAQS.filter((f) => isAdmin || f.audience === 'staff'),
  groups: GROUPS.filter((g) => isAdmin || g.audience === 'staff'),
});
