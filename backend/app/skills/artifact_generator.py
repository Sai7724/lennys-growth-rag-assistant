"""Artifact tagging utilities.

The LLM wraps generated code/widgets/documents in an <artifact> tag; the
frontend extracts and renders the payload inside the sandboxed iframe.
"""
import re
from dataclasses import dataclass
from typing import List, Optional

ARTIFACT_TAG_RE = re.compile(
    r"<artifact\b([^>]*)>(.*?)</artifact>", re.DOTALL | re.IGNORECASE
)
ATTR_RE = re.compile(r'([\w-]+)\s*=\s*"([^"]*)"')


@dataclass
class Artifact:
    type: str
    title: str
    html: str


def parse_artifacts(content: str) -> List[Artifact]:
    """Extract every <artifact>...</artifact> block from a string."""
    artifacts: List[Artifact] = []
    for match in ARTIFACT_TAG_RE.finditer(content):
        attrs = dict(ATTR_RE.findall(match.group(1)))
        artifacts.append(
            Artifact(
                type=attrs.get("type", "html"),
                title=attrs.get("title", "Untitled Artifact"),
                html=match.group(2).strip(),
            )
        )
    return artifacts


def first_artifact(content: str) -> Optional[Artifact]:
    """Return the first artifact found, or None."""
    artifacts = parse_artifacts(content)
    return artifacts[0] if artifacts else None


def wrap_artifact(html: str, title: str = "Generated Artifact", type: str = "html") -> str:
    """Wrap raw HTML in the canonical <artifact> tag (used in prompts/tests)."""
    return f'<artifact type="{type}" title="{title}">\n{html}\n</artifact>'


ARTIFACT_PROMPT_HINT = """When the user asks for code, wireframes, HTML widgets, dashboards, charts, or formal strategic documents, wrap the deliverable in an <artifact> tag exactly like this:

<artifact type="html" title="Descriptive Title">
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artifact</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Inter', sans-serif; }
    .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .card-shadow { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
  </style>
</head>
<body class="bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen p-6">
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="gradient-bg rounded-2xl p-6 mb-6 text-white card-shadow">
      <h1 class="text-2xl font-bold">Artifact Title</h1>
      <p class="text-white/80 mt-1">Brief description or subtitle</p>
    </div>
    
    <!-- Main Content -->
    <div class="bg-white rounded-xl p-6 card-shadow">
      <!-- Your artifact content here with Tailwind CSS classes -->
    </div>
  </div>
</body>
</html>
</artifact>

IMPORTANT DESIGN GUIDELINES:
1. Always use Tailwind CSS for styling (loaded via CDN)
2. Use modern, clean design with:
   - Soft gradients (purple, blue, emerald, amber)
   - Rounded corners (rounded-xl, rounded-2xl)
   - Subtle shadows (card-shadow class)
   - Good whitespace and spacing
   - Inter font for better readability
3. For dashboards/widgets: use grid layouts, cards, and visual hierarchy
4. For strategic documents: use clean typography, section headers, and bullet points
5. For charts/visualizations: use colorful bars, gradients, and clear labels
6. Make it interactive where appropriate (hover effects, transitions)
7. Ensure responsive design with mobile-friendly layouts
"""