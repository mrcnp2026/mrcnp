'use client';
// 시스템관리자만 보는 메뉴(운영 현황)를 메뉴판들이 보일지 정하는 표시 — AppFrame이 한 번 켜 주고, 메뉴를 그리는 곳이 읽는다 (2026-10-27 의뢰인).
import { createContext, useContext, type ReactNode } from 'react';

// logs: 접속 · 변경 기록 메뉴를 보일지 (2026-10-30 의뢰인: 이상준 최고관리자 · 시스템관리자만, lib/log-access.ts)
const Ctx = createContext({ on: false, logs: false });
export const SystemNavProvider = ({ on, logs = on, children }: { on: boolean; logs?: boolean; children: ReactNode }) => <Ctx.Provider value={{ on, logs }}>{children}</Ctx.Provider>;
export const useSystemNav = () => useContext(Ctx).on;
export const useLogNav = () => useContext(Ctx).logs;
