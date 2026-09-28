---
name: python
description: Python project structure, import and typing rules. Use when creating or restructuring Python modules, packages or tests.
---

# Python Project Structure and Rules

## Package Structure and Imports

### No `__init__.py` Files

Projects should follow a simplified approach without `__init__.py` files in directories. This keeps the structure clean and avoids complex import hierarchies.

### No `from __future__ import annotations` imports

Self explanatory, almost never necessary to do this.

### Import Patterns

When importing from modules in subdirectories, use explicit imports from the project root:

```python
from src.example.module import example_function
from src.example.models import ExampleModel
```

**NEVER import libraries inside functions unless there is an extremely specific use case for it! (e.g. lazy imports for performance optimization)**

All imports should be at the top of the file, following this order:
1. Standard library imports (asyncio, logging, etc.)
2. Third-party library imports (cv2, numpy, httpx, etc.)
3. Local project imports (src.* modules)

```python
# CORRECT - imports at top of file
import asyncio
import logging
from typing import Tuple

import cv2
import httpx
import numpy as np

from src.example.models import ExampleModel

# WRONG - importing inside function
async def download_file(url: str) -> bytes:
    import httpx  # DON'T DO THIS!
    ...
```

### Module Organization

Organize code into logical domains with clear separation of concerns. Each domain should have its own directory containing related functionality.

**Standard module naming conventions:**
- **models.py**: Pydantic models and enums for the domain
- **ops.py**: Business logic and operations
- **router.py**: API route definitions (for FastAPI routes)
- **config.py**: Domain-specific configuration
- **core.py**: Core abstractions and base classes
- **utils.py** or **utils/**: Helper functions specific to the domain

**Example project structure:**
```
src
├── api/                        # API layer
│   ├── main.py
│   └── routes/
│       ├── users/
│       │   ├── models.py       # Request/response models
│       │   ├── ops.py          # Business logic
│       │   └── router.py       # Route definitions
│       ├── orders/
│       │   ├── models.py
│       │   ├── ops.py
│       │   └── router.py
│       └── utils/
│           └── auth.py
├── domain_a/                   # Functional domain
│   ├── processing.py
│   ├── validation.py
│   └── models.py
├── domain_b/                   # Another functional domain
│   ├── core.py
│   ├── handlers.py
│   └── models.py
├── workers/                    # Background task system
│   ├── config.py
│   ├── core/
│   │   └── base_task.py
│   ├── main.py
│   └── tasks/
│       ├── task_a.py
│       └── task_b.py
└── utils/                      # Shared utilities
    ├── db/
    │   ├── connection.py
    │   └── convert.py
    ├── models/                 # Shared data models
    │   └── common.py
    └── helpers.py
```

**Key principles:**
- Group related functionality into domain directories
- Keep `utils/` for truly shared, cross-cutting concerns
- Separate API models from database/domain models
- Use `core/` directories for base classes and abstractions
- Functional modules can be flat when complexity is low

### Environment Variable Handling

Use a single, centralized settings object for all environment configuration. This approach uses `pydantic-settings` for validation and type coercion, combined with `python-dotenv` for local development.

**Create `env_settings.py` at the project root:**

```python
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()


class Settings(BaseSettings):
    # Application
    app_env: str = ""
    app_name: str = ""
    version: str = ""
    debug: bool = False

    # Database
    db_host: str = ""
    db_user: str = ""
    db_password: str = ""
    db_port: int = 0
    db_name: str = ""

    # External services
    external_api_key: str = ""
    external_api_url: str = ""


def get_env_or_die() -> Settings:
    """Load and validate all required environment variables."""
    settings = Settings()

    if not settings.app_env:
        raise ValueError("APP_ENV is not set")
    if not settings.db_host:
        raise ValueError("DB_HOST is not set")
    if not settings.db_user:
        raise ValueError("DB_USER is not set")
    if not settings.db_password:
        raise ValueError("DB_PASSWORD is not set")
    if not settings.db_name:
        raise ValueError("DB_NAME is not set")
    if not settings.db_port:
        raise ValueError("DB_PORT is not set")
    # ... validate other required fields as needed

    return settings


ENV_SETTINGS = get_env_or_die()
```

**Usage throughout the codebase:**

```python
from env_settings import ENV_SETTINGS

# Access settings anywhere
db_url = f"postgresql://{ENV_SETTINGS.db_user}:{ENV_SETTINGS.db_password}@{ENV_SETTINGS.db_host}"
```

**Key principles:**
- **Single source of truth**: One `ENV_SETTINGS` object used everywhere
- **Fail fast**: Validate required variables at startup via `get_env_or_die()`
- **Type safety**: Pydantic handles type coercion (strings to int, bool, lists)
- **Local development**: `load_dotenv()` loads `.env` file automatically
- **Never use `os.getenv()` directly**: Always go through the settings object

## Code Style and Standards

### Error Handling

- Use specific exceptions with clear messages
- Log errors appropriately using `logging.getLogger(__name__)`
- Provide meaningful error context for debugging

### Type Hints

- Use comprehensive type hints for all function signatures
- Import types from `typing` module when needed
- Use Pydantic models for structured data validation

### Async Patterns

- Use `async`/`await` for database operations and external API calls
- Avoid blocking operations in async contexts
- Use proper async context managers (`async with`)
- For network requests, use `httpx`

### Model Design

- Pydantic is our mechanism for python types and validation. When in doubt, use Pydantic.
- Use enums for categorical data with clear, descriptive values
- Include comprehensive field descriptions in Pydantic models
- Use appropriate field validations (ge, le, etc.) and descriptions
