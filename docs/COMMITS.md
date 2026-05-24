# Commit conventions

## Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

Co-authored-by: Cursor <agent@cursor.com>
```

## Types

| Type    | Use for                     |
| ------- | --------------------------- |
| `chore` | Tooling, config, meta files |
| `feat`  | New features                |
| `fix`   | Bug fixes                   |
| `test`  | Tests only                  |

## Scopes

`meta`, `bootstrap`, `domain`, `services`, `cli`

## Examples

```
chore(meta): add cursor rules, invariants, and phase gates

Co-authored-by: Cursor <agent@cursor.com>
```

```
feat(domain): add invoice schema, normalizer, and validation rules

Co-authored-by: Cursor <agent@cursor.com>
```

## Rules

- One logical change per commit when possible.
- Never commit `.env` or secrets.
- Always include the co-author trailer.
