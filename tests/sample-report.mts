// 견본 근태 확인서 만들기 — 인쇄 모양을 눈으로 확인할 때. npx tsx tests/sample-report.mts <저장 경로.xlsx> [인원수]
import { buildAttendanceWorkbook } from '../src/lib/export-xlsx';
import { SAMPLE } from './fixtures/report-sample';

const out = process.argv[2] ?? 'sample-report.xlsx';
const n = Number(process.argv[3] ?? 12);
const names = ['김민수', 'Nguyen Van An', '이서연', '박지훈', 'Somchai Dee', '최유진', '정우성', 'Tran Thi Hoa', '강하늘', '윤아름', '한지민', 'Le Van Nam', '오세훈', '서지수', '임채원'];
const people = Array.from({ length: n }, (_, i) => ({
  ...SAMPLE.people[i % 2],
  employeeNo: String(i + 1).padStart(3, '0'),
  name: names[i % names.length],
  netMinutes: 9000 + ((i * 377) % 1500),
  approvedOvertime: (i * 53) % 300,
  lateCount: i % 3,
  lateMinutes: (i % 3) * 12,
  absentDays: i % 5 === 4 ? 1 : 0,
}));
await buildAttendanceWorkbook({ ...SAMPLE, people }).xlsx.writeFile(out);
console.log('wrote', out);
