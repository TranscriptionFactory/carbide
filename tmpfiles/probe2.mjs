import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
const p = unified().use(remarkParse).use(remarkGfm);
for (const md of [
  `<video src="clip.mp4" controls></video>`,
  `<video src="clip.mp4" poster="p.jpg" width="640" controls muted loop></video>`,
  `<iframe src="https://x.com/a"></iframe>`,
  `text before\n\n<video src="c.mp4"></video>\n\nafter`,
]) {
  const tree = p.parse(md);
  console.log("IN:", JSON.stringify(md));
  console.log(JSON.stringify(tree.children, null, 0));
  console.log("---");
}
