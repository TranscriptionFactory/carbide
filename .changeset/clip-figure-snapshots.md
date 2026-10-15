---
"carbide": patch
---

Web clips now keep figures whose look depends on the page's own styling, such as thumbnails positioned over a diagram, canvas charts and CSS sprites. Carbide renders the page in a hidden window, snapshots each of these figures, and shows the snapshot with its caption; the figure's original images and text stay in a collapsed "Figure elements" section beneath it. Works on macOS and Linux; clips of pages without such figures are unchanged.
