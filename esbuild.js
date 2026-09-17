const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	// Extension-Host (Node)
	const extension = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	// Webview des Tabellen-Editors (Browser): Univer + Stylesheet nach media/sheet/
	const webview = await esbuild.context({
		entryPoints: ['src/webview/sheet.ts'],
		bundle: true,
		format: 'esm',
		minify: true,          // Univer ist ~11 MB unminifiziert, Sourcemaps lohnen hier nicht
		platform: 'browser',
		outdir: 'media/sheet',
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});
	// Webview des UML-Editors (Browser): eigener Code + Stylesheet nach media/uml/
	const uml = await esbuild.context({
		entryPoints: ['src/webview/uml/main.ts'],
		bundle: true,
		format: 'esm',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outdir: 'media/uml',
		entryNames: 'uml',
		logLevel: 'silent',
		plugins: [esbuildProblemMatcherPlugin],
	});
	const alle = [extension, webview, uml];
	if (watch) {
		await Promise.all(alle.map(c => c.watch()));
	} else {
		await Promise.all(alle.map(c => c.rebuild()));
		await Promise.all(alle.map(c => c.dispose()));
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
