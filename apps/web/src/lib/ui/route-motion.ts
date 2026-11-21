import { onNavigate } from '$app/navigation';
import { page } from '$app/state';
import { guildNavItems } from '#lib/components/layout/navigation.ts';

export function initRouteMotion() {
    let active: ViewTransition | undefined;
    let arrival: Animation | undefined;

    onNavigate(({ from, to, complete }) => {
        active?.skipTransition();
        active = undefined;
        arrival?.cancel();
        if (
            !from ||
            !to ||
            from.url.pathname === to.url.pathname ||
            !page.data.guild ||
            from.params?.guildId !== to.params?.guildId ||
            matchMedia('(prefers-reduced-motion: reduce)').matches
        )
            return;

        const menu = guildNavItems(page.data.guild, from.url.pathname).some(
            ({ href }) => href === from.url.pathname || href === to.url.pathname
        );
        const header = document.querySelector<HTMLElement>('[data-scrim-stage]');
        const scrimId = header?.dataset.scrim;
        const stageMove = header && (to.params?.scrimId === scrimId || to.params?.matchId);
        const content = document.querySelector<HTMLElement>('.route-content');
        const departing = stageMove ? document.querySelector<HTMLElement>('[data-scrim-board]') : content;
        if (!departing || (!stageMove && !menu)) return;

        const stage = Number(header?.dataset.scrimStage);
        const enter = () => {
            const next = document.querySelector<HTMLElement>('[data-scrim-stage]');
            const board = document.querySelector<HTMLElement>('[data-scrim-board]');
            const direction = Math.sign(Number(next?.dataset.scrimStage) - stage);
            if (!stageMove || !board || next?.dataset.scrim !== scrimId || !direction) {
                if (!menu || !content) return false;
                arrival = content.animate([{ opacity: 0 }, { opacity: 1 }], {
                    duration: 260,
                    easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
                });
                return true;
            }
            arrival = board.animate(
                [
                    { opacity: 0.55, transform: `translateX(${direction * 12}px)` },
                    { opacity: 1, transform: 'none' }
                ],
                { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
            );
            return true;
        };
        if (!document.startViewTransition || !Promise.withResolvers)
            return () => {
                enter();
            };

        // 이전 본문만 캡처한다. 고정 메뉴와 새 화면은 전환이 끝나기 전에도 조작할 수 있다.
        const { promise, resolve } = Promise.withResolvers<void>();
        departing.style.viewTransitionName = stageMove ? 'departing-board' : 'departing-menu-page';
        const transition = document.startViewTransition(async () => {
            departing.style.removeProperty('view-transition-name');
            resolve();
            try {
                await complete;
            } catch {
                // 더 최근 이동이 이 탐색을 취소하면 이전 본문을 다시 그리지 않는다.
                transition.skipTransition();
                return;
            }
            if (active === transition && !enter()) transition.skipTransition();
        });
        active = transition;
        // 같은 단계 또는 연속 탐색으로 캡처를 건너뛰면 ready만 AbortError로 끝난다.
        void transition.ready.catch(() => {});
        void transition.finished
            .finally(() => {
                if (active === transition) active = undefined;
            })
            .catch(() => {});
        return promise;
    });
}
