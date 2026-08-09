---
"carbide": patch
---

Linked sources in the file explorer now show their subfolders. A linked source is a folder of PDFs and saved pages that lives outside the vault, and the explorer only ever presented it as one flat list: every document a scan found was filed directly under the source, no matter which subfolder it actually sat in. Two papers with the same file name in different subfolders resolved to the same entry, so one silently replaced the other, and anything more than three levels below the source folder was never scanned at all. Reference libraries are rarely flat — Zotero stores each attachment under its own key, and hand-kept folders are usually split by project or year — so this was most of the structure being dropped.

Documents now keep their location inside the source: subfolders appear as real folders in the explorer, expand like any other folder, and same-named files in different subfolders stay distinct. The walk reaches sixteen levels deep instead of three. Existing sources correct themselves on the next scan; the entry a document had under the old flat layout is replaced rather than left behind as a duplicate.
