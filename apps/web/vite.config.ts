import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        tailwindcss(),
        sveltekit({
            compilerOptions: {
                // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
                runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
            },
            // 첫 HTML부터 현재 경로와 내비게이션 링크를 같은 절대 경로로 비교한다.
            paths: { relative: false },
            adapter: adapter()
        })
    ]
});
