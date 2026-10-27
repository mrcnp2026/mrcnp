'use client';
// 시스템관리자만 보는 메뉴(운영 현황)를 메뉴판들이 보일지 정하는 표시 — AppFrame이 한 번 켜 주고, 메뉴를 그리는 곳이 읽는다 (2026-10-27 의뢰인).
import { createContext, useContext, type ReactNode } from 'react';

const Ctx = createContext(false);
export const SystemNavProvider = ({ on, children }: { on: boolean; children: ReactNode }) => <Ctx.Provider value={on}>{children}</Ctx.Provider>;
export const useSystemNav = () => useContext(Ctx);
