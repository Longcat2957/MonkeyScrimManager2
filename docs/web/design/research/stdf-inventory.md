# STDF 3.0.0 — installed-package inventory (evidence-based)

Research date: 2026-10-29. **Read-only research artifact.** Target: the exact package resolved by
`apps/web` (not the website, not memory).

## 0. What was inspected, and shorthand used below

| Shorthand | Absolute path |
| --- | --- |
| `S:` | `apps/web/node_modules/stdf` → `node_modules/.pnpm/stdf@3.0.0_svelte@5.57.3_tailwindcss@4.3.3/node_modules/stdf` |
| `C:` | `node_modules/.pnpm/@any-tdf+common@0.0.1_tailwindcss@4.3.3/node_modules/@any-tdf/common` |
| `W:` | `apps/web` |

Facts verified against: `S:/package.json` (version **3.0.0**, peer `svelte ^5.0.0`, `tailwindcss ^4.0.0`,
dependency `@any-tdf/common ^0.0.1`), `S:/dist/index.js`, `S:/dist/index.d.ts`, `S:/dist/types/index.d.ts`,
every `S:/dist/components/**/*.svelte`, `C:/dist/types/index.d.ts`, `C:/dist/derived/*.d.ts|js`,
`C:/dist/theme/*`, `C:/dist/lang/*`, both `source.css` files, plus one in-memory Tailwind compile (§6.1).

Two structural facts that shape everything else:

1. **Most prop types are not declared in `stdf`.** `S:/dist/types/index.d.ts:1-2` imports ~90
   `Common*Props` types from `@any-tdf/common/types`, then re-omits/rewrites only the Svelte-specific
   members (snippets, callbacks). The *authoritative* prop surface is therefore
   `C:/dist/types/index.d.ts` + `S:/dist/types/index.d.ts` together. Class-name mapping for every option
   lives in `C:/dist/derived/*.d.ts` (type-level maps such as `buttonStateBaseObj`) and
   `C:/dist/derived/*.js` (minified, one line each).
2. **Defaults live only in the `.svelte` sources** (`let { … } = $props()`), not in `.d.ts`. Every
   "default" value in this report was read from the component source; the `.d.ts` files declare
   optionality only.

---

## 1. Full exported surface (`S:/dist/index.js` = `S:/dist/index.d.ts`)

**67 component exports** (`S:/dist/index.d.ts:1-66` = 66 components + `Feedback` at `:68`) + 6 functional
APIs (`:67`) + `lang` (`:69`) + `theme` (`:70`) + type-only `types` (`:71`).
`S:/dist/index.js:1-72` is identical minus the type-only `export type * from './types/index.js'` line.

### 1.1 Components, grouped

| Group | Exports |
| --- | --- |
| Basic / display | `Icon`, `Avatar`, `AvatarGroup`, `Badge`, `Tag`, `Card`, `Cell`, `CellGroup`, `Grid`, `Grids`, `Divider`, `Placeholder`, `Skeleton`, `Loading`, `Progress`, `ProgressLoop`, `Rate`, `CharRoll`, `CountDown` |
| Form / input | `Input`, `Form`, `Checkbox`, `CheckboxItem`, `Radio`, `RadioItem`, `Switch`, `Slider`, `Stepper`, `CodeInput`, `NumKeyboard`, `FullKeyboard`, `ColorPicker`, `Signature` |
| Selection panels | `Picker`, `AsyncPicker`, `TimePicker`, `Calendar` |
| Feedback / overlay | `Popup`, `Mask`, `Dialog`, `Modal`, `Alert`, `Toast`, `Feedback`, `ActionSheet`, `ActionPopover`, `Tooltip` |
| Navigation | `NavBar`, `Tabs`, `Tab`, `TabContent`, `TabBar`, `Pagination`, `IndexBar`, `Accordion`, `Steps`, `NoticeBar`, `Swiper` |
| Layout / scrolling | `InfiniteScroll`, `PullRefresh`, `BottomSheet` |
| Media | `ImagePreview`, `ImageList` |
| Utility | `Button`, `ButtonGroup`, `ConfigProvider` |

Exports listed in `S:/dist/index.d.ts:1-71` but **not present** anywhere in the package or in the
directory tree: `Table`, `Breadcrumb`, `Image`, `Ellipsis`, `Empty`, `Drawer`, `Menu`, `Dropdown`,
`Popper`, `DatePicker`, `Timeline`, `Splitter`, `Sticky`, `Skeleton`-only-`Skeleton` variants, `Segmented`.
`S:/dist/components/` contains 64 directories, all exported **except** `scrollRadio`
(`S:/dist/components/scrollRadio/ScrollRadio.svelte` exists, and `C:/dist/derived/scrollRadio.d.ts`
exists, but the component is not re-exported from `stdf`, and the package `exports` map
(`S:/package.json` `"exports"`) has no `./dist/*` subpath, so it is not importable by consumers).

### 1.2 Functional APIs (module-level, rendered by `<Feedback />`)

All from `S:/dist/components/feedback/index.js`; typed in `S:/dist/components/feedback/index.d.ts`.

| API | Signature | Notes |
| --- | --- | --- |
| `toast` | `toast(opts\|string) → id`, `.success/.error/.warning/.info/.loading(message, opts?) → id`, `.hide(id?)`, `.clear()` | Pushes into a global `$state` queue (`feedback/state.svelte.js:10-66`); **nothing renders unless `<Feedback />` is mounted** |
| `showAlert` | same shape as `toast` (`.success/.error/.warning/.info`, `.hide`, `.clear`) | fixed-position notice, auto-closes after `duration` |
| `dialog` | `dialog(opts) → Promise<'primary'\|'secondary'\|'close'>`, `.confirm(content, title?) → Promise<boolean>`, `.close()` | promise-resolved `Dialog` |
| `modal` | `modal(opts) → Promise<'confirm'\|'close'>`, `.info(content, title?)`, `.close()` | |
| `loading` | `.show(opts\|string)`, `.hide()` | global `Mask` + `Loading` (`Feedback.svelte:192-209`) |
| `setFeedbackLang` | `(lang: LangProps) => void` | same effect as `ConfigProvider`'s `$effect` |

`Feedback` takes **no props** (verified: no `$props()` in `S:/dist/components/feedback/Feedback.svelte`).

### 1.3 Namespaces

| Import specifier | Contents (verified) |
| --- | --- |
| `stdf` | 66 components + `Feedback`, `toast/showAlert/dialog/modal/loading/setFeedbackLang`, `* from './lang'`, `* from './theme'` |
| `stdf/theme` | `switchTheme`, `switchMode`, `darkMode`, `getTheme`, `getMode`, `themes`, `generateColorScale`, `STDFTheme` (= `ANYTDFTheme`), `stdfThemePlugin` (default) (`S:/dist/theme/index.js`) |
| `stdf/theme/plugin` | `stdfThemePlugin` (default), `generateColorScale`, `themes` (`S:/dist/theme/plugin.js`) |
| `stdf/lang` | `export * from '@any-tdf/common/lang'` → ~90 locale objects incl. `ko_KR`, plus `LangProps` (`S:/dist/lang/index.js`, `C:/dist/lang/index.d.ts:1-176`) |
| `stdf/svg` | raw SVG data objects (`arrowLeftSvg`, `formClearSvg`, loading sprites…) |
| `stdf/utils` | `SvgIcon` component, `builtInIconLibraryContextKey`, `resolveContextBuiltInIconLibrary`, plus `@any-tdf/common/utils`: `debounce`, `throttle`, `throttleWithRAF`, `stepNumberFun`, date/calendar helpers (`getWeekRange`, `getCalendarData`, `getDateRange`…), oklch/rgb conversion helpers (`C:/dist/utils/index.d.ts`) |
| `stdf/types` | all exported prop/types incl. `FormItemProps`, `ToastFunction`, `DialogFunction`, `SwiperImgProps`… (`S:/dist/types/index.d.ts`) |
| `stdf/source.css` | 2 lines: `@import '@any-tdf/common/source.css';` + `@source './dist';` (`S:/source.css`) |

`@any-tdf/common` is **not** a declared dependency of `W:/package.json` (only `stdf`). Importing
`@any-tdf/common/...` from app code would be an undeclared dependency; prefer `stdf/utils`,
`stdf/theme`, `stdf/lang`, `stdf/svg`.

---

## 2. Exact specs for the requested components

Legend: `prop: type = default`. Every default below comes from the component's `$props()` destructuring;
"common defaults" are from `.svelte` files cited in the last column. Callbacks are plain props
(`onclick`, `onchange`, …), not `createEventDispatcher` — every component does `onX?.(payload)`.

### 2.1 NavBar (`S:/dist/components/navBar/NavBar.svelte:15-28`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `title` | `string` · `undefined` | fallback text from lang (`navBar.title`); rendered only when no `titleChild` |
| `titleAlign` | `'left'\|'center'\|'right'` · `'left'` | |
| `left` | `'back'\|null\|IconProps` · `'back'` | `'back'` renders a `<button aria-label="back">` + shared arrow SVG; `null` renders a spacer div; `IconProps` renders `<button>` + `<Icon>` |
| `rights` | `IconProps[]` · `[]` | each icon becomes its own `<button>` with `onclickRight(i)` |
| `line` | `boolean` · `true` | bottom hairline |
| `love` | `boolean` · `false` | "big" variant flag (larger icons/padding, `iconSize 24 → 30`, `C:/dist/derived/navBar.d.ts:34`) |
| `injClass` | `string` · `''` | appended to container class |
| snippets | `titleChild` (no args), `leftChild` (no args), `rightChild` (no args) | `leftChild` **replaces** the whole left slot (takes precedence over `left`, `:45-46`); `rightChild` **replaces** all `rights` (`:67-68`) |
| events | `onclickLeft()`, `onclickRight(index: number)` | |

Semantics: root element is a plain `<div>` (`:44`) — **no `<header>`, no `<nav>`, no sticky/fixed
behaviour, no height prop**. Exactly one row, left/title/right slots.

### 2.2 Button (`S:/dist/components/button/Button.svelte:7-28`, class map `C:/dist/derived/button.js`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `fill` | `'base'\|'line'\|'lineLight'\|'lineState'\|'text'\|'textState'\|'colorLight'` · `'base'` | maps to bg/border/text triplets (`C:/dist/derived/button.d.ts:5-36`) |
| `state` | `'theme'\|'success'\|'warning'\|'error'\|'info'` · `undefined` | `undefined` = theme/primary |
| `size` | `'full'\|'big'\|'md'\|'sm'\|'auto'` · `'big'` | `full`/`big` → `w-full` (+`px-4` outer when `big`); `auto` → `w-auto`,`px-0`; **`md`/`sm` → `tdf-button-md` / `tdf-button-sm`, classes that no CSS in either package defines** (§7.3) |
| `radius` | `SmallAreaRadius \| ''` · `''` | `''` → `rounded-(--radius-form)`; else `rounded-none/xs/sm/md/lg/xl/2xl/3xl/4xl/full` |
| `border` | `'solid'\|'dashed'\|'dotted'` · `'solid'` | |
| `heightOut` | `'0'..'4'` · `'2'` | outer wrapper padding (py) |
| `heightIn` | `'0'..'4'` · `'3'` | inner button padding (py) |
| `love` | `boolean` · `false` | adds `text-xl` |
| `disabled` | `boolean` · `false` | |
| `loading` | `LoadingProps\|null` · `null` | renders `<Loading>` inside the button |
| `disabledLoading` | `boolean` · **`true`** | when `loading` is set (and this is true) the button is also disabled (`resolveButtonInnerDisabled`) |
| `customSize`/`customWidth`/`customHeight` | `boolean`/`number`/`number` · `false`/`0`/`0` | inline `width/height/padding:0` style |
| `icon` | `IconProps\|null` · `null` | |
| `iconPosition` | `'left'\|'right'` · `'left'` | |
| `type` | `'submit'\|'reset'\|'button'` · `'button'` | forwarded to the native `<button>` |
| `injClass` | `string` · `''` | appended to the **inner** button class |
| snippet | `children` | button label |
| event | `onclick()` — **no event object, no payload** | |

Markup: `<div class=outer><button type=… disabled=… onclick=…>…</button></div>` (`:41-59`). The outer
`<div>` exists only to hold `heightOut`.

### 2.3 Input (`S:/dist/components/input/Input.svelte:26-84`, native markup `:235-437`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `value` | `string` · `''` | **`$bindable`** |
| `title` | `string` · `''` | visible label text |
| `titlePosition` | `'in'\|'out'\|null` · `'out'` | |
| `inputPosition` | `'left'\|'right'` · `'left'` | |
| `inputStyle` | `'block'\|'line'` · `'block'` | |
| `lineTransition` | `null\|'center'\|'left'` · `null` | animated underline |
| `duration` | `'fast'\|'base'\|'slow'\|'slower'` · `'base'` | |
| `radius` | `LargeAreaRadius` · `''` | `''` → form radius token |
| `py` | `'0'\|'0.5'\|'1'\|'2'\|'3'\|'4'\|'6'` · `'2'` | |
| `state` | `'theme'\|'success'\|'warning'\|'error'\|'info'` · `'theme'` | focus-ring colour only |
| `type` | `'text'\|'decimal'\|'email'\|'none'\|'numeric'\|'search'\|'tel'\|'url'\|'password'\|'number'\|'textarea'` · `'text'` | **see §4.5** — only `password` reaches the DOM |
| `inputmode` | `'text'…\|''` · `''` | overrides derived inputmode |
| `autocomplete` | `boolean` · `true` | renders `autocomplete="on"`/`"off"` only |
| `maxlength` | `number` · `24` | JS truncation + not applied as native attribute |
| `textareaMaxlength` | `number` · `200` | |
| `rows` | `number` · `2` | textarea |
| `autosize` | `boolean` · `false` | textarea height follows scrollHeight |
| `negative` | `boolean` · `false` | allows leading `-` for numeric types |
| `clear` | `boolean` · `false` | shows clear `<button aria-label="clear">` |
| `select` | `boolean` · `false` | forces `readonly` (picker trigger look) |
| `readonly`, `disabled`, `required` | `boolean` · `false` | `required` renders a red `*` only |
| `placeholder` | `string` · `''` | falls back to lang "please input/select {title}" |
| `tip` | `string\|null` · `null` | helper text under field |
| `label1`,`label3`,`label4`,`label6` | `IconProps\|null` · `null` | leading/trailing icon buttons |
| `label2`,`label5` | `string\|null` · `null` | text buttons |
| `data1`,`data2` | `string\|null` · `null` | top-right meta |
| `data3` | `string\|null` · `null` | bottom-right meta |
| snippets | `titleChild`, `data1Child`, `data2Child`, `data3Child`, `inputChild` (custom display + hidden input), `label1Child`…`label6Child`, `tipChild`, `children` | |
| events | `onfocus(value)`, `onblur(value)`, `onchange(value)` (fires after 0 ms `setTimeout`, i.e. async, `:166-176`), `onclear()`, `onclickLabel1..6()`, `onkeydown(key: string)` | |

### 2.4 Form (`S:/dist/components/form/Form.svelte:66-80`; item types `C:/dist/types/index.d.ts:1120-1232`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `form` | `FormItemProps[]` · **required** | discriminated by `type` |
| `onchange` | `(model: Record<string, FormValueProps>) => void` | full model, fires per field change |
| `onsubmit` | `(model) => void` | **no validation is performed** (`:114-116`) |
| `onreset` | `() => void` | |
| `submitText` | `string` · lang `form.submit` | |
| `resetText` | `string\|null` · `null` (hidden) | |
| `submitButton`, `resetButton` | `ButtonProps` · `{}` | |
| `submitChildren`, `resetChildren` | Snippet | replaces the default submit/reset `Button` entirely |
| `card` | `CardProps` · `undefined` | wraps the field list in `<Card>` when set |
| `space` | `'0'\|'1'\|'2'\|'4'\|'6'\|'8'` · `'0'` | |

Supported item `type` values (each item also has `name: string`, `label: string`, `required?: boolean`,
`initValue?: …`): `input`, `timePicker`, `actionSheet`, `calendar`, `numKeyboard`, `fullKeyboard`,
`picker`, `colorPicker`, `checkbox`, `radio`, `slider`, `switch`, `stepper`
(`C:/dist/types/index.d.ts:1120-1231`). `type` is optional and defaults to `'input'` at runtime.

Form value shapes: `input/text → string`, `checkbox → string[]`, `radio → string`, `switch → boolean`,
`stepper → number`, `slider → {value?, valueRange?}`, `picker → {items?, indexs?, multipleSelected?}`,
`calendar → {dates?}`, `timePicker → {timeStr?, timeObj?}`, `actionSheet → {action?, index?}`.

Markup: **no `<form>` element anywhere in the package** (`grep -rn "<form" S:/dist/components` → empty);
submit is `<Button onclick=…>` whose `type` default is `'button'` (`:579`). `required` renders an asterisk
only (`:217-219`, `:390`, `:477`, `:494`).

### 2.5 Popup (`S:/dist/components/popup/Popup.svelte:18-40`, markup `:126-146`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `visible` | `boolean` · `false` | **`$bindable`**; closes itself on mask click and writes back |
| `size` | `number` · `40` | **percent** of viewport: `height` for top/bottom/center, `width` for left/right; `0` → `auto` (`C:/dist/derived/popup.js` `resolvePopupSizeStyleValue`) |
| `position` | `'center'\|'top'\|'bottom'\|'left'\|'right'` · `'bottom'` | |
| `duration` / `outDuration` | `number` · `450` / `240` | svelte transition ms |
| `easeType` / `easeOutType` | `AnimationEasingProps` · `'cubicOut'` | any name from `svelte/easing` (30 values, `C:/dist/types/index.d.ts:1245`) |
| `px` / `py` | scale tokens · `'0'` / `'0'` | panel padding |
| `mask` | `MaskProps` · `{}` | forwarded to `<Mask>` |
| `maskClosable` | `boolean` · `true` | |
| `radiusPosition` | `'auto'\|'all'\|'top'\|'bottom'\|'left'\|'right'\|'none'` · `'auto'` | auto → opposite of `position` |
| `radius` | `LargeAreaRadius` · `''` | `''` → `rounded-(--radius-box)` |
| `transitionDistance`, `transparent`, `zIndex` (`600`), `dynamicFixed` (`true`), `hideScrollbar` (`false`) | | `dynamicFixed` re-measures viewport on resize |
| snippet | `children` only | panel content |
| events | `onclose()`, `onclickMask()` | |

Structure: `<Mask>` (a full-screen `<button>`, `S:/dist/components/mask/Mask.svelte:31-39`) + a fixed
wrapper `<div>` with class/style + an inner panel `<div class=popupState.panelClass>` (`:142`).
`<svelte:head><style>` injects a `.popup-container::-webkit-scrollbar{display:none}` rule (`:120-124`).
**No focus trap, no Escape handler, no `role="dialog"`, no `aria-modal`, no `aria-label` slot, no body
scroll lock, no focus restore** (§4.3).

`Mask` itself: `visible`(`false`, non-bindable), `opacity` (`'0'`…`'1'`, `'0.5'`), `clickable` (`false`),
`inverse` (`false`), `backdropBlur` (`'none'`…`'3xl'`, `'none'`), `duration` (`150`), `outDuration` (`0`),
`zIndex` (`500`), `children`, `onclickMask()`.

### 2.6 Dialog (`S:/dist/components/dialog/Dialog.svelte:20-42`, markup `:70-117`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `visible` | `boolean` · `false` | bindable, passed to `Popup` |
| `title` / `content` | `string` · lang defaults | |
| `titleAlign` | `'left'\|'center'\|'right'` · `'center'` | |
| `showIcon` / `icon` | `boolean`·`false` / `IconProps`·`{}` | |
| `btnStyle` | `'button'\|'text'\|'textLine'` · `'button'` | |
| `primaryText` / `secondaryText` | `string` · lang | |
| `primaryButton` / `secondaryButton` | `ButtonProps` · `{}` | spread into the two `Button`s |
| `btnRatio` | `[number, number]` · `[1, 1]` | flex ratio of secondary:primary |
| `btnReverse` | `boolean` · `false` | swaps visual order |
| `secondaryClose` | `boolean` · `true` | secondary button closes the dialog |
| `btnGap` | `'0'\|'1'\|'2'\|'4'\|'8'\|'12'\|'16'` · `'2'` | |
| `popup` | `PopupProps` · `{}` | **the only way to configure size/position/mask** |
| snippets | `contentChild`, `primaryChild` | `contentChild` replaces `content` |
| events | `onprimary()`, `onsecondary()`, `onclose()` | primary does **not** auto-close |

No close "X"; closing paths are the mask (if `popup.maskClosable`), secondary button, or your own
`onprimary` handler setting `visible = false`.

### 2.7 Modal (`S:/dist/components/modal/Modal.svelte:15-28`)

`visible` (`$bindable false`), `title`, `content`, `titleAlign` (`'center'`), `popup` (`{}`),
`showIcon` (`false`), `icon` (`{}`), `showBtn` (`true`), `btnText` (lang `modal.btnText`),
`button` (`ButtonProps {}`), snippet `contentChild`, event `onclose()`. The single button closes.
Same `Popup` semantics as Dialog (no a11y beyond what Popup has).

### 2.8 Card (`S:/dist/components/card/Card.svelte:5-27`, markup `:44-92`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `bg` | `'none'\|'surface'\|'gray'\|'theme'` · `'surface'` | |
| `radius` | `LargeAreaRadius` · `''` | `''` → `rounded-(--radius-box)` (`C:/dist/derived/card.js`) |
| `shadow` | `'none'\|'xs'\|'sm'\|'md'\|'lg'\|'xl'\|'2xl'` · `'sm'` | Tailwind default shadows |
| `border` / `borderWidth` | `'none'\|'solid'\|'dashed'\|'dotted'` · `'none'` / `'0'\|'1'\|'2'\|'4'` · `'1'` | |
| `mx`/`my`/`p`/`px`/`py` | scale tokens · `'2'`/`'2'`/`'4'`/`undefined`/`undefined` | |
| `overflow` | `boolean` · `true` | `overflow-hidden` |
| `headerLine` / `footerLine` | `boolean` · `true` | dividers |
| `injClass`/`headerClass`/`bodyClass`/`footerClass` | `string` · `''` | |
| snippets | `header`, `children`, `footer` | body renders only if `children` exists |
| event | `onclick()` | **presence of `onclick` turns the root into `<button>`** (`:44-45`) |

### 2.9 Tabs / Tab / TabContent

`Tabs` (`S:/dist/components/tabs/Tabs.svelte:7`):

| Prop | Type · default | Notes |
| --- | --- | --- |
| `tab` | `TabProps` · source default `{}` (type says required) | all tab-bar options live here |
| `active` | `number` · `0` | **`$bindable`** |
| `duration` | `'fast'\|'base'\|'slow'\|'slower'` · `'base'` | |
| `position` | `'t'\|'b'\|'l'\|'r'` · `'t'` | `l`/`r` → vertical layout (`Tab layout="v"`) |
| `transition` | `boolean` · `true` | sliding viewport between panes (requires `children`) |
| snippet | `children({ active: number })` | one snippet for **all** panes — you render the right pane yourself |
| event | `onchange(active: number)` | |

`Tab` (`S:/dist/components/tabs/Tab.svelte:12-29`, markup `:74-138`):

| Prop | Type · default | Notes |
| --- | --- | --- |
| `labels` | `{ text?: string; icon?: IconProps }[]` · `[]` | **no snippet per tab** — text + icon only |
| `active` | `number` · `0` | `$bindable` when used standalone |
| `lineType` | `boolean` · `false` | full-width bottom line vs. sliding indicator |
| `layout` | `'h'\|'v'` · `'h'` | |
| `radius` | `SmallAreaRadius` · `''` | |
| `duration` | `'fast'…'slower'` · `'base'` | indicator motion |
| `love` | `boolean` · `false` | larger text |
| `mx` | `'0'…'20'` · `'2'` | horizontal margin |
| `overflow` | `boolean` · `false` | scrollable tab strip (injects `.no-scrollbar` CSS via `<svelte:head>`) |
| `showNum` | `number` · `3` | visible count in overflow mode |
| `autoScroll` | `boolean` · `true` | scroll active tab into view |
| `injClass`,`tabInjClass`,`activeTabInjClass`,`activeInjClass` | `string` · `''` | |
| event | `onclickTab(active: number)` | |

`TabContent` (`S:/dist/components/tabs/TabContent.svelte:5-12`): `show: boolean = true`; class is
`hidden` + `flex-1` when false — **content stays mounted**, removed from a11y tree via `display:none`.

### 2.10 Pagination (`S:/dist/components/pagination/Pagination.svelte:25-43`; page button `pagination/Page.svelte:19-23`)

`total` (`0`), `pageSize` (`10`), `current` (`$bindable 1`), `maxShowPage` (`5|7|9|11` · `7`),
`radius` (SmallAreaRadius · `''`), `type` (`'border'|'block'|'bold'` · `'bold'`),
`bg` (`'surface'|'gray'|'theme'|'white'` · `'gray'`), `pageCol` (`3`), `showNextOmitPage`/
`showPreOmitPage` (`$bindable false`), `injClass`, `noDataText`/`onePageText` (lang),
`continuous` (`false` — disables page-number clicks), events `onchange(current)`, `onnext(current)`,
`onpre(current)`. **`onnext`/`onpre` also call `onchange`** (`:113-124`) — do not debounce twice.
Prev/next have `aria-label="pre"` / `"next"` (English literals, `:135`, `:208`). Page-number buttons
have no `aria-current`. `total` itself is not displayed.

### 2.11 Accordion (`S:/dist/components/accordion/Accordion.svelte:13-28`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `items` | `{ title: string; content?: string; disabled?: boolean; icon?: IconProps }[]` · `[]` | |
| `activeIndex` | `number\|number[]\|undefined` · `undefined` | `$bindable` |
| `multiple` | `boolean` · `false` | |
| `radius` | `LargeAreaRadius` · `'md'` | note: default is a literal `'md'`, not `''` |
| `border` | `'none'\|'solid'\|'dashed'\|'dotted'` · `'solid'` | |
| `divider` | `boolean` · `true` | |
| `expandIcon` | `'arrow'\|'plus'\|null` · `'arrow'` | |
| `iconPosition` | `'left'\|'right'` · `'right'` | |
| `transitionDuration` | `number` · `300` | |
| `injClass`,`titleClass`,`contentClass` | `string` · `''` | |
| snippet | `children(item, index)` | replaces `item.content` |
| event | `onchange(index \| index[] \| undefined)` | |

Panels are **unmounted** when collapsed (`:81`) — collapsed content is not in the DOM at all.

### 2.12 Skeleton (`S:/dist/components/skeleton/Skeleton.svelte:6`)

`type` (`'div'|'p'|'img'|'video'|'code'|'qrcode'|'barcode'` · `'div'`),
`width` (`'full'|'2'|'4'|'6'|'8'|'12'|'16'|'24'|'32'|'48'|'64'|'96'` · `'6'`),
`height` (`'1'|'2'|'4'|'6'|'8'|'12'|'16'|'24'|'32'|'48'|'64'|'96'` · `'6'`),
`radius` (LargeAreaRadius · `''`), `space` (`'0.5'|'1'|'2'|'4'|'8'` · `'1'`), `lines` (`3`),
`iconRatio` (`0.6`), `effect` (`'pulse'|'wave'|'breathe'|'none'` · `'pulse'`),
`bg` (`'gray'|'theme'` · `'gray'`). Injects `@keyframes skeleton-wave/skeleton-breathe` via
`<svelte:head>` when needed (`:22-26`). No `role="status"`/`aria-hidden`.

### 2.13 Loading (`S:/dist/components/loading/Loading.svelte:71-80`; wrapper `:233`)

`type: string = '1_0'` — **not a union**. Real set (from the 64 sprite files under
`S:/dist/components/loading/loadings/`): one-colour `1_0`…`1_53`, two-colour `2_0`…`2_5`,
four-colour `4_0`…`4_3`. `height`/`width` (`'2'..'96'|'full'` · `'8'`), `theme` (`false`),
`inverse` (`false`), `customColor` (`string[]`), `lazyAnimation` (`true` — IntersectionObserver pauses
offscreen animations), `speed` (`$bindable 1`). Renders `<div><svg…>` only; no `role="status"`,
no text, no `aria-label`.

### 2.14 Tag (`S:/dist/components/tag/Tag.svelte:7-20`)

`text` (`''`), `state` (`'theme'|'success'|'warning'|'error'|'info'|'neutral'` · `'theme'`),
`fill` (`'base'|'line'|'light'` · `'base'`), `size` (`'xs'|'sm'|'md'|'lg'` · `'md'`),
`radius` (`SmallAreaRadius` · `'sm'`), `mark` (`false` — corner ribbon), `closable` (`false`),
`disabled` (`false`), `injClass`, snippet `children` (replaces `text`), events `onclick()`, `onclose()`.
Root is `<span role="button" tabindex>` (`:54-59`) — a span, not a button.

### 2.15 Avatar / AvatarGroup

`Avatar` (`S:/dist/components/avatar/Avatar.svelte:8-19`): `image` (`''`), `alt` (`''`), `icon`
(`IconProps {}`), `altSize` (`'xs'|'sm'|'md'|'lg'|'xl'` · `'md'`), `radius`,
`size` (`'xs'|'sm'|'base'|'md'|'lg'|'xl'|'2xl'` · `'base'`), `imgSize` (`'s'|'m'|'l'` · `'l'`),
`line` (`'none'|'solid'|'dashed'|'dotted'` · `'none'`), `injClass`, `onclick()`.
Root is **always** `<button>`; the image is `<img alt="">` (`:59-63`) and `alt` is rendered as a *text
fallback*, not as the image's accessible name.

`AvatarGroup` (`S:/dist/components/avatarGroup/AvatarGroup.svelte:8-...`): `data: AvatarProps[]`,
`radius`, `size` (`'base'`), `compact` (`4`), `lineWidth` (`'0'..'8'` · `'3'`), `reverse` (`false`),
`max` (`10`), `top` (`'totle'|'add'|null|Snippet` · `'totle'`), `injClass`, `onclick()`.

### 2.16 List (`S:/dist/components/list/List.svelte:36-68`, item markup `:290-365`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `data` | `T[]` · `[]` | generic `T extends Record<string, unknown>` (`generics` attr, `:1`) |
| `keyField` | `string` · `'id'` | |
| `gap`,`mx`,`my` | scale tokens · `'0'` | |
| `itemPx`,`itemPy` | scale tokens · `'0'` | |
| `itemRadius` | `LargeAreaRadius` · `''` | |
| `divider` | `boolean` · `true` | between items |
| `arrow` | `boolean` · `false` | trailing chevron |
| `transition` | `'slideRight'\|'slideUp'\|'fadeScale'\|'stagger'\|null` · `'slideRight'` | enter/leave animation |
| `transitionDelay` | `number` · `50` | |
| `batchSelectable` | `boolean` · `false` | adds edit/done bar + per-item check |
| `batchMode` / `batchSelected` | `boolean`·`false` / `(string\|number)[]`·`[]` | both `$bindable` |
| `batchActions` | `{ text: string; status?: 'theme'\|'success'\|'warning'\|'error'\|'info'; onclick?(selected) }[]` | |
| `swipeActions` | `{ icon?: string; text?: string; bgColor?: 'theme'\|'primary'\|'success'\|'warning'\|'error'\|'info' }[]` | swipe-to-reveal buttons |
| `swipeHint` | `'none'\|'first'\|'all'` · `'first'` | |
| `swipeThreshold` | `number` · `30` | |
| `injClass`,`itemInjClass` | `string` · `''` | |
| snippet | `itemChild(item, index)` — **required** | |
| snippets | `headerChild`, `footerChild` | |
| events | `onclickItem(item, index)`, `onswipeAction(actionIndex, action, item, itemIndex)`, `onbatchChange(selected)` | |

There is **no `clickable` prop** in `ListProps`; the internal clickable flag is
`Boolean(onclickItem)` (`:96`) and the item `<button>` is `disabled` when absent (`:346`).

### 2.17 Stepper (`S:/dist/components/stepper/Stepper.svelte:12-33`; markup `:73-110`)

`value` (`$bindable 10`), `min` (`0`), `max` (`100`), `step` (`1`), `vertical` (`false`),
`numberHighlight` (`false`), `theme` (`true`), `radius` (`SmallAreaRadius ''`), `decimal` (`0`),
`async` (`false`), `asyncLoading` (`false`), `loading` (`LoadingProps {}`), `padding` (`true`),
`width` (`0`), `injClassOut`/`injClassBtn`/`injClassNum` (`''`), events `onchange(value: number)`,
`ondecrease()`, `onincrease()`. The value is a `<div>`, **not editable**; buttons are
`aria-label="decrease"`/`"increase"` (`:78`, `:103`).

### 2.18 Radio / RadioItem, Checkbox / CheckboxItem

`Radio` (`radio/Radio.svelte:6-15`): `data: RadioItemProps[]`, `value` (`$bindable ''`),
`layout` (`'v'|'h'|'inline'` · `'v'`), `textPosition` (`'l'|'r'|'t'|'b'` · `'r'`),
`icon`/`iconChecked` (`'default'|null|IconProps` · `'default'`), snippet `radioChild({ item })`,
event `onchange(value: string)`.
`RadioItem` (`radio/RadioItem.svelte:8-17`): `name`, `layout`, `textPosition`, `checked` (`false`),
`icon`, `iconChecked`, snippet `children`, event `onclick(name)`. Root is `<button>` (`:30`).

`Checkbox` (`checkbox/Checkbox.svelte:6-15`): `data`, `checkeds` (`$bindable []`), `layout`,
`textPosition`, `icon`/`iconChecked`, snippet `checkboxChild({ item })`, event `onchange(checkeds: string[])`.
`CheckboxItem` (`checkbox/CheckboxItem.svelte:8-...`): `name`, `layout`, `checked`, `textPosition`,
`icon`, `iconChecked`, children, `onclick(name)`. Root `<button>` (`:30`).

Item props: `name: string` (required), `label?: string`, `layout?: 'v'|'h'|'inline'`,
`textPosition?: 'l'|'r'|'t'|'b'`, `icon?: 'default'|null|IconProps`, `iconChecked?: …`,
`checked?: boolean`, `children?: Snippet` (`C:/dist/types/index.d.ts:395-416`, `:793-815`).

### 2.19 Switch (`S:/dist/components/switch/Switch.svelte:12-24`, markup `:70-92`)

`active` (`$bindable false`), `radius` (`SmallAreaRadius ''`), `inside`
(`'state'|'loading'|[string,string]|null` · `null`), `injClass`, `disabled` (`false`),
`async` (`false`), `loading` (`LoadingProps {}`), `trueChild`/`falseChild` (snippets inside the thumb),
`onchange(active: boolean)`, `onclick()`. Root is `<button>` with **no `role="switch"`, no
`aria-checked`** (`:70-73`).

### 2.20 Picker (`S:/dist/components/picker/Picker.svelte:26-59`; wheel `scrollRadio/ScrollRadio.svelte`)

| Prop | Type · default | Notes |
| --- | --- | --- |
| `visible` | `boolean` · `false` | `$bindable`; renders inside `Popup` unless `popup: null` |
| `datas` | `PickerDatasProps[] \| PickerDataChildProps[]` · `[]` | plain column: `{ data: [{label:…}], showRow?: 3\|5\|7, initIndex?, useAnimation?, labelKey?, flex?, align?, lastSelectedIndex? }` |
| `isLinkage` | `boolean` · `false` | cascading columns |
| `linkageInitIndexs`,`linkageShowRows`,`linkageFlexs`,`linkageAligns`,`linkageLabelKeys`,`linkageChildrenKey` (`'children'`), `linkageSeparator` (Form) | | linkage config |
| `multiple` | `boolean` · `false` | |
| `multipleSelected` | `PickerMultipleItem[]` · `[]` | `$bindable` |
| `multipleIcon`/`multipleIconActive` | `IconProps` · remix symbol icons | |
| `autoScrollToLast` | `boolean` · `true` | |
| `height` | `number` · `30` | wheel height (rem-ish scale) |
| `popup` | `PopupProps\|null` · `{}` | `null` → inline panel |
| `title`,`cancelText`,`confirmText` | `string` | lang defaults |
| events | `onconfirm(items: Record<string,string>[], indexs: number[])`, `oncancel()`, `onmultiplechange(selected)`, `onclose()` | |

Each column is a `ScrollRadio` wheel: **plain `<div>`s scrolled with `scrollTop`**, no buttons, no
keyboard, no roles, no click-to-select (`S:/dist/components/scrollRadio/ScrollRadio.svelte:96-124`).
Cancel/confirm are `<button>`s (`Picker.svelte:236`, `:238`).

### 2.21 TimePicker (`S:/dist/components/timePicker/TimePicker.svelte:24-58`)

`visible` (`$bindable false`), `type` (`TimePickerTypeProps` · `'YYYYMMDDhhmmss'`) — one of
`'YYYY'|'MM'|'hh'|'mm'|'ss'|'YYYYMM'|'hhmm'|'mmss'|'YYYYMMDD'|'hhmmss'|'YYYYMMDDhh'|'YYYYMMDDhhmm'|'YYYYMMDDhhmmss'`
(`C:/dist/types/index.d.ts:1032`); per-column `{showRow, flex, align}` via
`yearProps/monthProps/dayProps/hourProps/minuteProps/secondProps`; `initYear…initSecond` strings;
`minuteStep`/`secondStep` (`1`); `yearRange` (`[]`), `monthRange` (`[1,12]`), `hourRange` (`[0,23]`),
`minuteRange` (`[0,59]`), `secondRange` (`[0,59]`); `showTips` (`true`); column labels
`yearText…secondText`; `outFormat` (`''`); `height` (`30`); `popup` (`{}`);
`onconfirm(timeStr: string, timeObj: {YYYY,MM,DD,hh,mm,ss})`, `oncancel()`, `onclose()`.
Wheels are `ScrollRadio` (same limitations as Picker).

### 2.22 Alert (`S:/dist/components/alert/Alert.svelte:12-39`; markup `:135-194`)

`visible` (`$bindable false`), `title` (`''`), `message` (`''`), `duration` (`3000` ms, auto-close),
`position` (`'top'|'bottom'` · `'top'`), `py` (`'0'|'10'|'20'|'40'|'60'|'80'` · `'20'`),
`type` (`'success'|'error'|'warning'|'info'|null` · `null`), `showIcon` (`true`), `icon` (`{}`),
`closable` (`true`), `inverse` (`true`), `card` (`CardProps {}`), `transitionType`
(`'scale'|'fly'|'fade'|'slide'|'blur'|null` · `'fly'`), `transitionParams` (`{}`), `outDuration` (`300`),
`easeType`/`easeOutType` (`'cubicOut'`), `zIndex` (`1000`), `clickable` (`true`), `injClass`,
snippet `children` (custom content), event `onclose()`. Fixed-position; body is a `<Card>`;
close button `aria-label="Close"` (`:125`). No `role="alert"`/`aria-live`.

### 2.23 Toast (`S:/dist/components/toast/Toast.svelte:11-32`) and Feedback

| Prop | Type · default | Notes |
| --- | --- | --- |
| `message` | `string` · `''` | |
| `visible` | `boolean` · `false` | bindable; auto-closes after `duration` |
| `duration` | `number` · `2000` | `0` = sticky (used by `toast.loading`) |
| `position` | `'center'\|'top'\|'bottom'` · `'center'` | |
| `py` | `'0'\|'10'\|'20'\|'40'\|'60'\|'80'` · `'0'` | |
| `radius` | `LargeAreaRadius` · `''` | |
| `transitionType` | `'scale'\|'fly'\|'fade'\|'slide'\|'blur'\|null` · `'scale'` | |
| `type` | `'success'\|'error'\|'warning'\|'info'\|'loading'\|'icon'\|null` · `null` | icon frame choice |
| `mask` | `MaskProps` · `{}` | a `Mask` with `opacity="0"` is rendered while visible (`:78`) |
| `loading`,`icon` | `LoadingProps {}` / `IconProps {}` | |
| `outDuration` (`0`), `easeType`/`easeOutType` (`'cubicOut'`), `zIndex` (`1000`), `clickable` (`false`), `dynamicFixed` (`true`), `children`, `onclose()` | | |

No `role="status"`, no `aria-live` — screen readers are not announced automatically.

### 2.24 NoticeBar (this is STDF's "Notice"; there is no `Notice` export)

`S:/dist/components/noticeBar/NoticeBar.svelte:18-...` props: `textList` (`string[]` · `[]` — logs
`console.error` when empty/invalid, `:77-88`), `leftIcon` (`'volume'|IconProps|null` · `'volume'`),
`rightIcon` (`'close'|'arrow'|null` · `'close'`), `space` (`100`), `speed` (`30` — px/s marquee),
`vertical` (`false`), `duration` (`100|300|500|700|1000` · `500`), `interval` (`4` s),
`injClass`, `radius`, snippets `leftChild`/`rightChild`, `onclickRight()`. Horizontal mode duplicates
the text into the DOM to loop it; there is no pause-on-hover and no `aria-live`.

### 2.25 Tooltip (`S:/dist/components/tooltip/Tooltip.svelte:20-44`; markup `:244-275`)

`content` (`''`), `position` (`'top'|'bottom'|'left'|'right'` · `'top'`), `visible` (`$bindable false`),
`delay` (`0`), `hideDelay` (`0`), `arrow` (`true`), `radius` (`SmallAreaRadius 'sm'`),
`state` (`'theme'|'success'|'warning'|'error'|'info'|'black'` · `'black'`), `maxWidth` (`200`),
`zIndex` (`800`), `disabled` (`false`), `injClass`, `contentClass`, snippets `children` (trigger) and
`contentSnippet`, events `onshow()`, `onhide()`.
Trigger is a `<div onclick>` with explicit `svelte-ignore a11y_click_events_have_key_events`
(`:245-247`) — **click to toggle, no hover, no focus, no keyboard, no `role="tooltip"`, no
`aria-describedby`**.

### 2.26 Progress (`S:/dist/components/progress/Progress.svelte:5-16`)

`percent` (`66`), `percentPosition` (`'inner'|'right'|'block'|null` · `'right'`),
`height` (`'1'|'2'|'3'|'4'` · `'2'`), `radius` (`SmallAreaRadius ''`), `inactive` (`false`),
`overflowPercent` (`10`), `duration` (`'150'|'300'|'500'|'700'|'1000'` · `'300'`), `injClass`,
`trackInjClass`, snippet `children` (custom label). Plain `<div>`s (`:30-58`): **no
`role="progressbar"`, no `aria-valuenow`**. `ProgressLoop`: `percent`, `strokeWidth` (`2`), `butt`,
`reverse`, `duration`, `gradient: [string,string]|null` — SVG ring.

### 2.27 Steps (`S:/dist/components/steps/Steps.svelte:10`, markup `:41-161`)

`steps: StepsItemProps[]` (`[{ step: { title?, desc?, bar?: {type:'icon'|'image'|'string', content}, injComponent?: Component }, finishStep?: {…}, height?: number }]`),
`current` (`1`), `radius` (`SmallAreaRadius ''`), `barBorder` (`true`), `vertical` (`false`).
Rendered as nested `<div>`s; no `<ol>/<li>`, no `aria-current="step"`. `injComponent` is a Svelte
component class rendered with `<SvelteComponent />` (no props).

### 2.28 Breadcrumb, Image, Ellipsis, Table, Drawer/Sheet, Dropdown/Popper, Menu, Calendar/DatePicker

| Requested | In STDF 3.0.0 | Closest native option |
| --- | --- | --- |
| Breadcrumb | **absent** | none (build with `<nav><ol>` + `Divider`) |
| Image | **absent** (no `img` component) | `Avatar` (button), `ImagePreview`, `ImageList`, or plain `<img>` |
| Ellipsis | **absent** | Tailwind `truncate`/`line-clamp-*` |
| Table | **absent** | `List` (buttons) or native `<table>` |
| Drawer / Sheet | `BottomSheet` (draggable, mask, stay heights) + `Popup position="left"/"right"` | `BottomSheet` (`bottomSheet/BottomSheet.svelte:28-...`): `visible`, `title`, `titleAlign` (`'left'`), `showBackIcon`, `closeContent` (`'downIcon'`), `showDivider`, `duration` (`450`)/`outDuration` (`240`), `mask` (`{}`), `maskClosable` (**`false`**), `zIndex` (`600`), `stayHeightList` (`[10,50,90]` %), `stayHeightIndex` (`1`), `closeHeight` (`0`), `radius`, `iconRadius`, `children`, `onheightChange(h)`, `onclickMask()`, `onclose()`, `onback()` |
| Dropdown / Popper | `ActionPopover` (anchored menu, `layout: 'v'\|'h'\|'grid'\|'ring'`, `inlineDirection: 'auto'\|'up'\|'down'`, `triggerRef: HTMLElement\|null`, `inlineOffset` (`8`), `inlineShadow` (`'md'`), `inlineRadius`, `gridColumns` (`3`), ring options) | `ActionPopover` |
| Menu | `ActionSheet` (popup action list) / `ActionPopover` (anchored) / `TabBar` (bottom nav) | |
| Calendar / DatePicker | `Calendar` (popup or inline; `mode: 'single'\|'multiple'\|'range'`, `startMonth` = now−6, `endMonth` = now+6, `initMonth` = now, `outFormat` `'YYYYMMDD'`, `quickSelects`, `disabledDates`, `infoDates`, `monthCard`, `monthMark`, `height` (`50`), `onconfirm(dates: string[])`, `onclose()`) | `Calendar`; **no generic single-date picker** — in Form it is `type: 'calendar'` |
| Empty state | **no `Empty` component** | `Placeholder` (`py`,`height`,`radius`,`shadow`,`children`) is a layout box, not an empty-state widget; `Skeleton` for loading |

---

## 3. Other components worth using for a competitive-gaming ops dashboard

| Component | One-line purpose | Useful details |
| --- | --- | --- |
| `ButtonGroup` | **Segmented control** (2–5 mutually exclusive buttons in one pill) | `items: {text?, icon?, iconPosition?, disabled?, onclick?}[]`, `fill`, `state`, `radius`, `size`, `border`, `dividerHeight` (`'full'\|'mid'\|'short'` · `'mid'`), `heightIn`/`heightOut`; items are real `<button>`s with dividers (`buttonGroup/ButtonGroup.svelte:43-75`); no `aria-pressed`/`role="tablist"` |
| `TabBar` | Bottom/top nav bar with icons + sliding indicator | `labels: {text?, icon?, activeIcon?}[]`, `active` (`$bindable 0`), `line`, `lineW`, `love`, `*InjClass`; buttons only, no links (`tabBar/TabBar.svelte:62-87`) |
| `ActionSheet` | Bottom action list (context menu) | `actions: {content, style?, disabled?, desc?, showImg?, imgSrc?, icon?}[]`, `showCancel`, `cancelText`, `actionClosable`, `popup`; `onclickAction(index, action)`, `oncancel`, `onclose` |
| `ActionPopover` | Anchored/grid/ring menu or floating action menu | see §2.28; `layout: 'ring'` + `ringActions` gives a radial FAB menu |
| `BottomSheet` | Draggable multi-stop sheet | `stayHeightList` stops in %, drag/back/mask callbacks |
| `InfiniteScroll` | Load-more sentinel with retry | `loading`/`finished`/`error` (`$bindable`), `offset` (`300`), `direction` (`'down'`), `immediateCheck` (`true`), texts, `loadingIcon`, `scrollTarget`, snippets `children(detail)`, `loadingChild`, `finishedChild`, `errorChild`; `onload(isRetry)`; root has `aria-busy` + `aria-live="polite"` (`infiniteScroll/InfiniteScroll.svelte:128`) |
| `PullRefresh` | Pull-to-refresh wrapper | `refreshing` (`$bindable`), `threshold` (`60`), `headHeight` (`50`), `maxDistance`, `successDuration`, texts, per-status snippets, `onrefresh()`, `onchange(detail)`; head has `aria-live="polite"` (`pullRefresh/PullRefresh.svelte:232`) |
| `CountDown` | Countdown/elapsed timer with snippet formatting | `time` (ms), `format` (`'HH:mm:ss'`), `autoStart` (`true`), `millisecond` (`false`), `children(TimeData)`, `onfinish()`, `onchange(TimeData)` |
| `CharRoll` | Rolling-digit scoreboard effect | `value`, `preset` (`'number'`…`'octal'`), `duration`, `stagger`, `direction`, `prefix`/`suffix`, `bg`, `fontSize`, `fontWeight`, `loop` |
| `Swiper` | Banner carousel (images or components) | `data: ({type:'img',url} \| {type:'component',component})[]`, `autoplay` (`true`), `interval` (`4`), `indicateStyle` (`'point'\|'line'\|'pointLine'\|'longLine'`), `aspectRatio` (`[16,9]`), 3D transforms; `role="region" aria-roledescription="carousel"` (`swiper/Swiper.svelte:240-242`) |
| `IndexBar` | A–Z / grouped jump index | `data: {index,title,child[]}[]`, `current`, `height`, `scrollAlign`, `onclickChild(...)`; the **only** component with listbox semantics — `role="listbox"`, `role="option"` + `aria-selected` (`indexBar/IndexBar.svelte:180-193`) |
| `Rate` | Star rating (read-only capable) | `value`, `total`, `half`, `readonly`, `disabled`, `onclick(value)` |
| `Slider` | Single/range slider with step labels | `value`, `isRange`, `valueRange`, `stepLabels`, `showTip` (`'always'\|'touch'\|'never'`), `onchange(value, valueRange?, label?, labelRange?)`; `role="group" aria-label="Slider"` (`slider/Slider.svelte:210-211`) |
| `Cell` / `CellGroup` | Settings-style rows, optionally with arrow/switch/icon | whole row is one `<button>`; **do not nest a `<Switch>`-style control inside** (`cell/Cell.svelte:70-114`) |
| `Badge` | Numeric/status bubble on an element | `text`, `radius` (+`'leaf'`), `isLeft`, `isShow`, `offsetX/Y`, `isInner`, `children` |
| `Divider` | Separator with optional text | `layout: 'h'\|'v'`, `text`, `align`, `line`, `weight` |
| `Grids` / `Grid` | 12-column grid container / item | `Grids: cols (default '6'), gap, mx, my`; `Grid: col, row` |
| `Placeholder` | Empty layout box / loading canvas | `py`,`height`,`radius`,`shadow` |
| `Icon` / `SvgIcon` | Icon renderer (symbol sprite or iconify) | `Icon: type 'symbol'\|'iconify'\|'iconify-color'`, `name`, `size` (24), `state`, `path` (**default `fonts/symbol.svg`**) — see §6.3 |
| `Mask` | Standalone scrim | `opacity`, `clickable`, `backdropBlur`, `zIndex` |
| `AsyncPicker` | Cascading picker fed by async pages | `data`, `lastLevel`, `firstLevel`, `labelKey`, `showSelected`, `loading`, `onnext`, `onprev`, `onconfirm` |
| `CodeInput` | OTP-style code entry | `length` (`6`), `mask`, `cellStyle`, `onfinish(value)` |
| `NumKeyboard` / `FullKeyboard` | On-screen numeric/full keyboards | mostly mobile-oriented; not needed on desktop |
| `ColorPicker` | OKLCH/RGB/HEX colour picker with copy | `modes`, `showPanel`, `showInputs`, `showCopy`, `onchange(colors)`, `oncopy(text)` |
| `Signature` | Canvas signature pad | `aspectRatio` (`[3,1]`), `imageType`, `onconfirm({dataUrl,isEmpty})` |

---

## 4. Accessibility / semantics facts that a plan must budget for

Summary: STDF 3.0.0 is a **visual** component set. Native `<button>` is used nearly everywhere, which
gives keyboard activation and focus for free, but there is **no dialog semantics, no focus management,
no Escape handling, no tab semantics, and almost no ARIA state**. There are also **zero anchors**.

### 4.1 Anchors / links

| Question | Answer | Evidence |
| --- | --- | --- |
| Does any component render `<a href>`? | **No.** The only `href` in the whole dist is SVG `<use xlink:href>` | `grep -rn href S:/dist/components` → `icon/Icon.svelte:41` only |
| Is there a link-capable Button? | No. Button has no `href`/`as` prop; it always renders `<button>` | `button/Button.svelte:41-48`; `ButtonProps` has `type: 'submit'\|'reset'\|'button'` only (`C:/dist/types/index.d.ts:305`) |
| Does List support anchors? | No. Every row is `<button>` wrapping `itemChild`, so links/buttons cannot be nested inside | `list/List.svelte:343-357` |
| Route navigation | Must be done with your own `<a>`/`goto`; wrap or surround STDF controls | — |

### 4.2 Element semantics per component

| Component | Root element | Notes / citations |
| --- | --- | --- |
| `Button` | `<div><button type=…>` | `Button.svelte:41-48`; `disabled` set on native button |
| `NavBar` | `<div>` | `NavBar.svelte:44`; back button `aria-label="back"` (`:48`); icon buttons (`left` as IconProps, and each of `rights`) have **no accessible name** (`:55-57`, `:70-74`) |
| `Card` | `<div>` or `<button>` | becomes `<button>` when `onclick` is provided → nested interactive content invalid (`Card.svelte:44-45`) |
| `List` row | `<button>` | `List.svelte:343-347`; content layer has `role="presentation"` (`:335`) |
| `Cell` row | `<button>` | `Cell.svelte:70` |
| `Avatar` | `<button>` | always; `<img alt="">`; no accessible name (`Avatar.svelte:33-35`, `:59-63`) |
| `Tag` | `<span role="button" tabindex>` | `Tag.svelte:54-59`; close `<button aria-label="close">` (`:67-72`) |
| `Switch` | `<button>` | **no `role="switch"` / `aria-checked`** (`Switch.svelte:70-73`) |
| `RadioItem` / `CheckboxItem` | `<button>` | no `role="radio"`/`"checkbox"`, no `aria-checked`, no group label (`radio/RadioItem.svelte:30-33`, `checkbox/CheckboxItem.svelte:30`) |
| `Tabs` / `Tab` | `<div>` + per-tab `<button>` | **no `role="tablist"/"tab"/"tabpanel"`, no `aria-selected`, no arrow-key roving** (`tabs/Tab.svelte:90-103`, `:122-134`) |
| `Accordion` | `<div>` + header `<button>` | no `aria-expanded`/`aria-controls`; panel unmounted when collapsed (`Accordion.svelte:55-60`, `:81-91`) |
| `Pagination` | `<div>` + `<button>`s | prev/next `aria-label="pre"`/`"next"`; page buttons have no `aria-current` (`Pagination.svelte:135`, `:208`; `Page.svelte:19-23`) |
| `Stepper` | `<div>` + 2 `<button>`s + value `<div>` | `aria-label="decrease"/"increase"` (`Stepper.svelte:78`, `:103`) |
| `Popup` / `Mask` | `<button>` (mask) + `<div>` wrapper + `<div>` panel | see §4.3 |
| `Tooltip` | `<div onclick>` trigger + `<div>` panel | `svelte-ignore a11y_click_events_have_key_events` (`Tooltip.svelte:245-247`) |
| `IndexBar` | `<div role="listbox">` + `<div role="option" aria-selected>` | only listbox in the library (`IndexBar.svelte:180-193`) |
| `Swiper` | `<div role="region" aria-roledescription="carousel" aria-label="Carousel">` | `Swiper.svelte:240-242` |
| `InfiniteScroll` | `<div aria-busy aria-live="polite">` | `InfiniteScroll.svelte:128` |
| `PullRefresh` | `<div role="presentation">` + head `aria-live="polite"` | `PullRefresh.svelte:223`, `:232` |
| `Slider` | `<div role="group" aria-label="Slider">` | `Slider.svelte:210-211` |
| `Progress` / `ProgressLoop` | `<div>` / `<svg>` | no `progressbar` role, no value text (`Progress.svelte:30-58`) |
| `Skeleton` / `Loading` | `<div>` / `<div><svg>` | no `aria-hidden`, no `role="status"` (`Skeleton.svelte:28-55`; `Loading.svelte:233`) |
| `Steps` | nested `<div>`s | no ordered list, no `aria-current="step"` (`Steps.svelte:42`, `:109`) |
| `BottomSheet` | mask `<button>` + `<div role="presentation">` + header `<button aria-label>` | `BottomSheet.svelte:226-277` |
| `Divider` | `<div>` | no `role="separator"` |
| `Form` | `<div>` | **no `<form>` element at all** |

### 4.3 Dialog/overlay behaviour (the biggest gap)

| Question | Answer | Evidence |
| --- | --- | --- |
| Focus trap? | **No.** Popup contains no focus code (`grep -n focus popup/Popup.svelte` → empty); the only `.focus()` calls in the whole package are `input/Input.svelte:220,222` and `codeInput/CodeInput.svelte:92` | `popup/Popup.svelte`; `grep -rn '\.focus()' S:/dist/components` |
| Escape to close? | **No.** The string `Escape` does not appear in any `.svelte` file | `grep -rn Escape S:/dist/components` → empty |
| `role="dialog"` / `aria-modal`? | **No.** Panel is a bare `<div class=…>` | `Popup.svelte:142-144` |
| Accessible name for the dialog? | No prop or slot for it (`aria-label`/`aria-labelledby`); only a visual title `<div>` inside Dialog/Modal | `Dialog.svelte:74-75`, `Modal.svelte:57-58` |
| Mask semantics | Mask is a full-screen `<button>` (tab-focusable, no label) | `Mask.svelte:31-39` |
| Initial focus / focus restore | **Absent** | — |
| Body scroll lock | **Absent**; only a `.popup-container::-webkit-scrollbar{display:none}` style is injected | `Popup.svelte:120-124`; `C:/dist/derived/helpers.js` `resolveHiddenScrollbarCss` |
| Background inertness | None (`inert`/`aria-hidden` never used) | `grep -rn "inert\|aria-hidden" S:/dist/components` → only `SvgIcon.svelte:46` |
| Consequences | Every modal-style surface (Popup, Dialog, Modal, ActionSheet, ActionPopover, Picker, TimePicker, Calendar, BottomSheet, ImagePreview, Alert, Toast) needs an app-provided focus/keyboard wrapper if the plan claims dialog semantics | — |

### 4.4 Form / input semantics

| Question | Answer | Evidence |
| --- | --- | --- |
| Is there a `<form>`? | No; `Form` is a `<div>`; submit `<Button>` defaults to `type="button"` | `Form.svelte:579`; `Button.svelte:25` |
| Validation? | **None.** `required` renders `*` only; no error state per field, no `invalid`, no first-error focus | `Form.svelte:217-219`, `:390`, `:477`, `:494` |
| Field label association | `Input` wraps title + control in a `<label>` — implicit association works; but there is no `id`/`for`, no `aria-describedby` for `tip`, no `aria-invalid` | `Input.svelte:235`, `:421-436` |
| `name` attribute | **Not supported anywhere** (no `name` prop on `Input`; `Form` collects a JS model) | `C:/dist/types/index.d.ts:492-540` |
| `autocomplete` | Boolean only → `"on"`/`"off"`; no token support (`"current-password"`, `"one-time-code"`, …) | `C:/dist/derived/input.js` `resolveInputAutocompleteValue`; `input/Input.svelte:309/325/357/375` |
| `type` | **Only `password` survives to the native input**; `number/email/tel/url/search` render `type="text"` (only `inputmode` changes). `textarea` switches element | `C:/dist/derived/input.js` `resolveInputNativeType=(t="text")=> "password"===t?"password":"text"`; `Input.svelte:104-108`, `:364-379` |
| `readonly`/`select` | `readonly` forces native readonly; `select` implies readonly | `resolveInputNativeReadonly` |
| `maxlength` | JS truncation, not a native attribute | `normalizeInputValue` |
| Numeric input | `inputmode="decimal"`, value stays a `string`; negatives optional | same file |
| Switch/Radio/Checkbox state exposure | `button` elements without ARIA state (§4.2) | — |
| Pickers | Wheels are scroll divs; no keyboard, no roles | `ScrollRadio.svelte:96-124` |

### 4.5 Miscellaneous a11y gotchas

* No component spreads unknown props (`grep -rn '\$\$restProps'` → empty), so **you cannot pass
  `aria-label`, `id`, `class`, `data-*` to any STDF component**. Styling hooks are limited to
  `injClass` on components that declare it (Button, NavBar, Card, List, Input, Popup, Dialog via
  `popup`, etc.).
* Fixed literal English labels that cannot be translated: `aria-label="back"`, `"clear"`, `"close"`,
  `"pre"`, `"next"`, `"decrease"`, `"increase"`, `"Close"`, `"Slider"`, `"Carousel"`,
  `"Index navigation"`, `"Rotate"/"Previous"/"Next"/"Go to image N"`.
* `Toast`, `Alert`, `Progress`, `Skeleton`, `Loading` provide **no live-region semantics** — a plan
  that needs announced status must add its own `role="status"`/`aria-live` region.

---

## 5. Theme / i18n contract as actually implemented

### 5.1 Theme = CSS custom properties + `data-theme` + `data-mode`

* `switchTheme(theme)` sets CSS variables **inline on `<html>`** and `data-theme="<name>"`
  (`C:/dist/theme/switchTheme.js`): it writes `--color-primary`, `--color-primary-50…950`,
  `--color-dark`, `--color-dark-50…950`, `--color-success/warning/error/info`,
  `--color-primaryBlack/primaryWhite/darkBlack/darkWhite` (written but **not consumed by any component
  class** — verified by census), plus every other `ThemeConfig` key prefixed with `--`.
  Passing a string: if it matches a built-in theme the variables are written, otherwise only
  `data-theme` is set.
* `switchMode('primary'|'dark')` / `darkMode(isDark = true)` only sets **`data-mode`** on `<html>`
  (`switchTheme.js` `switchMode`, `darkMode`). Reference values: `data-mode="primary"` and
  `data-mode="dark"` (`W:/src/app.html:2`, `W:/src/app.html:12`).
* `ThemeConfig` keys (the full token vocabulary, `C:/dist/theme/plugin.d.ts:43-67`):
  `color-primary`, `color-dark`, `color-success`, `color-warning`, `color-error`, `color-info`,
  `radius-box`, `radius-form`, `radius-small`, `built-in-icon-library`,
  `color-bg-base|surface|overlay|highlight`, the same four with `-dark`, `color-text-primary`,
  `color-text-dark`, `color-text-on-primary`, `color-text-on-dark`.
* 42 built-in themes incl. `ANYTDF` (`C:/dist/theme/anytdf.js`: primary = indigo `oklch(0.467 0.296
  264.886)`, dark/accent = amber `oklch(0.845 0.153 80.597)`); `STDFTheme` is an alias of `ANYTDFTheme`.
* **The plugin does not define Tailwind utilities.** `@plugin "stdf/theme" { all: true }` calls
  `addBase({ '[data-theme="ANYTDF"]': {…} })` only; `config: () => ({})` (`C:/dist/theme/plugin.js`,
  verified by in-memory compile — §6.1). It also **does not register a `dark` variant**.

### 5.2 What the components actually consume (census of class literals in `S:/dist` + `C:/dist`)

| Token family | Consumed as | Approx. occurrences |
| --- | --- | --- |
| `--color-primary` (+ 50…950) | `bg-primary`, `text-primary`, `border-primary`, `bg-primary/10…`, `text-primary-N` | ~150 |
| `--color-dark` (+ 50…950) | `bg-dark`, `text-dark`, `border-dark`, `bg-dark/…` (paired with `dark:` variants) | ~150 |
| `--color-text-primary` / `--color-text-dark` | `text-text-primary`, `text-text-dark`, `bg-text-primary/…` | ~120 |
| `--color-text-on-primary` / `-on-dark` | `text-text-on-primary`, `text-text-on-dark` | 30 |
| `--color-bg-base\|surface\|overlay\|highlight` (+ `-dark`) | `bg-bg-surface`, `bg-bg-highlight`, … | ~120 |
| `--color-success\|warning\|error\|info` | `text-…`, `bg-…`, `border-…`, `/10…` | ~110 |
| `--radius-box` | `rounded-(--radius-box)` (+ `-t`, `-b`, `-l`, `-r`) | 37 |
| `--radius-form` | `rounded-(--radius-form)` (Button/Input defaults) | 28 |
| `--radius-small` | `rounded-(--radius-small)` | 24 |
| `--radius-btn` | `rounded-(--radius-btn)` in `ImageList` only — **token is never defined by STDF** | 2 (§7.4) |
| shadows | `shadow-xs/sm/md/lg/xl/2xl` (Tailwind built-ins) | 78 |
| keyframes | `animate-spin`, `animate-pulse`, `animate-code-input-blink` (**undefined**), injected `skeleton-wave`/`skeleton-breathe` | — |

### 5.3 Recommended wiring (matches what `W:/src/routes/layout.css` already does)

```css
@import 'tailwindcss';
@import 'stdf/source.css';               /* registers @source for stdf/dist AND @any-tdf/common/dist */

@custom-variant dark (&:where([data-mode=dark], [data-mode=dark] *)); /* STDF ships none */

@theme {                                  /* REQUIRED for bg-primary / text-text-primary / radius tokens */
  --color-primary: …; --color-primary-50: …; /* … 950 */
  --color-dark: …;    --color-dark-50: …;    /* … 950 */
  --color-text-primary: …; --color-text-dark: …;
  --color-text-on-primary: …; --color-text-on-dark: …;
  --color-bg-base: …; --color-bg-surface: …; --color-bg-overlay: …; --color-bg-highlight: …;
  --color-bg-base-dark: …; --color-bg-surface-dark: …; --color-bg-overlay-dark: …; --color-bg-highlight-dark: …;
  --color-success: …; --color-warning: …; --color-error: …; --color-info: …;
  --radius-box: …; --radius-form: …; --radius-small: …;
  /* optional: --radius-btn: …; to fix ImageList default radius */
}
```

`@plugin "stdf/theme" { all: true }` can be added on top if you want a built-in palette *as
`data-theme` fallbacks*, but by itself it produces **no utilities** and no dark variant. `switchTheme`
then overrides the same variables inline at runtime (inline style beats `:root`), so a running theme
switch works only for tokens you have declared in `@theme`.

### 5.4 i18n

* Default locale is **Chinese** (`zh_CN`) everywhere: `ConfigProvider` default
  (`configProvider/ConfigProvider.svelte:14`) and every component's
  `getContext('STDF_lang') || zh_CN` fallback (e.g. `NavBar.svelte:12`, `Input.svelte:23`, `List.svelte:33`).
* `ConfigProvider` props: `locale` (`LangProps`, default `zh_CN`), `builtInIconLibrary`
  (`'remix'|'lucide'|'phosphor'|'tabler'|'iconoir'|'reicon'`, default `defaultBuiltInIconLibrary`),
  `children` (`ConfigProvider.svelte:8-24`). It `setContext('STDF_lang', locale)` with `untrack`, sets
  the icon-library context, and mirrors `locale` into `feedbackState.lang` via `$effect` (so functional
  Toast/Dialog texts follow).
* `LangProps` sections (`C:/dist/lang/index.d.ts:67-176`): `common`, `actionSheet`, `bottomSheet`,
  `dialog`, `input`, `modal`, `navBar`, `pagination`, `picker`, `asyncPicker`, `rate`, `timePicker`,
  `calendar`, `form`, `fullKeyboard`, `list`, **optional** `pullRefresh`, **optional**
  `infiniteScroll`, `signature`, `imagePreview`, `imageList`.
* **`ko_KR` is missing the `pullRefresh` and `infiniteScroll` sections** (verified by diffing locales).
  Both components fall back to `zh_CN` and then to hard-coded Chinese defaults
  (`pullRefresh/PullRefresh.svelte:22`, `infiniteScroll/InfiniteScroll.svelte:18`,
  `infiniteScrollDefaultTexts = {加载中..., 没有更多了, 加载失败，点击重试}`). If the plan uses either
  component with `ko_KR`, pass explicit text props.
* `ko_KR` values that matter: `common.noData = "데이터가 없습니다"`, `common.done = "완료"`,
  `form.submit = "제출"`, `dialog.primaryText = "확인"`, `dialog.secondaryText = "취소"`,
  `calendar.weekTextList = ["일"…"토"]`, `pagination.defaultOnlyOnePage = "한 페이지만 있습니다"`.
* No component accepts `lang` as a prop; language flows only through context, so `ConfigProvider`
  must wrap **every** consuming subtree (including `<Feedback />`).

---

## 6. Gotchas for this Tailwind 4 project

### 6.1 `@plugin "stdf/theme"` alone generates nothing (compile-verified)

In-memory `tailwindcss@4.3.3` `compile()` run against the installed plugin, candidates
`bg-primary text-text-primary dark:bg-dark rounded-(--radius-box) tdf-button-md bg-bg-surface`:

| CSS input | `.bg-primary` rule | `[data-theme="ANYTDF"]` vars | `dark:` behaviour |
| --- | --- | --- | --- |
| `@import 'tailwindcss'` + `@plugin "stdf/theme" { all: true }` | **not generated** | emitted | no variant registered (nothing produced) |
| same **+** `@theme { --color-primary: …; --color-dark: …; … }` | `.bg-primary{background-color:var(--color-primary)}` | emitted | falls back to Tailwind's default `prefers-color-scheme` media query unless the project defines `@custom-variant dark` |

⇒ The `README.md` snippet (`@plugin "stdf/theme" { all: true; }` only) is **insufficient** for a project
that needs `bg-primary`-style utilities. `W:/src/routes/layout.css:4` already supplies both the
`@custom-variant dark ([data-mode=dark])` and the `@theme` block, and is the correct pattern to keep.

### 6.2 Scanning / safelist

* `stdf/source.css` = `@import '@any-tdf/common/source.css'; @source './dist';`
  (`S:/source.css`), and `C:/source.css` = `@source './dist';`. Importing `stdf/source.css` (already
  done at `W:/src/routes/layout.css:2`) therefore registers **both** package `dist` trees, which is
  where all option→class literals live (`C:/dist/derived/*.js` and `*.d.ts`, and the `.svelte` files).
* Because those paths are relative to each `source.css`, **do not copy the `@source` lines into app
  CSS** and do not set `source(none)`; disabling automatic detection or skipping this import will
  silently drop component styling.
* Classes reach components through *props* you pass (`injClass`, `LoadingProps.type`, `IconProps.injClass`,
  `tabInjClass`, …). Any class you pass as a literal string in app code is scanned normally. Classes
  built by string concatenation in app code must be safelisted with `@source inline("…")`.
* Custom classes STDF *expects* but does **not** define (verify before use, or define them in
  `@layer`/`@utility`): `.tdf-button-md`, `.tdf-button-sm` (Button `size="md"|"sm"`),
  `.animate-code-input-blink` (CodeInput cursor). Nothing in either package's CSS defines them.
* Dynamic `<style>` blocks injected at runtime (`Tab`, `List`, `Popup`, `Picker`, `Calendar`,
  `Skeleton`, `ScrollRadio`, `Pagination/SecondPage*`, and ~50 of the `loading/loadings/*` sprites) are
  **plain CSS**, not Tailwind — they need no safelist, and they do not respond to Tailwind tokens unless
  they use `var(--color-…)`. (`NoticeBar` and `IndexBar` do **not** inject styles.)

### 6.3 Assets and plugins

* `Icon` with default `type="symbol"` renders `<use xlink:href="/fonts/symbol.svg#<name>">`
  (`C:/dist/derived/icon.js` `resolveIconSymbolHref`; `icon/Icon.svelte:15`). **`stdf` ships no sprite**
  and `W:/static/` has no `fonts/` directory (only `brand/`, `robots.txt`) → every `Icon` used by
  NavBar `rights`, `Cell`, `List` swipe actions, Card icons, etc. is invisible/empty unless you add
  `/static/fonts/symbol.svg`. Inline SVG data (`SvgIcon` + `stdf/svg`) is self-contained and unaffected.
* `type="iconify"|"iconify-color"` needs the project to provide the iconify CSS/mask classes.
* No PostCSS/Tailwind plugin other than the theme plugin is needed; `@tailwindcss/vite` (already in
  `W:/vite.config.ts`) is enough. Peer requirements: `svelte ^5` (installed 5.57.3), `tailwindcss ^4`
  (installed 4.3.3).
* `@any-tdf/common` classes are only reachable because `stdf/source.css` imports its `source.css`;
  keep that import even if you never use `@plugin`.

### 6.4 SSR / SvelteKit specifics

* 13 components read `window.innerHeight/innerWidth` (guarded by `typeof window === 'undefined'` helpers in
  the derived layer): `Tabs`, `Popup`, `Toast`, `Picker`, `Tooltip`, `Loading`, `Calendar`, `CodeInput`,
  `TimePicker`, `BottomSheet`, `AsyncPicker`, `ImagePreview`, `ActionPopover` (e.g. `Popup.svelte:42-46`,
  `Toast.svelte:58`). SSR-safe, but a panel can resize after hydration (`dynamicFixed`, default `true`).
* `List` transition CSS is injected via `{@html '<style>…</style>'}` in `<svelte:head>`
  (`List.svelte:435-437`); several other components use `<svelte:head><style>` — expect duplicated
  `<style>` blocks if many instances mount.
* All components read `getContext` at init (not reactive) except ConfigProvider's `$effect`; changing
  `locale` at runtime requires remounting consumers (context is set with `untrack`).

---

## 7. Where declarations and implementation disagree

| # | Declaration says | Implementation does | Impact / plan action |
| --- | --- | --- | --- |
| 7.1 | `TabsProps.tab` is **required** (`S:/dist/types/index.d.ts:352-353`) | `let { tab = {}, … }` (`Tabs.svelte:7`) | You may omit `tab`; no runtime error, empty tab bar |
| 7.2 | `InputProps.type` accepts `'number'\|'email'\|'tel'\|'url'\|'search'\|'decimal'\|'numeric'` | `resolveInputNativeType` maps everything except `password` to `type="text"`; only `inputmode`/normalisation change | No native email/url/tel validation, no number spinners, `min/max/step` impossible |
| 7.3 | `ButtonProps.size` includes `'md'\|'sm'`; `buttonSizeObj` maps them to `tdf-button-md`/`-sm` (`C:/dist/derived/button.d.ts:20-26`) | **No CSS in either package defines those classes**; `md/sm` also get `px-0` | `size="md"\|"sm"` yields an unpadded, auto-width button. Use `big`/`full`/`auto`, or define the two classes yourself |
| 7.4 | `ImageList` default radius → `rounded-(--radius-btn)` (`C:/dist/derived/imageList.js` `resolveImageListRadiusClass`) | `--radius-btn` is absent from `ThemeConfig` and from `ANYTDFTheme`; the plugin only emits `radius-box/form/small` | Default ImageList corners collapse to 0. Pass `radius` explicitly or define `--radius-btn` |
| 7.5 | `Missing sections in ko_KR` | `pullRefresh`/`infiniteScroll` optional in `LangProps`; `ko_KR` lacks them | Chinese fallback text; pass `pullingText`/`loadingText`… explicitly |
| 7.6 | Guide/docs mention `List.clickable` | Not in `ListProps`; derived from `Boolean(onclickItem)` (`List.svelte:96`) | Cannot "disable click" except by omitting `onclickItem` (row is then `disabled`) |
| 7.7 | `StepperProps.onchange` — docs describe an object | Type is `(value: number)` (`S:/dist/types/index.d.ts:292-295`) | Use number |
| 7.8 | `Button.disabledLoading` documented `false` | Source default **`true`** (`Button.svelte:24`) | A loading button is also disabled by default |
| 7.9 | `Skeleton` documented `padding` | Source/type use `space` (`Skeleton.svelte:6`) | |
| 7.10 | `dist/index.d.ts` re-exports `./types` | `dist/index.js` does not (type-only; harmless) | Import types from `stdf/types` if needed |
| 7.11 | `Avatar.alt` looks like an image alt | `alt` is fallback **text**; `<img alt="">` (`Avatar.svelte:51-63`) | Avatar carries no accessible name; the wrapping `<button>` is unlabeled |
| 7.12 | `theme/plugin.d.ts` JSDoc: "42 built-in themes, switches themes via `data-theme`" | Only `[data-theme="…"]` variable blocks are emitted; no `@theme`, no `dark` variant, no utilities | See §6.1 |
| 7.13 | `Loading` looks enumerated | `LoadingProps.type?: string` (unconstrained) — 64 sprite types exist (`1_0…1_53`, `2_0…2_5`, `4_0…4_3`) | Typos fall through to `1_0` |
| 7.14 | `ScrollRadio` has a published derived type module | Component not exported from `stdf` and package `exports` blocks deep imports | Treat Picker/TimePicker wheels as opaque |
| 7.15 | `Toast`/`Alert` support `loading`/`icon` etc. | No live-region semantics, no pause on hover, auto-dismiss timers | Add your own `aria-live` copy if messages are essential |
| 7.16 | `stdf/theme` exports `STDFTheme` | It is `ANYTDFTheme` (dark = amber accent, not a neutral) | Don't assume "dark" means grey; `--color-dark` is an accent colour in STDF semantics |

---

## 8. Citation trail (selected, one per claim family)

Only the most load-bearing lines; every table row above was read from the same files.

1. Export surface: `S:/dist/index.d.ts:1-71`, `S:/dist/index.js:1-72`, `S:/dist/components/` (64 dirs).
2. Prop types: `S:/dist/types/index.d.ts:1-541` (Svelte layer), `C:/dist/types/index.d.ts:1-1451` (common layer).
3. Defaults: each component's `$props()` block, e.g. `Button.svelte:7-28`, `Input.svelte:26-84`,
   `Popup.svelte:18-40`, `Card.svelte:5-27`, `List.svelte:36-68`, `Form.svelte:66-80`,
   `Tabs.svelte:7`, `Tab.svelte:12-29`, `Pagination.svelte:8-27`, `Accordion.svelte:13-28`,
   `Skeleton.svelte:6`, `Loading.svelte:71-80`, `Tag.svelte:7-20`, `Avatar.svelte:8-19`, `AvatarGroup.svelte:10-...`,
   `Stepper.svelte:12-33`, `Radio.svelte:6-15`, `RadioItem.svelte:8-17`, `Checkbox.svelte:6-15`,
   `Switch.svelte:12-24`, `Picker.svelte:26-59`, `TimePicker.svelte:24-58`, `Alert.svelte:12-39`, `Toast.svelte:11-32`,
   `Dialog.svelte:20-42`, `Modal.svelte:15-28`, `NoticeBar.svelte:18-...`, `Tooltip.svelte:20-44`,
   `Progress.svelte:5-16`, `Steps.svelte:10`, `BottomSheet.svelte:28-...`, `Swiper.svelte:20-43`,
   `IndexBar.svelte:17-...`, `TabBar.svelte:10-...`, `ButtonGroup.svelte:10-...`, `CountDown.svelte:16-...`, `CharRoll.svelte:19-...`.
4. Markup/semantics: `Button.svelte:41-48`; `NavBar.svelte:44-77`; `Card.svelte:44-45`;
   `List.svelte:290-357`; `Avatar.svelte:33-35,59-63`; `Tag.svelte:54-59`; `Switch.svelte:70-73`;
   `RadioItem.svelte:30-33`; `CheckboxItem.svelte:30`; `Tab.svelte:90-134`; `TabContent.svelte:5-12`;
   `Accordion.svelte:55-91`; `Pagination.svelte:135,208` + `Page.svelte:19-23`;
   `Stepper.svelte:78,103`; `Popup.svelte:120-146`; `Mask.svelte:31-39`; `Tooltip.svelte:244-275`;
   `Progress.svelte:30-58`; `Skeleton.svelte:22-55`; `Loading.svelte:233`; `Steps.svelte:41-161`;
   `Cell.svelte:70-114`; `BottomSheet.svelte:226-277`; `IndexBar.svelte:180-193`;
   `Swiper.svelte:240-242`; `InfiniteScroll.svelte:128`; `PullRefresh.svelte:223,232`;
   `Slider.svelte:210-211`; `Alert.svelte:125`; `Input.svelte:235,364-379,383`; `Form.svelte:114-116,579,584`.
5. Behaviour gaps: `grep -rn Escape S:/dist/components` (empty);
   `grep -rn '\$\$restProps' S:/dist/components` (empty); `grep -rn "<form" S:/dist/components` (empty);
   `grep -rn "href" S:/dist/components` (only `Icon.svelte:41`); `grep -rn "role=" S:/dist/components`
   (11 hits, listed in §4.2).
6. Theme: `C:/dist/theme/switchTheme.js` + `.d.ts:1-95`; `C:/dist/theme/plugin.js` (only
   `addBase({'[data-theme="…"]'…})`, `config: () => ({})`); `C:/dist/theme/plugin.d.ts:43-81`
   (`ThemeConfig`/`ThemeOptions`); `C:/dist/theme/anytdf.js`; `W:/src/routes/layout.css:1-62`;
   `W:/src/app.html:2,12`; compile test (§6.1) with `tailwindcss@4.3.3`.
7. i18n: `S:/dist/lang/index.js`; `C:/dist/lang/ko_KR.js`; `C:/dist/lang/index.d.ts:67-176`;
   `ConfigProvider.svelte:8-24`; per-component `getContext('STDF_lang') || zh_CN` fallbacks.
8. Assets/CSS: `S:/source.css`; `C:/source.css`; `C:/dist/derived/icon.js`
   (`resolveIconSymbolHref`); `W:/static/` contents.

---

### One-screen executive summary

* 67 component exports; **no Table, no Breadcrumb, no Image, no Empty, no Drawer (use BottomSheet), no
  Dropdown (use ActionPopover), no Ellipsis, no Menu (use ActionSheet/ActionPopover)**.
* Almost everything is a `<button>`; **nothing renders links**; no component forwards unknown props
  (no `aria-*` pass-through).
* **Zero dialog affordances**: no focus trap, no Escape, no `role="dialog"`/`aria-modal`, no scroll lock.
* **Zero tab semantics**: Tabs are `<div>` + buttons, no `role="tablist"`, no `aria-selected`.
* Form/Input: **no `<form>`, no validation, no `name`, `type` limited to text/password,
  `autocomplete` boolean only**.
* Theme tokens must be declared in the app's own `@theme`; the plugin only emits `[data-theme]` vars and
  no `dark` variant — `@custom-variant dark` is mandatory for `data-mode="dark"` (already present).
* `ko_KR` lacks PullRefresh/InfiniteScroll strings; default locale is Chinese.
* Known-broken options to avoid: `Button size="md"|"sm"`, `ImageList` default radius (`--radius-btn`),
  `Icon type="symbol"` without `/fonts/symbol.svg`.
