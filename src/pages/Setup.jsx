import Logo from '../components/Logo';

/** Shown only to the developer when the .env file is missing. */
export default function Setup() {
  return (
    <div className="public">
      <Logo />
      <h2>Almost there: connect Firebase</h2>
      <ol className="steps">
        <li>Copy <code>.env.example</code> to a new file named <code>.env</code></li>
        <li>Paste your Firebase web app config values into it</li>
        <li>Stop the server and run <code>npm run dev</code> again</li>
      </ol>
      <p className="muted small">The README has the full step-by-step guide.</p>
    </div>
  );
}
