.PHONY: publish test build

test:
	pnpm vitest run

build:
	pnpm build

publish:
	npm version patch
	npm publish
