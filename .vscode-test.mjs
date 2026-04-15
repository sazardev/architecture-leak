import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// Open the bad-arch fixture so the extension activates via workspaceContains trigger
	workspaceFolder: join(__dirname, 'test-fixtures', 'bad-arch'),
	extensionDevelopmentPath: __dirname,
});
