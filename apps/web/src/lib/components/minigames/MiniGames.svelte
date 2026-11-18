<script lang="ts">
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import CoinTossGame from './CoinTossGame.svelte';
    import LadderGame from './LadderGame.svelte';
    import RouletteGame from './RouletteGame.svelte';

    let active = $state(0);
    const games = [CoinTossGame, LadderGame, RouletteGame];
    const labels = ['코인토스', '사다리', '룰렛'];
</script>

<SelectionTabs {labels} bind:active />
{#each games as Game, index (Game)}
    <section hidden={active !== index} aria-label={labels[index]} class="mt-4">
        <Game />
    </section>
{/each}
