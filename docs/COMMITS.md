# Commit conventions

## Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <short description>

[optional body]
```

## Types

| Type       | Use for                                         |
| ---------- | ----------------------------------------------- |
| `chore`    | Tooling, configuration, and maintenance         |
| `docs`     | Documentation only                              |
| `feat`     | New features                                    |
| `fix`      | Bug fixes                                       |
| `refactor` | Internal restructuring without behavior changes |
| `test`     | Tests only                                      |

## Suggested scopes

`domain`, `services`, `cli`, `ports`, `tests`, `docs`, or `deps`.

## Examples

```text
chore(deps): update LangChain packages
```

```text
feat(domain): add invoice schema validation rules
```

## Rules

- Keep each commit focused on one logical change where practical.
- Never commit `.env` files, API keys, or generated build output.
- Write the summary in the imperative mood and keep it concise.
