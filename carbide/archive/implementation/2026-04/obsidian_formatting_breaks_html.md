Here is a comprehensive breakdown of how Obsidian handles auto-completion, line breaks, and underlying web technologies within your notes.

### 1. Auto-Closing & Completion Ruleset

Obsidian is designed to speed up formatting by automatically completing Markdown syntax and standard closures.

**The Core Rules:**

- **Bracket & Quote Pairing:** When you type an opening character—`[`, `(`, `{`, `"`, or `'`—Obsidian immediately drops the closing character and places your cursor in the middle.
- **Markdown Syntax Pairing:** The same applies to Markdown styling. Typing `*`, `_`, `=`, `~`, or `` ` `` generates the matching pair for bold, italics, highlights, strikethroughs, and inline code.
- **Code Fences:** Typing three backticks (```) and pressing `Enter` will automatically generate the closing set of backticks on a new line, keeping your cursor inside the block to start typing your code.

**Behaviors and Workarounds:**

- **The "Type-Through" Rule:** If Obsidian auto-generates a closing parenthesis `)`, you do not need to use the arrow keys to escape it. Simply typing `)` manually will jump your cursor _over_ the auto-generated character without typing a duplicate.
- **Wrapping Existing Text:** If you highlight a block of text and type an opening character (like `[` or `*`), Obsidian will wrap the selected text in the pairs rather than overwriting it.
- **Customizing the Rules:** Obsidian does not natively support using `Tab` to escape brackets (like VS Code does). However, you can toggle these features off entirely. Go to **Settings > Editor** and adjust the toggles for **Auto pair brackets** and **Auto pair Markdown syntax**. To get the "Tab to escape" functionality, you can install the community plugin **Tabout**.

### 2. Line Breaks

Obsidian handles line breaks a bit differently than strict, traditional Markdown, prioritizing a "what you see is what you get" feel.

**The Default Behavior:**
Normally, standard Markdown uses a "soft wrap" rule: if you press `Enter` once, it ignores the line break in the final rendering and merges the text into a single paragraph. To get a hard line break in standard Markdown, you have to add **two spaces** at the end of the line before hitting `Enter`.

By default, Obsidian ignores this standard. Pressing `Enter` once will drop you to a new line in both Editing View and Reading View.

**Strict Line Breaks:**
If you want to force Obsidian to behave like standard Markdown (which is highly recommended if you plan to export your notes to other Markdown editors, websites, or GitHub), you can change this.

- Go to **Settings > Editor** and toggle on **Strict line breaks**.
- With this enabled, a single `Enter` will collapse into a space in Reading View. You will be forced to use the "two spaces + Enter" rule to create a hard break, or press `Enter` twice to create a distinct, separated paragraph.

### 3. CSS/HTML Functionality & Restrictions

Because Obsidian is built on Electron (a Chromium-based framework), your vault is essentially a local website. It natively understands and renders standard web languages.

**What You Can Do:**

- **Inline HTML:** You can mix HTML tags directly into your notes. This is great for things Markdown can't natively do, such as `<kbd>Ctrl</kbd>` to style keyboard shortcuts, `<u>Underline</u>`, or `<span style="color:red">colored text</span>`.
- **Iframes:** You can embed websites, YouTube videos, or Spotify playlists directly into a note using standard `<iframe src="..."></iframe>` tags.
- **CSS Snippets:** You can globally change the look of your notes (fonts, colors, background images) without altering the Markdown itself. By placing `.css` files into the hidden `.obsidian/snippets` folder in your vault, you can apply custom styling to specific Markdown tags across your entire workspace.

**Security Restrictions:**
To prevent Cross-Site Scripting (XSS) attacks and protect your local file system, Obsidian implements strict security boundaries.

- **No Executable JavaScript:** This is the most significant restriction. Obsidian aggressively sanitizes Markdown files. If you write `<script>alert("Hello")</script>` inside a note, the application will refuse to execute it. This ensures that opening a downloaded note cannot silently run malicious code on your computer.
- **Iframe Blocking:** While Obsidian supports iframes, some external websites use HTTP headers (like `X-Frame-Options: SAMEORIGIN`) that explicitly forbid their pages from being embedded in other applications. These sites will refuse to load in your notes.
- **Local File Access:** Standard HTML running inside a note cannot arbitrarily access files on your computer outside of your defined vault structure, maintaining a sandboxed environment.

Would you like me to walk you through how to set up a custom CSS snippet to style specific elements in your vault?
