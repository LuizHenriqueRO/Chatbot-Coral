---
name: template-designer
description: Interactive visual template selection for image design agents. Opens a local browser companion to choose, refine, and approve visual identity templates.
type: hybrid
version: "1.0.0"
script:
  path: scripts/start-server.sh
  runtime: bash
categories: [design, visual, templates]
---

# Template Designer

Interactive visual companion for selecting and refining image templates during squad creation.

## When to Use

- During squad creation: when the Design phase identifies an image design agent and the user opts to choose a template
- During squad editing: when the user asks to define, edit, or change the visual identity / template of a design agent
- Trigger: presence of `image-creator` skill (or similar image-producing skill) in the squad's skill list

## Prerequisites

- A squad with a design agent that produces images (uses `image-creator` skill)
- Squad's `_build/` directory must exist (created during Discovery/Design phases)
- Node.js available in PATH

## How It Works

1. You start a local HTTP server that shows HTML templates in the browser
2. You read the base templates from `skills/template-designer/base-templates/`
3. You adapt them to the squad's context (platform, domain, tone, Sherlock data)
4. The user views templates in the browser and gives feedback in the terminal
5. You iterate until the user approves
6. You save the approved template as HTML reference + structured style rules
7. The server dies by inactivity timeout (30 min)

## Starting the Server

### On Windows (Git Bash)

The script auto-detects Windows and runs in foreground mode. Use `run_in_background: true` on the Bash tool call:

~~~bash
bash skills/template-designer/scripts/start-server.sh --session-dir "squads/{code}/_build/template-session"
~~~

Then read `squads/{code}/_build/template-session/state/server-info.json` on your next turn to get the URL and port.

### On macOS/Linux

~~~bash
bash skills/template-designer/scripts/start-server.sh --session-dir "squads/{code}/_build/template-session"
~~~

The script backgrounds the server and prints the JSON with URL.

### Server Info

After starting, read `squads/{code}/_build/template-session/state/server-info.json`:
~~~json
{"type":"server-started","port":52341,"url":"http://localhost:52341","content_dir":"...","state_dir":"..."}
~~~

Tell the user to open the URL in their browser.

## Generating Templates

### Step 0: Read Design Guidelines (MANDATORY)

Before generating any template, read and internalize the design best practices:
- `_opensquad/core/best-practices/image-design.md` — **REQUIRED reading**. Contains platform-specific minimum font sizes, typography rules, spacing guidelines, color palette constraints, contrast requirements, and layout methodology. Every template you generate MUST comply with these rules.

Key rules to always follow:
- **Font sizes**: Hero 58px, Heading 43px, Body 34px, Caption 24px minimum for Instagram carousel (1080x1440). Absolute minimum 20px for any readable text on any platform.
- **Font weight**: 500 or higher for body text and above.
- **Colors**: Maximum 5 colors per design system (primary, secondary, accent, background, text).
- **Contrast**: WCAG AA minimum 4.5:1 for all text against background.
- **Layout**: CSS Grid or Flexbox only. No absolute positioning for primary content.
- **Self-contained HTML**: Inline CSS only. Only Google Fonts @import allowed as external resource.
- **No slide counters**: Never include "1/7" or similar. Instagram has native navigation.

You should also apply general web design best practices: proper white space, visual hierarchy through scale and weight, consistent spacing rhythm, and balanced composition.

### Step 1: Read Context

Read these files to understand the squad:
- `squads/{code}/_build/discovery.yaml` — platform, domain, tone, language
- `squads/{code}/_build/design.yaml` — agents, purpose, skills
- `squads/{code}/_investigations/consolidated-analysis.md` (if exists) — visual patterns from reference profiles
- `_opensquad/_memory/company.md` — company name, brand, industry, target audience
- `_opensquad/_memory/preferences.md` — user preferences (language, style, tone)

Use the company context and user preferences to adapt template content: example text should reflect the company's domain and audience, colors should align with brand if available, and language should match the user's Output Language preference. If company context or preferences are not available, placeholder text (Lorem ipsum or similar) is fine.

### Step 2: Read Base Templates

Read the 3 base templates from `skills/template-designer/base-templates/`:
- `model-a.html`
- `model-b.html`
- `model-c.html`

### Step 3: Generate Adapted Variations

For each base template, create an adapted version:
- Adjust colors to match the squad's domain/brand (use Sherlock palette if available, company brand colors from company.md if available)
- Adjust typography following the platform-specific minimum font sizes from `image-design.md`
- Replace example content with domain-relevant content that reflects the company's industry, audience, and language. Use realistic text that demonstrates how the template would look with actual squad output.
- Resize viewport if the target is not 1080x1440 (e.g., 1080x1080 for posts, 1080x1920 for stories)
- Add any visual elements that match the squad's personality
- Apply proper white space, visual hierarchy, and spacing rhythm per `image-design.md` methodology

Write each adapted template as a **content fragment** (no `<!DOCTYPE>` or `<html>` — the server wraps it in the frame template automatically).

### Step 4: Write to Content Directory

Use the Write tool to create HTML files in the `content_dir` from `server-info.json`:

- First batch: `templates-overview.html` — shows all 3 adapted templates as cards for selection
- Individual views: `template-a.html`, `template-b.html`, `template-c.html` — full-size previews

The server automatically serves the newest file.

### Available CSS Classes (from frame template)

Cards for template selection:
~~~html
<div class="cards">
  <div class="card" data-choice="a" onclick="toggleSelect(this)">
    <div class="card-image"><!-- scaled-down template preview --></div>
    <div class="card-body"><h3>Name</h3><p>Description</p></div>
  </div>
</div>
~~~

Options for A/B/C choices:
~~~html
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content"><h3>Title</h3><p>Description</p></div>
  </div>
</div>
~~~

## Iteration Loop

1. **Write HTML** to a new file in `content_dir` (use Write tool, never cat/heredoc)
2. **Tell user** what's on screen and remind them of the URL
3. **Wait for user response** in terminal
4. **Read events** from `state_dir/events.jsonl` (if exists) to see browser clicks
5. **Generate new version** based on feedback — write as new file (e.g., `template-v2.html`, `template-v3.html`)
6. **Repeat** until user approves

File naming: use semantic names, never reuse. Append version suffix for iterations.

When returning to terminal-only questions (no visual needed), push a waiting screen:
~~~html
<!-- waiting.html -->
<div style="display:flex;align-items:center;justify-content:center;min-height:60vh">
  <p class="subtitle">Continuing in terminal...</p>
</div>
~~~

## Saving the Approved Template

When the user approves, create two files:

### 1. Template Reference HTML

Save to: `squads/{code}/pipeline/data/template-reference.html`

The complete, self-contained HTML/CSS of the approved template at full resolution (e.g., 1080x1440). This is the literal example the design agent will use.

### 2. Visual Identity Rules

Save to: `squads/{code}/pipeline/data/visual-identity.md`

Extract structured rules from the approved template:

~~~markdown
# Visual Identity

## Color Palette
- **Primary:** #HEXCODE — usage description
- **Secondary:** #HEXCODE — usage description
- **Background:** #HEXCODE
- **Text:** #HEXCODE
- **Accent:** #HEXCODE — usage description

## Typography
- **Headings:** Font Family, weight, size range
- **Body:** Font Family, weight, size range
- **Caption:** Font Family, weight, size range
- **Minimum sizes:** body 32px, caption 24px, heading 48px

## Layout
- **Viewport:** WIDTHxHEIGHT px
- **Padding:** value
- **Grid:** description
- **Spacing rules:** description

## Composition Rules
- Logo/profile placement: description
- Image treatment: description
- Visual hierarchy: description
- Footer/CTA pattern: description

## Adaptation Rules
- How to handle different viewport sizes
- What stays fixed vs. what adapts
- Color usage rules (when to use primary vs accent)
~~~

### 3. Update Squad Files

If the squad is being created (Build phase hasn't run yet):
- The design.yaml context now includes the template data — Build will pick it up

If the squad already exists (editing flow):
- Add `pipeline/data/template-reference.html` and `pipeline/data/visual-identity.md` to `squad.yaml` `data:` list
- Update the design agent's `.agent.md` to reference both files
- Update the design agent's tasks to include the rule: "always follow visual-identity.md and use template-reference.html as the base model"

## Stopping the Server

The server auto-stops after 30 minutes of inactivity. For manual stop:

~~~bash
bash skills/template-designer/scripts/stop-server.sh "squads/{code}/_build/template-session"
~~~

## Checking Server Status

Before writing content, verify the server is alive:
- Check if `state_dir/server-info.json` exists AND `state_dir/server-stopped` does NOT exist
- If stopped, restart with `start-server.sh`
