<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Dependências no Docker

O `docker-compose.yml` usa o volume nomeado `monisus_frontend_node_modules` para `/app/node_modules`. Esse volume **não** é atualizado quando `package.json`/`package-lock.json` mudam — builds locais passam, mas o container quebra com `Module not found`.

Após qualquer mudança de dependências, sincronize o volume:

```sh
docker compose exec frontend npm ci
docker compose restart frontend
```

(Não use `docker compose down -v`: apaga também o volume do Postgres.)
