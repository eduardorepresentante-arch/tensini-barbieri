"""Gera a prévia do site (modo demonstração) num único arquivo por página, com os scripts embutidos.

Uso: python3 tools/build_preview.py <pasta de saída>
A prévia não carrega o Supabase, então roda sempre em modo demonstração.
"""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)

SCRIPT = re.compile(r'<script src="([^"]+)"></script>\n?')


def inline(html):
    def sub(m):
        src = m.group(1)
        if src.startswith("vendor/"):
            return ""
        code = (ROOT / src).read_text(encoding="utf-8").replace("</script", "<\\/script")
        return f"<script>\n{code}\n</script>\n"
    return SCRIPT.sub(sub, html)


def fragment(html):
    """Página principal sem <!doctype>/<html>/<head>/<body>: a prévia acrescenta o esqueleto."""
    head = html[html.index("<head>") + 6:html.index("</head>")]
    body = html[html.index("<body>") + 6:html.index("</body>")]
    head = re.sub(r'<meta charset="utf-8">\n|<meta name="viewport"[^>]*>\n', "", head)
    return head.strip() + "\n\n" + body.strip() + "\n"


(OUT / "page.html").write_text(fragment(inline((ROOT / "index.html").read_text(encoding="utf-8"))), encoding="utf-8")
(OUT / "admin.html").write_text(inline((ROOT / "admin.html").read_text(encoding="utf-8")), encoding="utf-8")
for f in ["logo.webp", "mark.webp", "icon-192.png", "icon-512.png"]:
    shutil.copy(ROOT / f, OUT / f)
print("prévia em", OUT)
