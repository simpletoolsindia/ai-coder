import { Link } from 'react-router-dom';
import { H1, P, Callout, Card, Grid, Code, Pill } from '../components/ui';

export function Install() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Pill>Install</Pill>
      <H1>Install AI By</H1>
      <P>One line on any OS. The installer detects missing dependencies and installs them.</P>

      <h2 className="notion-h2 mt-10 mb-3">Option 1 — One-line installer (recommended)</h2>

      <h3 className="notion-h3 mt-4 mb-2">macOS / Linux / WSL</h3>
      <Code lang="bash">{`curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.sh | bash`}</Code>

      <h3 className="notion-h3 mt-6 mb-2">Windows (PowerShell)</h3>
      <Code lang="powershell">{`iwr -useb https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.ps1 | iex`}</Code>

      <Callout tone="info">
        The installer detects your OS, installs Node.js 20+ if missing, then installs <code>ai-by</code> from npm and exposes the <code>ai-coder</code> command.
      </Callout>

      <h2 className="notion-h2 mt-10 mb-3">Option 2 — npm</h2>
      <Code lang="bash">{`npm install -g ai-by`}</Code>
      <P>Requires Node.js 20 or newer (<a className="notion-link" href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org</a>).</P>

      <h2 className="notion-h2 mt-10 mb-3">Verify the install</h2>
      <Code lang="bash">{`ai-coder --version
# or
which ai-coder`}</Code>

      <h2 className="notion-h2 mt-10 mb-3">First run</h2>
      <P>Launch the agent:</P>
      <Code lang="bash">{`ai-coder`}</Code>
      <P>On first launch you'll be in <Pill color="yellow">PLAN</Pill> mode. Configure a provider:</P>
      <Code lang="text">{`ai-coder> /login openai openai https://api.openai.com/v1 sk-... gpt-4o`}</Code>

      <h2 className="notion-h2 mt-10 mb-3">Install options</h2>
      <Code lang="bash">{`# Install a specific version
curl -fsSL https://raw.githubusercontent.com/simpletoolsindia/ai-coder/main/install.sh | bash -s -- --version 0.2.3

# Install from a local checkout
git clone https://github.com/simpletoolsindia/ai-coder.git
cd ai-coder
bash install.sh --from-source`}</Code>

      <h2 className="notion-h2 mt-10 mb-3">Uninstall</h2>
      <Code lang="bash">{`npm uninstall -g ai-by`}</Code>

      <h2 className="notion-h2 mt-10 mb-3">Troubleshooting</h2>
      <Grid cols={2}>
        <Card title="command not found: ai-coder" icon="❓">
          Restart your terminal so the updated <code>PATH</code> takes effect, or run <code>hash -r</code> (bash) / <code>rehash</code> (zsh).
        </Card>
        <Card title="ai-coder: command not found (Windows)" icon="❓">
          Open a new PowerShell window after install. The <code>%PATH%</code> env var is updated for new sessions only.
        </Card>
        <Card title="Node 18 / 19 detected" icon="⚠️">
          AI By needs Node 20+. The installer upgrades it automatically. If it can't, install Node 20 LTS from nodejs.org.
        </Card>
        <Card title="Permission errors on Linux" icon="🔐">
          The installer uses <code>sudo</code> only for system packages. AI By itself installs into your user npm prefix.
        </Card>
      </Grid>

      <div className="mt-12">
        <Callout tone="success">
          <span>
            Installed? Head to the <Link className="notion-link" to="/commands">Commands</Link> page to learn what you can do, or <Link className="notion-link" to="/features">Features</Link> for the full tour.
          </span>
        </Callout>
      </div>
    </div>
  );
}
