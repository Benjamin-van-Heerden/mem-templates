#!/usr/bin/env python3
"""Compiles every ```rust block of this skill against a gpui-kit version.

Usage: python3 check_examples.py <scratch dir> [gpui-kit version]

Builds a throwaway crate in <scratch dir> (keep it outside the project, or its
target/ grows), writes each block to its own module and runs `cargo test`, so
the one #[gpui_kit::test] example runs too. Blocks that import neither
`gpui_kit::*` nor `gpui_kit::{...}` get the skill's convention:
`use gpui_kit::*; use gpui_kit::prelude::*;`. The first build is cold (about a
minute); later runs are incremental.
"""

import pathlib
import re
import subprocess
import sys

skill = pathlib.Path(__file__).resolve().parent.parent
work = pathlib.Path(sys.argv[1]).resolve()
version = sys.argv[2] if len(sys.argv) > 2 else "0.8.1"

src = work / "src"
src.mkdir(parents=True, exist_ok=True)
(work / "Cargo.toml").write_text(f"""[package]
name = "gpui-skill-examples"
version = "0.1.0"
edition = "2024"
publish = false

[dependencies]
gpui-kit = {{ version = "={version}", features = ["test-support"] }}
anyhow = "1"
futures = "0.3"
schemars = "1"
serde = {{ version = "1", features = ["derive"] }}
serde_json = "1"
tracing = "0.1"

[profile.dev]
debug = "line-tables-only"

[profile.dev.package."*"]
debug = false
""")

for old in src.glob("*.rs"):
    old.unlink()
modules = []
for md in [skill / "SKILL.md", *sorted((skill / "references").glob("*.md"))]:
    text = md.read_text()
    for i, block in enumerate(re.finditer(r"```rust\n(.*?)```", text, re.S)):
        body = block.group(1)
        name = f"{md.stem.replace('-', '_').lower()}_{i}"
        prefix = "" if re.search(r"^use gpui_kit::(\*|\{)", body, re.M) else "use gpui_kit::*;\nuse gpui_kit::prelude::*;\n\n"
        line = text[: block.start()].count("\n") + 2
        (src / f"{name}.rs").write_text(f"// {md.relative_to(skill)}:{line}\n{prefix}{body}")
        modules.append(name)
lib = "#![allow(dead_code, unused_imports, unused_variables, unused_mut, unused_must_use, clippy::all)]\n"
(src / "lib.rs").write_text(lib + "".join(f"mod {m};\n" for m in modules))
print(f"{len(modules)} examples written to {src}", flush=True)

# Each module's first line names the markdown file and line it came from.
sys.exit(subprocess.run(["cargo", "test", "-q"], cwd=work).returncode)
