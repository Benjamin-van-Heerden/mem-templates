---
name: uv
description: How to run Python, tools and dependencies through uv. Use whenever running, testing or adding packages to Python code.
---

## UV and Package Management

All Python operations must go through `uv`. Never invoke Python, pip, or Python tools directly.

### Running Python

```bash
# CORRECT
uv run python script.py
uv run python -c "print('hello')"

# WRONG - never do this
python script.py
python3 script.py
```

### Running Tools and Scripts

```bash
# CORRECT
uv run pytest
uv run pytest tests/ -v
uv run mypy src/
uv run ruff check .
uv run uvicorn src.api.main:app

# WRONG
pytest
mypy src/
ruff check .
```

### Package Management

```bash
# Add a dependency
uv add httpx

# Add a dev dependency
uv add --dev pytest

# Remove a dependency
uv remove httpx

# Sync environment with lockfile
uv sync

# Update dependencies
uv lock --upgrade
```

### Key Principles

- **Always prefix with `uv run`**: Any command that would normally invoke Python or a Python tool
- **Never install/uninstall packages without explicit permission**: In stead, only advise on which packages to install and let the user decide.
- **Never activate virtual environments manually**: `uv run` handles this automatically
- **Keep `uv.lock` in version control**: Ensures reproducible builds across environments
