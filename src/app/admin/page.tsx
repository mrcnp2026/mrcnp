// 관리자 홈(오늘 현황판)은 게이트 6에서 만든다. 그때까지는 만든 탭(직원)으로 보낸다.
import { redirect } from 'next/navigation';

export default function AdminIndex() {
  redirect('/admin/members');
}
