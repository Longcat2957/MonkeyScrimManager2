/**
 * 참가자를 끌어 놓는 상태. 수동 편성(자리·미배정)과 경매(팀 카드)가 같이 쓴다.
 * 놓을 수 없는 대상이면 dragover를 막지 않아 브라우저가 놓기 금지 표시를 하게 둔다.
 */
export class DragState {
	id = $state<string | null>(null);
	over = $state<string | null>(null);

	#enabled: () => boolean;
	#accepts: (id: string, target: string) => boolean;
	#ondrop: (id: string, target: string) => void;

	constructor(options: {
		enabled: () => boolean;
		ondrop: (id: string, target: string) => void;
		accepts?: (id: string, target: string) => boolean;
	}) {
		this.#enabled = options.enabled;
		this.#ondrop = options.ondrop;
		this.#accepts = options.accepts ?? (() => true);
	}

	start(event: DragEvent, id: string) {
		if (!this.#enabled() || !event.dataTransfer) return;
		this.id = id;
		event.dataTransfer.setData('text/plain', id);
		event.dataTransfer.effectAllowed = 'move';
	}

	end() {
		this.id = null;
		this.over = null;
	}

	enter(event: DragEvent, target: string) {
		if (!this.#enabled() || !this.id || !event.dataTransfer || !this.#accepts(this.id, target)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		this.over = target;
	}

	leave(target: string) {
		if (this.over === target) this.over = null;
	}

	drop(event: DragEvent, target: string) {
		event.preventDefault();
		const id = event.dataTransfer?.getData('text/plain') || this.id;
		this.end();
		if (id && this.#enabled() && this.#accepts(id, target)) this.#ondrop(id, target);
	}
}
