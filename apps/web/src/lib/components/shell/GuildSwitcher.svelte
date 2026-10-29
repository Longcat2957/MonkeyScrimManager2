<script lang="ts">
	import { resolve } from '$app/paths';
	import type { GuildContext, ViewerContext } from '#lib/shell/context.ts';

	/*
	 * 서버 선택 드롭다운.
	 * 현재 서버는 표시 항목으로만 두고 링크로 만들지 않는다(레일의 서버 홈과 중복 방지).
	 * 다른 서버를 고르면 그 서버의 홈으로 이동한다.
	 *
	 * STDF에는 링크를 담을 수 있는 앵커 메뉴가 없다(ActionPopover 항목은 button, Popup은 화면 전체를 덮는다).
	 * 서버 이동은 새 탭·주소 복사가 가능해야 하므로 이 컨트롤만 native disclosure(버튼 + 링크 목록)로 만든다.
	 */
	let {
		guild = null,
		viewer
	}: {
		guild?: GuildContext | null;
		viewer: ViewerContext;
	} = $props();

	let open = $state(false);
	let trigger: HTMLButtonElement | undefined = $state();
	let panel: HTMLDivElement | undefined = $state();
	const panelId = $props.id();

	const others = $derived(viewer.guilds.filter((option) => option.id !== guild?.id));

	function openMenu() {
		open = true;
		// 열면 첫 이동 항목으로 포커스를 옮긴다. 이동할 서버가 없으면 트리거에 그대로 둔다.
		requestAnimationFrame(() => panel?.querySelector<HTMLElement>('a')?.focus());
	}

	function closeMenu(restoreFocus = false) {
		open = false;
		if (restoreFocus) requestAnimationFrame(() => trigger?.focus());
	}

	function ondocumentclick(event: MouseEvent) {
		if (!open) return;
		const target = event.target;
		if (target instanceof Node && !panel?.contains(target) && !trigger?.contains(target)) closeMenu(false);
	}
</script>

<svelte:document
	onclick={ondocumentclick}
	onkeydown={(event) => {
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			closeMenu(true);
		}
	}}
/>

<div class="relative">
	<button
		bind:this={trigger}
		type="button"
		class="inline-flex min-h-11 max-w-36 items-center gap-1 rounded-sm px-2 text-body-s font-semibold text-fg transition-colors hover:bg-surface-raised sm:max-w-48"
		aria-expanded={open}
		aria-controls={open ? panelId : undefined}
		onclick={() => (open ? closeMenu(false) : openMenu())}
	>
		<span class="truncate">{guild?.name ?? '서버 선택'}</span>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true" class="shrink-0 text-muted transition-transform {open ? 'rotate-180' : ''}">
			<path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<div
			bind:this={panel}
			id={panelId}
			class="absolute top-full right-0 z-50 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-sm border border-line bg-surface-overlay p-1 shadow-[var(--shadow-overlay)]"
			onfocusout={(event) => {
				// 패널 밖으로 포커스가 나가면 닫는다(트리거로 돌아오는 경우는 유지).
				const next = event.relatedTarget;
				if (next instanceof Node && (panel?.contains(next) || trigger?.contains(next))) return;
				closeMenu(false);
			}}
		>
			<nav aria-label="서버 선택">
				<ul>
					{#if guild}
						<li>
							<span class="flex min-h-9 items-center justify-between gap-2 rounded-sm px-2 text-body-s">
								<span class="truncate font-semibold">{guild.name}</span>
								<span class="shrink-0 text-caption text-muted">현재</span>
							</span>
						</li>
					{/if}

					{#each others as option (option.id)}
						<li>
							<a
								href={resolve('/g/[guildId]', { guildId: option.id })}
								class="flex min-h-11 items-center rounded-sm px-2 text-body-s hover:bg-surface-raised"
								onclick={() => closeMenu(false)}
							>
								{option.name}
							</a>
						</li>
					{:else}
						<li class="px-2 py-2">
							<p class="text-body-s text-muted">
								{guild ? '참여한 다른 서버가 없습니다.' : '참여한 서버가 없습니다.'}
							</p>
						</li>
					{/each}
				</ul>
			</nav>
		</div>
	{/if}
</div>
