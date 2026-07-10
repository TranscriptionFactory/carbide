<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import DialogPortal from "./dialog-portal.svelte";
	import XIcon from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import * as Dialog from "./index.js";
	import { cn, type WithoutChildrenOrChild } from "$lib/shared/utils/component_utils.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		onOpenAutoFocus,
		onCloseAutoFocus,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
		showCloseButton?: boolean;
	} = $props();

	// bits-ui restores focus on close with a plain el.focus(), which scrolls the
	// pre-focused element (e.g. the editor selection) into view and jumps the
	// page. Capture the pre-focused element ourselves (onOpenAutoFocus fires
	// before bits moves focus) and restore it with preventScroll.
	let pre_focused: HTMLElement | null = null;

	function handle_open_auto_focus(e: Event) {
		pre_focused =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		onOpenAutoFocus?.(e);
	}

	function handle_close_auto_focus(e: Event) {
		onCloseAutoFocus?.(e);
		if (e.defaultPrevented) return;
		e.preventDefault();
		if (pre_focused && document.contains(pre_focused)) {
			pre_focused.focus({ preventScroll: true });
		}
		pre_focused = null;
	}
</script>

<DialogPortal {...portalProps}>
	<Dialog.Overlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			"bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
			className
		)}
		onOpenAutoFocus={handle_open_auto_focus}
		onCloseAutoFocus={handle_close_auto_focus}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close
				class="ring-offset-background focus:ring-ring absolute end-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
			>
				<XIcon />
				<span class="sr-only">Close</span>
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
