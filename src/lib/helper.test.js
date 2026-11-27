// @vitest-environment jsdom
// @ts-nocheck
import { describe, test, expect } from 'vitest';

// latexToHtml() inserts converted, user-supplied documents into the page. The converter is
// stubbed to emit exactly the unsafe markup the cleanup step must remove, whatever
// latex.js itself happens to support.
describe('latexToHtml sanitizing', () => {
	test('removes scripts, event handlers and unsafe URLs, keeping safe content', async () => {
		window.latexjs = {
			HtmlGenerator: class {
				htmlDocument() {
					const doc = document.implementation.createHTMLDocument();
					doc.body.innerHTML = `
						<p onclick="alert(1)">text</p>
						<script>alert(2)</script>
						<iframe src="https://x.org"></iframe>
						<a href="javascript:alert(3)">bad</a>
						<a href=" JavaScript:alert(4)">bad too</a>
						<a href="data:text/html,x">data</a>
						<img src="x" onerror="alert(5)">
						<img src="https://tracker.test/a.png" srcset="https://tracker.test/b.png 2x">
						<p style="background: url(https://tracker.test/c.png)">css</p>
						<p style="background: u\\72l(https://tracker.test/d.png)">escaped</p>
						<video poster="https://tracker.test/e.png"></video>
						<svg><image href="https://tracker.test/f.png"></image></svg>
						<span style="margin-left: 2em">indented</span>
						<a href="https://x.org">good</a>
						<math><mi>x</mi></math>`;
					return doc;
				}
			},
			parse: () => {}
		};
		const { latexToHtml } = await import('./helper.js');
		const html = latexToHtml('\\begin{document}x\\end{document}');

		expect(html).not.toMatch(/alert|<script|<iframe|onclick|onerror|javascript:|data:/i);
		expect(html).toContain('<a href="https://x.org">good</a>');
		expect(html).not.toMatch(/tracker\.test/);
		expect(html).toContain('style="margin-left: 2em"');
		expect(html).toContain('<mi>x</mi>');
		expect(html).toContain('bad too');
	});
});
