<script lang="ts">
    import { SERVICE_NAME } from '#lib/branding.ts';
    import AccessibleAccordion from '#lib/components/common/AccessibleAccordion.svelte';

    const TOC_GROUPS = [
        {
            title: '참가·기록',
            items: [
                { id: 'recruit', text: '모집 참여' },
                { id: 'rofl', text: 'ROFL 업로드' }
            ]
        },
        {
            title: '운영하기',
            items: [
                { id: 'teams', text: '팀 편성' },
                { id: 'bracket', text: '대진' },
                { id: 'operations', text: '되돌리기·중도 종료' }
            ]
        }
    ];

    const FAQ = [
        {
            q: 'ROFL을 올렸는데 기록되지 않았어요.',
            a: '업로드 창의 파일 칸에 이유가 표시돼요. 파일이 손상됐거나 출전자·포지션·팀·승패를 확인할 수 없으면 기록하지 않아요. 경기 상태가 바뀌었거나 연결이 끊겼다면 창을 닫은 뒤 경기 화면에서 실제로 기록됐는지 확인해 주세요.'
        },
        {
            q: '같은 파일을 두 번 올리면 어떻게 되나요?',
            a: '같은 결과를 중복으로 기록하지 않아요. 이미 등록된 파일이라는 안내가 나오면 경기 화면에서 저장된 세트를 확인해 주세요. 마지막 세트를 취소했다면 새로고침 후 같은 세트에 같은 파일을 다시 올려 복구할 수 있어요.'
        },
        {
            q: '승패를 직접 입력할 수는 없나요?',
            a: '결과는 ROFL 파일로만 기록해요. 직접 입력으로 결과를 바꾸는 기능은 없어요.'
        },
        {
            q: '하드 피어리스에서 이미 쓴 챔피언을 골랐어요.',
            a: '경기 화면에 피어리스 표시가 붙고 다음 세트에서 쓸 수 없는 챔피언 목록에 안내돼요. 업로드나 결과 기록은 막지 않아요.'
        },
        {
            q: '선발이 아니라 대기로 표시돼요.',
            a: '선발된 사람이 철회하거나 제외되면 먼저 신청한 대기자부터 자동으로 선발돼요. 상태는 내전 화면의 내 신청에서 확인할 수 있어요.'
        }
    ];
</script>

<svelte:head>
    <title>이용 안내 | {SERVICE_NAME}</title>
</svelte:head>

<div class="max-w-6xl">
    <h1 class="text-2xl font-semibold">이용 안내</h1>
    <div class="mt-6 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <nav
            aria-label="목차"
            class="grid grid-cols-2 gap-x-4 gap-y-4 self-start lg:sticky lg:top-24 lg:grid-cols-1 lg:gap-y-6"
        >
            {#each TOC_GROUPS as group (group.title)}
                <div class="min-w-0">
                    <h2 class="text-sm font-semibold text-text-muted">{group.title}</h2>
                    <ul class="mt-2 flex flex-col gap-1">
                        {#each group.items as item (item.id)}
                            <li>
                                <a
                                    href={`#${item.id}`}
                                    class="flex min-h-11 items-center rounded-(--radius-small) px-2 py-2 text-sm underline underline-offset-4 hover:bg-bg-overlay dark:hover:bg-bg-overlay-dark"
                                    >{item.text}</a
                                >
                            </li>
                        {/each}
                    </ul>
                </div>
            {/each}
            <a
                href="#faq"
                class="col-span-2 flex min-h-11 items-center border-t border-border px-2 pt-3 text-sm underline underline-offset-4 hover:bg-bg-overlay lg:col-span-1 dark:hover:bg-bg-overlay-dark"
                >자주 묻는 질문</a
            >
        </nav>
        <article class="doc min-w-0">
            <section>
                <h2 class="mt-0! text-2xl!">참가·기록</h2>
                <h3 id="recruit" tabindex="-1" class="text-lg!">모집 참여</h3>
                <p>
                    Discord 모집 글의 <strong>참가</strong> 버튼으로 바로 신청할 수 있어요. 웹 사전 가입이나 Riot
                    계정 연결은 필요하지 않아요.
                </p>
                <ol>
                    <li>웹에서는 로그인한 뒤 서버의 <strong>내전</strong> 메뉴에서 참가할 내전을 열어요.</li>
                    <li>
                        <strong>신청하기</strong>에서 희망 포지션을 고르고 신청해요. 연결된 Riot 계정이 있으면
                        함께 선택할 수 있어요.
                    </li>
                    <li>
                        모집이 끝나기 전까지는 <strong>내 신청</strong>에서 계정·포지션을 바꾸거나 신청을
                        철회할 수 있어요.
                    </li>
                </ol>
                <p>신청하면 선발 자리가 남아 있을 때 바로 선발되고, 다 찼으면 대기가 돼요.</p>

                <h3 id="rofl" tabindex="-1" class="text-lg!">ROFL 업로드</h3>
                <p>
                    수동 편성에서 확정한 팀·포지션은 경기에 자동 적용돼요. 경매는 운영자가 경기 화면에서 출전
                    라인업을 한 번 확정해요. 한 경기의 모든 세트는 같은 라인업을 사용하며, 서버 관리자와 그
                    경기에 확정된 출전자가 결과를 등록할 수 있어요.
                </p>
                <ol>
                    <li>세트가 끝나면 League of Legends 클라이언트에서 리플레이 파일(.rofl)을 저장해요.</li>
                    <li>
                        <strong>경기 기록</strong>에서 진행 중인 경기를 열고 <strong>ROFL 업로드</strong>를
                        눌러요.
                    </li>
                    <li>표시된 세트 번호를 확인하고, 그 세트에서 실제로 블루 진영이었던 팀을 골라요.</li>
                    <li>
                        해당 세트의 파일 하나를 고르고 <strong>업로드</strong>를 눌러요. 파일은 64MB 이하여야
                        해요.
                    </li>
                </ol>
                <p>
                    정상 파일은 승인 없이 바로 기록되고, 한 팀이 과반을 이기면 경기가 끝나요. 원본 파일은
                    보관하지 않아요.
                </p>
                <p>
                    첫 ROFL 결과를 기록할 때 확정 출전 정보와 선택한 블루 팀을 기준으로 Riot 계정이 연결돼요.
                    서버별 연결 계정은 <strong>내 정보</strong>에서 확인할 수 있어요.
                </p>
            </section>
            <section class="mt-12 border-t border-border pt-8">
                <h2 class="mt-0! text-2xl!">운영하기</h2>
                <h3 id="teams" tabindex="-1" class="text-lg!">팀 편성</h3>
                <p>
                    운영자가 내전 화면의 <strong>편성 방식</strong>에서 수동 편성과 경매 중 하나를 골라요.
                    모집 중에 미리 골라 둘 수 있고, 팀 편성을 확정하기 전까지 바꿀 수 있어요. 편성을 시작한 뒤
                    방식을 바꾸면 지금까지의 배치나 경매 기록은 지워져요.
                </p>
                <p>
                    방식을 고르면 상단에 <strong>팀 편성</strong> 메뉴가 생기고, 참가자도 여기서 진행 상황을 볼
                    수 있어요. 팀 이름은 포로팀·칼날부리팀처럼 자동으로 붙어요.
                </p>
                <h4 class="mt-6 font-semibold">수동 편성</h4>
                <p>
                    운영자가 참가자를 팀의 포지션 자리로 끌어 놓거나, 참가자를 누른 뒤 자리를 눌러 배치해요.
                    자리에 사람이 있으면 서로 바뀌어요. 모두 배치하고 <strong>편성 확정</strong>을 누르면 팀이
                    정해져요.
                </p>
                <h4 class="mt-6 font-semibold">경매</h4>
                <p>
                    운영자가 팀장과 팀별 시작 포인트를 정한 뒤 경매를 시작해요. 후보가 한 명씩 올라오면 팀마다
                    입찰가를 정해 낙찰하거나 유찰해요.
                </p>
                <ul>
                    <li>
                        입찰가는 직접 입력하거나 <strong>−50</strong>·<strong>−10</strong>·<strong>+10</strong
                        >·<strong>+50</strong>
                        버튼으로 조정해요.
                    </li>
                    <li>
                        현재 후보는 팀으로 끌거나 후보 목록의 <strong>수동 배치</strong>로 가격 없이 배치할 수
                        있어요.
                    </li>
                    <li>유찰된 후보도 후보 목록에서 다시 올리거나 팀에 바로 배치할 수 있어요.</li>
                </ul>
                <p>모든 팀이 다 차면 경매가 끝나요.</p>

                <h3 id="bracket" tabindex="-1" class="text-lg!">대진</h3>
                <p>
                    팀 편성이 끝나면 운영자가 팀을 대진 자리에 배치하고 준결승·결승의 경기 방식(단판, 3전
                    2선승, 5전 3선승)을 정한 뒤 <strong>대진 확정</strong>을 눌러요.
                </p>
                <ul>
                    <li>2팀은 결승 한 경기예요.</li>
                    <li>3팀은 준결승 한 경기와 결승 직행 자리 하나예요.</li>
                    <li>4팀은 준결승 두 경기의 승자끼리 결승을 치러요.</li>
                </ul>
                <p>
                    경기가 시작되기 전에는 운영자가 <strong>다시 편성</strong>으로 확정을 풀 수 있어요. 내전이
                    끝나면 상단 메뉴가 <strong>결과</strong>로 바뀌고 경기별 점수와 진출 결과를 보여 줘요.
                </p>

                <h3 id="operations" tabindex="-1" class="text-lg!">되돌리기·중도 종료</h3>
                <p>
                    운영자는 내전 화면의 운영 메뉴에서 모집 다시 열기, 팀 편성 다시 하기처럼 이전 단계로
                    되돌릴 수 있어요. 모집을 다시 열면 팀 편성은 지워지고 편성 방식은 그대로 남아요. 세트가
                    기록된 뒤에는 시작 전으로 돌아갈 수 없어요.
                </p>
                <p>팀 편성 중에는 편성 화면에서도 앞 단계로 돌아갈 수 있어요.</p>
                <ul>
                    <li>
                        <strong>방식 다시 고르기</strong>: 지금까지의 편성을 지우고 편성 방식 선택으로
                        돌아가요. 수동 편성과 경매(준비·진행 중) 모두에서 쓸 수 있어요.
                    </li>
                    <li>
                        <strong>팀장 다시 정하기</strong>: 진행 중인 경매의 낙찰·유찰·수동 배치를 되돌리고
                        팀장·시작 포인트 설정으로 돌아가요. 지금 설정은 남아 있어 고친 뒤 다시 시작하면 돼요.
                    </li>
                </ul>
                <p>
                    남은 경기를 치르지 않고 끝내려면 <strong>중도 종료</strong>를 써요. 5전 3선승 결승을
                    1:1에서 끝내도 기록된 세트와 점수는 전적에 남고, 승자는 정하지 않아요. 잘못 끝냈다면
                    <strong>진행 중으로 되돌리기</strong>로 다시 열 수 있어요.
                </p>
                <p>
                    마지막 세트의 결과를 고치려면 경기 화면에서 <strong>마지막 세트 취소</strong>를 사용해요.
                    이후 경기나 점수 변경 때문에 취소할 수 없다면 이유가 표시돼요. 취소한 기록은 남고, 올바른
                    결과의 새 ROFL 파일을 등록하면 같은 세트 번호로 기록돼요.
                </p>
            </section>
            <section class="mt-12 border-t border-border pt-8">
                <h2 id="faq" tabindex="-1" class="mt-0! text-2xl!">자주 묻는 질문</h2>
                <div class="mt-3">
                    <AccessibleAccordion items={FAQ.map((item) => ({ title: item.q }))} border="solid">
                        {#snippet children(_item: unknown, index: number)}
                            <p class="mt-0! pb-3 text-sm">{FAQ[index]?.a}</p>
                        {/snippet}
                    </AccessibleAccordion>
                </div>
            </section>
        </article>
    </div>
</div>
